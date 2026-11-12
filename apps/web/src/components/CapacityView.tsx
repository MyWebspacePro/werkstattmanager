import {
  SHOP_END_MIN,
  SHOP_START_MIN,
  atMinutes,
  fmtTime,
  hoursLabel,
  minutesOfDay,
} from "../lib/slots.js";
import { appointmentsOfDay, statusMeta, type PlannerAppointment, type ResourceLite } from "../lib/planner.js";

interface Props {
  days: Date[];
  mechanics: ResourceLite[];
  appointments: PlannerAppointment[];
  shopStartMin: number;
  shopEndMin: number;
  /** Klick auf eine Lücke → Termin in dieser Lücke verplanen. */
  onGapClick: (mechanicId: string, day: Date, startMin: number) => void;
}

const MIN_GAP_MIN = 30; // kleinste angezeigte Lücke

interface Span { start: number; end: number }

/** Freie Intervalle innerhalb der Öffnungszeiten (≥ MIN_GAP_MIN). */
function freeGaps(spans: Span[], shopStart: number, shopEnd: number): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  let cursor = shopStart;
  for (const s of sorted) {
    if (s.start - cursor >= MIN_GAP_MIN) out.push({ start: cursor, end: Math.min(s.start, shopEnd) });
    cursor = Math.max(cursor, s.end);
  }
  if (shopEnd - cursor >= MIN_GAP_MIN) out.push({ start: cursor, end: shopEnd });
  return out.filter((g) => g.end > g.start && g.end > shopStart && g.start < shopEnd);
}

/**
 * Auslastung pro Mitarbeiter und Tag: gebuchte Terminminuten gegen die
 * Tageskapazität, plus anklickbare Lücken (direkt in der Lücke verplanen).
 */
export function CapacityView({ days, mechanics, appointments, shopStartMin, shopEndMin, onGapClick }: Props) {
  const today = new Date().toDateString();

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white" style={{ maxHeight: "calc(100vh - 250px)" }}>
      <div style={{ minWidth: 150 + days.length * 150 }}>
        <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-white">
          <div className="shrink-0 px-2 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-400" style={{ width: 150 }}>
            Mitarbeiter
          </div>
          {days.map((d) => (
            <div key={d.toISOString()} className={`min-w-[150px] flex-1 border-l border-slate-100 px-2 py-2 text-center ${d.toDateString() === today ? "bg-blue-50 text-blue-700" : ""}`}>
              <div className="text-sm font-semibold">
                {d.toLocaleDateString("de-CH", { weekday: "short" })} {d.getDate()}.
              </div>
              <div className="text-[11px] text-slate-500">{d.toLocaleDateString("de-CH", { month: "short" })}</div>
            </div>
          ))}
        </div>

        {mechanics.map((m) => (
          <div key={m.id} className="flex border-b border-slate-100 last:border-b-0">
            <div className="sticky left-0 z-10 shrink-0 bg-white px-2 py-2" style={{ width: 150 }}>
              <div className="truncate text-xs font-semibold leading-tight text-slate-800">{m.name}</div>
              <div className="text-[10px] leading-tight text-slate-500">
                {Math.floor((m.workMinutesPerDay ?? 510) / 60)}:{String((m.workMinutesPerDay ?? 510) % 60).padStart(2, "0")} h/Tag
                {m.jobTitle ? ` · ${m.jobTitle}` : ""}
              </div>
            </div>
            {days.map((day) => {
              const items = appointmentsOfDay(appointments, day).filter((a) => a.mechanicId === m.id && a.status !== "CANCELLED");
              const spans = items.map((a) => ({ start: minutesOfDay(new Date(a.start)), end: minutesOfDay(new Date(a.end)) }));
              const booked = spans.reduce((s, x) => s + (x.end - x.start), 0);
              const cap = m.workMinutesPerDay ?? 510;
              const pct = Math.min(100, Math.round((booked / Math.max(cap, 1)) * 100));
              const over = booked > cap;
              const gaps = freeGaps(spans, shopStartMin, shopEndMin);
              return (
                <div key={day.toISOString()} className="min-w-[150px] flex-1 border-l border-slate-100 p-2">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-2 rounded-full ${over ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className={`mt-1 text-[11px] tabular-nums ${over ? "font-semibold text-red-600" : "text-slate-600"}`}>
                    {hoursLabel(booked)} / {hoursLabel(cap)}
                    {over && " (überbucht)"}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {gaps.map((g) => (
                      <button
                        key={g.start}
                        onClick={() => onGapClick(m.id, day, g.start)}
                        className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 hover:border-blue-400 hover:text-blue-700"
                        title={`Termin ab ${fmtTime(atMinutes(day, g.start))} verplanen (${g.end - g.start} min frei)`}
                      >
                        {fmtTime(atMinutes(day, g.start))} · {g.end - g.start}′
                      </button>
                    ))}
                    {gaps.length === 0 && <span className="text-[10px] text-slate-400">voll</span>}
                  </div>
                  {items.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {items.slice(0, 3).map((a) => (
                        <div key={a.id} className="truncate text-[10px] text-slate-500">
                          <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${statusMeta(a.status).dot}`} />
                          {fmtTime(new Date(a.start))} {a.vehicle?.licensePlate}
                        </div>
                      ))}
                      {items.length > 3 && <div className="text-[10px] text-slate-400">+{items.length - 3} weitere</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {mechanics.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-500">Keine Mitarbeiter erfasst — unter «Arbeitsplätze verwalten» anlegen.</div>
        )}
      </div>
    </div>
  );
}
