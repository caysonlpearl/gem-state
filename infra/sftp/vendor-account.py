#!/usr/bin/env python3
"""Create an isolated SFTP vendor on a dedicated Bluebird Ubuntu receiver."""

import argparse
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import subprocess
import sys


def command(*args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, text=True, **kwargs)


def private_write(path, content, mode=0o600):
    temporary = path.with_name(path.name + ".new")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    try:
        os.fchmod(descriptor, mode)
        with os.fdopen(descriptor, "w") as stream:
            stream.write(content)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def password_override(username):
    return "Match User " + username + "\n    AuthenticationMethods password\n    PasswordAuthentication yes\n    PubkeyAuthentication no\nMatch all\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("vendor", help="Lowercase vendor name, for example overfuel")
    authentication = parser.add_mutually_exclusive_group(required=True)
    authentication.add_argument("--password", action="store_true", help="Generate a password; store it in a root-only credentials file")
    authentication.add_argument("--public-key", type=Path, help="Vendor public key file; private keys are never accepted")
    args = parser.parse_args()
    if os.geteuid() != 0 or not Path("/opt/bluebird-sftp/installed").is_file():
        parser.error("Run as root on a provisioned Bluebird SFTP receiver.")
    if not re.fullmatch(r"[a-z][a-z0-9_-]{0,22}", args.vendor):
        parser.error("Vendor must be a short lowercase name containing letters, digits, underscore or hyphen.")

    username = "bbfeed_" + args.vendor
    registry = Path("/var/lib/bluebird-sftp/vendors")
    state_file = registry / (username + ".json")
    if state_file.exists():
        # Re-running deployment must never rotate an active integration credential.
        print(json.dumps({"username": username, "status": "already_configured", "remote_directory": "/incoming", "port": 22}))
        return
    try:
        pwd.getpwnam(username)
    except KeyError:
        pass
    else:
        parser.error("Account already exists without a Bluebird registry entry; refusing to modify it.")

    public_key = None
    if args.public_key:
        public_key = args.public_key.read_text().strip()
        if "PRIVATE KEY" in public_key or len(public_key.splitlines()) != 1 or not re.match(r"^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521)) [A-Za-z0-9+/=]+(?: .*)?$", public_key):
            parser.error("Supply a single OpenSSH public key without authorized_keys options.")
        command("ssh-keygen", "-l", "-f", str(args.public_key))

    registry.mkdir(parents=True, exist_ok=True, mode=0o700)
    credentials = Path("/root/bluebird-sftp-credentials")
    credentials.mkdir(mode=0o700, exist_ok=True)
    command("useradd", "--no-create-home", "--home-dir", "/incoming", "--shell", "/usr/sbin/nologin", "--password", "*", username)
    user = pwd.getpwnam(username)
    jail = Path("/srv/bluebird-sftp") / username
    jail.mkdir(mode=0o755)
    jail.chmod(0o755)
    incoming = jail / "incoming"
    incoming.mkdir(mode=0o700)
    incoming.chmod(0o700)
    os.chown(incoming, user.pw_uid, user.pw_gid)
    auth_file = Path("/etc/ssh/sshd_config.d") / ("60-bluebird-sftp-" + username + ".conf")
    record = {"vendor": args.vendor, "username": username, "remote_directory": "/incoming", "port": 22}
    try:
        if public_key:
            private_write(Path("/etc/ssh/bluebird-sftp-keys") / username, public_key + "\n", mode=0o644)
            record["authentication"] = "publickey"
        else:
            password = secrets.token_urlsafe(32)
            # No password in process arguments, terminal output, or cloud-init metadata.
            command("chpasswd", input=username + ":" + password + "\n")
            private_write(credentials / (username + ".json"), json.dumps({**record, "password": password}, indent=2) + "\n")
            private_write(auth_file, password_override(username), mode=0o644)
            record["authentication"] = "password"
            record["credentials_file"] = str(credentials / (username + ".json"))
        command("sshd", "-t")
        command("systemctl", "reload", "ssh")
        private_write(state_file, json.dumps(record, indent=2) + "\n")
    except Exception:
        # Fail closed if provisioning fails after account creation.
        command("usermod", "--lock", "--expiredate", "1", username)
        auth_file.unlink(missing_ok=True)
        (Path("/etc/ssh/bluebird-sftp-keys") / username).unlink(missing_ok=True)
        command("systemctl", "reload", "ssh")
        raise
    print(json.dumps({**record, "status": "configured"}))


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        # chpasswd error output never includes the submitted password.
        print("SFTP account setup failed: " + error.stderr.strip(), file=sys.stderr)
        sys.exit(1)
