from copy import deepcopy
import os
from pathlib import Path
import shutil
import tempfile
import unittest

import origin_tls
import tls_fixtures
from test_ops import gateway_config, ops


def https_config(directory):
    config = gateway_config()
    caddy = config["services"]["caddy"]
    caddy["environment"].pop("WANGMAI_SHARED_GATEWAY_CONFIG")
    caddy["environment"].update(WANGMAI_INGRESS_MODE="shared-gateway-https", WANGMAI_SHARED_GATEWAY_HTTPS_CONFIG="selected",
        WANGMAI_ORIGIN_TLS_IDENTITY="10.20.30.40", WANGMAI_GATEWAY_TLS_VERIFICATION_VERIFIED="verified", WANGMAI_GATEWAY_TLS_CONTRACT_REFERENCE="review/TLS-123")
    caddy["environment"]["WANGMAI_ORIGIN_BIND_IP"] = "10.20.30.40"
    caddy["ports"][0].update(published="443", target=443)
    caddy["command"][-1] = "shared-gateway-https"
    caddy["volumes"] = [{"type": "bind", "source": str(Path(directory) / name), "target": "/run/wangmai-origin/" + name,
        "read_only": True, "bind": {"create_host_path": False}} for name in origin_tls.TARGETS]
    return config


@unittest.skipUnless(shutil.which("openssl"), "OpenSSL 3+ required")
class OriginTLSTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="wangmai-tls-test-")
        cls.directory = Path(cls.temp.name)
        tls_fixtures.provision(cls.directory)
        cls.config = https_config(cls.directory)

    @classmethod
    def tearDownClass(cls): cls.temp.cleanup()

    def test_valid_ip_and_supported_dns_chain_and_permissions(self):
        self.assertEqual(ops.validate(self.config), [])
        config = deepcopy(self.config)
        config["services"]["caddy"]["environment"]["WANGMAI_ORIGIN_TLS_IDENTITY"] = "origin.invalid"
        self.assertEqual(ops.validate(config), [])

    def test_contract_mode_private_binding_and_ports_fail_closed(self):
        for field, value in (("WANGMAI_GATEWAY_TLS_VERIFICATION_VERIFIED", "unverified"), ("WANGMAI_GATEWAY_TLS_CONTRACT_REFERENCE", "pending"),
                             ("WANGMAI_ORIGIN_TLS_IDENTITY", "wrong.invalid"), ("WANGMAI_ORIGIN_TLS_IDENTITY", "10.20.30.41"),
                             ("WANGMAI_SHARED_GATEWAY_CONFIG", "selected"), ("WANGMAI_DIRECT_HTTPS_CONFIG", "selected"),
                             ("WANGMAI_ORIGIN_SOURCE_RESTRICTION_VERIFIED", "unverified")):
            config = deepcopy(self.config); config["services"]["caddy"]["environment"][field] = value
            self.assertTrue(ops.validate(config), field)
        for ports in ([], [{"host_ip": "0.0.0.0", "published": "443", "target": 443}], self.config["services"]["caddy"]["ports"] * 2,
                      [{"host_ip": "10.20.30.40", "published": "80", "target": 80}]):
            config = deepcopy(self.config); config["services"]["caddy"]["ports"] = ports
            self.assertTrue(ops.validate(config))

    def test_bad_missing_mismatched_untrusted_and_incomplete_files_fail(self):
        for target, replacement in ((0, "ca.pem"), (0, "leaf.pem"), (1, "ca.key"), (1, "missing.key"), (2, "leaf.pem")):
            config = deepcopy(self.config); config["services"]["caddy"]["volumes"][target]["source"] = str(self.directory / replacement)
            self.assertTrue(ops.validate(config))
        path = self.directory / "malformed.pem"; path.write_text("not a certificate"); path.chmod(0o600)
        config = deepcopy(self.config); config["services"]["caddy"]["volumes"][0]["source"] = str(path)
        self.assertTrue(ops.validate(config))

    def test_mount_and_credential_boundaries(self):
        for field, value in (("read_only", False), ("type", "volume"), ("bind", {"create_host_path": True})):
            config = deepcopy(self.config); config["services"]["caddy"]["volumes"][1][field] = value
            self.assertTrue(ops.validate(config))
        config = deepcopy(self.config); config["services"]["frontend"]["volumes"] = [config["services"]["caddy"]["volumes"][1]]
        self.assertTrue(ops.validate(config))
        config = deepcopy(self.config); config["services"]["other"] = {"ports": [{"published": "80", "target": 80}]}
        self.assertTrue(ops.validate(config))
        config = deepcopy(self.config); config["services"]["frontend"]["network_mode"] = "host"
        self.assertTrue(ops.validate(config))
        config = deepcopy(self.config); config["services"]["frontend"]["volumes"] = [{"type": "bind", "source": str(self.directory), "target": "/keys"}]
        self.assertTrue(ops.validate(config))

    def test_expired_and_short_lived_certificates_are_rejected(self):
        path = self.directory / "expired.pem"
        tls_fixtures.run("x509", "-req", "-in", self.directory / "leaf.csr", "-CA", self.directory / "intermediate.pem",
            "-CAkey", self.directory / "intermediate.key", "-CAcreateserial", "-out", path, "-days", "0", "-extfile", self.directory / "leaf.ext")
        path.write_bytes(path.read_bytes() + (self.directory / "intermediate.pem").read_bytes()); path.chmod(0o600)
        config = deepcopy(self.config); config["services"]["caddy"]["volumes"][0]["source"] = str(path)
        self.assertTrue(ops.validate(config))

    @unittest.skipUnless(os.name == "posix", "POSIX permissions are verified by Linux CI; Windows requires ACL review")
    def test_world_readable_key_is_rejected(self):
        path = self.directory / "exposed.key"; shutil.copyfile(self.directory / "private.key", path); path.chmod(0o644)
        config = deepcopy(self.config); config["services"]["caddy"]["volumes"][1]["source"] = str(path)
        self.assertTrue(ops.validate(config))
