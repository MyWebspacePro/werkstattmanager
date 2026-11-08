# Deployment auf den IONOS-VPS

## Wer macht was?

| Schritt | Wer |
|---|---|
| A-Record im IONOS-DNS setzen (Domain → VPS-IP) | **du** |
| Alles andere (Docker, App, HTTPS, Backups, DB) | **deploy.sh** — oder ZCode per SSH |

## Variante A: Du führst 3 Befehle auf dem VPS aus

Per SSH einloggen (Terminal oder IONOS-Webkonsole), dann:

```bash
# 1. Repo holen
git clone https://github.com/MyWebspacePro/werkstattmanager.git && cd werkstattmanager

# 2. Skript ausführen (installiert Docker, .env mit Zufalls-Passwörtern, baut alles)
#    Mit Domain (nach dem DNS-Umzug):
bash deploy.sh deine-domain.ch
#    Oder ohne Domain (Zugriff vorerst über http://DEINE-VPS-IP:8080):
bash deploy.sh
```

Das Skript installiert Docker, erstellt die `.env` mit starken Zufallspasswörtern,
startet alle Container und richtet die Datenbank ein.

## Variante B: ZCode macht es per SSH

ZCode die VPS-IP und den SSH-Zugang geben (Passwort oder besser: Public Key).
Dann erledigt ZCode Clone, Deploy, TLS und Smoke-Test direkt.

## Nach dem Deploy (wichtig!)

1. **Passwörter ändern**: Login `chef@werkstatt.ch` / `changeme` — Passwort-Änderung
   kommt als nächster Schritt ins System (aktuell über DB/Support).
2. **SMTP prüfen**: `nano .env` → IONOS-Mailbox-Zugang eintragen → `docker compose -f docker-compose.prod.yml up -d` (Neustart), sonst gehen keine Rechnungs-E-Mails raus.
3. **Smoke-Test**: `https://deine-domain.ch` öffnen → Login → Testauftrag → Rechnungs-PDF.

## Architektur auf dem VPS

```
Internet → Caddy (80/443, HTTPS automatisch) → nginx (React-Build) → API (Fastify) → PostgreSQL
                                                            ↘ Mailhog nur lokal (DEV)
Backup-Container: täglich pg_dump nach ./backups (30 Tage Vorhalt)
Ports nach aussen: nur 80/443 (+ 8080 als Notfall-HTTP) — DB und API sind nicht exponiert
```

## Updates einspielen

```bash
cd werkstattmanager && git pull
docker compose -f docker-compose.prod.yml --profile tls up -d --build
docker compose -f docker-compose.prod.yml exec -T api npx prisma db push --skip-generate
```

## Backup wiederherstellen (Notfall)

```bash
gunzip -c backups/werkstatt_YYYYMMDD_HHMMSS.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U werkstatt werkstatt
```
