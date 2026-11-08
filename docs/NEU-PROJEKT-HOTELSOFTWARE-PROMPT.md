# Start-Prompt: HotelSoftware (in ein NEUES ZCode-Fenster kopieren)

```
Ich baue mit dir eine Hotelsoftware (PMS) für kleine Hotels/Gastbetriebe in der Schweiz — genau nach dem gleichen Ablauf wie bei meiner Autowerkstatt-Software, die du als Vorbild/Referenz nutzen kannst: github.com/MyWebspacePro/werkstattmanager (Repo einsehen für Architektur, Docker-, Traefik- und Deploy-Muster).

ARBEITSWEISE (unverhandelbar):
1. Erst gründlich recherchieren (Bedarf kleiner CH-Hotels: Zimmer/Ferienwohnungen, Reservierungen inkl. Kanäle, Gästeregister/Beherbergungsbefreiung von der MWST prüfen, Preissaison, Reinigungsplan, Rechnungen mit QR-Teil, Touristen tax, etc.), dann ein umfassendes KONZEPT.md schreiben.
2. Bevor du konzeptionell fertig bist: grill mich mit allen wichtigen Fragen (AskUserQuestion, gebündelt).
3. Programmieren erst nach meinem GO. Danach schrittweise, kontextsparend, jeden Meilenstein verifizieren (Typecheck, Tests, echtes Klicken der Flows) bevor der nächste kommt.
4. Kostenpflichtige API-Aufrufe immer vorher ankündigen und freigeben lassen. Bestehende Dateien (Grafiken etc.) nie überschreiben — neue Version = neue Datei.

TECH-STACK (fix, wie beim Werkstattmanager):
- Monorepo mit npm workspaces: apps/web (React 18 + Vite + TS + Tailwind 4 + TanStack Query + react-router + react-i18next, Deutsch), apps/api (Fastify 5 + Prisma 6 + PostgreSQL 16 + Zod + JWT/bcryptjs), packages/shared
- Auth: JWT Access/Refresh, Rollen (z.B. ADMIN/RECEPTION/HOUSEKEEPING), Passwort-Ändern-Funktion + Benutzerverwaltung ab Tag 1
- Schweizer Konformität: QR-Rechnung (swissqrbill), MwSt-Logik (Beherbergung MWST-befreit? — sauber recherchieren und im Konzept belegen), 10-Jahres-Aufbewahrung (Soft-Delete), AuditLog für alles Wichtige
- Chef-Übersteuerung: Sperren antworten dem ADMIN mit 409+canOverride, UI fragt «Als Chef trotzdem…?», Ausnahmen landen im AuditLog — aber NUR im operativen Kern (Zimmer-/Reservierungs-/Rechnungs-Korrekturen), nie bei Kontoschutz

GITHUB:
- Neues PUBLIC Repo github.com/MyWebspacePro/hotelsoftware, Branch main
- .env niemals committen (nur .env.example); Demo-Logins + Zugänge in docs/PROJEKT-STATUS.md dokumentieren
- Push-Hänger umgehen mit: GIT_TERMINAL_PROMPT=0 git push https://x-access-token:$(gh auth token)@github.com/MyWebspacePro/hotelsoftware.git main

DOCKER (Muster 1:1 aus dem Werkstattmanager-Repo übernehmen):
- docker-compose.yml: PostgreSQL 16 + Mailhog (lokal), Build-Kontext IMMER am Monorepo-Root (nicht apps/api — das war ein teurer Stolperstein)
- Produktion: mehrstufige Dockerfiles, API-Container läuft mit tsx und enthält src/ + prisma/ (dort kann man Seeds direkt ausführen)

VPS (IONOS, bereits vorbereitet — gleiches System wie die Werkstatt):
- root@212.227.73.93, SSH-Schlüssel ~/.ssh/werkstatt_vps, Zielverzeichnis /opt/hotelsoftware
- WICHTIG: Auf dem Server läuft bereits Coolify/Traefik — Ports 80/443/8080 sind BELEGT. Deshalb: keine eigenen Host-Ports, Anbindung über Traefik-Labels (Präfix z.B. hs-), Docker-Netzwerk coolify (external), Labels-Host hotelsoftware.aiconso.eu, certresolver letsencrypt — exaktes Muster: docker-compose.vps.yml + docker-compose.vps-tls.yml im Werkstattmanager-Repo kopieren und anpassen
- .env auf dem VPS anlegen mit generierten Secrets + APP_DOMAIN=hotelsoftware.aiconso.eu (A-Record ist bereits gesetzt)
- Hermes-Regeln beachten: minimale Änderungen am Server, nichts an Auth/Coolify/Traefik-Grundsystem anfassen
- Deployment: git pull && docker compose up -d --build && im API-Container «npx prisma db push --skip-generate» — und IMPORTANT: Lokal = VPS ohne Ausnahme. Alles, was lokal existiert (Code UND Demo-/Testdaten), wird 1:1 auch auf den VPS gespielt (Seed im API-Container mit dem NEUEN Image laufen lassen oder Datei per docker cp reinbringen). Es gibt keine «nur lokale Demo» — ich zeige das System von überall.
- Nach dem ersten Deploy verifizieren: HTTPS-Zertifikat gültig, Login über das öffentliche Internet funktioniert

DEMODATEN (wenn es ans Testen geht):
- Realistische Schweizer Daten (echte Namensmuster, keine «Demo User»), dicht genug, um jede Seite zu beurteilen — z.B. Auslastungs-Kalender mit vielen Reservierungen, mehrere Gäste mit mehreren Aufenthalten
- Zweit-Reservierungen, Stornos, späte Anfragen — Realität abbilden, nicht nur Sonnenschein
- Logins für alle Rollen dokumentieren

Fang mit Schritt 1 (Recherche) an und frage mich dann nach der Recherche mit deinen Grill-Fragen.
```

*Hinweis: Die Zeile mit dem Push-Workaround enthält `$(gh auth token)` — im neuen Fenster wird das beim Ausführen aufgelöst. Datei liegt versioniert in diesem Repo (docs/NEU-PROJEKT-HOTELSOFTWARE-PROMPT.md).*
