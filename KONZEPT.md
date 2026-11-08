# Konzept: Werkstattmanager

Betriebssoftware für eine freie Mehrmarken-Autowerkstatt in der Schweiz (1–20 Mitarbeitende).
Stand: 2026-11-08 · Status: vom Auftraggeber freigegeben

## 1. Ziel
Zentrales System für Annahme, Terminplanung, Auftragsabwicklung, Teile und Abrechnung —
Ersatz für Papier/Excel. Marktlücke (37 CH-Lösungen, Ø CHF 458/Monat, Zufriedenheit 7/10):
durchsichtige Teile-/Lagerverwaltung und Reifenhotel-Module.

## 2. Entscheidungen (mit Auftraggeber abgestimmt)
- **Single-Tenant** für eine Werkstatt (kein Mandantensystem)
- **Deutsch** aktiv, i18n vorbereitet (FR/IT später möglich)
- **Buchhaltung**: Rechnungen + Export (KMU-Kontenrahmen-CSV), keine eigene Buchhaltungslogik
- **Teiledaten**: Eigenkatalog + CSV-Import von Lieferantenpreislisten (TecDoc-Option in Phase 3)
- **Rollen**: Chef/Admin + Annahme/Administration aktiv; Mechaniker erhalten gedruckte
  Auftragszettel (MVP). UI wird touch-freundlich gebaut (Tablet-Support später)
- **Kerngeschäft Phase 2**: Reifenhotel/Saisonlager, Leihwagen, Gebrauchtwagen-Ankauf & Verkauf
- **Rechnungsversand**: PDF + E-Mail, Zahlungen manuell erfasst
- **Hosting später**: eigener IONOS-VPS; Entwicklung lokal via Docker Desktop
- **Migration**: Start bei null, Import-Funktion nur für Teilepreislisten (MVP)

## 3. Module

### Phase 1 (MVP)
1. **Kunden & Fahrzeuge** — Privat/Firma, Einwilligungen (nDSG), Obligo, Fahrzeug mit
   Marke/Modell/VIN/KM, komplette Reparatur-Historie
2. **Werkstattplaner** — Tag/Wochen-Kalender, Ressourcen (Hebebühnen/Mechaniker),
   Drag&Drop, Status: beantragt → bestätigt → in Arbeit → fertig
3. **Aufträge** — Positionen (Arbeit × Stundensatz, Teile, Fremdleistungen), Kostenvoranschlag
   mit dokumentierter Annahme/Ablehnung, Statusfluss inkl. „Teile bestellt",
   Nachkalkulation, Auftragszettel-Druck (A4)
4. **Teile & Lager** — Artikelstamm, Barcodes, Mindestbestand, Reservierung pro Auftrag,
   Bestellliste, Kern-Rückgabe, CSV-Import mit Feld-Mapping
5. **Fakturierung CH** — QR-Rechnung (swissqrbill), MWST 8.1 %/2.6 %, MWSTG-Pflichtangaben,
   Mahnwesen, Teilzahlungen, Kreditnota, E-Mail-Versand, 10-Jahres-Aufbewahrung
   (Soft-Delete), Buchhaltungs-Export CSV, Kleingeschäft-Modus
6. **Dashboard** — Umsatz, offene Forderungen/Aging, Auslastung, Reifenhotel-Belegung

### Phase 2
Reifenhotel (Plätze, Ein-/Auslagerung, Saisonerinnerung) · Leihwagen (Flotte, KM/Tank,
Fälligkeit, Pauschale auf Auftrag) · Gebrauchtwagen-Ankauf & Verkauf (Bewertungsbogen,
Inzahlungnahme, Kaufvertrag, Marge, Gewährleistung OR 197) · Zeiterfassung pro Auftrag ·
Foto-Dokumentation · Erinnerungs-Engine (Wartung, MFK-Vorbereitung, Saison)

### Phase 3 (optional/geplant)
Website-Widget (Reifen-Anfrage, Servicetermin beantragen) · Versicherungs-Direktabrechnung
(Schadenakten, Audatex/Eurotax) · Flotten-Sammelabrechnung · Bank-Import camt.053 ·
TecDoc-Anbindung · SMS/WhatsApp

## 4. Architektur
```
Monorepo (npm workspaces)
apps/web       React 18 + TS + Vite · TanStack Query · Tailwind + shadcn/ui
               react-hook-form + zod · react-i18next (de aktiv)
apps/api       Node 22 + TS · Fastify · Prisma · PostgreSQL 16
               JWT-Auth (bcrypt) · Zod · nodemailer · swissqrbill + pdf-lib
packages/shared  geteilte Typen + Schemas
docker-compose.yml  postgres · api · web · mailhog (lokal)
```

Kern-Entities: Customer, CustomerConsent, Vehicle, Resource, Appointment, Quote,
WorkOrder + WorkOrderLine, Part, Supplier, SupplierPriceImport, StockMovement,
TyreHotelSlot, LoanerVehicle, Loan, PurchaseVehicle, Invoice, InvoiceLine, Payment,
Reminder, TextTemplate, Setting, AuditLog

## 5. Rechtliches eingebaut
- MWSTG-Pflichtangaben (CHE-xxx.xxx.xxx MWST etc.) + QR-Zahlteil (QR-IBAN)
- Aufbewahrung 10 Jahre (OR 957/958): Soft-Delete + Archiv, kein Hard-Delete
- Gewährleistung 2 Jahre dokumentierbar (OR 210/211), Verkauf: OR 197
- nDSG: Einwilligungsverwaltung, Löschkonzept, Audit-Log, Backups, Passwort-Hashing
- MWST-Sätze konfigurierbar; Kleingeschäft-Modus (< CHF 100 000)

## 6. Offene Punkte
- swissqrbill-Qualität prüfen (Fallback: QR nach SIX-Spec + qrcode-Lib)
- Ziel-Buchhaltungsprogramm für Exportformat klären (bleibt konfigurierbar)
- IONOS-SMTP: SPF/DKIM der Werkstatt-Domain einrichten
