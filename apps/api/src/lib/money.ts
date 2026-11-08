/** Runden auf Rappen (2 Dezimalen) — Grundlage aller CHF-Beträge. */
export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Nettobetrag × MwSt-Satz, gerundet auf Rappen.
 * vatRate in Prozent (z.B. 8.1).
 */
export function vatAmount(net: number, vatRate: number): number {
  return roundCents((net * vatRate) / 100);
}

/**
 * Summen einer Positionen-Liste berechnen.
 * Pro Position: lineTotal = qty × unitPrice (netto).
 * Gruppiert nach MwSt-Satz und summiert — MWSTG-konforme Ausweisung.
 */
export interface VatGroup {
  vatRate: number;
  net: number;
  vat: number;
}

export interface TotalsResult {
  net: number;
  vat: number;
  total: number;
  vatGroups: VatGroup[];
}

export function computeTotals(
  lines: { qty: unknown; unitPrice: unknown; vatRate: unknown }[],
  vatScheme: "STANDARD" | "SMALL_BUSINESS" = "STANDARD"
): TotalsResult {
  const groups = new Map<number, number>();
  let net = 0;
  for (const l of lines) {
    const qty = Number(l.qty) || 0;
    const price = Number(l.unitPrice) || 0;
    const rate = Number(l.vatRate) || 0;
    const lineNet = roundCents(qty * price);
    net += lineNet;
    if (vatScheme === "STANDARD") {
      groups.set(rate, (groups.get(rate) ?? 0) + lineNet);
    }
  }
  // (unverändert weiter unten)
  net = roundCents(net);
  const vatGroups: VatGroup[] = [];
  let vat = 0;
  if (vatScheme === "STANDARD") {
    for (const [rate, groupNet] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
      const g = vatAmount(groupNet, rate);
      vat += g;
      vatGroups.push({ vatRate: rate, net: roundCents(groupNet), vat: g });
    }
  }
  vat = roundCents(vat);
  return { net, vat, total: roundCents(net + vat), vatGroups };
}
