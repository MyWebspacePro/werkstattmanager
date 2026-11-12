/**
 * Planer-Datentypen und Spur-Logik. Eine „Spur" (Lane) ist eine Zeile bzw. Spalte
 * im Raster — je nach Umschalter ein Arbeitsplatz oder ein Mitarbeiter.
 */
import { SKILL_SHORT } from "./skills.js";
import { SHOP_END_MIN, SHOP_START_MIN, minutesOfDay } from "./slots.js";

export type ResourceType = "LIFT" | "MECHANIC" | "BAY";
export type GroupBy = "station" | "mechanic";

export interface ResourceLite {
  id: string;
  name: string;
  type: ResourceType;
  active?: boolean;
  jobTitle?: string | null;
  skillLevel?: number;
  sortOrder?: number;
}

export interface PlannerAppointment {
  id: string;
  customerId?: string | null;
  vehicleId?: string | null;
  start: string;
  end: string;
  status: string;
  resourceId?: string | null;
  mechanicId?: string | null;
  requiredSkill?: number;
  reason?: string | null;
  notes?: string | null;
  customer?: { firstName?: string | null; lastName?: string | null; company?: string | null } | null;
  vehicle?: { licensePlate: string; brand: string; model: string } | null;
  resource?: { id: string; name: string; type: string } | null;
  mechanic?: { id: string; name: string; skillLevel?: number } | null;
  workOrder?: { id: string; number: string; status: string } | null;
}

/** Sammelspur für Termine ohne Zuweisung in der aktuellen Gruppierung. */
export const UNASSIGNED = "__unassigned__";

/** Ziel beim Verschieben eines Termins. */
export interface MoveTarget {
  laneKey: string;
  /** Nur die Wochenansicht verschiebt über Tagesgrenzen. */
  day?: Date;
  startMin: number;
  endMin: number;
}

export interface Lane {
  key: string;
  title: string;
  subtitle?: string;
  kind: "STATION" | "MECHANIC" | "UNASSIGNED";
}

const byOrder = (a: ResourceLite, b: ResourceLite) =>
  (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, "de");

/** Spuren für die gewählte Gruppierung bilden. */
export function buildLanes(resources: ResourceLite[], groupBy: GroupBy): Lane[] {
  const sorted = [...resources].sort(byOrder);
  if (groupBy === "station") {
    return sorted
      .filter((r) => r.type !== "MECHANIC")
      .map((r) => ({
        key: r.id,
        title: r.name,
        subtitle: r.type === "BAY" ? "Arbeitsplatz" : "Hebebühne",
        kind: "STATION" as const,
      }));
  }
  return sorted
    .filter((r) => r.type === "MECHANIC")
    .map((r) => ({
      key: r.id,
      title: r.name,
      subtitle: [r.jobTitle, r.skillLevel ? SKILL_SHORT[r.skillLevel] : null].filter(Boolean).join(" · ") || undefined,
      kind: "MECHANIC" as const,
    }));
}

/** Welcher Spur gehört der Termin an? */
export function laneKeyOf(a: PlannerAppointment, groupBy: GroupBy): string {
  const id = groupBy === "station" ? a.resourceId : a.mechanicId;
  return id ?? UNASSIGNED;
}

export function custName(a: PlannerAppointment): string {
  return (
    a.customer?.company ||
    `${a.customer?.firstName ?? ""} ${a.customer?.lastName ?? ""}`.trim() ||
    "Kunde"
  );
}

export interface StatusMeta {
  label: string;
  /** Block im Raster: Hintergrund, Text, linker Balken. */
  block: string;
  dot: string;
}

export const STATUS_META: Record<string, StatusMeta> = {
  REQUESTED: { label: "beantragt", block: "bg-amber-50 border-amber-300 text-amber-900", dot: "bg-amber-400" },
  CONFIRMED: { label: "bestätigt", block: "bg-blue-50 border-blue-300 text-blue-900", dot: "bg-blue-500" },
  IN_PROGRESS: { label: "in Arbeit", block: "bg-purple-50 border-purple-300 text-purple-900", dot: "bg-purple-500" },
  DONE: { label: "fertig", block: "bg-emerald-50 border-emerald-300 text-emerald-900", dot: "bg-emerald-500" },
  CANCELLED: { label: "annulliert", block: "bg-slate-100 border-slate-300 text-slate-500 line-through", dot: "bg-slate-400" },
};

export const STATUS_ORDER = ["REQUESTED", "CONFIRMED", "IN_PROGRESS", "DONE", "CANCELLED"] as const;

export function statusMeta(status: string): StatusMeta {
  return STATUS_META[status] ?? STATUS_META.CONFIRMED;
}

/** Blöcke, die (ganz oder teilweise) in den Tag fallen. */
export function appointmentsOfDay(appointments: PlannerAppointment[], day: Date): PlannerAppointment[] {
  return appointments.filter((a) => {
    const s = new Date(a.start);
    return s.getFullYear() === day.getFullYear() && s.getMonth() === day.getMonth() && s.getDate() === day.getDate();
  });
}

/**
 * Start/Ende eines Termins als Minuten seit Mitternacht, auf die Werkstattzeit
 * begrenzt. Ein Termin, der über Mitternacht läuft, endet am Achsenende.
 */
export function blockMinutes(a: { start: string; end: string }): { startMin: number; endMin: number } {
  const startMin = Math.max(minutesOfDay(new Date(a.start)), SHOP_START_MIN);
  let endMin = minutesOfDay(new Date(a.end));
  if (endMin <= startMin) endMin = SHOP_END_MIN;
  return { startMin, endMin: Math.min(endMin, SHOP_END_MIN) };
}