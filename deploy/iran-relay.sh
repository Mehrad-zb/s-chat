#!/usr/bin/env bash
# OPTIONAL — run on the Iranian server (Webdade) to give friends in Iran a filter-proof entrance:
#   ir.chat.satingraphic.ca  ->  this Iranian server  ->  forwarded to the DigitalOcean server
# Encryption stays end-to-end (TLS passes straight through); this server cannot read messages.
# Usage:  sudo bash iran-relay.sh <DIGITALOCEAN_IP>
# Then: add DNS A record  ir.chat.satingraphic.ca -> <this server's IP>
#       and on the DigitalOcean server set  DOMAINS=chat.satingraphic.ca, ir.chat.satingraphic.ca  in .env, then: docker compose up -d
set -euo pipefail
DEST="${1:?Usage: iran-relay.sh <DigitalOcean server IP>}"
IFACE=$(ip route show default | awk '{print $5; exit}')

echo 1 > /proc/sys/net/ipv4/ip_forward
grep -q '^net.ipv4.ip_forward=1' /etc/sysctl.conf || echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf

fwd() { # proto port
  iptables -t nat -C PREROUTING -i "$IFACE" -p "$1" --dport "$2" -j DNAT --to-destination "$DEST:$2" 2>/dev/null ||
  iptables -t nat -A PREROUTING -i "$IFACE" -p "$1" --dport "$2" -j DNAT --to-destination "$DEST:$2"
}
fwd tcp 80; fwd tcp 443; fwd udp 443; fwd tcp 3478; fwd udp 3478; fwd tcp 5349
iptables -t nat -C POSTROUTING -d "$DEST" -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -d "$DEST" -j MASQUERADE
iptables -C FORWARD -d "$DEST" -j ACCEPT 2>/dev/null || iptables -I FORWARD -d "$DEST" -j ACCEPT
iptables -C FORWARD -s "$DEST" -j ACCEPT 2>/dev/null || iptables -I FORWARD -s "$DEST" -j ACCEPT

DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent >/dev/null 2>&1 || true
netfilter-persistent save >/dev/null 2>&1 || iptables-save > /etc/iptables/rules.v4 || true
echo "Relay active: ports 80/443/3478/5349 -> $DEST"
echo "NOTE: if this server already uses port 80/443 (e.g. a web panel), move that service first."
