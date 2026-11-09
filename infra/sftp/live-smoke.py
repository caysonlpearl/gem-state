#!/usr/bin/env python3
"""Test a deployed SFTP account without printing its credential or leaving files."""

import argparse
import hashlib
import json
import logging
from pathlib import Path
import secrets

import paramiko


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True)
    parser.add_argument("--known-hosts", type=Path, required=True)
    parser.add_argument("--credentials", type=Path, required=True)
    parser.add_argument("--sample", type=Path, required=True)
    args = parser.parse_args()
    if args.credentials.stat().st_mode & 0o077:
        parser.error("Credential file must be readable only by its owner.")
    credential = json.loads(args.credentials.read_text())
    logging.getLogger("paramiko.transport").setLevel(logging.CRITICAL)

    def connect():
        connection = paramiko.SSHClient()
        connection.load_host_keys(str(args.known_hosts))
        connection.set_missing_host_key_policy(paramiko.RejectPolicy())
        connection.connect(args.host, port=credential["port"], username=credential["username"],
                           password=credential["password"], look_for_keys=False,
                           allow_agent=False, timeout=15, auth_timeout=15)
        return connection

    client = connect()
    checks = []
    try:
        with client.open_sftp() as sftp:
            assert sftp.normalize(".") == "/incoming", "Unexpected starting directory"
            checks.append("starts_in_incoming")
            for path in ("/etc/passwd", "/root/.ssh/authorized_keys"):
                try:
                    sftp.stat(path)
                except OSError:
                    continue
                raise AssertionError("Host file is visible outside the jail")
            checks.append("host_files_inaccessible")
            forbidden = "/bluebird-isolation-test-" + secrets.token_hex(6)
            try:
                handle = sftp.open(forbidden, "w")
            except OSError:
                checks.append("jail_root_not_writable")
            else:
                handle.close()
                sftp.remove(forbidden)
                raise AssertionError("Jail root is writable")
            folder = "/incoming/.bluebird-smoke-" + secrets.token_hex(6)
            partial, final = folder + "/sample.csv.part", folder + "/sample.csv"
            sftp.mkdir(folder)
            try:
                sftp.put(str(args.sample), partial)
                sftp.rename(partial, final)
                with sftp.open(final, "rb") as stream:
                    received = stream.read()
                expected = args.sample.read_bytes()
                assert received == expected, "Uploaded CSV differs from source"
                checks.extend(["csv_upload", "atomic_rename", "sha256_match"])
                digest = hashlib.sha256(received).hexdigest()
            finally:
                for path in (partial, final):
                    try:
                        sftp.remove(path)
                    except FileNotFoundError:
                        pass
                sftp.rmdir(folder)
            checks.append("test_files_removed")
        transport = client.get_transport()
        try:
            channel = transport.open_channel("direct-tcpip", ("127.0.0.1", 22), ("127.0.0.1", 0), timeout=10)
        except paramiko.SSHException:
            checks.append("tcp_forwarding_denied")
        else:
            channel.close()
            raise AssertionError("TCP forwarding is allowed")
        try:
            port = transport.request_port_forward("127.0.0.1", 0)
        except paramiko.SSHException:
            checks.append("remote_forwarding_denied")
        else:
            transport.cancel_port_forward("127.0.0.1", port)
            raise AssertionError("Remote forwarding is allowed")
        # MaxSessions=1 is intentional. Use separate connections so a pending
        # channel-close acknowledgement cannot make the next probe ambiguous.
        client.close()
        client = connect()
        stdin, stdout, stderr = client.exec_command("id", timeout=10)
        output = stdout.read() + stderr.read()
        assert b"uid=" not in output and b"sftp" in output.lower(), "Unexpected command execution result"
        checks.append("shell_command_denied")
        client.close()
        client = connect()
        with client.get_transport().open_session(timeout=10) as channel:
            channel.settimeout(10)
            try:
                channel.get_pty()
            except paramiko.SSHException:
                checks.append("terminal_denied")
            else:
                raise AssertionError("Interactive terminal is allowed")
        print(json.dumps({"host": args.host, "username": credential["username"],
                          "checks": checks, "sample_sha256": digest, "status": "passed"}, indent=2))
    finally:
        client.close()


if __name__ == "__main__":
    main()
