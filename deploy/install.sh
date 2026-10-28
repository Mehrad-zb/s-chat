#!/usr/bin/env bash
# S-Chat one-step installer for a fresh Ubuntu 22.04/24.04 server (DigitalOcean droplet).
# Usage (as root):  curl -fsSL https://raw.githubusercontent.com/Mehrad-zb/s-chat/main/deploy/install.sh | bash
set -euo pipefail

REPO="https://github.com/Mehrad-zb/s-chat.git"
DIR="/opt/s-chat"

say() { printf "\n\033[1;36m==> %s\033[0m\n" "$*"; }
ask() { local p="$1" d="${2:-}" v; read -r -p "$p${d:+ [$d]}: " v </dev/tty; echo "${v:-$d}"; }
asks() { local p="$1" v; read -r -s -p "$p: " v </dev/tty; echo >&2; echo "$v"; }

[ "$(id -u)" = 0 ] || { echo "Run as root (sudo -i)"; exit 1; }

say "Installing Docker, git, firewall"
export DEBIAN_FRONTEND=noninteractive
apt-get -o DPkg::Lock::Timeout=600 update -y
apt-get -o DPkg::Lock::Timeout=600 install -y ca-certificates curl git ufw openssl
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi

# small droplets: add swap so builds never run out of memory
if [ ! -f /swapfile ] && [ "$(free -m | awk '/Mem:/{print $2}')" -lt 2000 ]; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "Getting S-Chat code"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone --depth 1 "$REPO" "$DIR"; fi
cd "$DIR"

if [ ! -f .env ] && [ -n "${SCHAT_AUTO:-}" ]; then
  # unattended install (e.g. DigitalOcean user-data). Email/SMS are set later on https://DOMAIN/setup.html
  DOMAIN="${DOMAIN:-chat.satingraphic.ca}"; EMAIL="${ACME_EMAIL:-mehrad.tr@gmail.com}"
  IP=$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}')
  sed -e "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" -e "s|^DOMAINS=.*|DOMAINS=$DOMAIN|" -e "s|^ACME_EMAIL=.*|ACME_EMAIL=$EMAIL|" \
      -e "s|^PUBLIC_IP=.*|PUBLIC_IP=$IP|" -e "s|^TURN_SECRET=.*|TURN_SECRET=$(openssl rand -hex 32)|" \
      -e "s|^SETUP_TOKEN=.*|SETUP_TOKEN=${SETUP_TOKEN:-$(openssl rand -hex 24)}|" .env.example > .env
  chmod 600 .env
fi

if [ ! -f .env ]; then
  say "Settings (press Enter to accept the value in [brackets])"
  DOMAIN=$(ask "Domain for the app" "chat.satingraphic.ca")
  EMAIL=$(ask "Your email (for the HTTPS certificate)" "mehrad.tr@gmail.com")
  IP=$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}')
  echo
  echo "Email login codes — SMTP account (e.g. HostPapa: mail.satingraphic.ca, port 465). Leave host empty to skip."
  SMTP_HOST=$(ask "SMTP host" "")
  SMTP_PORT=465; SMTP_USER=""; SMTP_PASS=""; SMTP_FROM=""
  if [ -n "$SMTP_HOST" ]; then
    SMTP_PORT=$(ask "SMTP port" "465")
    SMTP_USER=$(ask "SMTP username (full email)" "")
    SMTP_PASS=$(asks "SMTP password")
    SMTP_FROM=$(ask "From" "S-Chat <$SMTP_USER>")
  fi
  echo
  echo "SMS login codes via VoIP.ms (Canada/US numbers). Leave empty to skip."
  VUSER=$(ask "VoIP.ms account email" "")
  VPASS=""; VDID="9056959147"
  if [ -n "$VUSER" ]; then
    VPASS=$(asks "VoIP.ms API password")
    VDID=$(ask "VoIP.ms SMS number (DID)" "9056959147")
  fi
  TURN_SECRET=$(openssl rand -hex 32)
  sed -e "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" \
      -e "s|^DOMAINS=.*|DOMAINS=$DOMAIN|" \
      -e "s|^ACME_EMAIL=.*|ACME_EMAIL=$EMAIL|" \
      -e "s|^PUBLIC_IP=.*|PUBLIC_IP=$IP|" \
      -e "s|^SMTP_HOST=.*|SMTP_HOST=$SMTP_HOST|" \
      -e "s|^SMTP_PORT=.*|SMTP_PORT=$SMTP_PORT|" \
      -e "s|^SMTP_USER=.*|SMTP_USER=$SMTP_USER|" \
      -e "s|^SMTP_PASS=.*|SMTP_PASS=$SMTP_PASS|" \
      -e "s|^SMTP_FROM=.*|SMTP_FROM=$SMTP_FROM|" \
      -e "s|^VOIPMS_USER=.*|VOIPMS_USER=$VUSER|" \
      -e "s|^VOIPMS_API_PASS=.*|VOIPMS_API_PASS=$VPASS|" \
      -e "s|^VOIPMS_DID=.*|VOIPMS_DID=$VDID|" \
      -e "s|^TURN_SECRET=.*|TURN_SECRET=$TURN_SECRET|" \
      -e "s|^SETUP_TOKEN=.*|SETUP_TOKEN=$(openssl rand -hex 24)|" \
      .env.example > .env
  chmod 600 .env
fi
for v in DOMAIN PUBLIC_IP SETUP_TOKEN; do export "$v=$(grep "^$v=" .env | head -1 | cut -d= -f2-)"; done

say "Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
ufw allow 3478 >/dev/null; ufw allow 5349/tcp >/dev/null; ufw allow 49160:49400/udp >/dev/null
ufw --force enable >/dev/null

mkdir -p data/download && chown -R 1000:1000 data

say "Starting S-Chat (first build takes a minute)"
docker compose up -d --build

say "Waiting for the HTTPS certificate for $DOMAIN (DNS must point to $PUBLIC_IP)"
for i in $(seq 1 360); do
  if docker compose exec -T caddy sh -c "ls /data/caddy/certificates/*/$DOMAIN/$DOMAIN.crt" >/dev/null 2>&1; then
    docker compose restart coturn >/dev/null; echo "Certificate ready — TURN over TLS enabled."; break
  fi
  sleep 5
done

# daily auto-update of the Android APK from GitHub releases
cat > /etc/cron.daily/s-chat-apk <<EOF
#!/bin/sh
curl -fsSL -o $DIR/data/download/s-chat.apk.tmp "\$(grep ^APK_URL= $DIR/.env | cut -d= -f2-)" && mv $DIR/data/download/s-chat.apk.tmp $DIR/data/download/s-chat.apk && chown 1000:1000 $DIR/data/download/s-chat.apk
EOF
chmod +x /etc/cron.daily/s-chat-apk; /etc/cron.daily/s-chat-apk || true

echo "*/2 * * * * root bash $DIR/deploy/auto-update.sh >> /var/log/s-chat-update.log 2>&1" > /etc/cron.d/s-chat-update

say "Done!  Open https://$DOMAIN"
echo "Server settings page (email/SMS):  https://$DOMAIN/setup.html#$SETUP_TOKEN"
echo "Update later with:   cd $DIR && bash deploy/update.sh"
echo "Edit settings:       nano $DIR/.env   then   docker compose up -d"
