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
            "GOOGLE_CLIENT_SECRET": "testing-only-credential", "DATABASE_URL": "postgresql://wangmai:" + "b" * 32 + "@postgres:5432/wangmai"}},
        "postgres": {"image": "postgres@sha256:" + "c" * 64, "environment": {"POSTGRES_USER": "wangmai", "POSTGRES_PASSWORD": "b" * 32, "POSTGRES_DB": "wangmai"}},
        "frontend": {"image": "wangmai-frontend:" + "a" * 40, "environment": {"API_INTERNAL_ORIGIN": "http://backend:4000"}},
        "caddy": {"image": "caddy@sha256:" + "d" * 64, "environment": {"WANGMAI_DOMAIN": "calendar.company.org"}, "ports": [
            {"published": "80", "target": 80, "protocol": "tcp"},
            {"published": "443", "target": 443, "protocol": "tcp"},
            {"published": "443", "target": 443, "protocol": "udp"}]}},
        "networks": {"database": {"internal": True}}}


class DeploymentTests(unittest.TestCase):
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
            ops.configuration(".env.production")
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
            command, _ = ops.configuration(".env.production", recovery_file=override)
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
