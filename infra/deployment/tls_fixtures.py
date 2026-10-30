"""TEST ONLY: disposable CA/intermediate/leaf fixtures; never production provisioning."""
from pathlib import Path
import subprocess


def run(*args):
    result = subprocess.run(["openssl", *map(str, args)], capture_output=True, timeout=20)
    if result.returncode: raise RuntimeError("Disposable TLS fixture generation failed; details withheld")


def provision(directory, identity="10.20.30.40", *, dns="origin.invalid"):
    directory = Path(directory)
    directory.mkdir(exist_ok=True)
    directory.chmod(0o700)
    run("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", directory / "ca.key", "-out", directory / "ca.pem",
        "-days", "3", "-subj", "/CN=Disposable Test Root", "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign")
    run("req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", directory / "intermediate.key", "-out", directory / "intermediate.csr", "-subj", "/CN=Disposable Intermediate")
    (directory / "intermediate.ext").write_text("basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\n")
    run("x509", "-req", "-in", directory / "intermediate.csr", "-CA", directory / "ca.pem", "-CAkey", directory / "ca.key", "-CAcreateserial",
        "-out", directory / "intermediate.pem", "-days", "3", "-extfile", directory / "intermediate.ext")
    run("req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", directory / "private.key", "-out", directory / "leaf.csr", "-subj", "/CN=Not A Verification Identity")
    (directory / "leaf.ext").write_text(f"basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:{identity},DNS:{dns}\n")
    run("x509", "-req", "-in", directory / "leaf.csr", "-CA", directory / "intermediate.pem", "-CAkey", directory / "intermediate.key", "-CAcreateserial",
        "-out", directory / "leaf.pem", "-days", "3", "-extfile", directory / "leaf.ext")
    (directory / "fullchain.pem").write_bytes((directory / "leaf.pem").read_bytes() + (directory / "intermediate.pem").read_bytes())
    (directory / "trust.pem").write_bytes((directory / "ca.pem").read_bytes())
    for file in directory.iterdir(): file.chmod(0o600)
