"""Offline provisioned-origin TLS checks. No network, issuance, secret output or fallback."""
import ipaddress
import os
from pathlib import Path
import re
import ssl
import subprocess

TARGETS = ("fullchain.pem", "private.key", "trust.pem")


def validate(config):
    caddy = config["services"]["caddy"]
    env = caddy["environment"]
    errors = []
    if env.get("WANGMAI_ORIGIN_BIND_IP") != (caddy.get("ports") or [{}])[0].get("host_ip"):
        errors.append("Origin bind address must match the published private interface and startup guard.")
    for flag in ("WANGMAI_GATEWAY_TLS_VERIFICATION_VERIFIED",):
        if env.get(flag) != "verified":
            errors.append(flag + " requires actual upstream chain/identity verification evidence; activation is BLOCKED.")
    reference = env.get("WANGMAI_GATEWAY_TLS_CONTRACT_REFERENCE", "")
    if not reference.strip() or reference != reference.strip() or any(word in reference.lower() for word in ("change_me", "unverified", "pending", "unknown", "example", "fixture")):
        errors.append("Record the reviewed NaCl TLS verification/identity/trust contract reference.")
    identity = env.get("WANGMAI_ORIGIN_TLS_IDENTITY", "")
    try:
        address = ipaddress.ip_address(identity)
        if str(address) != identity or identity != (caddy.get("ports") or [{}])[0].get("host_ip"):
            raise ValueError()
        verification = ["-verify_ip", identity]
    except ValueError:
        if not re.fullmatch(r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*", identity):
            errors.append("TLS identity must be the canonical bound IP or an explicitly supported verification DNS hostname.")
        verification = ["-verify_hostname", identity]
    paths = []
    root = Path(__file__).resolve().parents[2]
    for target in TARGETS:
        mounts = [mount for mount in caddy.get("volumes", []) if mount.get("target") == "/run/wangmai-origin/" + target]
        if len(mounts) != 1 or mounts[0].get("type") != "bind" or mounts[0].get("read_only") is not True or mounts[0].get("bind", {}).get("create_host_path", False):
            errors.append("Origin TLS requires three explicit read-only file binds without auto-creation.")
            continue
        try:
            path = Path(mounts[0]["source"])
            if not path.is_absolute() or path.is_symlink() or not path.is_file() or path.stat().st_size == 0 or path.resolve().is_relative_to(root):
                raise ValueError()
            if os.name == "posix" and path.stat().st_mode & (0o077 if target == "private.key" else 0o022):
                raise ValueError()
            if os.name == "posix" and (path.stat().st_uid not in (0, os.geteuid()) or path.parent.stat().st_mode & 0o022):
                raise ValueError()
            # Explicit readability check; never print bytes or SSL exception text.
            with path.open("rb") as stream: stream.read(1)
            paths.append(path)
        except (OSError, ValueError, KeyError):
            errors.append("Origin TLS files must be readable regular non-symlink files outside the checkout, with protected permissions.")
    # Never permit TLS/operator files in another service or mounts masking the checked files.
    for name, service in config["services"].items():
        for mount in service.get("volumes", []):
            target = mount.get("target", "")
            if name == "caddy" and (target in ("/", "/run", "/run/wangmai-origin") or target.startswith("/run/wangmai-origin/") and target.removeprefix("/run/wangmai-origin/") not in TARGETS):
                errors.append("Unexpected origin TLS mount target.")
            if name != "caddy" and mount.get("type") == "bind":
                source = Path(mount.get("source", ""))
                if source.is_absolute() and any(path.resolve().is_relative_to(source.resolve()) for path in paths):
                    errors.append("Only Caddy may mount origin TLS files or their parent directory.")
    if errors or len(paths) != 3:
        return errors
    cert, key, ca = paths
    try:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cert, key, password=lambda: "")  # No interactive password prompt.
        def openssl(*args):
            result = subprocess.run(["openssl", *args], capture_output=True, timeout=10)
            if result.returncode: raise ValueError()
            return result.stdout.decode("ascii")
        san = openssl("x509", "-in", str(cert), "-noout", "-ext", "subjectAltName")
        if (verification[0] == "-verify_ip" and "IP Address:" not in san or
                verification[0] == "-verify_hostname" and "DNS:" not in san):
            raise ValueError()  # Never fall back to a CN-only identity.
        openssl("x509", "-in", str(cert), "-checkend", "86400", "-noout")
        openssl("verify", "-no-CApath", "-no-CAstore", "-CAfile", str(ca), "-untrusted", str(cert),
                "-auth_level", "2", "-purpose", "sslserver", *verification, str(cert))
    except (OSError, ValueError, ssl.SSLError, subprocess.TimeoutExpired):
        errors.append("Origin TLS verification failed: require OpenSSL 3+, valid chain/SAN/server purpose, 24h validity and a matching readable unencrypted key; details withheld.")
    return errors
