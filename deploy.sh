#!/usr/bin/env bash
# Werkstattmanager — VPS-Deploy (auf dem Server ausführen)
# Nutzung:  bash deploy.sh [domain]
set -euo pipefail

DOMAIN="${1:-}"
cd "$(dirname "$0")"

echo "=== 1/5 Docker prüfen/installieren ==="
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
docker compose version &>/dev/null || { echo "docker compose fehlt"; exit 1; }

echo "=== 2/5 .env anlegen (falls fehlend) ==="
if [ ! -f .env ]; then
  cp .env.production.example .env
  # Zufallswerte direkt einsetzen
  sed -i "s|HIER-STARKES-PASSWORT|$(openssl rand -hex 16)|" .env
  sed -i "s|JWT_SECRET=HIER-ZUFALLSWERT-32-BYTES|JWT_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|JWT_REFRESH_SECRET=HIER-ANDERER-ZUFALLSWERT-32-BYTES|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|" .env
  if [ -n "$DOMAIN" ]; then sed -i "s|^APP_DOMAIN=$|APP_DOMAIN=$DOMAIN|" .env; fi
  echo "!! .env erstellt — SMTP-Zugang prüfen:  nano .env"
fi

echo "=== 3/5 Container bauen & starten ==="
if [ -n "$DOMAIN" ]; then
  docker compose -f docker-compose.prod.yml --profile tls up -d --build
else
  docker compose -f docker-compose.prod.yml up -d --build
fi

echo "=== 4/5 Datenbank einrichten ==="
sleep 5
docker compose -f docker-compose.prod.yml exec -T api npx prisma db push --skip-generate
docker compose -f docker-compose.prod.yml exec -T api npx tsx prisma/seed.ts

echo "=== 5/5 Fertig ==="
if [ -n "$DOMAIN" ]; then
  echo "→ https://$DOMAIN  (HTTPS-Zertifikat holt Caddy automatisch, ggf. 1–2 Min warten)"
else
  echo "→ http://$(curl -s ifconfig.me):8080  (Domain in .env eintragen + DNS setzen, dann Neustart: docker compose -f docker-compose.prod.yml --profile tls up -d)"
fi
echo "→ Login: chef@werkstatt.ch / changeme  — PASSWORT SOFORT ÄNDERN!"
