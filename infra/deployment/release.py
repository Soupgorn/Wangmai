#!/usr/bin/env python3
"""Operator-controlled local release build/verification. Never pushes or deploys."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SHA = re.compile(r"[0-9a-f]{40}")
PIN = re.compile(r"(?:docker.io/library/)?node(?::[a-zA-Z0-9._-]+)?@sha256:[0-9a-f]{64}")


def run(args, **kwargs):
    result = subprocess.run(args, capture_output=True, **kwargs)
    if result.returncode:
        # Commands contain no credentials. Do not forward arbitrary Docker output.
        raise ValueError("Release operation failed: " + args[0] + " " + args[1])
    return result.stdout.decode().strip()


def checksum(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def validate_inputs(commit, node_image):
    if not SHA.fullmatch(commit) or not PIN.fullmatch(node_image):
        raise ValueError("Require a full lowercase source SHA and a Node image pinned by sha256")


def local_docker():
    endpoint = run(["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"])
    # Refuse ambient endpoint overrides, including Docker contexts targeting a VM.
    import os
    if os.environ.get("DOCKER_HOST") or not endpoint.startswith(("unix://", "npipe://")):
        raise ValueError("A reviewed local Docker socket without DOCKER_HOST is required")


def inspect_image(tag, commit):
    info = json.loads(run(["docker", "image", "inspect", tag]))[0]
    if info["Config"].get("User") != "node" or info["Config"].get("Labels", {}).get("org.opencontainers.image.revision") != commit:
        raise ValueError("Image user or source revision does not match the reviewed release")
    forbidden = ("DATABASE_", "MIGRATION_", "POSTGRES_", "BETTER_AUTH_", "GOOGLE_", "NEXT_PUBLIC_")
    if any(entry.split("=", 1)[0].startswith(forbidden) for entry in info["Config"].get("Env", [])):
        raise ValueError("Application credentials or unreviewed public configuration were baked into an image")
    # RepoDigests are absent for local builds; image ID is the local content identity.
    return {"tag": tag, "id": info["Id"], "repoDigests": info.get("RepoDigests", []), "platform": info["Os"] + "/" + info["Architecture"]}


def build(commit, node_image, output):
    validate_inputs(commit, node_image)
    if run(["git", "rev-parse", "HEAD"], cwd=ROOT) != commit or run(["git", "status", "--porcelain", "--untracked-files=all"], cwd=ROOT):
        raise ValueError("Build requires the selected HEAD and a clean worktree, including untracked files")
    local_docker()
    tags = ["wangmai-" + service + ":" + commit for service in ("backend", "frontend")]
    for tag in tags:
        if subprocess.run(["docker", "image", "inspect", tag], capture_output=True).returncode == 0:
            raise ValueError("Release tag already exists; verify the retained artifact instead of overwriting it")
    output.mkdir(parents=True, exist_ok=False)
    with tempfile.TemporaryDirectory(prefix="wangmai-release-") as temporary:
        context = Path(temporary)
        source = output / "source.tar"
        run(["git", "archive", "--format=tar", "--output", str(source), commit], cwd=ROOT)
        with tarfile.open(source) as archive:
            archive.extractall(context, filter="data")
        # Git archive never includes ignored local env, credentials, backups or builds.
        tracked = [path for path in context.rglob("*") if path.is_file()]
        if any(path.name in (".env", ".env.production") or path.suffix in (".key", ".pem", ".dump", ".backup") for path in tracked):
            raise ValueError("Tracked private configuration is forbidden in a release source archive")
        for service, tag in zip(("backend", "frontend"), tags):
            print("Building reviewed " + service + " image", flush=True)
            run(["docker", "build", "--build-arg", "NODE_IMAGE=" + node_image, "--build-arg", "SOURCE_COMMIT=" + commit,
                 "-f", str(context / service / "Dockerfile"), "-t", tag, str(context)])
        images = [inspect_image(tag, commit) for tag in tags]
        archive = output / "images.tar"
        run(["docker", "image", "save", "--output", str(archive), *tags])
        manifest = {"version": 1, "sourceCommit": commit, "nodeImage": node_image,
                    "sourceSha256": checksum(source), "archiveSha256": checksum(archive),
                    "lockfileSha256": checksum(context / "package-lock.json"),
                    "migrations": {str(path.relative_to(context)).replace("\\", "/"): checksum(path) for path in sorted((context / "backend/drizzle").rglob("*")) if path.is_file()},
                    "images": images}
        (output / "release.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("Release artifacts created; no image push, migration or deployment performed.")


def verify(directory):
    manifest = json.loads((directory / "release.json").read_text(encoding="utf-8"))
    validate_inputs(manifest["sourceCommit"], manifest["nodeImage"])
    if manifest.get("version") != 1 or checksum(directory / "source.tar") != manifest["sourceSha256"] or checksum(directory / "images.tar") != manifest["archiveSha256"]:
        raise ValueError("Release archive integrity failed")
    with tarfile.open(directory / "source.tar") as source:
        def source_hash(name):
            stream = source.extractfile(name)
            if stream is None: raise ValueError("Release source file is missing")
            with stream: return hashlib.file_digest(stream, "sha256").hexdigest()
        migrations = {member.name: source_hash(member.name) for member in source.getmembers() if member.isfile() and member.name.startswith("backend/drizzle/")}
        if manifest["lockfileSha256"] != source_hash("package-lock.json") or manifest["migrations"] != migrations:
            raise ValueError("Release dependency or migration metadata differs from the source archive")
    expected_tags = ["wangmai-" + service + ":" + manifest["sourceCommit"] for service in ("backend", "frontend")]
    if [image["tag"] for image in manifest["images"]] != expected_tags:
        raise ValueError("Unexpected release image tags")
    local_docker()
    for image in manifest["images"]:
        actual = inspect_image(image["tag"], manifest["sourceCommit"])
        if actual["id"] != image["id"] or actual["platform"] != image["platform"]:
            raise ValueError("Local image content differs from the recorded release")
    print("Release source, archive checksums, local image IDs, non-root users and source labels verified.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    create = sub.add_parser("build")
    create.add_argument("--commit", required=True)
    create.add_argument("--node-image", required=True)
    create.add_argument("--output", type=Path, required=True)
    check = sub.add_parser("verify")
    check.add_argument("directory", type=Path)
    args = parser.parse_args()
    try:
        if args.action == "build": build(args.commit, args.node_image, args.output.resolve())
        else: verify(args.directory.resolve())
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()
