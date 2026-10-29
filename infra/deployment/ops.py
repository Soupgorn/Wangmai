#!/usr/bin/env python3
"""Manual deployment guards and binary-safe backups. Never starts production services."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.parse import unquote, urlsplit
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]


def configuration(env_file, local_smoke=False, recovery_file=None):
    command = ["docker", "compose", "--project-name", "wangmai-smoke" if local_smoke else "wangmai", "--env-file",
               str(Path(env_file).resolve()), "-f", str(ROOT / "compose.yaml")]
    if local_smoke:
        command += ["-f", str(ROOT / "infra/smoke/compose.yaml")]
    if recovery_file:
        if local_smoke:
            raise ValueError("Recovery and local smoke overrides cannot be combined.")
        command += ["-f", str(Path(recovery_file).resolve(strict=True))]
    # Rendered configuration contains secrets: capture it, never print it or exception output.
    result = subprocess.run(command + ["config", "--format", "json"], capture_output=True)
    if result.returncode:
        raise ValueError("Compose configuration failed. Check the env file and required variables.")
    return command, json.loads(result.stdout)


def validate(config):
    services = config["services"]
    backend = services["backend"]["environment"]
    postgres = services["postgres"]["environment"]
    domain = services["caddy"]["environment"]["WANGMAI_DOMAIN"]
    errors = []
    def require(ok, message):
        if not ok:
            errors.append(message)
    def configured(value):
        return bool(value) and not any(word in value.lower() for word in
            ("change_me", "replace-with", "fixture", "smoke", "example", "your_domain"))
    require(bool(re.fullmatch(r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", domain))
            and configured(domain) and not domain.endswith((".invalid", ".test", ".localhost")),
            "WANGMAI_DOMAIN must be the real public DNS hostname.")
    require(backend["BETTER_AUTH_URL"] == f"https://{domain}",
            "BETTER_AUTH_URL must exactly match https://WANGMAI_DOMAIN, without a trailing slash.")
    require(backend["NODE_ENV"] == "production", "Backend must use NODE_ENV=production.")
    for field in ("BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"):
        require(configured(backend.get(field, "")), f"{field} contains a placeholder or is missing.")
    require(len(backend.get("BETTER_AUTH_SECRET", "")) >= 32, "BETTER_AUTH_SECRET must have at least 32 characters.")
    require(backend.get("GOOGLE_CLIENT_ID", "").endswith(".apps.googleusercontent.com"),
            "GOOGLE_CLIENT_ID must be a Google Web client ID.")
    password = postgres.get("POSTGRES_PASSWORD", "")
    require(configured(password) and len(password) >= 24, "POSTGRES_PASSWORD must be a strong, non-placeholder password (24+ characters).")
    try:
        uri = urlsplit(backend["DATABASE_URL"])
        require(uri.scheme in ("postgres", "postgresql") and uri.hostname == "postgres"
                and uri.port in (None, 5432) and not uri.query and not uri.fragment
                and unquote(uri.username or "") == postgres["POSTGRES_USER"]
                and unquote(uri.password or "") == password
                and unquote(uri.path.removeprefix("/")) == postgres["POSTGRES_DB"],
                "DATABASE_URL must match PostgreSQL credentials, database, and internal postgres:5432 target.")
    except ValueError:
        errors.append("DATABASE_URL is malformed.")
    for name in ("frontend", "backend", "postgres"):
        require(not services[name].get("ports"), f"{name} must not publish host ports.")
    ports = services["caddy"].get("ports", [])
    require({(str(p.get("published")), p.get("target"), p.get("protocol", "tcp")) for p in ports}
            == {("80", 80, "tcp"), ("443", 443, "tcp"), ("443", 443, "udp")},
            "Caddy must publish only HTTP/HTTPS on 80/tcp, 443/tcp and 443/udp.")
    for name in ("frontend", "backend"):
        require(bool(re.fullmatch(rf"wangmai-{name}:[a-f0-9]{{40}}", services[name]["image"])),
                f"{name} image tag must be the full reviewed Git commit SHA.")
    for name, repository in (("postgres", "postgres"), ("caddy", "caddy")):
        require(bool(re.fullmatch(rf"{repository}@sha256:[a-f0-9]{{64}}", services[name]["image"])),
                f"{name} image must be pinned to a tested official repository digest.")
    require(config["networks"]["database"].get("internal") is True, "Database network must remain internal.")
    require(services["frontend"]["environment"].get("API_INTERNAL_ORIGIN") == "http://backend:4000",
            "Frontend server-side API routing must use the internal backend origin.")
    return errors


def checked(command, **kwargs):
    result = subprocess.run(command, stderr=subprocess.PIPE, **kwargs)
    if result.returncode:
        raise ValueError("Docker operation failed. Inspect service health and permissions; diagnostic output was withheld to protect secrets.")
    return result


def backup(command, destination):
    directory = Path(destination).resolve()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    name = f"wangmai-{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}-{uuid4().hex[:8]}.dump"
    partial = directory / (name + ".partial")
    # Exclusive create; no existing backup can be overwritten. Partial files never count as backups.
    fd = os.open(partial, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "wb") as output:
        checked(command + ["exec", "-T", "postgres", "sh", "-eu", "-c",
            'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges'], stdout=output)
    with partial.open("rb") as archive:
        checked(command + ["exec", "-T", "postgres", "pg_restore", "--list"], stdin=archive, stdout=subprocess.DEVNULL)
    target = directory / name
    partial.rename(target)
    with target.open("rb") as archive:
        digest = hashlib.file_digest(archive, "sha256").hexdigest()
    with (directory / (name + ".sha256")).open("x", encoding="ascii") as checksum:
        checksum.write(f"{digest}  {name}\n")
    print(f"Archive created (restore drill still required): {target}")


def verify_backup(config, source):
    archive_path = Path(source).resolve(strict=True)
    expected = Path(str(archive_path) + ".sha256").read_text(encoding="ascii").split()[0]
    with archive_path.open("rb") as archive:
        if hashlib.file_digest(archive, "sha256").hexdigest() != expected:
            raise ValueError("Backup checksum mismatch; restore was not attempted.")
    name = f"wangmai-restorecheck-{uuid4().hex[:12]}"
    volume = name + "-data"
    # Public fixture credentials, a new volume, zero network, zero published ports.
    # This container cannot connect to the application or existing database.
    checked(["docker", "run", "--detach", "--name", name, "--network", "none",
             "--mount", f"type=volume,source={volume},target=/var/lib/postgresql",
             "-e", "POSTGRES_USER=restorecheck", "-e", "POSTGRES_DB=restorecheck",
             "-e", "POSTGRES_PASSWORD=restorecheck-isolated-fixture-only",
             config["services"]["postgres"]["image"]], stdout=subprocess.DEVNULL)
    try:
        for _ in range(60):
            probe = subprocess.run(["docker", "exec", name, "pg_isready", "-U", "restorecheck", "-d", "restorecheck"], capture_output=True)
            if probe.returncode == 0:
                break
            time.sleep(1)
        else:
            raise ValueError("Isolated restore database did not become ready.")
        with archive_path.open("rb") as archive:
            checked(["docker", "exec", "-i", name, "pg_restore", "-U", "restorecheck", "-d", "restorecheck",
                     "--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges"],
                    stdin=archive, stdout=subprocess.DEVNULL)
        sql = "SELECT 'migrations', count(*) FROM drizzle.__drizzle_migrations UNION ALL SELECT 'users', count(*) FROM public.\"user\" UNION ALL SELECT 'schedules', count(*) FROM public.schedule_entry UNION ALL SELECT 'exceptions', count(*) FROM public.schedule_exception UNION ALL SELECT 'preferences', count(*) FROM public.schedule_preference;"
        counts = checked(["docker", "exec", name, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "restorecheck", "-d", "restorecheck", "-Atc", sql], stdout=subprocess.PIPE)
        rows = dict(line.split("|", 1) for line in counts.stdout.decode().strip().splitlines())
        if int(rows.get("migrations", "0")) < 3:
            raise ValueError("Restored database is missing the Phase 5 migration baseline.")
        print("Restore succeeded; compare these administrative counts with the source during a write freeze:")
        print(counts.stdout.decode().strip())
    finally:
        stopped = subprocess.run(["docker", "stop", "--time", "60", name], capture_output=True)
        if stopped.returncode:
            raise ValueError("Could not stop the isolated restore container. Inspect containers named wangmai-restorecheck-* manually.")
        print(f"Isolated restore container stopped: {name}; retained volume: {volume}.")
        print("Do not promote this test volume. It uses public fixture credentials. No database or volume was deleted.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("preflight", "backup", "verify-backup"))
    parser.add_argument("--env-file", required=True)
    parser.add_argument("--destination", help="Backup directory, preferably outside the checkout")
    parser.add_argument("--archive", help="Existing custom-format dump for an isolated restore drill")
    parser.add_argument("--local-smoke", action="store_true", help="Use the isolated local HTTP smoke project, never production")
    parser.add_argument("--recovery-file", help="Explicit reviewed recovery Compose override; required after a volume recovery")
    args = parser.parse_args()
    command, config = configuration(args.env_file, args.local_smoke, args.recovery_file)
    if args.action == "preflight":
        errors = validate(config)
        if errors:
            raise ValueError("\n".join(errors))
        print("Configuration preflight passed. DNS, VM, OAuth credentials, TLS and backups still require manual verification.")
    elif args.action == "backup":
        if not args.destination:
            parser.error("backup requires --destination")
        backup(command, args.destination)
    else:
        if not args.archive:
            parser.error("verify-backup requires --archive")
        verify_backup(config, args.archive)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as error:
        # Never print arbitrary exception text, which can include secrets or rendered config.
        if isinstance(error, ValueError) and not isinstance(error, json.JSONDecodeError):
            print(str(error), file=sys.stderr)
        else:
            print("Operation failed. Check Docker, file paths and permissions.", file=sys.stderr)
        sys.exit(1)
