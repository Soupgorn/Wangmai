#!/usr/bin/env python3
"""Manual deployment guards and binary-safe backups. Never starts production services."""
import argparse
import hashlib
import ipaddress
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


INGRESS_MODES = ("direct-https", "shared-gateway")


def configuration(env_file, local_smoke=False, recovery_file=None, ingress_mode=None, database_ops=False):
    if local_smoke and ingress_mode:
        raise ValueError("Local smoke and production ingress modes cannot be combined.")
    if not local_smoke and ingress_mode not in INGRESS_MODES:
        raise ValueError("Explicit --ingress-mode direct-https or shared-gateway is required.")
    command = ["docker", "compose", "--project-name", "wangmai-smoke" if local_smoke else "wangmai", "--env-file",
               str(Path(env_file).resolve()), "-f", str(ROOT / "compose.yaml")]
    if local_smoke:
        command += ["-f", str(ROOT / "infra/smoke/compose.yaml")]
    else:
        command += ["-f", str(ROOT / f"compose.{ingress_mode}.yaml")]
    if database_ops:
        if local_smoke:
            raise ValueError("Production database tools and legacy local smoke cannot be combined.")
        command += ["-f", str(ROOT / "compose.database-ops.yaml"), "--profile", "database-ops"]
    if recovery_file:
        if local_smoke:
            raise ValueError("Recovery and local smoke overrides cannot be combined.")
        command += ["-f", str(Path(recovery_file).resolve(strict=True))]
    # Rendered configuration contains secrets: capture it, never print it or exception output.
    result = subprocess.run(command + ["config", "--format", "json"], capture_output=True)
    if result.returncode:
        raise ValueError("Compose configuration failed. Check the env file and required variables.")
    config = json.loads(result.stdout)
    if not local_smoke and config.get("services", {}).get("caddy", {}).get("environment", {}).get("WANGMAI_INGRESS_MODE") != ingress_mode:
        raise ValueError("Ingress mode must agree in the env file and selected Compose override.")
    return command, config


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
    roles = [postgres.get(field, "") for field in ("POSTGRES_USER", "POSTGRES_RUNTIME_USER", "POSTGRES_MIGRATION_USER")]
    require(len(set(roles)) == 3 and all(re.fullmatch(r"[a-z][a-z0-9_]{2,62}", role) and not role.startswith("pg_") for role in roles),
            "Admin, runtime and migration roles must be explicit, valid and distinct.")
    require(backend.get("DATABASE_RUNTIME_ROLE") == postgres.get("POSTGRES_RUNTIME_USER"),
            "Backend runtime role must match the dedicated runtime identity.")
    try:
        uri = urlsplit(backend["DATABASE_URL"])
        require(uri.scheme in ("postgres", "postgresql") and uri.hostname == "postgres"
                and uri.port in (None, 5432) and not uri.query and not uri.fragment
                and unquote(uri.username or "") == postgres.get("POSTGRES_RUNTIME_USER")
                and configured(unquote(uri.password or "")) and len(unquote(uri.password or "")) >= 24
                and unquote(uri.path.removeprefix("/")) == postgres["POSTGRES_DB"],
                "DATABASE_URL must use the dedicated runtime identity, a strong password, and internal postgres:5432 database target.")
    except ValueError:
        errors.append("DATABASE_URL is malformed.")
    for name in ("frontend", "backend", "postgres"):
        require(not services[name].get("ports"), f"{name} must not publish host ports.")
    for name in ("frontend", "backend", "postgres", "caddy"):
        environment = services[name].get("environment", {})
        require(not services[name].get("secrets"), f"{name} must not mount operator secrets in steady-state production.")
        forbidden = [key for key in environment if "MIGRATION_DATABASE" in key or key in
            ("POSTGRES_PASSWORD", "POSTGRES_PASSWORD_FILE", "POSTGRES_ADMIN_PASSWORD", "POSTGRES_ADMIN_PASSWORD_FILE",
             "POSTGRES_MIGRATION_PASSWORD", "POSTGRES_MIGRATION_PASSWORD_FILE")]
        require(not forbidden, f"{name} must not receive initialization/migration credentials in steady-state production.")
    require(not services["frontend"].get("environment", {}).get("DATABASE_URL"), "Frontend must not receive database credentials.")
    for name in ("frontend", "caddy"):
        require(not any(key.startswith(("DATABASE_", "POSTGRES_", "PGPASSWORD", "MIGRATION_", "NEXT_PUBLIC_DATABASE"))
                        for key in services[name].get("environment", {})),
                f"{name} must not receive database/operator configuration.")
    ports = services["caddy"].get("ports", [])
    ingress = services["caddy"]["environment"]
    mode = ingress.get("WANGMAI_INGRESS_MODE")
    require(mode in INGRESS_MODES, "Explicit production ingress mode is required; no fallback is permitted.")
    require(services["caddy"].get("command") == ["sh", "/etc/caddy/start.sh", mode],
            "Caddy must use the startup guard and the matching explicit mode override.")
    require((ingress.get("WANGMAI_DIRECT_HTTPS_CONFIG") == "selected" and not ingress.get("WANGMAI_SHARED_GATEWAY_CONFIG"))
            if mode == "direct-https" else (ingress.get("WANGMAI_SHARED_GATEWAY_CONFIG") == "selected" and not ingress.get("WANGMAI_DIRECT_HTTPS_CONFIG")),
            "Select exactly one ingress Compose override; combining both modes is forbidden.")
    if mode == "direct-https":
        require(len(ports) == 3 and {(str(p.get("published")), p.get("target"), p.get("protocol", "tcp")) for p in ports}
                == {("80", 80, "tcp"), ("443", 443, "tcp"), ("443", 443, "udp")},
                "Direct HTTPS must publish only 80/tcp, 443/tcp and 443/udp.")
    elif mode == "shared-gateway":
        require(len(ports) == 1 and str(ports[0].get("published")) == "80"
                and ports[0].get("target") == 80 and ports[0].get("protocol", "tcp") == "tcp",
                "Shared gateway must publish only origin 80/tcp.")
        try:
            bind = ipaddress.ip_address(ports[0].get("host_ip", "")) if ports else None
            require(isinstance(bind, ipaddress.IPv4Address) and any(bind in ipaddress.ip_network(cidr) for cidr in
                    ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")),
                    "HTTP origin must bind an explicitly verified private IPv4 interface.")
        except ValueError:
            errors.append("HTTP origin must bind an explicitly verified private IPv4 interface.")
        raw_cidrs = ingress.get("WANGMAI_GATEWAY_CIDRS", "")
        try:
            cidrs = raw_cidrs.split(" ")
            networks = [ipaddress.ip_network(cidr, strict=True) for cidr in cidrs]
            require(bool(networks) and all("/" in cidr for cidr in cidrs)
                    and not any(char in raw_cidrs for char in "\r\n\t")
                    and all(net.prefixlen > 0 and not net.is_loopback and not net.is_multicast
                            and not net.network_address.is_unspecified
                            and str(net) not in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7", "fd00::/8")
                            for net in networks),
                    "Gateway CIDRs must be explicit verified peer ranges, never wildcard or blanket private trust.")
        except ValueError:
            errors.append("Gateway CIDRs must be space-separated canonical CIDRs; no guessed defaults.")
        for field in ("WANGMAI_GATEWAY_HEADERS_VERIFIED", "WANGMAI_ORIGIN_CONFIDENTIALITY_VERIFIED",
                      "WANGMAI_ORIGIN_SOURCE_RESTRICTION_VERIFIED"):
            require(ingress.get(field) == "verified", f"{field} must be verified against administrator evidence; activation is BLOCKED.")
        reference = ingress.get("WANGMAI_GATEWAY_CONTRACT_REFERENCE", "")
        require(configured(reference) and reference.strip() == reference and reference.lower() not in ("unverified", "pending", "unknown"),
                "Record a reviewed gateway security contract evidence reference before activation.")
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


def validate_database_tools(config, read_files=True):
    """Static role/secret wiring plus private secret-file checks; never prints values."""
    errors = validate(config)
    services = config["services"]
    postgres = services["postgres"]["environment"]
    for name in ("bootstrap", "migrator"):
        tool = services.get(name, {})
        if (tool.get("image") != services["backend"]["image"] or tool.get("restart") != "no" or tool.get("ports")
                or set(tool.get("networks", {})) != {"database"} or tool.get("user", "node") != "node"
                or "ALL" not in tool.get("cap_drop", []) or "no-new-privileges:true" not in tool.get("security_opt", [])):
            errors.append(f"{name} must remain an isolated, non-root, one-shot database tool using the reviewed backend image.")
    migration = services.get("migrator", {}).get("environment", {})
    bootstrap = services.get("bootstrap", {}).get("environment", {})
    if (migration.get("NODE_ENV") != "production" or migration.get("DATABASE_RUNTIME_ROLE") != postgres.get("POSTGRES_RUNTIME_USER")
            or migration.get("DATABASE_MIGRATION_ROLE") != postgres.get("POSTGRES_MIGRATION_USER")
            or migration.get("MIGRATION_DATABASE_URL_FILE") != "/run/secrets/migration_database_url"
            or set(migration) != {"NODE_ENV", "DATABASE_RUNTIME_ROLE", "DATABASE_MIGRATION_ROLE", "MIGRATION_DATABASE_URL_FILE"}
            or {secret["source"] for secret in services.get("migrator", {}).get("secrets", [])} != {"migration_database_url"}):
        errors.append("Migrator must receive only its migration URL file and role metadata, never runtime/admin/auth credentials.")
    if any(bootstrap.get(key) != postgres.get(key) for key in ("POSTGRES_USER", "POSTGRES_DB", "POSTGRES_RUNTIME_USER", "POSTGRES_MIGRATION_USER")):
        errors.append("Bootstrap role/database metadata must match the reviewed steady-state configuration.")
    if (bootstrap.get("PGHOST") != "postgres" or
        {secret["source"] for secret in services.get("bootstrap", {}).get("secrets", [])} !=
            {"postgres_admin_password", "postgres_runtime_password", "postgres_migration_password"} or
        any(bootstrap.get(key) != "/run/secrets/" + name for key, name in (
            ("POSTGRES_ADMIN_PASSWORD_FILE", "postgres_admin_password"), ("POSTGRES_RUNTIME_PASSWORD_FILE", "postgres_runtime_password"),
            ("POSTGRES_MIGRATION_PASSWORD_FILE", "postgres_migration_password")))):
        errors.append("Bootstrap must use only the reviewed internal host and its three role password files.")
    if not read_files:
        return errors
    values = {}
    for name in ("postgres_admin_password", "postgres_runtime_password", "postgres_migration_password", "migration_database_url"):
        try:
            path = Path(config["secrets"][name]["file"])
            if os.name == "posix" and path.stat().st_mode & 0o077:
                errors.append("Database operator secret files must have private filesystem permissions.")
            value = path.read_text(encoding="utf-8").removesuffix("\n").removesuffix("\r")
            if not value or any(char in value for char in "\r\n\0") or any(word in value.lower() for word in ("change_me", "replace-with", "fixture", "example")):
                errors.append("Database operator secret files must contain real single-line secrets, never placeholders.")
            values[name] = value
        except (OSError, KeyError, UnicodeError):
            errors.append("Database operator secret files are missing or unreadable; values were withheld.")
    if len(values) == 4:
        passwords = [values[key] for key in ("postgres_admin_password", "postgres_runtime_password", "postgres_migration_password")]
        if len(set(passwords)) != 3 or any(not re.fullmatch(r"[\x21-\x7e]{24,}", password) for password in passwords):
            errors.append("Admin, runtime and migration passwords must be independent, strong printable ASCII (24+ characters, no whitespace).")
        try:
            runtime = urlsplit(services["backend"]["environment"]["DATABASE_URL"])
            migration_url = urlsplit(values["migration_database_url"])
            if (unquote(runtime.password or "") != values["postgres_runtime_password"] or migration_url.scheme not in ("postgres", "postgresql")
                    or migration_url.hostname != "postgres" or migration_url.port not in (None, 5432) or migration_url.query or migration_url.fragment
                    or unquote(migration_url.username or "") != postgres.get("POSTGRES_MIGRATION_USER")
                    or unquote(migration_url.password or "") != values["postgres_migration_password"]
                    or unquote(migration_url.path.removeprefix("/")) != postgres["POSTGRES_DB"]):
                errors.append("Separate migration target/password and runtime password file must match the reviewed internal role configuration.")
        except ValueError:
            errors.append("Migration URL file is malformed; its contents were withheld.")
    return errors


def checked(command, **kwargs):
    result = subprocess.run(command, stderr=subprocess.PIPE, **kwargs)
    if result.returncode:
        raise ValueError("Docker operation failed. Inspect service health and permissions; diagnostic output was withheld to protect secrets.")
    return result


def backup(command, destination):
    return backup_database(command + ["exec", "-T", "postgres"], destination)


def backup_database(prefix, destination):
    directory = Path(destination).resolve()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    name = f"wangmai-{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}-{uuid4().hex[:8]}.dump"
    partial = directory / (name + ".partial")
    # Exclusive create; no existing backup can be overwritten. Partial files never count as backups.
    fd = os.open(partial, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "wb") as output:
        checked(prefix + ["sh", "-eu", "-c",
            'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges'], stdout=output)
    with partial.open("rb") as archive:
        checked(prefix + ["pg_restore", "--list"], stdin=archive, stdout=subprocess.DEVNULL)
    target = directory / name
    partial.rename(target)
    with target.open("rb") as archive:
        digest = hashlib.file_digest(archive, "sha256").hexdigest()
    with (directory / (name + ".sha256")).open("x", encoding="ascii") as checksum:
        checksum.write(f"{digest}  {name}\n")
    print(f"Archive created (restore drill still required): {target}")
    return target


def verify_archive(source):
    archive_path = Path(source).resolve(strict=True)
    expected = Path(str(archive_path) + ".sha256").read_text(encoding="ascii").split()[0]
    with archive_path.open("rb") as archive:
        if hashlib.file_digest(archive, "sha256").hexdigest() != expected:
            raise ValueError("Backup checksum mismatch; restore was not attempted.")
    return archive_path


def restore_archive(prefix, source):
    """Restore trusted app archive only into an empty, explicitly bootstrapped DB."""
    archive_path = verify_archive(source)
    empty = checked(prefix + ["sh", "-eu", "-c",
        '''exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','drizzle') AND c.relkind IN ('r','p','S','v','m','f')"'''], stdout=subprocess.PIPE)
    if empty.stdout.strip() != b"0":
        raise ValueError("Restore target is not empty; existing objects/data were not changed.")
    with archive_path.open("rb") as archive:
        listing = checked(prefix + ["pg_restore", "--list"], stdin=archive, stdout=subprocess.PIPE).stdout.decode("utf-8")
    # Bootstrap already creates owned/restricted schemas. Restore their contents,
    # without duplicate CREATE SCHEMA, source owners or source ACLs.
    listing = "\n".join(line for line in listing.splitlines()
        if not re.match(r"^\d+; \d+ \d+ SCHEMA - (public|drizzle) ", line)) + "\n"
    temporary = "/tmp/wangmai-restore-list-" + uuid4().hex
    try:
        checked(prefix + ["sh", "-eu", "-c", 'umask 077; set -C; cat > "$1"', "sh", temporary], input=listing.encode("utf-8"))
        with archive_path.open("rb") as archive:
            checked(prefix + ["sh", "-eu", "-c",
                'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --role "$POSTGRES_MIGRATION_USER" --exit-on-error --single-transaction --no-owner --no-privileges --schema public --schema drizzle --use-list "$1"', "sh", temporary],
                stdin=archive, stdout=subprocess.DEVNULL)
    finally:
        checked(prefix + ["rm", "-f", "--", temporary], stdout=subprocess.DEVNULL)
    print("Archive restored as migration owner. Reapply reviewed runtime grants and verify live roles before starting any app.")


def verify_backup(config, source, retain=True):
    archive_path = verify_archive(source)
    name = f"wangmai-restorecheck-{uuid4().hex[:12]}"
    volume = name + "-data"
    # Public fixture credentials, a new volume, zero network, zero published ports.
    # This container cannot connect to the application or existing database.
    checked(["docker", "run", "--detach", "--name", name, "--network", "none",
             "--mount", f"type=volume,source={volume},target=/var/lib/postgresql",
             "-e", "POSTGRES_USER=restorecheck", "-e", "POSTGRES_DB=restorecheck",
             "-e", "POSTGRES_PASSWORD=restorecheck-isolated-fixture-only",
             "-e", "POSTGRES_MIGRATION_USER=restore_migrator",
             config["services"]["postgres"]["image"]], stdout=subprocess.DEVNULL)
    try:
        for _ in range(60):
            probe = subprocess.run(["docker", "exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "restorecheck", "-d", "restorecheck"], capture_output=True)
            if probe.returncode == 0:
                break
            time.sleep(1)
        else:
            raise ValueError("Isolated restore database did not become ready.")
        # Tool containers share ONLY the network-none restore container's loopback.
        # No production env, network, secret or database is mounted into this drill.
        def tool(script, environment, *arguments):
            options = ["docker", "run", "--rm", "--pull", "never", "--network", f"container:{name}"]
            for key, value in environment.items():
                options += ["-e", f"{key}={value}"]
            checked(options + [config["services"]["backend"]["image"], "node", f"backend/dist/db/{script}.js", *arguments], stdout=subprocess.DEVNULL)
        tool("bootstrap", {"PGHOST": "127.0.0.1", "POSTGRES_USER": "restorecheck", "POSTGRES_DB": "restorecheck",
            "POSTGRES_RUNTIME_USER": "restore_runtime", "POSTGRES_MIGRATION_USER": "restore_migrator",
            "POSTGRES_ADMIN_PASSWORD": "restorecheck-isolated-fixture-only", "POSTGRES_RUNTIME_PASSWORD": "restorecheck-runtime-fixture-only",
            "POSTGRES_MIGRATION_PASSWORD": "restorecheck-migration-fixture-only"})
        restore_archive(["docker", "exec", "-i", name], archive_path)
        tool("migrate", {"NODE_ENV": "production", "DATABASE_MIGRATION_ROLE": "restore_migrator", "DATABASE_RUNTIME_ROLE": "restore_runtime",
            "MIGRATION_DATABASE_URL": "postgresql://restore_migrator:restorecheck-migration-fixture-only@127.0.0.1:5432/restorecheck"}, "--grant-only")
        tool("check", {"NODE_ENV": "production", "DATABASE_RUNTIME_ROLE": "restore_runtime",
            "DATABASE_URL": "postgresql://restore_runtime:restorecheck-runtime-fixture-only@127.0.0.1:5432/restorecheck",
            "BETTER_AUTH_URL": "https://restore.invalid", "BETTER_AUTH_SECRET": "restorecheck-auth-fixture-only-never-production",
            "GOOGLE_CLIENT_ID": "restore-fixture.apps.googleusercontent.com", "GOOGLE_CLIENT_SECRET": "restore-fixture-only"})
        sql = "SELECT 'migrations', count(*) FROM drizzle.__drizzle_migrations UNION ALL SELECT 'users', count(*) FROM public.\"user\" UNION ALL SELECT 'schedules', count(*) FROM public.schedule_entry UNION ALL SELECT 'exceptions', count(*) FROM public.schedule_exception UNION ALL SELECT 'preferences', count(*) FROM public.schedule_preference;"
        counts = checked(["docker", "exec", name, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "restorecheck", "-d", "restorecheck", "-Atc", sql], stdout=subprocess.PIPE)
        rows = dict(line.split("|", 1) for line in counts.stdout.decode().strip().splitlines())
        if int(rows.get("migrations", "0")) < 3:
            raise ValueError("Restored database is missing the Phase 5 migration baseline.")
        print("Restore and live runtime privilege verification succeeded; compare counts with the source during a write freeze:")
        print(counts.stdout.decode().strip())
    finally:
        stopped = subprocess.run(["docker", "stop", "--time", "60", name], capture_output=True)
        if stopped.returncode:
            raise ValueError("Could not stop the isolated restore container. Inspect containers named wangmai-restorecheck-* manually.")
        if retain:
            print(f"Isolated restore container stopped: {name}; retained volume: {volume}.")
            print("Do not promote this test volume. It uses public fixture credentials. No database or volume was deleted.")
        else:
            # Only the UUID-named fixture resources created by this invocation.
            checked(["docker", "rm", name], stdout=subprocess.DEVNULL)
            checked(["docker", "volume", "rm", volume], stdout=subprocess.DEVNULL)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("preflight", "preflight-db", "preflight-runtime", "backup", "verify-backup", "restore"))
    parser.add_argument("--env-file", required=True)
    parser.add_argument("--ingress-mode", choices=INGRESS_MODES, help="Required for all production operations; must match the env file")
    parser.add_argument("--destination", help="Backup directory, preferably outside the checkout")
    parser.add_argument("--archive", help="Existing custom-format dump for an isolated restore drill")
    parser.add_argument("--confirm-empty-restore", action="store_true", help="Explicit operator confirmation of the reviewed empty recovery target")
    parser.add_argument("--local-smoke", action="store_true", help="Use the isolated local HTTP smoke project, never production")
    parser.add_argument("--recovery-file", help="Explicit reviewed recovery Compose override; required after a volume recovery")
    args = parser.parse_args()
    command, config = configuration(args.env_file, args.local_smoke, args.recovery_file, args.ingress_mode, args.action == "preflight-db")
    if args.action in ("preflight", "preflight-db", "preflight-runtime"):
        errors = validate_database_tools(config) if args.action == "preflight-db" else validate(config)
        if errors:
            raise ValueError("\n".join(errors))
        if args.action == "preflight-runtime":
            # No automatic build/pull or service dependency startup during live checks.
            checked(["docker", "image", "inspect", config["services"]["backend"]["image"], "--format", "{{.Id}}"], stdout=subprocess.DEVNULL)
            checked(command + ["run", "--rm", "--no-deps", "--pull", "never", "backend", "node", "backend/dist/db/check.js"], stdout=subprocess.DEVNULL)
            print("Live runtime database identity and exact privilege preflight passed. Other launch gates remain.")
        else:
            print("Configuration preflight passed. Live role checks, DNS, VM, OAuth, ingress security and backups still require verification.")
    elif args.action == "backup":
        if not args.destination:
            parser.error("backup requires --destination")
        backup(command, args.destination)
    elif args.action == "restore":
        if not args.archive or not args.confirm_empty_restore or args.local_smoke:
            parser.error("restore requires --archive, --confirm-empty-restore and an explicit production recovery configuration")
        errors = validate(config)
        if errors:
            raise ValueError("\n".join(errors))
        if not args.recovery_file:
            parser.error("restore requires --recovery-file to select a reviewed fresh volume")
        restore_archive(command + ["exec", "-T", "postgres"], args.archive)
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
