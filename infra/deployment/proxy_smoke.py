#!/usr/bin/env python3
"""Isolated proxy contract smoke. Uses only local images and synthetic upstreams."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]


def docker(*args, expected=0):
    result = subprocess.run(["docker", *args], capture_output=True, text=True)
    if result.returncode != expected:
        raise RuntimeError(f"Local smoke command failed ({args[0]}): {result.stderr[-1600:]} {result.stdout[-1600:]}")
    return result.stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--caddy-image", default="caddy:2-alpine")
    parser.add_argument("--node-image", default="wangmai-backend:phase6a-smoke", help="Existing local Node image; never built or pulled by this tool")
    parser.add_argument("--frontend-image", help="Optional current frontend image; --node-image must then be a current Wangmai backend image with role tools")
    parser.add_argument("--postgres-image", default="postgres:18-alpine", help="Existing image for optional disposable application database")
    args = parser.parse_args()
    endpoint = docker("context", "inspect", "--format", "{{.Endpoints.docker.Host}}")
    if not (endpoint.startswith("npipe://") or endpoint.startswith("unix://")):
        raise RuntimeError("Smoke requires an explicitly reviewed local Docker socket context.")
    for image in (args.caddy_image, args.node_image):
        docker("image", "inspect", image, "--format", "{{.Id}}")
    if args.frontend_image:
        for image in (args.frontend_image, args.postgres_image):
            docker("image", "inspect", image, "--format", "{{.Id}}")
    prefix = "wangmai-proxy-smoke-" + uuid4().hex[:10]
    network = prefix + "-net"
    containers = []
    with tempfile.TemporaryDirectory(prefix=prefix) as directory:
        fixture = Path(directory)
        for source in (ROOT / "infra/caddy").iterdir():
            if source.is_file():
                shutil.copyfile(source, fixture / source.name)
        for name in ("proxy-fixture.mjs", "proxy-check.mjs"):
            shutil.copyfile(ROOT / "infra/smoke" / name, fixture / name)
        # Exact direct production config with only the certificate issuer changed locally.
        direct = (fixture / "Caddyfile").read_text(encoding="utf-8")
        (fixture / "Caddyfile.direct-test").write_text(direct.replace("{\n", "{\n\tlocal_certs\n\tskip_install_trust\n", 1), encoding="utf-8")
        docker("network", "create", "--internal", network)
        def start(suffix, image, *command, aliases=(), env=()):
            name = prefix + "-" + suffix
            containers.append(name)
            options = ["run", "--detach", "--pull", "never", "--name", name, "--network", network,
                       "--mount", f"type=bind,source={fixture},target=/fixtures,readonly",
                       "--mount", f"type=bind,source={fixture},target=/etc/caddy,readonly"]
            for alias in aliases:
                options += ["--network-alias", alias]
            for entry in env:
                options += ["-e", entry]
            docker(*options, "--entrypoint", command[0], image, *command[1:])
            return name
        try:
            gateway = start("gateway", args.node_image, "node", "-e", "setInterval(()=>{},1000)")
            peer = json.loads(docker("inspect", "--format", "{{json .NetworkSettings.Networks}}", gateway))[network]["IPAddress"]
            upstream = start("upstream", args.node_image, "node", "/fixtures/proxy-fixture.mjs", aliases=("backend", "frontend"))
            shared_env = ("WANGMAI_DOMAIN=wangmai.invalid", f"WANGMAI_GATEWAY_CIDRS={peer}/32")
            # Validation never runs ACME; startup for shared mode has auto_https off.
            for config in ("Caddyfile", "Caddyfile.shared-gateway"):
                docker("run", "--rm", "--pull", "never", "--network", "none", "--mount",
                       f"type=bind,source={fixture},target=/etc/caddy,readonly", "-e", shared_env[0], "-e", shared_env[1],
                       args.caddy_image, "caddy", "validate", "--config", "/etc/caddy/" + config, "--adapter", "caddyfile")
            verified = dict(entry.split("=", 1) for entry in (*shared_env,
                "WANGMAI_INGRESS_MODE=shared-gateway", "WANGMAI_SHARED_GATEWAY_CONFIG=selected",
                "WANGMAI_GATEWAY_HEADERS_VERIFIED=verified", "WANGMAI_ORIGIN_CONFIDENTIALITY_VERIFIED=verified",
                "WANGMAI_ORIGIN_SOURCE_RESTRICTION_VERIFIED=verified", "WANGMAI_GATEWAY_CONTRACT_REFERENCE=isolated-synthetic-test-only"))
            cases = [("unselected", {}), ("shared-gateway", {"WANGMAI_INGRESS_MODE": "direct-https"}),
                     ("shared-gateway", {"WANGMAI_DIRECT_HTTPS_CONFIG": "selected"}),
                     ("shared-gateway", {"WANGMAI_GATEWAY_CIDRS": "0.0.0.0/0"})]
            for field in ("WANGMAI_GATEWAY_HEADERS_VERIFIED", "WANGMAI_ORIGIN_CONFIDENTIALITY_VERIFIED",
                          "WANGMAI_ORIGIN_SOURCE_RESTRICTION_VERIFIED", "WANGMAI_GATEWAY_CONTRACT_REFERENCE"):
                cases.append(("shared-gateway", {field: "unverified"}))
            for selected, overrides in cases:
                env = []
                for key, value in (verified | overrides).items():
                    env += ["-e", f"{key}={value}"]
                docker("run", "--rm", "--pull", "never", "--network", "none", "--mount", f"type=bind,source={fixture},target=/etc/caddy,readonly",
                       *env, "--entrypoint", "sh", args.caddy_image, "/etc/caddy/start.sh", selected, expected=1)
            shared = start("shared", args.caddy_image, "sh", "/etc/caddy/start.sh", "shared-gateway", aliases=("shared",), env=tuple(f"{key}={value}" for key, value in verified.items()))
            shutil.copyfile(fixture / "Caddyfile.direct-test", fixture / "Caddyfile")
            direct_name = start("direct", args.caddy_image, "sh", "/etc/caddy/start.sh", "direct-https", aliases=("direct",),
                                env=(shared_env[0], "WANGMAI_INGRESS_MODE=direct-https", "WANGMAI_DIRECT_HTTPS_CONFIG=selected"))
            for name in (shared, direct_name):
                for attempt in range(40):
                    probe = subprocess.run(["docker", "exec", name, "wget", "-qO-", "http://127.0.0.1:2019/config/"], capture_output=True)
                    if probe.returncode == 0:
                        config = json.loads(probe.stdout)
                        break
                    time.sleep(0.25)
                else:
                    raise RuntimeError("Local proxy did not become ready")
                if name == shared:
                    assert "tls" not in config["apps"], "HTTP origin has no TLS automation app"
                    for server in config["apps"]["http"]["servers"].values():
                        assert server["automatic_https"]["disable"] is True
                        assert server["listen"] == [":80"]
            docker("cp", direct_name + ":/data/caddy/pki/authorities/local/root.crt", str(fixture / "root.crt"))
            for mode in ("gateway", "direct"):
                print(docker("exec", gateway, "node", "/fixtures/proxy-check.mjs", mode, peer))
            print(docker("run", "--rm", "--pull", "never", "--network", network, "--mount", f"type=bind,source={fixture},target=/fixtures,readonly",
                         "--entrypoint", "node", args.node_image, "/fixtures/proxy-check.mjs", "untrusted"))
            docker("stop", "--time", "5", upstream)
            print(docker("exec", gateway, "node", "/fixtures/proxy-check.mjs", "failure"))
            for name in (shared, direct_name):
                logs = docker("logs", name)
                # docker writes Caddy logs to stderr; check both streams as well.
                result = subprocess.run(["docker", "logs", name], capture_output=True, text=True)
                logs += result.stderr
                for secret in ("synthetic-oauth-marker", "synthetic-cookie", "fixture%2Bstate"):
                    assert secret not in logs, "Sensitive synthetic request values leaked into proxy logs"
            print("PASS: production Caddy validation, mode guards, no HTTP-origin TLS/ACME, secret-safe failure logs")
            if args.frontend_image:
                # Replace only our disposable synthetic upstream with real local app images.
                # The optional fresh DB uses only public fixture credentials/data and local
                # migrations. Its anonymous volume belongs only to this disposable run.
                docker("rm", "--volumes", upstream)
                containers.remove(upstream)
                postgres = start("postgres", args.postgres_image, "docker-entrypoint.sh", "postgres", aliases=("postgres",), env=(
                    "POSTGRES_USER=proxy_admin", "POSTGRES_DB=proxy_fixture", "POSTGRES_PASSWORD=public-proxy-admin-fixture-password"))
                for attempt in range(60):
                    ready = subprocess.run(["docker", "exec", postgres, "pg_isready", "-h", "127.0.0.1", "-U", "proxy_admin", "-d", "proxy_fixture"], capture_output=True)
                    if ready.returncode == 0:
                        break
                    time.sleep(0.5)
                else:
                    raise RuntimeError("Disposable application database did not become ready")
                def database_tool(script, entries):
                    options = ["run", "--rm", "--pull", "never", "--network", network]
                    for entry in entries:
                        options += ["-e", entry]
                    docker(*options, args.node_image, "node", f"backend/dist/db/{script}.js")
                database_tool("bootstrap", (
                    "PGHOST=postgres", "POSTGRES_USER=proxy_admin", "POSTGRES_DB=proxy_fixture",
                    "POSTGRES_RUNTIME_USER=proxy_runtime", "POSTGRES_MIGRATION_USER=proxy_migrator",
                    "POSTGRES_ADMIN_PASSWORD=public-proxy-admin-fixture-password",
                    "POSTGRES_RUNTIME_PASSWORD=public-proxy-runtime-fixture-password",
                    "POSTGRES_MIGRATION_PASSWORD=public-proxy-migrator-fixture-password"))
                database_tool("migrate", ("NODE_ENV=production", "DATABASE_RUNTIME_ROLE=proxy_runtime", "DATABASE_MIGRATION_ROLE=proxy_migrator",
                    "MIGRATION_DATABASE_URL=postgresql://proxy_migrator:public-proxy-migrator-fixture-password@postgres:5432/proxy_fixture"))
                backend = start("backend", args.node_image, "node", "backend/dist/index.js", aliases=("backend",), env=(
                    "NODE_ENV=production", "HOST=0.0.0.0", "PORT=4000", "BETTER_AUTH_URL=https://wangmai.invalid",
                    "BETTER_AUTH_SECRET=isolated-public-fixture-only-000000000000000000000000",
                    "GOOGLE_CLIENT_ID=synthetic.apps.googleusercontent.com", "GOOGLE_CLIENT_SECRET=synthetic-not-a-google-credential",
                    "DATABASE_RUNTIME_ROLE=proxy_runtime",
                    "DATABASE_URL=postgresql://proxy_runtime:public-proxy-runtime-fixture-password@postgres:5432/proxy_fixture"))
                start("frontend", args.frontend_image, "node", "frontend/server.js", aliases=("frontend",), env=(
                    "NODE_ENV=production", "HOSTNAME=0.0.0.0", "PORT=3000", "API_INTERNAL_ORIGIN=http://backend:4000"))
                for attempt in range(60):
                    result = subprocess.run(["docker", "exec", gateway, "node", "/fixtures/proxy-check.mjs", "application"], capture_output=True, text=True)
                    if result.returncode == 0:
                        print(result.stdout.strip())
                        break
                    time.sleep(0.5)
                else:
                    raise RuntimeError("Local application-image smoke failed: " + result.stderr[-1600:])
                print(docker("exec", backend, "node", "--input-type=module", "-e",
                    "import assert from 'node:assert/strict'; import {createAuth} from './backend/dist/auth/auth.js'; "
                    "import {loadEnv} from './backend/dist/config/env.js'; import {createDatabase} from './backend/dist/db/client.js'; "
                    "const env=loadEnv(); const {db,pool}=createDatabase(env); const auth=createAuth(env,db); "
                    "assert.equal(auth.options.baseURL,'https://wangmai.invalid'); assert.deepEqual(auth.options.trustedOrigins,[env.BETTER_AUTH_URL]); "
                    "assert.notEqual(auth.options.advanced.trustedProxyHeaders,true); assert.equal(auth.options.advanced.useSecureCookies,true); "
                    "assert.deepEqual(auth.options.advanced.defaultCookieAttributes,{httpOnly:true,sameSite:'lax',path:'/'}); "
                    "await pool.end(); console.log('PASS: fixed public auth URL, sole trusted origin, secure cookie configuration');"))
        finally:
            # Delete only the uniquely named disposable containers/network created above.
            # No persistent application volume is mounted or removed.
            for name in reversed(containers):
                subprocess.run(["docker", "rm", "--force", "--volumes", name], capture_output=True)
            docker("network", "rm", network)


if __name__ == "__main__":
    main()
