#!/usr/bin/env python3
"""Isolated HTTPS-origin contract smoke; local existing images, no host ports or real secrets."""
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
from proxy_smoke import docker, ROOT


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node-image", required=True)
    parser.add_argument("--caddy-image", default="caddy:2-alpine")
    args = parser.parse_args()
    if os.environ.get("DOCKER_HOST") or not docker("context", "inspect", "--format", "{{.Endpoints.docker.Host}}").startswith(("npipe://", "unix://")):
        raise RuntimeError("A local Docker socket without an endpoint override is required")
    for image in (args.node_image, args.caddy_image): docker("image", "inspect", image, "--format", "{{.Id}}")
    prefix = "wangmai-origin-tls-" + uuid4().hex[:10]
    network = prefix + "-net"
    names = []
    with tempfile.TemporaryDirectory(prefix=prefix) as directory:
        fixture = Path(directory); fixture.chmod(0o755)
        public = fixture / "public"; public.mkdir(); public.chmod(0o755)
        private = fixture / "private"; private.mkdir(); private.chmod(0o700)
        for name in ("proxy-fixture.mjs", "proxy-check.mjs", "origin-tls-check.mjs"):
            shutil.copyfile(ROOT / "infra/smoke" / name, public / name); (public / name).chmod(0o644)
        for name in ("fullchain.pem", "private.key", "trust.pem"):
            (private / name).touch(); (private / name).chmod(0o600)
        docker("network", "create", "--internal", network)
        def start(suffix, image, command, env=(), aliases=(), tls=False):
            name = prefix + "-" + suffix; names.append(name)
            options = ["run", "-d", "--pull", "never", "--name", name, "--network", network, "--mount", f"type=bind,source={public},target=/fixtures,readonly"]
            for alias in aliases: options += ["--network-alias", alias]
            for value in env: options += ["-e", value]
            if tls:
                options += ["--mount", f"type=bind,source={ROOT / 'infra/caddy'},target=/etc/caddy,readonly"]
                for file in ("fullchain.pem", "private.key", "trust.pem"):
                    options += ["--mount", f"type=bind,source={private / file},target=/run/wangmai-origin/{file},readonly"]
            docker(*options, "--entrypoint", command[0], image, *command[1:])
            return name
        def ip(name): return json.loads(docker("inspect", "--format", "{{json .NetworkSettings.Networks}}", name))[network]["IPAddress"]
        try:
            gateway = start("gateway", args.node_image, ["node", "-e", "setInterval(()=>{},1000)"])
            start("upstream", args.node_image, ["node", "/fixtures/proxy-fixture.mjs"], aliases=("frontend", "backend"))
            env = ["WANGMAI_INGRESS_MODE=shared-gateway-https", "WANGMAI_SHARED_GATEWAY_HTTPS_CONFIG=selected", "WANGMAI_DOMAIN=wangmai.invalid",
                "WANGMAI_GATEWAY_CIDRS=" + ip(gateway) + "/32", "WANGMAI_GATEWAY_HEADERS_VERIFIED=verified", "WANGMAI_ORIGIN_CONFIDENTIALITY_VERIFIED=verified",
                "WANGMAI_ORIGIN_SOURCE_RESTRICTION_VERIFIED=verified", "WANGMAI_GATEWAY_CONTRACT_REFERENCE=disposable-test-only",
                "WANGMAI_GATEWAY_TLS_VERIFICATION_VERIFIED=verified", "WANGMAI_GATEWAY_TLS_CONTRACT_REFERENCE=disposable-test-only"]
            # The fixture gate lets us provision a SAN for the actual newly assigned
            # origin IP before executing the unchanged production startup guard.
            origin = start("origin", args.caddy_image, ["sh", "-ec", 'until [ -f /fixtures/ready ]; do sleep 0.1; done; export WANGMAI_ORIGIN_TLS_IDENTITY="$(cat /fixtures/identity)"; export WANGMAI_ORIGIN_BIND_IP="$WANGMAI_ORIGIN_TLS_IDENTITY"; exec sh /etc/caddy/start.sh shared-gateway-https'], env=env, tls=True)
            address = ip(origin)
            tls_fixtures.provision(private, identity=address)
            shutil.copyfile(private / "trust.pem", public / "root.crt"); (public / "root.crt").chmod(0o644)
            (public / "identity").write_text(address); (public / "identity").chmod(0o644)
            (public / "ready").touch()
            for _ in range(60):
                result = subprocess.run(["docker", "exec", origin, "wget", "-qO-", "http://127.0.0.1:2019/config/"], capture_output=True)
                if result.returncode == 0: break
                time.sleep(0.25)
            else: raise RuntimeError("Provisioned TLS origin did not start")
            config = json.loads(result.stdout)
            assert not config["apps"].get("pki") and not config["apps"]["tls"].get("automation", {}).get("policies"), "No internal CA or certificate automation"
            assert all(server["listen"] == [":443"] and server["automatic_https"]["disable"] for server in config["apps"]["http"]["servers"].values())
            for name in names:
                assert not json.loads(docker("inspect", "--format", "{{json .HostConfig.PortBindings}}", name)), "No public test ports"
            print(docker("exec", gateway, "node", "/fixtures/origin-tls-check.mjs", address), flush=True)
            print(docker("exec", gateway, "node", "/fixtures/proxy-check.mjs", "gateway-https", address), flush=True)
            print(docker("run", "--rm", "--pull", "never", "--network", network, "--mount", f"type=bind,source={public},target=/fixtures,readonly", "--entrypoint", "node", args.node_image, "/fixtures/proxy-check.mjs", "untrusted-https", address), flush=True)
            # Negative startup checks execute only the real production entrypoint.
            env += ["WANGMAI_ORIGIN_TLS_IDENTITY=" + address, "WANGMAI_ORIGIN_BIND_IP=" + address]
            for override in ("WANGMAI_GATEWAY_TLS_VERIFICATION_VERIFIED=unverified", "WANGMAI_SHARED_GATEWAY_CONFIG=selected", "WANGMAI_DIRECT_HTTPS_CONFIG=selected", "WANGMAI_ORIGIN_BIND_IP=0.0.0.0"):
                failed = start("bad-" + uuid4().hex[:5], args.caddy_image, ["sh", "/etc/caddy/start.sh", "shared-gateway-https"], env=[*env, override], tls=True)
                assert docker("wait", failed) == "1"
            for replacement in ((private / "ca.key").read_bytes(), b"", b"malformed-private-key"):
                (private / "private.key").write_bytes(replacement)
                failed = start("bad-key-" + uuid4().hex[:5], args.caddy_image, ["sh", "/etc/caddy/start.sh", "shared-gateway-https"], env=[*env, "WANGMAI_ORIGIN_TLS_IDENTITY=" + address], tls=True)
                assert docker("wait", failed) == "1"
            logs = subprocess.run(["docker", "logs", origin], capture_output=True, text=True)
            assert not any(marker in logs.stdout + logs.stderr for marker in ("synthetic-oauth-marker", "synthetic-cookie", "PRIVATE KEY"))
            print("PASS: provisioned TLS/IP identity, trust failures, peer/header/routing guards, private ports and startup failures", flush=True)
        finally:
            for name in reversed(names): subprocess.run(["docker", "rm", "--force", "--volumes", name], capture_output=True)
            docker("network", "rm", network)


if __name__ == "__main__": main()
