# Projektstatus: Werkstattmanager

> **Zweck dieser Datei:** Vollständiger Projektzustand als Erinnerungsanker — nach Context-Compacting
> oder in neuen Sessions hier weiterlesen, dann geht nichts verloren. Bei grösseren Meilensteinen aktualisieren.

Stand: 2026-11-08 · Status: **LIVE in Produktion**

## 1. Was das ist

Betriebssoftware für eine freie Mehrmarken-Autowerkstatt (Schweiz, 1–20 MA), Single-Tenant.
Vollständiges Konzept mit allen Abstimmungs-Entscheidungen: **[KONZEPT.md](../KONZEPT.md)**.

## 2. Zugänge & URLs

| | |
|---|---|
| **Produktion** | https://autowerkstattsoftware.aiconso.eu (HTTPS via Traefik/Let's Encrypt, gültig bis 6.2.2027, Auto-Erneuerung) |
| **Login Prod** | `chef@werkstatt.ch` / `changeme` ⚠️ SOFORT ÄNDERN (auch `annahme@werkstatt.ch`) |
| **Lokal Dev** | Web http://localhost:5173 · API http://localhost:3001 · Mailhog http://localhost:8025 |
| **Git** | github.com/MyWebspacePro/werkstattmanager (public, branch main) |
| **VPS** | IONOS `root@212.227.73.93`, SSH-Schlüssel `~/.ssh/werkstatt_vps`, App in `/opt/werkstattmanager` |
| **VPS-Verwaltung** | **Hermes-Agent ist zuständig** — minimale Änderungen, nichts an Auth, bestehende Dienste (Coolify/Traefik 80/443/8080) unangetastet lassen. Details: `VPS-UEBERGABE.md` |

## 3. Lokale Entwicklung

```bash
docker compose up -d            # PostgreSQL + Mailhog
npm run db:push && npm run db:seed
npm run dev                     # API (:3001) + Web (:5173) parallel
```
Node 22 · npm workspaces · `.env` liegt am Root UND in `apps/api/` (Prisma/tsx brauchen sie dort).

## 4. Architektur & Implementiertes

**Stack:** React 18 + Vite + TS + TanStack Query + Tailwind 4 + react-i18next (de aktiv) · Fastify + Prisma + PostgreSQL 16 + Zod + JWT · swissqrbill/pdfkit für QR-Rechnungen · Monorepo (`apps/web`, `apps/api`, `packages/shared`).

**Phase 1 (MVP) — fertig & verifiziert:**
- Auth (JWT Access/Refresh, Rollen ADMIN/STAFF/MECHANIC), Settings (MWST 8.1/2.6, Kleingeschäft-Modus, QR-IBAN, Belegnummernkreise, Stundensatz)
- Kunden (+ nDSG-Einwilligungen mit Nachweis) & Fahrzeuge (Historie)
- Werkstattplaner: Wochenansicht, Ressourcen (Hebebühnen/Mechaniker), Konfliktprüfung
- Kostenvoranschlag (Entwurf→Gesendet→Angenommen/Abgelehnt) → Auftrags-Umwandlung
- Aufträge: Positionen (Arbeit/Teil/Fremd/Pauschale), Teile-Autoabbuchung mit StockMovements, Statusfluss, **Auftragszettel-Druck** (window.print, Mechaniker-Workflow)
- Teile/Lager: CRUD, Barcode, Mindestbestand, **CSV-Import mit Spalten-Mapping** (Frontend parst CSV)
- Rechnungen: aus Auftrag, **QR-Zahlteil spezifikationskonform** (Modulo-10-Referenz, visuell geprüft), Mahnwesen (3 Stufen), Teilzahlungen, E-Mail-Versand mit Templates, **Buchhaltungs-CSV-Export**, 10-J-Soft-Delete
- Dashboard (Umsatz, Forderungen/Aging, offene Aufträge, Reifenhotel, Low-Stock) + AuditLog

**Phase 2 — fertig & verifiziert:**
- Reifenhotel (Lagerplätze, Saisonerinnerungs-Liste mit Einwilligungs-Badge) · Leihwagen (Flotte, Herausgabe/Rückgabe mit KM) · Ankauf/Verkauf (Pipeline-Status, Marge-Berechnung — Live-Test: CHF 2600 korrekt)
- Schema für Zeiterf­assung/Fotos/ReminderRules/MFK schon in der DB (TimeEntry, WorkOrderPhoto, ReminderRule) — **UI fehlt noch**

**Tests:** 6/6 Unit-Tests (MWST-Gruppen, Rappenrundung, Kleingeschäft, QR-Prüfziffer) in `apps/api/src/lib/money.test.ts`.

## 5. Deployment (VPS)

- Compose-Varianten: `docker-compose.vps.yml` (Basis, keine Host-Ports) + `docker-compose.vps-tls.yml` (Traefik-Labels, Netzwerk `coolify`, certresolver letsencrypt) · lokal: `docker-compose.prod.yml` (+Caddy-Profil `tls`)
- Server-Dateien: `/opt/werkstattmanager/.env` (enthält generierte Secrets + SMTP-Platzhalter), Backups in `/opt/werkstattmanager/backups/`
- **Backup-Entrypoint muss Array-Form sein** (`/bin/sh -c` als Liste) — String-Entrypoints zerreisst Compose (Bug war, gefixt)
- Update-Prozedur + Notfall-Wiederherstellung: `VPS-UEBERGABE.md` (auch für Hermes)
- `deploy.sh` = Ein-Befehl-Setup für leere Server · Git-Push-Hänger → `GIT_TERMINAL_PROMPT=0 git push https://x-access-token:$(gh auth token)@github.com/MyWebspacePro/werkstattmanager.git main`

**Verknüpfungen + VPS-Spiegel (2026-11-08, deployed):**
- Leihwagen↔Auftrag: Herausgabe mit Auftragswahl → Tagespauschale als Position, Rückgabe = Tage-Anpassung
- Reifenhotel: «Fakturieren» pro Satz → Rechnung (billedAt schützt vor Doppel)
- Termin→Auftrag: übernehmbare Termine im Auftragsdialog (open=1)
- Zeiterfassung: Minuten/Notiz/Person pro Auftrag (Chef bucht für andere), Total im Auftrag
- **VPS = Spiegel von lokal:** MechBox-Demodaten laufen auf autowerkstattsoftware.aiconso.eu
  (Login jorge@fabios-mechbox.ch / mechbox2026); Regel in ~/.zcode/AGENTS.md verankert

**Skill-Zuweisung + Demo-Daten Fabios MechBox (2026-11-08, deployed):**
- Skill-Modell nach CH-Berufslogik: Resource.skillLevel (0=Bühne · 1=Fachmann · 2=Automechatroniker · 3=Diagnostiker); Planer + Auftrag filtern «Zugewiesen an» nach Mindestqualifikation (Appointment.requiredSkill / WorkOrder.requiredSkill)
- **Demo-Szenario (nur lokale Dev-DB!): Fabios Mech_Box GmbH** (fabios-mechbox.ch, Solenbergstrasse 15, 8207 Schaffhausen) — Team real gemäss fabios-mechbox.ch/team
- Demo-Logins (lokal, Passwort alle `mechbox2026`): jorge@ (Werkstattchef, ADMIN), andy@ (Annahme), ramona@ (Buchhaltung), michael@ (Kundendienst) → STAFF · jason@ (Diagnostiker, L3), cedric@ + marco@ (Mechatroniker, L2), elijah@ + roger@ (Fachmänner, L1), besim@ (Reifenpraktiker) → MECHANIC
- `npm run db:seed:demo` (idempotent): 20 Kunden/21 Fahrzeuge (Region SH, echte Namensmuster), 22 Termine skill-gerecht über 2 Wochen, Ressourcen umbenannt (Mechaniker 1/2 → Personen, deaktiviert)
- Prod bleibt Clean (chef@/annahme@) — Hebebühnen dort auf skillLevel 0 korrigiert

**Welle 1 nach Funktions-Audit (2026-11-08, deployed):**
- Funktions-Audit mit 3 Subagenten → **[FUNKTIONS-AUDIT.md](FUNKTIONS-AUDIT.md)** (Befund: viele fertige Backend-Endpunkte waren im Frontend nie erreichbar)
- Neu: KV-Verwaltungsseite + KV-PDF · Teile-Picker auf Aufträgen (Lagerabbuchung via UI) · Kunden-Dossier · Fahrzeugakte (Bearbeiten/Archiv) · Kreditnota (GS-Kreis, negative Beträge) · Mahn-PDF/-E-Mail + Mahnstufen konfigurierbar · Lieferanten-Datenverlust-Fix · Auftrags-Statusschutz · minStock-Nachbestell-Fix
- **Noch offen aus dem Audit:** Zeiterfassung (TimeEntry tot), Nachbestell-Wesen/UI, Leihwagen-/Reifenhotel-Fakturierung, Annahme-Daten (KM/Tankstand/Fotos), UI-Politur-Welle (Form-Wrap aller Modals, Datums-Bug Planer, Escape/Backdrop, Touch-Targets, Mobile-Sidebar)

**Kunden-Fixes (2026-11-08, deployed):**
- Leerer Kunde nicht mehr möglich: Backend-Pflichtvalidierung (Privat: Vor-/Nachname, Firma/Flotte: Firma) + required-Felder im Modal
- Kennzeichen: Fahrzeug-Sektion im Neuer-Kunde-Modal (Kunde+Fahrzeug transaktional in einem Call) + «+ Fahrzeug»-Button pro Kundenzeile
- Verifiziert: leer → 400 (lokal + Prod), UI-E2E Kunde «Uitester» mit SH UI 100 über den Browser angelegt

**Auth-Verwaltung (2026-11-08, deployed):**
- «Mein Passwort ändern» in Einstellungen (alle Rollen, altes Passwort nötig, min. 8 Zeichen) — `PUT /api/auth/password`
- Benutzerverwaltung in Einstellungen (nur Chef): anlegen, Rolle, aktiv/gesperrt, Passwort-Reset — `/api/users`
- Schutzmechanismen: Selbst-Deaktivierung blockiert, letzter aktiver Admin geschützt; AuditLog-Einträge `PASSWORD_CHANGE`/`PASSWORD_RESET`
- Verifiziert lokal (API-Smoke 8 Checks + UI-E2E inkl. Rollen-Gating) und in Prod deployed (Health 200, Route 401-guarded, Login OK)

## 6. Offene Punkte / Nächste Schritte

1. **Passwörter in PROD ändern** — Funktion ist jetzt im UI (Einstellungen → «Mein Passwort ändern»); Nutzer kann es selbst im Browser machen, Passwörter gehören nicht in den Chat
2. **SMTP konfigurieren**: `nano /opt/werkstattmanager/.env` auf VPS (IONOS-Mailbox) → Restart → E-Mail-Versand testen (lokal via Mailhog verifiziert)
3. Buchhaltungs-Export: Zielprogramm der Werkstatt klären (aktuell KMU-CSV, semikolon-getrennt)
4. Phase 3 (aus KONZEPT.md): Website-Widget (Reifen-Anfrage/Termin), Versicherungs-Direktabrechnung, camt.053, TecDoc, FR/IT-Übersetzungen
5. Zeiterfassungs-Tablet-UI + Foto-Upload-UI (DB-Schema existiert bereits)
6. Playwright-E2E (Geplant in Schritt 5, noch nicht gebaut) · Auftrags-PDF statt nur Auftragszettel-HTML-Druck?

## 7. Recherche-Fundstellen (für Erweiterungen)

- Markt-Referenz: garagensoftwarevergleich.ch (37 CH-Lösungen, Ø CHF 458/Monat, Zufriedenheit 7/10)
- Stundenansätze CH: 140–200 CHF/h · Reifenhotel: 25–100 CHF/Saison
- Teile: TecDoc/TecRMI (lizenzpflichtig), Lieferanten-CSV (Hostettler autotechnik etc.)
