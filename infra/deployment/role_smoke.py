#!/usr/bin/env python3
"""Local disposable PostgreSQL role, application and recovery rehearsal. No production env."""
import argparse
import importlib.util
import json
import os
import socket
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from uuid import uuid4
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("ops", Path(__file__).with_name("ops.py"))
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


def run(command, env=None, expected=0):
    result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != expected:
        # Every subprocess gets only public fixtures. Never call this tool with real env files.
        raise RuntimeError(f"Disposable role smoke failed ({command[0]}): {result.stdout[-5000:]} {result.stderr[-3000:]}")
    return result.stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-image", default="postgres:18-alpine")
    parser.add_argument("--backend-image", help="Optional locally built current backend image for ops.py isolated restore drill")
    args = parser.parse_args()
    endpoint = run(["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"])
    if os.environ.get("DOCKER_HOST") or not endpoint.startswith(("npipe://", "unix://")):
        raise RuntimeError("An explicitly reviewed local Docker socket is required")
    run(["docker", "image", "inspect", args.postgres_image, "--format", "{{.Id}}"])
    if args.backend_image:
        run(["docker", "image", "inspect", args.backend_image, "--format", "{{.Id}}"])
    identity = uuid4().hex[:12]
    network = "wangmai-roles-smoke-" + identity
    database = "wangmai_roles_" + identity
    names = []
    clean_env = {key: value for key, value in os.environ.items() if key != "NODE_OPTIONS" and not key.startswith(("PG", "POSTGRES_", "DATABASE_", "MIGRATION_", "BETTER_AUTH_", "GOOGLE_", "ROLE_TEST_", "WANGMAI_"))}
    bootstrap = {"POSTGRES_USER": "role_admin", "POSTGRES_DB": database, "POSTGRES_RUNTIME_USER": "role_runtime", "POSTGRES_MIGRATION_USER": "role_migrator",
                 "POSTGRES_ADMIN_PASSWORD": "public-admin-fixture-only-000000", "POSTGRES_RUNTIME_PASSWORD": "public-runtime-fixture-only-000000",
                 "POSTGRES_MIGRATION_PASSWORD": "public-migrator-fixture-only-000000", "PGHOST": "127.0.0.1"}
    tsx = ["node", str(ROOT / "node_modules/tsx/dist/cli.mjs")]
    # A unique bridge with inter-container traffic disabled; native Node tests use
    # only ephemeral 127.0.0.1 ports. It never joins any existing application network.
    run(["docker", "network", "create", "--opt", "com.docker.network.bridge.enable_icc=false", network])
    secret_directory = tempfile.TemporaryDirectory(prefix=network + "-secrets-")
    secret_files = {}
    for key in ("POSTGRES_ADMIN_PASSWORD", "POSTGRES_RUNTIME_PASSWORD", "POSTGRES_MIGRATION_PASSWORD"):
        path = Path(secret_directory.name) / key
        path.write_text(bootstrap[key], encoding="utf-8")
        path.chmod(0o600)
        secret_files[key] = str(path)
    def start(suffix):
        name = network + "-" + suffix
        names.append(name)
        run(["docker", "run", "--detach", "--pull", "never", "--name", name, "--network", network,
             "--publish", "127.0.0.1::5432", "-e", "POSTGRES_USER=role_admin", "-e", f"POSTGRES_DB={database}",
             "-e", "POSTGRES_MIGRATION_USER=role_migrator", "-e", "POSTGRES_PASSWORD=" + bootstrap["POSTGRES_ADMIN_PASSWORD"], args.postgres_image])
        port = run(["docker", "port", name, "5432/tcp"]).rsplit(":", 1)[1]
        for _ in range(60):
            probe = subprocess.run(["docker", "exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "role_admin", "-d", database], capture_output=True)
            if probe.returncode == 0:
                return name, port
            time.sleep(0.5)
        raise RuntimeError("Disposable PostgreSQL did not become ready")
    def url(role, password, port):
        return f"postgresql://{role}:{password}@127.0.0.1:{port}/{database}"
    def bootstrap_database(port, extra=None, expected=0):
        environment = clean_env | bootstrap | {"PGPORT": port} | (extra or {})
        for key, path in secret_files.items():
            if not extra or key not in extra:
                environment.pop(key, None)
                environment[key + "_FILE"] = path
        return run(tsx + ["backend/src/db/bootstrap.ts"], environment, expected)
    def migrate_database(port, *arguments):
        path = Path(secret_directory.name) / ("migration-" + port)
        path.write_text(url("role_migrator", bootstrap["POSTGRES_MIGRATION_PASSWORD"], port), encoding="utf-8")
        path.chmod(0o600)
        environment = clean_env | {"NODE_ENV": "production", "DATABASE_RUNTIME_ROLE": "role_runtime", "DATABASE_MIGRATION_ROLE": "role_migrator",
            "MIGRATION_DATABASE_URL_FILE": str(path)}
        return run(tsx + ["backend/src/db/migrate.ts", *arguments], environment)
    def fingerprint(name):
        sql = "\n".join(f'''SELECT '{table}', count(*), md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) FROM public."{table}" t;'''
            for table in ("user", "account", "session", "verification", "schedule_entry", "schedule_exception", "schedule_preference"))
        sql += "\nSELECT 'journal', count(*), md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM drizzle.__drizzle_migrations t;"
        result = subprocess.run(["docker", "exec", "-i", name, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "role_admin", "-d", database, "-At"], input=sql, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError("Disposable fingerprint query failed")
        return result.stdout
    try:
        source, port = start("source")
        print(bootstrap_database(port), flush=True)
        print(bootstrap_database(port), flush=True)
        print(migrate_database(port), flush=True)
        print(migrate_database(port), flush=True)
        print(bootstrap_database(port), flush=True)
        bootstrap_database(port, {"POSTGRES_RUNTIME_PASSWORD": "different-runtime-fixture-000000"}, expected=1)
        print("PASS: fresh/repeated bootstrap, migration replay and fail-closed secret mismatch", flush=True)
        environment = clean_env | {"NODE_ENV": "production", "DATABASE_RUNTIME_ROLE": "role_runtime",
            "DATABASE_URL": url("role_runtime", bootstrap["POSTGRES_RUNTIME_PASSWORD"], port), "POSTGRES_DB": database, "POSTGRES_PORT": port,
            "BETTER_AUTH_URL": "https://roles.invalid", "BETTER_AUTH_SECRET": "public-auth-fixture-only-never-production-000000000",
            "GOOGLE_CLIENT_ID": "role-fixture.apps.googleusercontent.com", "GOOGLE_CLIENT_SECRET": "public-google-fixture-only",
            "WANGMAI_ROLE_TEST": "isolated-disposable", "ROLE_TEST_MIGRATION_URL": url("role_migrator", bootstrap["POSTGRES_MIGRATION_PASSWORD"], port),
            "ROLE_TEST_MIGRATION_ROLE": "role_migrator", "ROLE_TEST_ADMIN_ROLE": "role_admin"}
        print(run(tsx + ["--test", "backend/tests/database-roles.test.ts"], environment), flush=True)
        # Current API entrypoint must start with the verified runtime identity, while
        # the same entrypoint must reject administrative credentials.
        check = run(tsx + ["backend/src/db/check.ts"], environment)
        print(check, flush=True)
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            api_port = listener.getsockname()[1]
        api_env = {key: value for key, value in environment.items() if not key.startswith("ROLE_TEST_")}
        api_env.update({"HOST": "127.0.0.1", "PORT": str(api_port)})
        api = subprocess.Popen(["node", "--import", "tsx", "backend/src/index.ts"], cwd=ROOT, env=api_env,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            for _ in range(50):
                try:
                    with urlopen(f"http://127.0.0.1:{api_port}/api/health", timeout=1) as response:
                        assert json.load(response) == {"status": "ok", "service": "wangmai-api"}
                    break
                except OSError:
                    if api.poll() is not None:
                        raise RuntimeError("Runtime-only API startup failed")
                    time.sleep(0.2)
            else:
                raise RuntimeError("Runtime-only API startup timed out")
            print("PASS: actual API entrypoint starts with runtime-only credentials", flush=True)
        finally:
            api.terminate()
            api.communicate(timeout=15)
        run(tsx + ["backend/src/db/check.ts"], environment | {"DATABASE_URL": url("role_admin", bootstrap["POSTGRES_ADMIN_PASSWORD"], port), "DATABASE_RUNTIME_ROLE": "role_admin"}, expected=1)
        prefix = ["docker", "exec", "-i", source]
        def admin_sql(sql):
            run(prefix + ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "role_admin", "-d", database, "-c", sql])
        for grant, revoke in (("GRANT TRUNCATE ON public.session TO role_runtime", "REVOKE TRUNCATE ON public.session FROM role_runtime"),
                              ("GRANT SELECT ON public.session TO role_runtime WITH GRANT OPTION", "REVOKE GRANT OPTION FOR SELECT ON public.session FROM role_runtime"),
                              ("GRANT SELECT (token) ON public.session TO role_runtime WITH GRANT OPTION", "REVOKE SELECT (token) ON public.session FROM role_runtime"),
                              ("GRANT REFERENCES (id) ON public.session TO role_runtime", "REVOKE REFERENCES (id) ON public.session FROM role_runtime"),
                              ("GRANT role_migrator TO role_runtime", "REVOKE role_migrator FROM role_runtime")):
            admin_sql(grant)
            try:
                run(tsx + ["backend/src/db/check.ts"], environment, expected=1)
            finally:
                admin_sql(revoke)
        admin_sql("CREATE TABLE public.unrelated_fixture(id int)")
        try:
            bootstrap_database(port, expected=1)
        finally:
            admin_sql("DROP TABLE public.unrelated_fixture")
        print("PASS: live guard detects excess grants/membership; bootstrap refuses unexpected existing ownership", flush=True)
        # Existing tests set their own validated NODE_ENV=test database targets.
        # Keep the library process in development mode, as npm's existing script
        # does: Better Auth's global test mode intentionally disables origin checks.
        test_env = environment | {"NODE_ENV": "development", "DATABASE_URL": url("role_admin", bootstrap["POSTGRES_ADMIN_PASSWORD"], port)}
        files = [str(path) for path in sorted((ROOT / "backend/tests").glob("*.integration.test.ts"))]
        print(run(tsx + ["--test", *files], test_env), flush=True)
        before = fingerprint(source)
        with tempfile.TemporaryDirectory(prefix=network + "-") as directory:
            archive = ops.backup_database(["docker", "exec", "-i", source], directory)
            target, target_port = start("restore")
            bootstrap_database(target_port)
            ops.restore_archive(["docker", "exec", "-i", target], archive)
            migrate_database(target_port, "--grant-only")
            assert fingerprint(target) == before, "Restore changed fixture data or journal"
            restored = environment | {"DATABASE_URL": url("role_runtime", bootstrap["POSTGRES_RUNTIME_PASSWORD"], target_port), "POSTGRES_PORT": target_port}
            print(run(tsx + ["backend/src/db/check.ts"], restored), flush=True)
            try:
                ops.restore_archive(["docker", "exec", "-i", target], archive)
            except ValueError as error:
                assert "not empty" in str(error)
            else:
                raise AssertionError("Nonempty restore target must be rejected")
            if args.backend_image:
                ops.verify_backup({"services": {"postgres": {"image": args.postgres_image}, "backend": {"image": args.backend_image}}}, archive, retain=False)
        print("PASS: exact data/journal backup-restore fingerprints, migration ownership, runtime grants and nonempty-target protection", flush=True)
    finally:
        for name in reversed(names):
            subprocess.run(["docker", "rm", "--force", "--volumes", name], capture_output=True)
        run(["docker", "network", "rm", network])
        secret_directory.cleanup()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
