# Werkstattmanager

Betriebssoftware für eine freie Schweizer Autowerkstatt (Single-Tenant).

## Schnellstart (lokal, Docker Desktop nötig)

```bash
cp .env.example .env
npm install
docker compose up -d          # PostgreSQL + Mailhog
npm run db:push               # Prisma-Schema in die DB
npm run db:seed               # Demo-Daten (Nutzer, Hebebühnen)
npm run dev                   # API :3001 + Web :5173
```

- Web-UI: http://localhost:5173
- API: http://localhost:3001
- Mailhog (E-Mail-Postfach zum Testen): http://localhost:8025

## Struktur

```
apps/web         React-Frontend
apps/api         Node/Fastify-Backend
packages/shared  geteilte Typen + Schemas
docs/            Architektur & Konzepte
KONZEPT.md       Gesamt-Konzept (freigegeben)
```

## Ausbau

Siehe `KONZEPT.md` (Phase 1 MVP → Phase 2 Zusatzgeschäft → Phase 3 optional).
Deployment später auf eigenem VPS — dieselben Docker-Images, nur Zielhost ändert sich.
