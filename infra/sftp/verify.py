#!/usr/bin/env python3
"""Verify rendered deployment and effective OpenSSH policies without changing this host."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
root = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("vendor_account", root / "vendor-account.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def run(*args):
    return subprocess.run(args, text=True, check=True, capture_output=True).stdout


sshd = shutil.which("sshd") or "/usr/sbin/sshd"
with tempfile.TemporaryDirectory(prefix="bluebird-sftp-verify-") as temporary:
    directory = Path(temporary)
    host_key = directory / "host"
    run("ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(host_key))
    override = directory / "60-password.conf"
    override.write_text(module.password_override("bbfeed_overfuel"))
    vendor = directory / "90-vendors.conf"
    vendor.write_text((root / "sshd-vendors.conf").read_text())
    config = directory / "sshd_config"
    config.write_text("\n".join([
        "HostKey " + str(host_key),
        "ListenAddress 127.0.0.1",
        "Port 22222",
        "UsePAM no",
        "PasswordAuthentication no",
        "KbdInteractiveAuthentication no",
        "PermitRootLogin prohibit-password",
        "Include " + str(override),
        "Include " + str(vendor),
        "",
    ]))
    run(sshd, "-t", "-f", str(config))

    def effective(username):
        output = run(sshd, "-T", "-f", str(config), "-C", "user=" + username + ",host=localhost,addr=127.0.0.1")
        return dict(line.split(" ", 1) for line in output.splitlines())

    for username in ("bbfeed_overfuel", "bbfeed_secondvendor"):
        policy = effective(username)
        assert policy["chrootdirectory"] == "/srv/bluebird-sftp/%u", policy
        assert policy["forcecommand"] == "internal-sftp -d /incoming -u 0077", policy
        for option in ("permittty", "permittunnel", "permituserrc", "x11forwarding", "kbdinteractiveauthentication"):
            assert policy[option] in ("no", "false"), (option, policy[option])
        assert policy["disableforwarding"] == "yes"
        assert policy["maxsessions"] == "1"
        if username == "bbfeed_overfuel":
            assert policy["authenticationmethods"] == "password"
            assert policy["passwordauthentication"] == "yes"
            assert policy["pubkeyauthentication"] == "no"
        else:
            assert policy["authenticationmethods"] == "publickey"
            assert policy["passwordauthentication"] == "no"
            assert policy["pubkeyauthentication"] == "yes"
    administrator = effective("root")
    assert administrator["forcecommand"] == "none"
    assert administrator["chrootdirectory"] == "none"
    assert administrator["passwordauthentication"] == "no"
    assert administrator["pubkeyauthentication"] == "yes"

    data = directory / "user-data.yaml"
    run(sys.executable, str(root / "render-user-data.py"), str(data))
    text = data.read_text()
    assert text.startswith("#cloud-config\n")
    cloud_config = json.loads(text.split("\n", 1)[1])
    assert cloud_config["ssh_pwauth"] is False
    assert cloud_config["runcmd"] == [["bash", "/opt/bluebird-sftp/provision.sh"]]
    assert len(cloud_config["write_files"]) == 3
    assert not any("password" in entry.get("path", "") for entry in cloud_config["write_files"])
    # An operator's restrictive umask must not make public keys unreadable to
    # sshd's vendor user, or make the credentials readable by other users.
    old_umask = os.umask(0o077)
    try:
        public_file = directory / "public-key-mode"
        secret_file = directory / "secret-mode"
        module.private_write(public_file, "public\n", 0o644)
        module.private_write(secret_file, "synthetic-test-secret\n")
        assert public_file.stat().st_mode & 0o777 == 0o644
        assert secret_file.stat().st_mode & 0o777 == 0o600
    finally:
        os.umask(old_umask)
    run("bash", "-n", str(root / "provision.sh"))
    compile((root / "vendor-account.py").read_text(), "vendor-account.py", "exec")
    print(json.dumps({"configurationSyntax": "passed", "overfuelPasswordPolicy": "passed", "secondVendorKeyPolicy": "passed", "vendorConfinementPolicy": "passed", "administratorAccessPreserved": "passed", "deploymentRendering": "passed", "filePermissions": "passed", "publicUploadTest": "pending live server"}))
