import type { MouseEvent } from "react";
import { SHOP_END_MIN, SHOP_START_MIN, snapMinutes, weekdayShort } from "../lib/slots.js";
import { appointmentsOfDay, blockMinutes, laneKeyOf, UNASSIGNED, type Lane, type MoveTarget, type PlannerAppointment } from "../lib/planner.js";
import { AppointmentBlock } from "./AppointmentBlock.js";
import { useGridDrag } from "./gridDrag.js";

interface Props {
  days: Date[];
  lanes: Lane[];
  appointments: PlannerAppointment[];
  /** Pixel pro Minute — in der Woche flacher als in der Tagansicht. */
  pxPerMin?: number;
  groupBy: "station" | "mechanic";
  today?: Date;
  onCreate: (laneKey: string, day: Date, startMin: number, endMin: number) => void;
  onOpen: (a: PlannerAppointment) => void;
  onMove?: (id: string, target: MoveTarget) => void;
  /** Öffnungszeiten aus den Einstellungen (Fallback: 07:00–18:00). */
  shopStartMin?: number;
  shopEndMin?: number;
}

const LABEL_W = 150;

/** Wochen-Gantt: Zeilen = Arbeitsplätze bzw. Mitarbeiter, Spalten = Tage. */
export function WeekGrid({ days, lanes, appointments, pxPerMin = 0.6, groupBy, today, onCreate, onOpen, onMove, shopStartMin = SHOP_START_MIN, shopEndMin = SHOP_END_MIN }: Props) {
  const drag = useGridDrag(pxPerMin);
  const TOTAL_MIN = shopEndMin - shopStartMin;
  const bodyHeight = TOTAL_MIN * pxPerMin;
  const HOURS = Array.from({ length: Math.floor(TOTAL_MIN / 60) + 1 }, (_, i) => shopStartMin + i * 60);

  const minutesFromEvent = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return snapMinutes(shopStartMin + (e.clientY - rect.top) / pxPerMin);
  };

  const isToday = (d: Date) =>
    !!today && d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white" style={{ maxHeight: "calc(100vh - 250px)" }}>
      <div style={{ minWidth: LABEL_W + days.length * 150 }}>
        {/* Kopf: Tage */}
        <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-white">
          <div className="shrink-0 px-2 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-400" style={{ width: LABEL_W }}>
            {groupBy === "station" ? "Arbeitsplatz" : "Mitarbeiter"}
          </div>
          {days.map((d) => (
            <div key={d.toISOString()} className={`min-w-[150px] flex-1 border-l border-slate-100 px-2 py-2 text-center ${isToday(d) ? "bg-blue-50 text-blue-700" : ""}`}>
              <div className="text-sm font-semibold">{weekdayShort(d)} {d.getDate()}.</div>
              <div className="text-[11px] text-slate-500">{d.toLocaleDateString("de-CH", { month: "short" })}</div>
            </div>
          ))}
        </div>

        {/* Spur-Zeilen */}
        {lanes.map((lane) => (
          <div key={lane.key} className="flex border-b border-slate-100 last:border-b-0">
            <div className="sticky left-0 z-10 shrink-0 overflow-hidden border-r border-slate-100 bg-white px-2 py-1" style={{ width: LABEL_W, height: bodyHeight }}>
              <div className={`text-xs font-semibold leading-tight ${lane.kind === "UNASSIGNED" ? "text-amber-700" : "text-slate-800"}`}>{lane.title}</div>
              {lane.subtitle && <div className="text-[10px] leading-tight text-slate-500">{lane.subtitle}</div>}
              {HOURS.filter((m) => m % 120 === 0).map((m) => (
                <div key={m} className="absolute right-1 text-[10px] tabular-nums text-slate-400" style={{ top: (m - shopStartMin) * pxPerMin + 26 }}>
                  {String(Math.floor(m / 60)).padStart(2, "0")}:00
                </div>
              ))}
            </div>

            {days.map((day) => {
              const items = appointmentsOfDay(appointments, day).filter((a) => laneKeyOf(a, groupBy) === lane.key);
              return (
                <div
                  key={day.toISOString()}
                  className={`relative min-w-[150px] flex-1 border-l border-slate-100 ${lane.kind === "UNASSIGNED" ? "bg-amber-50/40" : ""}`}
                  style={{ height: bodyHeight }}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const start = minutesFromEvent(e);
                    onCreate(lane.key, day, start, Math.min(start + 60, shopEndMin));
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const moved = drag.drop(e, minutesFromEvent(e));
                    if (moved) onMove?.(moved.id, { laneKey: lane.key, day, startMin: moved.startMin, endMin: moved.endMin });
                  }}
                >
                  {HOURS.map((m) => (
                    <div
                      key={m}
                      className={`pointer-events-none absolute inset-x-0 ${m % 60 === 0 ? "border-t border-slate-100" : "border-t border-dashed border-slate-50"}`}
                      style={{ top: (m - shopStartMin) * pxPerMin }}
                    />
                  ))}

                  {items.map((a) => {
                    const { startMin, endMin } = blockMinutes(a);
                    const duration = Math.max(endMin - startMin, 15);
                    return (
                      <AppointmentBlock
                        key={a.id}
                        a={a}
                        top={(startMin - shopStartMin) * pxPerMin}
                        height={duration * pxPerMin - 1.5}
                        compact
                        showResource={groupBy === "mechanic"}
                        draggable={!!onMove}
                        onOpen={onOpen}
                        onDragStart={(e, appt) => drag.begin(e, appt.id, duration)}
                        onDragEnd={drag.end}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}

        {lanes.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-500">
            Keine {groupBy === "station" ? "Arbeitsplätze" : "Mitarbeiter"} erfasst — unter „Arbeitsplätze verwalten" anlegen.
          </div>
        )}
      </div>

      {lanes.some((l) => l.key === UNASSIGNED) && (
        <div className="border-t border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
          Termine in der Sammelspur sind noch keinem {groupBy === "station" ? "Arbeitsplatz" : "Mitarbeiter"} zugewiesen.
        </div>
      )}
    </div>
  );
}