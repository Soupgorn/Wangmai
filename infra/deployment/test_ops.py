import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("ops", Path(__file__).with_name("ops.py"))
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


def valid_config():
    # Public fixtures only, intentionally different from the rejected smoke placeholders.
    return {"services": {
        "backend": {"image": "wangmai-backend:" + "a" * 40, "environment": {
            "NODE_ENV": "production", "BETTER_AUTH_URL": "https://calendar.company.org",
            "BETTER_AUTH_SECRET": "a" * 48, "GOOGLE_CLIENT_ID": "123456.apps.googleusercontent.com",
            "GOOGLE_CLIENT_SECRET": "testing-only-credential", "DATABASE_RUNTIME_ROLE": "wangmai_runtime", "DATABASE_URL": "postgresql://wangmai_runtime:" + "b" * 32 + "@postgres:5432/wangmai"}},
        "postgres": {"image": "postgres@sha256:" + "c" * 64, "environment": {"POSTGRES_USER": "wangmai_admin", "POSTGRES_RUNTIME_USER": "wangmai_runtime", "POSTGRES_MIGRATION_USER": "wangmai_migrator", "POSTGRES_DB": "wangmai"}},
        "frontend": {"image": "wangmai-frontend:" + "a" * 40, "environment": {"API_INTERNAL_ORIGIN": "http://backend:4000"}},
        "caddy": {"image": "caddy@sha256:" + "d" * 64, "command": ["sh", "/etc/caddy/start.sh", "direct-https"],
                  "environment": {"WANGMAI_DOMAIN": "calendar.company.org", "WANGMAI_INGRESS_MODE": "direct-https", "WANGMAI_DIRECT_HTTPS_CONFIG": "selected"}, "ports": [
            {"published": "80", "target": 80, "protocol": "tcp"},
            {"published": "443", "target": 443, "protocol": "tcp"},
            {"published": "443", "target": 443, "protocol": "udp"}]}},
        "networks": {"database": {"internal": True}}}


def gateway_config():
    config = valid_config()
    caddy = config["services"]["caddy"]
    caddy["command"][-1] = "shared-gateway"
    del caddy["environment"]["WANGMAI_DIRECT_HTTPS_CONFIG"]
    caddy["ports"] = [{"host_ip": "10.20.30.40", "published": "80", "target": 80, "protocol": "tcp"}]
    caddy["environment"].update({
        "WANGMAI_INGRESS_MODE": "shared-gateway", "WANGMAI_SHARED_GATEWAY_CONFIG": "selected", "WANGMAI_GATEWAY_CIDRS": "192.0.2.10/32 2001:db8::10/128",
        "WANGMAI_GATEWAY_HEADERS_VERIFIED": "verified", "WANGMAI_ORIGIN_CONFIDENTIALITY_VERIFIED": "verified",
        "WANGMAI_ORIGIN_SOURCE_RESTRICTION_VERIFIED": "verified", "WANGMAI_GATEWAY_CONTRACT_REFERENCE": "review/GW-123",
    })
    return config


class DeploymentTests(unittest.TestCase):
    @patch.object(ops, "checked")
    @patch.object(ops, "configuration")
    def test_live_preflight_cannot_start_a_tool_with_admin_runtime_credentials(self, configuration, checked):
        config = valid_config()
        config["services"]["backend"]["environment"]["DATABASE_URL"] = "postgresql://wangmai_admin:sensitive-password@postgres/wangmai"
        configuration.return_value = (["docker", "compose"], config)
        with patch.object(ops.sys, "argv", ["ops.py", "preflight-runtime", "--env-file", "unused", "--ingress-mode", "direct-https"]):
            with self.assertRaises(ValueError) as raised:
                ops.main()
        self.assertNotIn("sensitive-password", str(raised.exception))
        checked.assert_not_called()

    def test_role_separation_and_credential_boundaries_fail_closed(self):
        for field in ("POSTGRES_USER", "POSTGRES_MIGRATION_USER"):
            config = valid_config()
            config["services"]["postgres"]["environment"][field] = "wangmai_runtime"
            self.assertTrue(ops.validate(config))
        for service, field in (("backend", "MIGRATION_DATABASE_URL"), ("backend", "POSTGRES_ADMIN_PASSWORD"),
                               ("frontend", "DATABASE_URL"), ("postgres", "POSTGRES_PASSWORD")):
            config = valid_config()
            config["services"][service]["environment"][field] = "sensitive-value"
            self.assertTrue(ops.validate(config))
            self.assertNotIn("sensitive-value", " ".join(ops.validate(config)))
        for name in ("backend", "frontend", "postgres"):
            config = valid_config()
            config["services"][name]["secrets"] = [{"source": "migration_database_url"}]
            self.assertTrue(ops.validate(config))
        config = valid_config()
        config["services"]["backend"]["environment"]["DATABASE_URL"] = "postgresql://wangmai_admin:" + "b" * 32 + "@postgres/wangmai"
        self.assertTrue(ops.validate(config))

    def test_verified_gateway_contract(self):
        self.assertEqual(ops.validate(gateway_config()), [])

    def test_gateway_contract_is_blocked_until_every_confirmation_and_reference(self):
        for field in ("WANGMAI_GATEWAY_CIDRS", "WANGMAI_GATEWAY_HEADERS_VERIFIED", "WANGMAI_ORIGIN_CONFIDENTIALITY_VERIFIED",
                      "WANGMAI_ORIGIN_SOURCE_RESTRICTION_VERIFIED", "WANGMAI_GATEWAY_CONTRACT_REFERENCE"):
            for value in ("", "unverified", "CHANGE_ME"):
                config = gateway_config()
                config["services"]["caddy"]["environment"][field] = value
                self.assertTrue(ops.validate(config), field)

    def test_gateway_cidrs_cannot_be_wildcards_blanket_private_or_injected_config(self):
        for cidrs in ("0.0.0.0/0", "::/0", "private_ranges", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
                      "fd00::/8", "127.0.0.1/32", "192.0.2.10", "192.0.2.10/24", "192.0.2.10/32\n}", "192.0.2.10/32\t192.0.2.11/32"):
            config = gateway_config()
            config["services"]["caddy"]["environment"]["WANGMAI_GATEWAY_CIDRS"] = cidrs
            self.assertTrue(ops.validate(config), cidrs)

    def test_gateway_cannot_publish_tls_or_wildcard_origin(self):
        for ip in ("0.0.0.0", "::", "127.0.0.1", "203.0.113.2", ""):
            config = gateway_config()
            config["services"]["caddy"]["ports"][0]["host_ip"] = ip
            self.assertTrue(ops.validate(config))
        config = gateway_config()
        config["services"]["caddy"]["ports"].append({"published": "443", "target": 443})
        self.assertTrue(ops.validate(config))

    def test_mode_is_explicit_and_startup_guard_cannot_be_bypassed(self):
        for mode in (None, "", "auto", "local-smoke", "shared-gateway"):
            config = valid_config()
            config["services"]["caddy"]["environment"]["WANGMAI_INGRESS_MODE"] = mode
            self.assertTrue(ops.validate(config))
        config = valid_config()
        config["services"]["caddy"]["command"] = ["caddy", "run"]
        self.assertTrue(ops.validate(config))
        for config, other in ((valid_config(), "WANGMAI_SHARED_GATEWAY_CONFIG"), (gateway_config(), "WANGMAI_DIRECT_HTTPS_CONFIG")):
            config["services"]["caddy"]["environment"][other] = "selected"
            self.assertTrue(ops.validate(config), "Both overrides must fail even when the last override matches the selected mode")

    @patch.object(ops.subprocess, "run")
    def test_production_operations_require_explicit_matching_mode(self, run):
        with self.assertRaisesRegex(ValueError, "Explicit --ingress-mode"):
            ops.configuration(".env.production")
        run.assert_not_called()
        with self.assertRaisesRegex(ValueError, "cannot be combined"):
            ops.configuration("infra/smoke/.env.example", True, ingress_mode="direct-https")
        run.return_value = subprocess.CompletedProcess([], 0, b'{"services":{"caddy":{"environment":{"WANGMAI_INGRESS_MODE":"direct-https"}}}}', b"")
        with self.assertRaisesRegex(ValueError, "must agree"):
            ops.configuration(".env.production", ingress_mode="shared-gateway")

    def test_platform_details_are_absent_from_application_code(self):
        # Infrastructure changes must not introduce provider-specific business logic.
        for directory in (ops.ROOT / "backend/src", ops.ROOT / "frontend/src", ops.ROOT / "packages"):
            for source in directory.rglob("*"):
                if "node_modules" not in source.parts and "dist" not in source.parts and source.suffix in (".ts", ".tsx"):
                    content = source.read_text(encoding="utf-8").lower()
                    for forbidden in ("cloudstack", "ce-nacl.com", "10.60.2.22", "wangmai_gateway_", "wangmai_ingress_mode"):
                        self.assertNotIn(forbidden, content, str(source))

    def test_production_contract(self):
        self.assertEqual(ops.validate(valid_config()), [])

    def test_placeholder_and_mismatched_origins_fail(self):
        for domain in ("wangmai.example.com", "wangmai.invalid", "localhost", "http://calendar.company.org", "bad..org"):
            config = valid_config()
            config["services"]["caddy"]["environment"]["WANGMAI_DOMAIN"] = domain
            self.assertTrue(ops.validate(config))
        config = valid_config()
        config["services"]["backend"]["environment"]["BETTER_AUTH_URL"] += "/"
        self.assertTrue(ops.validate(config))

    def test_caddy_cannot_publish_admin_or_extra_ports(self):
        config = valid_config()
        config["services"]["caddy"]["ports"].append({"published": "2019", "target": 2019})
        self.assertTrue(ops.validate(config))

    def test_database_target_credentials_and_overrides_fail_closed(self):
        for uri in ("postgresql://someone:secret@public.host/db", "postgresql://wangmai:secret@postgres/wangmai?host=remote", "postgresql://[", "postgresql://postgres:bad-port/db"):
            config = valid_config()
            config["services"]["backend"]["environment"]["DATABASE_URL"] = uri
            errors = ops.validate(config)
            self.assertTrue(errors)
            self.assertNotIn(uri, " ".join(errors))

    def test_no_public_application_ports_or_external_database_network(self):
        for name in ("backend", "frontend", "postgres"):
            config = valid_config()
            config["services"][name]["ports"] = [{"published": "5432"}]
            self.assertTrue(ops.validate(config))
        config = valid_config()
        config["networks"]["database"]["internal"] = False
        self.assertTrue(ops.validate(config))

    def test_unreviewed_images_and_weak_secrets_fail(self):
        for name in ("backend", "frontend", "postgres", "caddy"):
            config = valid_config()
            config["services"][name]["image"] = "unreviewed:latest"
            self.assertTrue(ops.validate(config))
        config = valid_config()
        config["services"]["backend"]["environment"]["BETTER_AUTH_SECRET"] = "CHANGE_ME_long_placeholder_that_must_fail"
        self.assertTrue(ops.validate(config))

    @patch.object(ops.subprocess, "run")
    def test_compose_failure_does_not_expose_rendered_secrets(self, run):
        run.return_value = subprocess.CompletedProcess([], 1, b"sensitive stdout", b"sensitive stderr")
        with self.assertRaisesRegex(ValueError, "^Compose configuration failed") as raised:
            ops.configuration(".env.production", ingress_mode="direct-https")
        self.assertNotIn("sensitive", str(raised.exception))

    @patch.object(ops.subprocess, "run")
    def test_smoke_uses_separate_project_and_explicit_override(self, run):
        run.return_value = subprocess.CompletedProcess([], 0, b"{}", b"")
        command, _ = ops.configuration("infra/smoke/.env.example", True)
        self.assertIn("wangmai-smoke", command)
        self.assertIn(str(ops.ROOT / "infra/smoke/compose.yaml"), command)

    @patch.object(ops.subprocess, "run")
    def test_recovery_override_is_explicit_and_cannot_mix_with_smoke(self, run):
        run.return_value = subprocess.CompletedProcess([], 0, b"{}", b"")
        with tempfile.TemporaryDirectory() as directory:
            override = Path(directory) / "compose.recovery.yaml"
            override.write_text("volumes: {}\n")
            run.return_value = subprocess.CompletedProcess([], 0, b'{"services":{"caddy":{"environment":{"WANGMAI_INGRESS_MODE":"shared-gateway"}}}}', b"")
            command, _ = ops.configuration(".env.production", recovery_file=override, ingress_mode="shared-gateway")
            self.assertIn(str(ops.ROOT / "compose.shared-gateway.yaml"), command)
            self.assertEqual(command[-2:], ["-f", str(override.resolve())])
            with self.assertRaisesRegex(ValueError, "cannot be combined"):
                ops.configuration(".env.production", True, override)

    @patch.object(ops.subprocess, "run")
    def test_corrupted_backup_never_starts_restore_container(self, run):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "test.dump"
            source.write_bytes(b"damaged")
            Path(str(source) + ".sha256").write_text("0" * 64 + "  test.dump\n")
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                ops.verify_backup(valid_config(), source)
        run.assert_not_called()

    @patch.object(ops, "checked")
    def test_failed_backup_retains_partial_and_never_reports_complete(self, checked):
        checked.side_effect = ValueError("controlled failure")
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "controlled failure"):
                ops.backup(["docker", "compose"], directory)
            files = list(Path(directory).iterdir())
            self.assertEqual(len(files), 1)
            self.assertTrue(files[0].name.endswith(".partial"))


if __name__ == "__main__":
    unittest.main()
