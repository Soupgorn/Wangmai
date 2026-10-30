import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import release


class ReleaseTests(unittest.TestCase):
    def test_requires_full_sha_and_immutable_base(self):
        for commit, base in (("latest", "node@sha256:" + "b" * 64), ("a" * 40, "node:24"), ("a" * 40, "evil@sha256:" + "b" * 64)):
            with self.assertRaises(ValueError): release.validate_inputs(commit, base)
        release.validate_inputs("a" * 40, "node:24-bookworm-slim@sha256:" + "b" * 64)

    def test_refuses_dirty_worktree_before_docker_or_output(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(release, "run", side_effect=["a" * 40, "?? local.env"]), patch.object(release, "local_docker") as docker:
            output = Path(directory) / "release"
            with self.assertRaises(ValueError): release.build("a" * 40, "node@sha256:" + "b" * 64, output)
            docker.assert_not_called()
            self.assertFalse(output.exists())

    def test_tampered_archive_fails_before_docker(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(release, "local_docker") as docker:
            root = Path(directory)
            (root / "source.tar").write_bytes(b"changed")
            (root / "release.json").write_text(json.dumps({"version": 1, "sourceCommit": "a" * 40, "nodeImage": "node@sha256:" + "b" * 64, "sourceSha256": "incorrect"}))
            with self.assertRaises(ValueError): release.verify(root)
            docker.assert_not_called()

    def test_image_requires_nonroot_and_matching_revision(self):
        for user, revision in (("root", "a" * 40), ("node", "b" * 40)):
            with patch.object(release, "run", return_value=json.dumps([{"Config": {"User": user, "Labels": {"org.opencontainers.image.revision": revision}}}])):
                with self.assertRaises(ValueError): release.inspect_image("fixture", "a" * 40)

    def test_baked_credentials_and_remote_daemons_are_rejected(self):
        info = {"Config": {"User": "node", "Labels": {"org.opencontainers.image.revision": "a" * 40}, "Env": ["DATABASE_URL=private-fixture"]}}
        with patch.object(release, "run", return_value=json.dumps([info])):
            with self.assertRaises(ValueError): release.inspect_image("fixture", "a" * 40)
        with patch.object(release, "run", return_value="ssh://remote-vm"), patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(ValueError): release.local_docker()
