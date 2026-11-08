import { describe, expect, it } from "vitest";
import { computeTotals, qrRefTestable } from "./money.test-helpers.js";

describe("computeTotals", () => {
  it("berechnet Netto, MWST und Total korrekt (8.1 %)", () => {
    const r = computeTotals([
      { qty: 1, unitPrice: 145, vatRate: 8.1 },
      { qty: 1, unitPrice: 35, vatRate: 8.1 },
    ]);
    expect(r.net).toBe(180);
    expect(r.vat).toBe(14.58);
    expect(r.total).toBe(194.58);
    expect(r.vatGroups).toEqual([{ vatRate: 8.1, net: 180, vat: 14.58 }]);
  });

  it("trennt MWST-Gruppen bei gemischten Sätzen", () => {
    const r = computeTotals([
      { qty: 2, unitPrice: 100, vatRate: 8.1 },
      { qty: 1, unitPrice: 50, vatRate: 2.6 },
    ]);
    expect(r.net).toBe(250);
    expect(r.vatGroups).toEqual([
      { vatRate: 2.6, net: 50, vat: 1.3 },
      { vatRate: 8.1, net: 200, vat: 16.2 },
    ]);
    expect(r.total).toBe(267.5);
  });

  it("Kleingeschäft: keine MWST, keine Gruppen", () => {
    const r = computeTotals([{ qty: 3, unitPrice: 99.95, vatRate: 8.1 }], "SMALL_BUSINESS");
    expect(r.net).toBe(299.85);
    expect(r.vat).toBe(0);
    expect(r.total).toBe(299.85);
    expect(r.vatGroups).toEqual([]);
  });

  it("rundet auf Rappen (Floating-Point-sicher)", () => {
    const r = computeTotals([{ qty: 3, unitPrice: 19.99, vatRate: 8.1 }]);
    expect(r.net).toBe(59.97);
    expect(r.vat).toBe(4.86); // 59.97 × 0.081 = 4.85757 → 4.86
    expect(r.total).toBe(64.83);
  });

  it("leere Positionen ergeben Nullen", () => {
    const r = computeTotals([]);
    expect(r).toEqual({ net: 0, vat: 0, total: 0, vatGroups: [] });
  });
});

describe("qrReference", () => {
  it("erzeugt eine 27-stellige QR-Referenz mit gültiger Prüfziffer", () => {
    const ref = qrRefTestable("RE-00001");
    expect(ref).toHaveLength(27);
    expect(ref).toMatch(/^\d{27}$/);
    // Prüfziffer: Modulo-10-rekursiv über die ersten 26 Stellen muss die 27. ergeben
    const carry = [0, 9, 4, 6, 8, 2, 7, 1, 3, 6];
    let c = 0;
    for (const ch of ref.slice(0, 26)) c = carry[(c + Number(ch)) % 10];
    expect(String((10 - c) % 10)).toBe(ref[26]);
  });
});
