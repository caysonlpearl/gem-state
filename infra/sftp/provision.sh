#!/usr/bin/env bash
set -euo pipefail

[[ "$(id -u)" == 0 ]] || { echo 'Run as root on the dedicated Ubuntu receiver.' >&2; exit 1; }
source /etc/os-release
[[ "${ID}" == ubuntu ]] || { echo 'This receiver is prepared for Ubuntu.' >&2; exit 1; }
[[ -s /root/.ssh/authorized_keys ]] || { echo 'Add an administrator SSH key before provisioning.' >&2; exit 1; }

install -d -m 0755 /srv/bluebird-sftp /etc/ssh/bluebird-sftp-keys /etc/ssh/sshd_config.d
install -d -m 0700 /var/lib/bluebird-sftp/vendors /root/bluebird-sftp-credentials
install -m 0644 /opt/bluebird-sftp/sshd-vendors.conf /etc/ssh/sshd_config.d/90-bluebird-sftp.conf
install -m 0700 /opt/bluebird-sftp/vendor-account.py /usr/local/sbin/bluebird-sftp-account

# Global defaults protect administration. A vendor-specific Match may enable
# password authentication inside its isolated SFTP account only.
cat > /etc/ssh/sshd_config.d/00-bluebird-admin.conf <<'SSH'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 4
LoginGraceTime 30
SSH

cat > /etc/fail2ban/jail.d/bluebird-sshd.local <<'JAIL'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
JAIL

/usr/sbin/sshd -t
systemctl reload ssh
systemctl enable --now fail2ban
systemctl restart fail2ban
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw --force enable
touch /opt/bluebird-sftp/installed

# Provisioning retries preserve the existing vendor password.
/usr/local/sbin/bluebird-sftp-account overfuel --password
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub > /var/lib/bluebird-sftp/host-key-fingerprint.txt
echo 'Bluebird SFTP receiver provisioned. Vendor credentials are stored under /root/bluebird-sftp-credentials; they are not printed.'
