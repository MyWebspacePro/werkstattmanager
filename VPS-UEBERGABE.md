# VPS-Übergabe: Werkstattmanager (für Hermes / Server-Verantwortliche)

Stand: 2026-11-08 · Deployed von ZCode per SSH — ab jetzt verwaltet **Hermes** den Server.

## Was läuft auf dem VPS (212.227.73.93)?

| Komponente | Detail |
|---|---|
| Verzeichnis | `/opt/werkstattmanager` (Git-Clone von github.com/MyWebspacePro/werkstattmanager, Branch main) |
| Container | `werkstattmanager-db-1` (PostgreSQL 16, nur intern), `werkstattmanager-api-1` (Fastify, nur intern), `werkstattmanager-web-1` (nginx, Port 80 im Containernetz), `werkstattmanager-backup-1` (tägliches pg_dump) |
| Compose-Dateien | `docker-compose.vps.yml` (Basis) + optional `docker-compose.vps-tls.yml` (Traefik-Labels für Domain) |
| Konfiguration | `.env` im Projektordner (DB-Passwort, JWT-Secrets, SMTP, `APP_DOMAIN`) |
| Backups | `/opt/werkstattmanager/backups/werkstatt_YYYYMMDD_HHMMSS.sql.gz`, täglich, 30 Tage Vorhalt |
| Ports nach aussen | **keine eigenen** — Routing läuft über das bestehende Coolify/Traefik-Setup |
| Integration | `web` hängt mit Traefik-Labels (Präfix `wm-`) im Docker-Netzwerk `coolify`, Certresolver `letsencrypt` — gleiches Muster wie `schwarzbrunn-site` |

## HTTPS: bereits aktiviert (nichts zu tun)

Am 2026-11-08 von ZCode aktiviert: `APP_DOMAIN=autowerkstattsoftware.aiconso.eu` in `.env`,
Stack mit `docker-compose.vps-tls.yml`-Overlay gestartet. Let's-Encrypt-Zertifikat ist gültig
und wird von Traefik automatisch verlängert. Die Idempotenz-Befehle aus dieser Sektion sind
harmlos erneut ausführbar, aber **nicht nötig**:

```bash
# Nur falls Routing nach einem Rebuild fehlt:
cd /opt/werkstattmanager
docker compose -f docker-compose.vps.yml -f docker-compose.vps-tls.yml up -d --build web
```

## Updates (künftig über Hermes)

```bash
cd /opt/werkstattmanager
git pull
docker compose -f docker-compose.vps.yml -f docker-compose.vps-tls.yml up -d --build
docker compose -f docker-compose.vps.yml exec -T api npx prisma db push --skip-generate
```

## Nicht ändern

- `.env` nicht in Git committen (enthält Secrets) — liegt korrekt im `.gitignore`
- Der `web`-Container braucht die Traefik-Labels (`docker-compose.vps-tls.yml`) — sonst ist die Seite nach einem Rebuild ohne Domain-Routing
- Backup-Ordner `backups/` vor Löschen bewahren

## Rückfragen / Notfall

- Wiederherstellung: `gunzip -c backups/<datei>.sql.gz | docker compose -f docker-compose.vps.yml exec -T db psql -U <user> <db>` (Zugangsdaten stehen in `.env`)
- Entwickler-Kontakt: ZCode-Session (Repo: MyWebspacePro/werkstattmanager)
