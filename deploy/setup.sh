#!/usr/bin/env bash
# Setup on a fresh Ubuntu/Debian server.
#
#   sudo bash deploy/setup.sh                    -> https://<IP>.sslip.io (no domain needed)
#   sudo bash deploy/setup.sh poker.example.com  -> your own domain (A record must point to the server)
#   sudo bash deploy/setup.sh --turn [domain]    -> additionally your own TURN server for voice
#
set -euo pipefail
cd "$(dirname "$0")"

TURN=0
DOMAIN_ARG=""
for a in "$@"; do
  case "$a" in
    --turn) TURN=1 ;;
    *) DOMAIN_ARG="$a" ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "» Installing Docker …"
  curl -fsSL https://get.docker.com | sh
fi

# Small servers (512 MB RAM) need some swap for the Docker build
if [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 1500000 ] && ! swapon --show | grep -q .; then
  echo "» Creating 1 GB of swap …"
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

PUBLIC_IP=$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')
PRIVATE_IP=$(hostname -I | awk '{print $1}')

if [ -n "$DOMAIN_ARG" ]; then
  DOMAIN="$DOMAIN_ARG"
elif [ -f .env ] && grep -q '^DOMAIN=' .env; then
  DOMAIN=$(grep '^DOMAIN=' .env | cut -d= -f2)
else
  DOMAIN="$(echo "$PUBLIC_IP" | tr . -).sslip.io"
fi

{
  echo "DOMAIN=$DOMAIN"
  if [ "$TURN" = 1 ]; then
    PASS=$(grep '^TURN_PASSWORD=' .env 2>/dev/null | cut -d= -f2 || true)
    [ -n "$PASS" ] || PASS=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)
    echo "TURN_URL=turn:$DOMAIN:3478?transport=udp,turn:$DOMAIN:3478?transport=tcp"
    echo "TURN_USERNAME=poker"
    echo "TURN_PASSWORD=$PASS"
    echo "TURN_EXTERNAL_IP=$PUBLIC_IP/$PRIVATE_IP"
  fi
} > .env

echo "» Building and starting PokerCrew …"
if [ "$TURN" = 1 ]; then
  docker compose --profile turn up -d --build
else
  docker compose up -d --build
fi

echo
echo "✔ Done! Reachable in about 30 seconds at: https://$DOMAIN"
echo "  Firewall: TCP 80 and 443 must be open."
[ "$TURN" = 1 ] && echo "  TURN:     also open UDP+TCP 3478 and UDP 49160-49200."
exit 0
