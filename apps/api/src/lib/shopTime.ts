/**
 * Werkstatt-Lokalzeit (Standard: Europe/Zurich) auf der Serverseite.
 *
 * Der API-Container läuft in UTC — rechnet man Öffnungszeiten einfach als
 * UTC-Minuten, liegen alle Slots eine Stunde daneben (Sommer/Winter egal,
 * der Browser zeigt Lokalzeit). Diese Helfer übersetzen Wanduhr-Zeiten der
 * Werkstatt in UTC-Instanzen und zurück.
 */

const TZ = process.env.SHOP_TZ ?? "Europe/Zurich";

interface ZonedParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sonntag … 6 = Samstag (Werkstatt-Lokalzeit) */
  dow: number;
}

export function zonedParts(date: Date, tz: string = TZ): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const get = (type: string) => {
    const p = fmt.formatToParts(date).find((x) => x.type === type);
    return p?.value ?? "";
  };
  const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: get("hour") === "24" ? 0 : Number(get("hour")),
    minute: Number(get("minute")),
    dow: Math.max(0, dows.indexOf(get("weekday"))),
  };
}

/** „2026-11-12" in Werkstatt-Lokalzeit. */
export function zonedDayKey(date: Date, tz: string = TZ): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function addZonedDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** Wanduhrzeit (Tag + Minuten seit Mitternacht) → UTC-Instant, DST-korrekt. */
export function zonedMake(dayKey: string, minutes: number, tz: string = TZ): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const offsetAt = (ts: number) => {
    const p = zonedParts(new Date(ts), tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - ts;
  };
  const off1 = offsetAt(guess);
  let ts = guess - off1;
  const off2 = offsetAt(ts);
  if (off2 !== off1) ts = guess - off2;
  return new Date(ts);
}
