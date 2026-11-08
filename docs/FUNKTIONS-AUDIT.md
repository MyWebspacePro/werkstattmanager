# Funktions-Audit (2026-11-08, 3 Subagenten)

> Auslöser: Nutzer-Befund «es fehlt an Funktionalität an allen Ecken». Drei parallele Audits:
> (1) Konzept↔Implementierung, (2) UI/UX-Defekte, (3) Werkstatt-Tagesgeschäft-Simulation.
> Kernbefund: **Das Backend deckt das Konzept weitgehend ab — aber viele fertige Endpunkte
> werden vom Frontend nie aufgerufen.** Vier explizite Phase-1-Zusagen sind funktional tot.

## Die P1-Kernbefunde (blockieren das Tagesgeschäft)

| # | Befund | Detail | Quelle |
|---|--------|--------|--------|
| A1 | **Teile nicht mit Auftrag verknüpfbar** | Positionen-Editor hat keinen Part-Picker → `partId` wird nie gesetzt → Lagerabbuchung/Reservierung/Abruf des Katalogpreises über die UI unmöglich | workorders.routes.ts:103–113 (toter Pfad); WorkOrdersPage.tsx:171–184 |
| A2 | **KV-Modul headless** | komplette Quotes-API (Liste, send, accept/reject mit Grund, convert, PDF) existiert — keine `/quotes`-Route, keine Seite. Der aus dem Auftrag erzeugte KV verschwindet | quotes.routes.ts:123–177; App.tsx ohne Route |
| A3 | **Kunden-/Fahrzeug-Detailansicht fehlt** | GET /customers/:id (Historie: Aufträge, Rechnungen, Reifen, Leihwagen) und GET /vehicles/:id (workOrders+invoices) existieren — Frontend ruft sie nie auf; Fahrzeuge nicht bearbeitbar/archivierbar | customers.routes.ts:81–96; vehicles.routes.ts:46–82 |
| A4 | **Kreditnota funktionslos (MWSTG!)** | type CREDIT_NOTE anlegbar, aber Zeilen min(0), Totals ohne Vorzeichen → Gutschrift *erhöht* Umsatz; kein UI-Button, kein Verweis auf Originalrechnung, kein Storno | invoices.routes.ts:14–24,118–124; money.ts |
| A5 | **Mahnwesen ohne Dokument/Versand** | /remind legt nur DB-Zeile an; kein Mahn-PDF, kein E-Mail, keine konfigurierbaren Fristen/Gebühren (nur 3 harte Level) | invoices.routes.ts:156–167,181 |
| A6 | **Lieferantenzuordnung geht bei jedem Teile-Edit verloren** | `supplierId: ""` hart im openEdit; Lieferanten-CRUD ohne UI | PartsPage.tsx:126; SalesPage.tsx:55 (sellerId analog) |
| A7 | **Zeiterfassung komplett tot** | TimeEntry-Modell ohne eine einzige Route/UI → Ist-Stunden, Mechaniker-Umsatz, Auslastung unmöglich | schema.prisma:329–342 (nur Include workorders.routes.ts:37) |

## Weitere echte Defekte (P2)

- **Rechnungs-Drift**: Auftragspositionen nach INVOICED frei änderbar, Rechnung (Snapshot) wird nie gewarnt/nachgezogen
- **Nachbestell-Filter-Bug**: `/parts/reorder` prüft `stock<=0` statt `<= minStock` (Kommentar behauptet Mindestbestand)
- **KV→Auftrag-Convert** übernimmt PART-Positionen ohne Lagerabbuchung
- **Mutter-Modals ohne `<form>`**: `required`-Attribute wirkungslos + kein Enter-Submit (Parts, WorkOrders, Invoices, Planner, Sales, TyreHotel, Loaners)
- **Stille Fehler**: E-Mail-Versand/Mahnung/Statuswechsel/Termin-Annullierung/Auslagern/Rückgabe ohne ErrorMsg; «Rechnung erstellen» ohne catch/isPending
- **Datums-Bug Planer**: UTC-Slice + lokale Zeit → Termine rutschen um halbe Tage
- **Termin ohne Ende>Start-Validierung**
- **Empty-State-Flash** während des Ladens (TyreHotel, Loaners, Sales)
- **Tabellen ohne `overflow-x-auto`** (6 Seiten) → Clipping auf schmalen Screens
- **Rohes `<select>`** in LoanersPage (44px ≠ 38px-Standard), SalesPage-Overrides (36px)
- Modal: kein Escape, Backdrop-Klick verliert Formulareingaben
- Kern-Rückgabe (RETURN-Bewegungstyp) ohne UI/Pfad; Wareneingang-API ohne UI; TextTemplate/AuditLog ohne UI

## P3 (später)

Planer: kein Drag&Drop, keine Tag-Ansicht, Mo–Fr fix; Annahme ohne KM/Tankstand/Fotos; Leihwagen-`orderId`/`salePrice`-Erfassung fehlen in UI; Reifenhotel-`seasonFee` ohne Fakturierungsstrecke; Dashboard ohne Aging-Buckets/Auslastung; keine Mobile-Sidebar; Touch-Targets klein.

## UI-Fix bereits umgesetzt (vor den Audits)

Input/Select py-2 text-sm min-h-[38px], Button py-2, Modal max-w-3xl — behebt die Mini-Dropdowns.

## Behobene Welle (Batch 1) — siehe Git-Historie

Aus A1–A7 + P2 wurden umgesetzt: Part-Picker, KV-Seite + KV-PDF, Fahrzeug-/Kunden-Detail,
Kreditnota, Mahn-PDF/-E-Mail + Mahnregeln, Lieferanten-Fix, Statusschutz, Fehlermeldungen,
`<form>`-Wrap aller Modals, Datums-/Termin-Fix, overflow-x-auto, Empty-States.
Nicht in Batch 1: Zeiterfassung (A7), Nachbestell-Wesen, Leihwagen-/Reifenhotel-Fakturierung.
