#!/usr/bin/env python3
"""Disposable Compose production simulation. No host ports, real OAuth or production env."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from uuid import uuid4
import tls_fixtures

ROOT = Path(__file__).resolve().parents[2]


def command(args, **kwargs):
    result = subprocess.run(args, capture_output=True, **kwargs)
    if result.returncode:
        raise RuntimeError("Disposable simulation operation failed: " + result.stderr.decode(errors="replace")[-1200:] + result.stdout.decode(errors="replace")[-1800:])
    return result.stdout.decode().strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend-image", required=True)
    parser.add_argument("--frontend-image", required=True)
    parser.add_argument("--postgres-image", default="postgres:18-alpine")
    parser.add_argument("--caddy-image", default="caddy:2-alpine")
    parser.add_argument("--ingress-mode", choices=("shared-gateway", "shared-gateway-https"), default="shared-gateway")
    args = parser.parse_args()
    endpoint = command(["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"])
    if os.environ.get("DOCKER_HOST") or not endpoint.startswith(("unix://", "npipe://")):
        raise RuntimeError("A reviewed local Docker socket is required")
    for image in (args.backend_image, args.frontend_image, args.postgres_image, args.caddy_image):
        command(["docker", "image", "inspect", image, "--format", "{{.Id}}"])
    for image in (args.backend_image, args.frontend_image):
        config = json.loads(command(["docker", "image", "inspect", image]))[0]["Config"]
        assert config["User"] == "node", "Application images must remain non-root"
        assert not any(value.split("=", 1)[0].startswith(("DATABASE_", "MIGRATION_", "POSTGRES_", "BETTER_AUTH_", "GOOGLE_", "NEXT_PUBLIC_")) for value in config["Env"])
        command(["docker", "run", "--rm", "--pull", "never", "--network", "none", "--entrypoint", "node", image, "-e",
                 "const fs=require('node:fs'); for(const p of ['.env','.env.production','infra/smoke/oauth-preload.mjs']) if(fs.existsSync(p)) process.exit(1)"])
    project = "wangmai-production-smoke-" + uuid4().hex[:10]
    safe_env = {key: value for key, value in os.environ.items() if not key.startswith(("COMPOSE_", "WANGMAI_", "POSTGRES_", "DATABASE_", "BETTER_AUTH_", "GOOGLE_", "MIGRATION_"))}
    with tempfile.TemporaryDirectory(prefix=project) as directory:
        fixture = Path(directory)
        fixture.chmod(0o755)
        for name in ("oauth-preload.mjs", "production-check.mjs"):
            shutil.copyfile(ROOT / "infra/smoke" / name, fixture / name)
            (fixture / name).chmod(0o644)
        (fixture / "oauth-control.json").write_text("{}")
        (fixture / "oauth-control.json").chmod(0o666)  # Public synthetic registry, never real credentials.
        (fixture / "session-state.json").write_text("{}")
        (fixture / "session-state.json").chmod(0o666)
        gateway_config = '''{
  local_certs
  skip_install_trust
  log default {
    exclude http.log.access http.log.error
  }
}
wangmai.invalid {
  reverse_proxy caddy:80
}
'''
        if args.ingress_mode == "shared-gateway-https":
            tls_fixtures.provision(fixture / "origin-tls")
            # Test gateway explicitly supports this DNS identity and this disposable
            # CA. This supplies no evidence about real NaCl capabilities.
            shutil.copyfile(fixture / "origin-tls/trust.pem", fixture / "origin-trust.pem")
            (fixture / "origin-trust.pem").chmod(0o644)
            gateway_config = gateway_config.replace("reverse_proxy caddy:80", """reverse_proxy https://caddy:443 {
    header_up Host {hostport}
    transport http {
      tls_server_name origin.invalid
      tls_trust_pool file /fixtures/origin-trust.pem
    }
  }""")
        (fixture / "gateway.Caddyfile").write_text(gateway_config)
        (fixture / "gateway.Caddyfile").chmod(0o644)
        secrets = {"admin": "simulation-admin-password-00000000", "runtime": "simulation-runtime-password-00000000", "migrator": "simulation-migrator-password-00000000",
                   "migration-url": "postgresql://simulation_migrator:simulation-migrator-password-00000000@postgres:5432/simulation"}
        for name, value in secrets.items():
            (fixture / name).write_text(value)
            (fixture / name).chmod(0o600)
        if os.name == "posix":
            # Only our four newly created public fixture files. Production tools
            # remain non-root; Linux bind secrets must be readable by Node UID 1000.
            command(["docker", "run", "--rm", "--pull", "never", "--network", "none", "--user", "0:0", "--mount", f"type=bind,source={fixture},target=/fixtures",
                     "--entrypoint", "chown", args.backend_image, "1000:1000", *["/fixtures/" + name for name in secrets]])
        env_values = {
            "WANGMAI_IMAGE_TAG": "simulation-only", "WANGMAI_INGRESS_MODE": args.ingress_mode, "WANGMAI_DOMAIN": "wangmai.invalid",
            "WANGMAI_ORIGIN_BIND_IP": "127.0.0.1", "WANGMAI_GATEWAY_CIDRS": "192.0.2.1/32",
            "WANGMAI_GATEWAY_HEADERS_VERIFIED": "verified", "WANGMAI_ORIGIN_CONFIDENTIALITY_VERIFIED": "verified",
            "WANGMAI_ORIGIN_SOURCE_RESTRICTION_VERIFIED": "verified", "WANGMAI_GATEWAY_CONTRACT_REFERENCE": "disposable-simulation-only",
            "POSTGRES_USER": "simulation_admin", "POSTGRES_DB": "simulation", "POSTGRES_RUNTIME_USER": "simulation_runtime", "POSTGRES_MIGRATION_USER": "simulation_migrator",
            "DATABASE_URL": "postgresql://simulation_runtime:" + secrets["runtime"] + "@postgres:5432/simulation",
            "BETTER_AUTH_URL": "https://wangmai.invalid", "BETTER_AUTH_SECRET": "simulation-auth-secret-only-000000000000000000000000",
            "GOOGLE_CLIENT_ID": "simulation.apps.googleusercontent.com", "GOOGLE_CLIENT_SECRET": "simulation-only-not-a-google-credential",
            "POSTGRES_IMAGE": args.postgres_image, "CADDY_IMAGE": args.caddy_image,
            "POSTGRES_ADMIN_PASSWORD_FILE": str(fixture / "admin"), "POSTGRES_RUNTIME_PASSWORD_FILE": str(fixture / "runtime"),
            "POSTGRES_MIGRATION_PASSWORD_FILE": str(fixture / "migrator"), "MIGRATION_DATABASE_URL_FILE": str(fixture / "migration-url"),
        }
        if args.ingress_mode == "shared-gateway-https":
            env_values.update({"WANGMAI_GATEWAY_TLS_VERIFICATION_VERIFIED": "verified",
                "WANGMAI_ORIGIN_BIND_IP": "10.20.30.40",
                "WANGMAI_GATEWAY_TLS_CONTRACT_REFERENCE": "disposable-simulation-only", "WANGMAI_ORIGIN_TLS_IDENTITY": "origin.invalid",
                "WANGMAI_ORIGIN_TLS_CERT_FILE": str(fixture / "origin-tls/fullchain.pem"),
                "WANGMAI_ORIGIN_TLS_KEY_FILE": str(fixture / "origin-tls/private.key"),
                "WANGMAI_ORIGIN_TLS_CA_FILE": str(fixture / "origin-tls/trust.pem")})
        env_file = fixture / "fixtures.env"
        def write_env():
            env_file.write_text("\n".join(f"{key}={value}" for key, value in env_values.items()))
        write_env()
        # JSON is a YAML subset. All inherited public ports are explicitly replaced.
        override = {"services": {
            "frontend": {"image": args.frontend_image, "healthcheck": {"interval": "1s", "start_period": "2s", "retries": 3}},
            "backend": {"image": args.backend_image, "command": ["node", "--import", "/fixtures/oauth-preload.mjs", "backend/dist/index.js"],
                        "volumes": [f"{fixture}:/fixtures:ro"], "healthcheck": {"interval": "1s", "start_period": "2s", "retries": 3}},
            "bootstrap": {"image": args.backend_image}, "migrator": {"image": args.backend_image},
            "gateway": {"image": args.caddy_image, "command": ["caddy", "run", "--config", "/fixtures/gateway.Caddyfile", "--adapter", "caddyfile"],
                        "volumes": [f"{fixture}:/fixtures:ro"], "networks": ["app"]},
            "client": {"image": args.backend_image, "entrypoint": ["node"], "command": ["-e", "setInterval(()=>{},1000)"],
                       "user": "1000:1000", "volumes": [f"{fixture}:/fixtures"], "networks": ["app"]},
        }}
        # Compose's !override is required for port deletion; serialize it separately.
        override_path = fixture / "compose.simulation.yaml"
        text = json.dumps(override)
        # JSON content plus a YAML override cannot be concatenated; create caddy
        # override in a second small YAML document/file instead.
        override_path.write_text(text)
        ports_path = fixture / "compose.no-ports.yaml"
        ports_path.write_text("services:\n  caddy:\n    ports: !override []\n")
        base = ["docker", "compose", "--project-name", project, "--env-file", str(env_file), "-f", str(ROOT / "compose.yaml"), "-f", str(ROOT / "compose.caddy-rollback.yaml"),
                "-f", str(ROOT / f"compose.{args.ingress_mode}.yaml"), "-f", str(ROOT / "compose.database-ops.yaml"), "-f", str(override_path), "-f", str(ports_path), "--profile", "database-ops"]
        def dc(*args2):
            return command(base + list(args2), env=safe_env)
        model = json.loads(dc("config", "--format", "json"))
        assert all(not service.get("ports") for service in model["services"].values()), "Simulation must publish no ports"
        assert all(value["name"].startswith(project + "_") and not value.get("external") for value in model["volumes"].values())
        assert not command(["docker", "ps", "-aq", "--filter", "label=com.docker.compose.project=" + project])
        def container(service):
            return dc("ps", "-aq", service)
        def check(phase):
            print(dc("exec", "-T", "client", "node", "/fixtures/production-check.mjs", phase), flush=True)
        def sql(query):
            return dc("exec", "-T", "postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "simulation_admin", "-d", "simulation", "-Atc", query)
        try:
            command(base + ["-f", str(ROOT / "compose.database-init.yaml"), "up", "-d", "--wait", "--no-build", "--pull", "never", "postgres"], env=safe_env)
            dc("up", "-d", "--wait", "--no-deps", "--no-build", "--pull", "never", "--force-recreate", "postgres")
            dc("run", "--rm", "--no-deps", "--pull", "never", "bootstrap")
            dc("run", "--rm", "--no-deps", "--pull", "never", "migrator")
            dc("up", "-d", "--no-deps", "--no-build", "--pull", "never", "gateway", "client")
            gateway = container("gateway")
            networks = json.loads(command(["docker", "inspect", "--format", "{{json .NetworkSettings.Networks}}", gateway]))
            env_values["WANGMAI_GATEWAY_CIDRS"] = networks[project + "_app"]["IPAddress"] + "/32"
            write_env()
            for _ in range(40):
                copied = subprocess.run(["docker", "cp", gateway + ":/data/caddy/pki/authorities/local/root.crt", str(fixture / "root.crt")], capture_output=True)
                if copied.returncode == 0:
                    (fixture / "root.crt").chmod(0o644)
                    break
                time.sleep(0.25)
            else:
                raise RuntimeError("Local gateway CA did not become ready")
            dc("up", "-d", "--wait", "--no-build", "--pull", "never", "frontend", "backend", "caddy")
            check("initial")
            token = sql("SELECT access_token FROM public.account WHERE access_token IS NOT NULL LIMIT 1")
            assert token and token != "synthetic-private-provider-token", "Provider tokens must be encrypted at rest"
            dc("up", "-d", "--wait", "--no-deps", "--no-build", "--pull", "never", "--force-recreate", "backend", "frontend")
            check("persist")
            before = container("backend")
            started = command(["docker", "inspect", "--format", "{{.State.StartedAt}}", before])
            dc("stop", "--timeout", "5", "postgres")
            check("outage")
            dc("up", "-d", "--wait", "--no-deps", "--no-build", "--pull", "never", "postgres")
            dc("up", "-d", "--wait", "--no-deps", "--no-build", "--pull", "never", "backend", "frontend")
            assert container("backend") == before, "Database outage must not restart the API"
            assert command(["docker", "inspect", "--format", "{{.State.StartedAt}}", before]) == started, "API process must recover without a restart"
            check("persist")
            dc("up", "-d", "--wait", "--no-deps", "--no-build", "--pull", "never", "--force-recreate", "postgres")
            dc("up", "-d", "--wait", "--no-deps", "--no-build", "--pull", "never", "backend", "frontend")
            check("persist")
            lock = subprocess.Popen(base + ["exec", "-T", "postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "simulation_admin", "-d", "simulation", "-c",
                "BEGIN; LOCK TABLE public.schedule_entry IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(4); COMMIT;"], env=safe_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            for _ in range(25):
                if sql("SELECT count(*) FROM pg_locks WHERE relation='public.schedule_entry'::regclass AND mode='AccessExclusiveLock' AND granted") == "1": break
                time.sleep(0.1)
            else:
                raise RuntimeError("Fixture table lock was not observed")
            slow = subprocess.Popen(base + ["exec", "-T", "client", "node", "/fixtures/production-check.mjs", "slow"], env=safe_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            for _ in range(25):
                if sql("SELECT count(*) FROM pg_stat_activity WHERE usename='simulation_runtime' AND wait_event_type='Lock'") != "0": break
                time.sleep(0.1)
            else:
                raise RuntimeError("In-flight runtime request was not observed before SIGTERM")
            dc("stop", "--timeout", "28", "backend")
            slow_out, slow_err = slow.communicate(timeout=15)
            lock.communicate(timeout=10)
            assert lock.returncode == 0, "Fixture lock must release normally"
            assert slow.returncode == 0, slow_err.decode()
            print(slow_out.decode().strip(), flush=True)
            assert command(["docker", "inspect", "--format", "{{.State.ExitCode}}", before]) == "0", "SIGTERM must drain cleanly"
            logs = dc("logs", "--no-color", "backend", "frontend", "caddy", "gateway", "postgres")
            for marker in [*secrets.values(), env_values["BETTER_AUTH_SECRET"], env_values["GOOGLE_CLIENT_SECRET"], "synthetic-private-provider-token", "simulation-code-", "private-synthetic-weekly-title"]:
                assert marker not in logs, "Sensitive fixture content leaked into service logs"
            assert "shutdown_complete" in logs
            print("PASS: TLS gateway/shared origin, mock OAuth, privacy/CRUD, readiness outage/recovery, persistence, clean SIGTERM and secret-safe logs", flush=True)
        finally:
            # Unique project and volume-prefix checks above protect existing data.
            dc("down", "--volumes", "--remove-orphans", "--timeout", "10")


if __name__ == "__main__":
    main()
