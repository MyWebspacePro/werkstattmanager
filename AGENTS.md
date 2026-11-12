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

**Zwei Fallen beim `db push` / Seed (12.11.2026 selbst erlebt):**

1. `docker compose run --rm --no-deps api npx prisma db push` benutzt das
   **alte Image**, wenn man nicht vorher `build` ausgeführt hat — es vergleicht
   dann das alte Schema mit der DB und meldet fälschlich "already in sync".
   Richtig: erst `docker compose … build api`, dann `run … db push`, dann `up -d`.
2. `seed-demo.ts` ist idempotent, aber der Werkstattplan ist relativ zum
   **Montag des Lauf-Tags** — ein erneuter Lauf in einer späteren Woche legt
   dieselben Termine noch einmal an (Dup-Prüfung prüft nur Start+Fahrzeug+Grund).
   Also nur laufen lassen, wenn der Plan wirklich aufgefüllt werden soll;
   ggf. vorher zählen (`select count(*) from "Appointment";`) und nach
   `createdAt` wieder löschen. `prisma/backfill-plan.ts` (Bühne + Mechaniker
   nachziehen) ist dagegen jederzeit gefahrlos lauffähig.

## Auto-Verplanung (seit 13.11.2026)

- **Arbeitsarten-Katalog** (`WorkType`, verwaltet in Einstellungen → «Arbeitsarten»):
  Name, Standarddauer, Qualifikation, Stundensatz. Die Annahme wählt im Planer
  1–n Arten; Dauer = Summe, Skill = Maximum. Grundfeld wird automatisch gesetzt.
- **Slot-Suche**: `GET /api/appointments/suggest?durationMin=&requiredSkill=&from=&to=[&stationId][&mechanicId]`
  — liefert max. 5 Vorschläge (frühester Slot zuerst, am wenigsten belasteter
  qualifizierter Mechaniker). Öffnungszeiten aus `Setting.shopStartMin/shopEndMin/
  saturdayOpen`, gerechnet in **Europe/Zurich** (der Container läuft UTC — deshalb
  `apps/api/src/lib/shopTime.ts`, mit Tests in `shopTime.test.ts`).
- **`POST /appointments` mit `autoAssign: true`**: füllt leere Bühne/Mechaniker mit
  der am wenigsten belasteten freien Kombination. Nicht gefundene Zuweisung = null.
- **Bestätigungsflow**: auto-verplante Termine als `REQUESTED` anlegen; Chef
  bestätigt im Planer («Beantragte bestätigen»). Bestehender Override-Flow
  (409 + `canOverride`) bleibt; der 409 enthält jetzt `conflicts[]`
  (plate/reason/start/end/lane) und der Dialog zeigt sie.
- **Kapazität**: `Resource.workMinutesPerDay` (Profi 510, Lernende 390 im Seed),
  Ansicht «Kapazität» im Planer zeigt gebucht/Kapazität pro Tag + klickbare Lücken.
- **Seed-Falle (zweimal reingeritten!)**: `seed-demo.ts` legt den Werkstattplan
  relativ zum Lauf-Tag an. Jeder Lauf an einem anderen Montag **verdoppelt**
  Termine UND erzeugt dazu Aufträge/Rechnungen. Nach versehentlichem Lauf:
  alles mit `createdAt >= <Laufzeitpunkt>` in FK-Reihenfolge löschen
  (Reminder → Payment → Invoice → StockMovement → TimeEntry → OrderAssignment →
  WorkOrder → Appointment). Rechnungs-/Auftragsnummerntreiber rücken weiter (ok).
  `backfill-plan.ts` ist davon nicht betroffen und jederzeit gefahrlos lauffähig.

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

## Bekannte offene Punkte (Stand 12.11.2026, nach Pentest)

1. **Admin-Passwort ist `changeme`** — nur der Nutzer kann das ändern. Höchste Priorität.
2. **Bewusst so entschieden (12.11.2026):** Soft-Delete (`DELETE /customers/:id`,
   `/vehicles/:id`, `/parts/:id`, `/appointments/:id`) ist für **ADMIN + STAFF**
   freigegeben. `users` und `settings` bleiben ADMIN-only. Grund: das Web-UI hat für
   Kunden-/Teile-/Termin-Archivierung (noch) keinen Button — ein zusätzlicher
   Role-Gate hätte die API also nur für ein Feature gesperrt, das niemand nutzt.
   Wer das ändern will: `requireRole("ADMIN")` als `preHandler` auf die vier
   DELETE-Routen in `customers.routes.ts`, `vehicles.routes.ts`, `parts.routes.ts`,
   `planner.routes.ts`. Vorher mit dem Nutzer klären.
3. ✅ **Erledigt (12.11.2026):** Unbekannte IDs liefern 404 statt 500, und der
   Error-Handler gibt keine Prisma-/Stack-Details mehr an den Client
   (`apps/api/src/app.ts`: P2025 → 404, andere Prisma-Fehler → 409 mit generischer
   Meldung, 5xx → "Interner Fehler"). Details nur noch im Log.
4. ✅ **Erledigt (12.11.2026):** CSV-Injection im Buchhaltungs-Export
   (`invoices.routes.ts`, `esc()`): Werte mit führendem `= + - @` bzw. Tab/CR
   bekommen ein vorangestelltes `'`; reine Zahlen (auch negative Gutschriften)
   bleiben unverändert.
5. Passwort-Policy nur "mindestens 8 Zeichen" — vom Nutzer vorerst **bewusst
   unverändert** gelassen (12.11.2026).
6. CSP läuft als `Content-Security-Policy-Report-Only` — erst die Browser-Konsole
   prüfen, dann scharf schalten. HSTS bewusst **ohne** `includeSubDomains`
   (aiconso.eu hat weitere Subdomains).