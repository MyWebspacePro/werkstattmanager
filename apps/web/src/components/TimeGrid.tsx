import type { MouseEvent } from "react";
import { SHOP_END_MIN, SHOP_START_MIN, snapMinutes } from "../lib/slots.js";
import { appointmentsOfDay, blockMinutes, laneKeyOf, UNASSIGNED, type Lane, type MoveTarget, type PlannerAppointment } from "../lib/planner.js";
import { AppointmentBlock } from "./AppointmentBlock.js";
import { useGridDrag } from "./gridDrag.js";

interface Props {
  day: Date;
  lanes: Lane[];
  appointments: PlannerAppointment[];
  /** Pixel pro Minute — steuert die Höhe der Tagesachse. */
  pxPerMin?: number;
  groupBy: "station" | "mechanic";
  onCreate: (laneKey: string, startMin: number, endMin: number) => void;
  onOpen: (a: PlannerAppointment) => void;
  /** Termin in andere Spur/Zeit ziehen. */
  onMove?: (id: string, target: MoveTarget) => void;
  /** Öffnungszeiten aus den Einstellungen (Fallback: 07:00–18:00). */
  shopStartMin?: number;
  shopEndMin?: number;
}

/** Tag-Ansicht: Spalten = Arbeitsplätze bzw. Mitarbeiter, Zeilen = Zeit. */
export function TimeGrid({ day, lanes, appointments, pxPerMin = 1.15, groupBy, onCreate, onOpen, onMove, shopStartMin = SHOP_START_MIN, shopEndMin = SHOP_END_MIN }: Props) {
  const drag = useGridDrag(pxPerMin);
  const TOTAL_MIN = shopEndMin - shopStartMin;
  const HOURS = Array.from({ length: Math.floor(TOTAL_MIN / 60) + 1 }, (_, i) => shopStartMin + i * 60);
  const bodyHeight = TOTAL_MIN * pxPerMin;

  const minutesFromEvent = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return snapMinutes(shopStartMin + (e.clientY - rect.top) / pxPerMin);
  };

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white" style={{ maxHeight: "calc(100vh - 250px)" }}>
      <div style={{ minWidth: 56 + lanes.length * 160 }}>
        {/* Kopf: Spur-Namen */}
        <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-white">
          <div className="w-14 shrink-0" />
          {lanes.map((lane) => (
            <div key={lane.key} className="min-w-[160px] flex-1 border-l border-slate-100 px-2 py-2">
              <div className={`truncate text-sm font-semibold ${lane.kind === "UNASSIGNED" ? "text-amber-700" : "text-slate-800"}`}>
                {lane.title}
              </div>
              {lane.subtitle && <div className="truncate text-[11px] text-slate-500">{lane.subtitle}</div>}
            </div>
          ))}
        </div>

        <div className="flex">
          {/* Zeitachse */}
          <div className="relative w-14 shrink-0" style={{ height: bodyHeight }}>
            {HOURS.map((m) => (
              <div key={m} className="absolute right-1 -translate-y-1/2 text-[11px] tabular-nums text-slate-400" style={{ top: (m - shopStartMin) * pxPerMin }}>
                {String(Math.floor(m / 60)).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {/* Spuren */}
          {lanes.map((lane) => {
            const items = appointmentsOfDay(appointments, day).filter((a) => laneKeyOf(a, groupBy) === lane.key);
            return (
              <div
                key={lane.key}
                className={`relative min-w-[160px] flex-1 border-l border-slate-100 ${lane.kind === "UNASSIGNED" ? "bg-amber-50/40" : ""}`}
                style={{ height: bodyHeight }}
                onClick={(e) => {
                  if (e.target !== e.currentTarget) return;
                  const start = minutesFromEvent(e);
                  onCreate(lane.key, start, Math.min(start + 60, shopEndMin));
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const moved = drag.drop(e, minutesFromEvent(e));
                  if (moved) onMove?.(moved.id, { laneKey: lane.key, startMin: moved.startMin, endMin: moved.endMin });
                }}
              >
                {HOURS.map((m) => (
                  <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-slate-100" style={{ top: (m - shopStartMin) * pxPerMin }} />
                ))}

                {items.map((a) => {
                  const { startMin, endMin } = blockMinutes(a);
                  const duration = Math.max(endMin - startMin, 15);
                  return (
                    <AppointmentBlock
                      key={a.id}
                      a={a}
                      top={(startMin - shopStartMin) * pxPerMin}
                      height={duration * pxPerMin - 2}
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
      </div>
      {lanes.some((l) => l.key === UNASSIGNED) && (
        <div className="border-t border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
          Termine in der Sammelspur sind noch keinem {groupBy === "station" ? "Arbeitsplatz" : "Mitarbeiter"} zugewiesen.
        </div>
      )}
    </div>
  );
}