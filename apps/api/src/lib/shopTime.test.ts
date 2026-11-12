import { describe, it, expect } from "vitest";
import { addZonedDays, zonedDayKey, zonedMake, zonedParts } from "./shopTime.js";

// Werkstatt-Zeit ist Europe/Zurich; der Test prüft die UTC-Instanzen.
describe("shopTime", () => {
  it("Wintertime (CET, UTC+1): 07:00 Lokalzeit = 06:00 UTC", () => {
    expect(zonedMake("2026-11-12", 420).toISOString()).toBe("2026-11-12T06:00:00.000Z");
  });

  it("Summertime (CEST, UTC+2): 07:00 Lokalzeit = 05:00 UTC", () => {
    expect(zonedMake("2026-07-15", 420).toISOString()).toBe("2026-07-15T05:00:00.000Z");
  });

  it("DST-Wechseltag: letzter Sonntag im März (29.3.2026) zeigt bereits CEST", () => {
    // Umstellung 02:00→03:00 Lokalzeit; 10:00 Lokal = 08:00 UTC
    expect(zonedMake("2026-03-29", 600).toISOString()).toBe("2026-03-29T08:00:00.000Z");
  });

  it("Rückstellung: letzter Sonntag im Oktober (25.10.2026) zeigt bereits CET", () => {
    expect(zonedMake("2026-10-25", 600).toISOString()).toBe("2026-10-25T09:00:00.000Z");
  });

  it("zonedDayKey ordnet späte UTC-Zeiten dem nächsten Lokal-Tag zu", () => {
    expect(zonedDayKey(new Date("2026-11-12T23:30:00Z"))).toBe("2026-11-13");
    expect(zonedDayKey(new Date("2026-11-12T10:00:00Z"))).toBe("2026-11-12");
  });

  it("addZonedDays bleibt im Kalenderdatum", () => {
    expect(addZonedDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addZonedDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("zonedParts liefert Schweizer Wochentag", () => {
    // 12.11.2026 ist ein Donnerstag
    expect(zonedParts(new Date("2026-11-12T12:00:00Z")).dow).toBe(4);
    expect(zonedParts(new Date("2026-11-15T12:00:00Z")).dow).toBe(0);
  });
});
