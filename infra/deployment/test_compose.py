"""Render actual Compose files using public fixtures; no Docker daemon is needed."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from test_ops import ops


@unittest.skipUnless(shutil.which("docker"), "Docker CLI is required for Compose rendering")
class ComposeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.env_file = Path(self.directory.name) / "public-fixtures.env"
        self.values = {
            "WANGMAI_DOMAIN": "calendar.company.org", "BETTER_AUTH_URL": "https://calendar.company.org",
            "BETTER_AUTH_SECRET": "a" * 48, "GOOGLE_CLIENT_ID": "123456.apps.googleusercontent.com",
            "GOOGLE_CLIENT_SECRET": "testing-only-credential", "POSTGRES_USER": "wangmai_admin",
            "POSTGRES_RUNTIME_USER": "wangmai_runtime", "POSTGRES_MIGRATION_USER": "wangmai_migrator",
            "POSTGRES_DB": "wangmai", "DATABASE_URL": "postgresql://wangmai_runtime:" + "b" * 32 + "@postgres:5432/wangmai",
            "WANGMAI_IMAGE_TAG": "a" * 40, "POSTGRES_IMAGE": "postgres@sha256:" + "c" * 64,
            "CADDY_IMAGE": "caddy@sha256:" + "d" * 64, "WANGMAI_INGRESS_MODE": "direct-https",
            "WANGMAI_GATEWAY_CIDRS": "192.0.2.10/32", "WANGMAI_ORIGIN_BIND_IP": "10.20.30.40",
            "WANGMAI_GATEWAY_HEADERS_VERIFIED": "verified", "WANGMAI_ORIGIN_CONFIDENTIALITY_VERIFIED": "verified",
            "WANGMAI_ORIGIN_SOURCE_RESTRICTION_VERIFIED": "verified", "WANGMAI_GATEWAY_CONTRACT_REFERENCE": "review/GW-123",
        }
        # Never let workstation credentials or COMPOSE overrides enter a fixture render.
        safe_env = {key: value for key, value in os.environ.items()
                    if key not in self.values and not key.startswith(("COMPOSE_", "WANGMAI_"))}
        self.environment = patch.dict(os.environ, safe_env, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def render(self, *overrides):
        self.env_file.write_text("\n".join(f"{key}={value}" for key, value in self.values.items()), encoding="utf-8")
        command = ["docker", "compose", "--env-file", str(self.env_file), "-f", str(ops.ROOT / "compose.yaml")]
        for override in overrides:
            command += ["-f", str(ops.ROOT / override)]
        if "compose.database-ops.yaml" in overrides:
            command += ["--profile", "database-ops"]
        return subprocess.run(command + ["config", "--format", "json"], capture_output=True)

    def test_direct_and_shared_render_and_pass_full_production_guards(self):
        for mode in ops.INGRESS_MODES:
            self.values["WANGMAI_INGRESS_MODE"] = mode
            result = self.render(f"compose.{mode}.yaml")
            self.assertEqual(result.returncode, 0, "Public fixture render failed")
            config = json.loads(result.stdout)
            self.assertEqual(ops.validate(config), [])
            caddy = config["services"]["caddy"]
            self.assertTrue(any(mount["target"] == "/etc/caddy" and mount["read_only"] for mount in caddy["volumes"]))
            for service in ("frontend", "backend"):
                app = config["services"][service]
                self.assertIn("ALL", app["cap_drop"])
                self.assertIn("no-new-privileges:true", app["security_opt"])
                self.assertEqual(app["restart"], "unless-stopped")
                self.assertEqual(app["logging"]["options"], {"max-file": "3", "max-size": "10m"})
                self.assertIn("healthcheck", app)
                path = "/health/ready" if service == "frontend" else "/api/ready"
                self.assertIn(path, " ".join(app["healthcheck"]["test"]))
                self.assertEqual(app["build"]["args"]["SOURCE_COMMIT"], self.values["WANGMAI_IMAGE_TAG"])
                self.assertNotIn("ports", app)
            self.assertEqual(config["services"]["postgres"]["networks"], {"database": None})
            self.assertEqual(config["services"]["postgres"]["volumes"][0]["source"], "postgres_data")

    def test_missing_explicit_mode_or_release_tag_fails_compose(self):
        for key in ("WANGMAI_INGRESS_MODE", "WANGMAI_IMAGE_TAG"):
            value = self.values.pop(key)
            self.assertNotEqual(self.render("compose.direct-https.yaml").returncode, 0, key)
            self.values[key] = value

    def test_database_tools_and_first_init_do_not_leak_into_normal_services(self):
        paths = {}
        for key, value in {"POSTGRES_ADMIN_PASSWORD_FILE": "c" * 32, "POSTGRES_RUNTIME_PASSWORD_FILE": "b" * 32,
                           "POSTGRES_MIGRATION_PASSWORD_FILE": "d" * 32,
                           "MIGRATION_DATABASE_URL_FILE": "postgresql://wangmai_migrator:" + "d" * 32 + "@postgres:5432/wangmai"}.items():
            path = Path(self.directory.name) / key
            path.write_text(value, encoding="utf-8")
            path.chmod(0o600)
            paths[key] = str(path)
        self.values.update(paths)
        result = self.render("compose.direct-https.yaml", "compose.database-ops.yaml")
        self.assertEqual(result.returncode, 0)
        config = json.loads(result.stdout)
        self.assertEqual(ops.validate_database_tools(config), [])
        self.assertNotIn("DATABASE_URL", config["services"]["migrator"]["environment"])
        self.assertNotIn("secrets", config["services"]["backend"])
        Path(paths["POSTGRES_MIGRATION_PASSWORD_FILE"]).write_text("b" * 32, encoding="utf-8")
        self.assertTrue(ops.validate_database_tools(config))
        result = self.render("compose.direct-https.yaml", "compose.database-init.yaml")
        self.assertEqual(result.returncode, 0)
        self.assertTrue(ops.validate(json.loads(result.stdout)), "Initial password mount must never pass steady-state preflight")

    def test_base_alone_and_combined_modes_are_rejected(self):
        result = self.render()
        self.assertEqual(result.returncode, 0)
        self.assertTrue(ops.validate(json.loads(result.stdout)))
        for order in (("direct-https", "shared-gateway"), ("shared-gateway", "direct-https")):
            self.values["WANGMAI_INGRESS_MODE"] = order[-1]
            result = self.render(*(f"compose.{mode}.yaml" for mode in order))
            self.assertEqual(result.returncode, 0)
            self.assertTrue(ops.validate(json.loads(result.stdout)))

    def test_unverified_shared_contract_is_blocked_after_successful_render(self):
        self.values["WANGMAI_INGRESS_MODE"] = "shared-gateway"
        self.values["WANGMAI_ORIGIN_CONFIDENTIALITY_VERIFIED"] = "unverified"
        result = self.render("compose.shared-gateway.yaml")
        self.assertEqual(result.returncode, 0)
        self.assertTrue(any("CONFIDENTIALITY" in error for error in ops.validate(json.loads(result.stdout))))

    def test_local_smoke_override_retains_loopback_only_and_is_not_production(self):
        result = self.render("infra/smoke/compose.yaml")
        self.assertEqual(result.returncode, 0)
        config = json.loads(result.stdout)
        self.assertEqual([(p["host_ip"], str(p["published"]), p["target"]) for p in config["services"]["caddy"]["ports"]],
                         [("127.0.0.1", "8088", 80)])
        self.assertTrue(ops.validate(config))


if __name__ == "__main__":
    unittest.main()
