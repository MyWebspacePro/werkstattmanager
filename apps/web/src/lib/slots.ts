/**
 * Zeit-Helfer für den Planer. Alles in lokaler Zeit — die API liefert ISO-Zeitstempel,
 * die Anzeige (und die Position im Raster) rechnet bewusst in der Zeitzone des Browsers.
 */

/** Öffnungszeiten der Werkstatt — Grundlage für die Zeitachse im Raster. */
export const SHOP_START_MIN = 7 * 60; // 07:00
export const SHOP_END_MIN = 18 * 60; // 18:00
export const SLOT_MIN = 15; // Rasterweite

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Montag als Wochenbeginn (CH-Konvention). */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // Montag = 0
  return addDays(x, -day);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** `count` Tage ab `start` (inklusive Start). */
export function dayRange(start: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

/** Minuten seit Mitternacht, in Lokalzeit. */
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Datum + Minuten → Date (Lokalzeit). */
export function atMinutes(day: Date, minutes: number): Date {
  const x = startOfDay(day);
  x.setMinutes(minutes);
  return x;
}

export function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Auf das Raster rasten (15-Minuten-Schritte). */
export function snapMinutes(minutes: number, step = SLOT_MIN): number {
  return Math.round(minutes / step) * step;
}

/** ISO → Minuten seit Mitternacht des Tages, auf den der Wert fällt. */
export function apptStartMin(iso: string): number {
  return minutesOfDay(new Date(iso));
}

export function apptEndMin(iso: string): number {
  return minutesOfDay(new Date(iso));
}

export function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h},${String(m).padStart(2, "0")} h`;
}

/** Deutsche Wochentags-Kurzform, z. B. „Mo". */
export function weekdayShort(d: Date): string {
  return d.toLocaleDateString("de-CH", { weekday: "short" }).replace(".", "");
}