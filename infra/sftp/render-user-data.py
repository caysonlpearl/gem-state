#!/usr/bin/env python3
"""Render deployment user data without embedding any vendor passwords or keys."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent
files = [("provision.sh", "0700"), ("vendor-account.py", "0700"), ("sshd-vendors.conf", "0644")]
config = {
    "package_update": True,
    "packages": ["openssh-server", "ufw", "fail2ban", "python3"],
    "ssh_pwauth": False,
    "write_files": [
        {"path": "/opt/bluebird-sftp/" + name, "owner": "root:root", "permissions": mode, "content": (root / name).read_text()}
        for name, mode in files
    ],
    "runcmd": [["bash", "/opt/bluebird-sftp/provision.sh"]],
}
args.output.parent.mkdir(parents=True, exist_ok=True)
# JSON is a YAML subset accepted after the cloud-config header.
args.output.write_text("#cloud-config\n" + json.dumps(config, indent=2) + "\n")
print("Prepared deployment user data: " + str(args.output))
