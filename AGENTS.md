# AGENTS.md — Werkstattmanager

Kurzüberblick für jede KI, die an diesem Repo arbeitet. Bitte zuerst lesen.

## Was das ist

Betriebssoftware für eine freie Autowerkstätte (Schweiz). Monorepo:
`apps/api` (Fastify + Prisma + Postgres), `apps/web` (React + Vite + Tailwind),
`packages/shared`. Sprache der Oberfläche: Deutsch.

**Wichtig:** Die Produktion läuft mit **Demo-Daten** (Fabios Mech_Box GmbH).
Lokal = VPS wird 1:1 gespiegelt, auch die Daten. Es gibt keine "nur lokale Demo".

## Deploy — der einzige Weg nach live

Code wird **nicht** direkt auf dem Server editiert. Ablauf:

```bash
# 1. lokal committen, dann pushen (Token-Weg, sonst hängt osxkeychain)
GIT_TERMINAL_PROMPT=0 git push \
  https://x-access-token:$(gh auth token)@github.com/MyWebspacePro/werkstattmanager.git main

# 2. auf dem Server
ssh -i ~/.ssh/werkstatt_vps root@212.227.73.93
cd /opt/werkstattmanager
git pull --ff-only
docker compose -f docker-compose.vps.yml -f docker-compose.vps-tls.yml up -d --build
```

Bei Schema-Änderungen zusätzlich **vor** dem Start:
`docker compose -f … run --rm --no-deps api npx prisma db push --skip-generate`

## Datenbank

- Es gibt **kein** `migrations/`-Verzeichnis. Schema-Änderungen laufen über `prisma db push`.
- **Niemals `prisma/seed.ts` ausführen** — der überschreibt die vorhandenen Daten.
- Nach Schema-Änderungen lokal `npx prisma generate` nicht vergessen, sonst
  kennt TypeScript die neuen Modelle nicht.

## Auth — bitte nicht beiläufig umbauen

Zwei Sessions, die zusammengehören:

| | |
|---|---|
| Access-Token | JWT, **15 Minuten**, liegt **nur im Speicher** (`apps/web/src/lib/api.ts`, Modulvariable) — kein `localStorage` |
| Refresh-Token | JWT, 30 Tage, liegt in einem **httpOnly-Cookie** `wm_refresh` (`Path=/api/auth`, `SameSite=Strict`, `Secure`) |
| Session-Tabelle | `prisma/schema.prisma` → `Session`, speichert nur den **SHA-256-Hash** des Refresh-Tokens |

Ablauf: Login legt eine Session an → `/auth/refresh` **rotiert** (neue Session, alte
wird gesperrt) → wird ein bereits rotiertes Token erneut benutzt, sperrt der Server
**alle** Sessions des Users (Diebstahl-Verdacht) → Logout sperrt die Session,
Passwortwechsel beendet alle anderen.

### Falle, die schon einmal zum Ausfall führte

`AuthProvider` (`apps/web/src/lib/auth.tsx`) ruft beim Mount `/auth/me` auf.
**Auf `/login` darf das nicht passieren** — sonst: 401 → `api()` setzt
`window.location.href = "/login"` → Seite lädt neu → Provider mountet erneut →
Endlosschleife. Die Seite flackert und das Login-Formular ist nicht bedienbar.

Zwei Bremsen sind deshalb drin, **beide müssen bleiben**:
1. `auth.tsx`: Effekt überspringt `/auth/me`, wenn `pathname === "/login"`.
2. `api.ts`: leitet nur um, wenn `pathname !== "/login"`.

Wer hier etwas ändert, testet danach **zwingend im Browser** (siehe unten).

## Test vor Deploy — nicht danach

Bei allem, was Login, Session oder Oberfläche berührt: **erst im Browser testen**.

Schnellster Weg ohne lokales Backend: `apps/web` bauen, `dist/` mit einem kleinen
Node-Server auf **Port 5173** ausliefern und `/api/*` auf die Produktion proxen.
Port 5173 ist in `CORS_ORIGINS` erlaubt, `localhost:5173` funktioniert also
inklusive echtem Login. Danach: Reload (Session aus Cookie), Abmelden.

Ein API-Test mit `curl` ersetzt das **nicht** — genau so ist der Redirect-Bug
durchgerutscht.

## Server

- IONOS-VPS, verwaltet vom "Hermes"-Agenten: nur nötigste, dokumentierte Änderungen.
- **Ports 80/443/8080 sind von Coolify/Traefik belegt** — nie eigene Host-Ports publishen.
- Routing per Traefik-Labels, TLS endet dort. nginx im Container sieht nur HTTP;
  deshalb `trustProxy` in Fastify und `absolute_redirect off` in nginx.
- Bestehende Dienste (Coolify, AppFlowy, Gitea, RustDesk, schwarzbrunn) nicht anfassen.

## Bekannte offene Punkte (12.11.2026, nach Pentest)

1. **Admin-Passwort ist `changeme`** — nur der Nutzer kann das ändern. Höchste Priorität.
2. `DELETE /api/customers` und `/api/vehicles` sind für die Rolle `STAFF` nicht
   rollengesperrt (Soft-Delete). `users` und `settings` sind ADMIN-only. Klären, ob gewollt.
3. Unbekannte ID bei DELETE liefert **500** statt 404 und gibt den rohen
   Prisma-Fehlertext preis (`apps/api/src/app.ts`, Error-Handler).
4. CSV-Injection im Buchhaltungs-Export: Werte mit führendem `=` werden in Excel
   als Formel ausgeführt.
5. Passwort-Policy nur "mindestens 8 Zeichen".
6. CSP läuft als `Content-Security-Policy-Report-Only` — erst die Browser-Konsole
   prüfen, dann scharf schalten. HSTS bewusst **ohne** `includeSubDomains`
   (aiconso.eu hat weitere Subdomains).