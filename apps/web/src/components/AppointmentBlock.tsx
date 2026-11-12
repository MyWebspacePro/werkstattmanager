import type { DragEvent } from "react";
import { custName, statusMeta, type PlannerAppointment } from "../lib/planner.js";
import { fmtTime } from "../lib/slots.js";

interface Props {
  a: PlannerAppointment;
  /** Position innerhalb der Tages-Spur, in Pixeln. */
  top: number;
  height: number;
  /** Kompakt = Wochen-Gantt (weniger Zeilen). */
  compact?: boolean;
  draggable?: boolean;
  dragging?: boolean;
  onOpen: (a: PlannerAppointment) => void;
  onDragStart?: (e: DragEvent<HTMLDivElement>, a: PlannerAppointment) => void;
  onDragEnd?: () => void;
}

/**
 * Ein Termin im Raster. Höhe und Position kommen von der Kachel, hier steht nur
 * die Darstellung — Tag- und Wochenansicht teilen sich diesen Block.
 */
export function AppointmentBlock({ a, top, height, compact, draggable, dragging, onOpen, onDragStart, onDragEnd }: Props) {
  const meta = statusMeta(a.status);
  const start = fmtTime(new Date(a.start));
  const end = fmtTime(new Date(a.end));
  const plate = a.vehicle?.licensePlate ?? "—";
  const showTime = compact ? height >= 13 : height >= 26;
  const showReason = height >= (compact ? 999 : 52) && !!a.reason;
  const showMechanic = height >= (compact ? 999 : 74);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e, a)}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(a);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(a);
        }
      }}
      title={`${start}–${end} · ${plate} · ${custName(a)}${a.reason ? ` · ${a.reason}` : ""}`}
      style={{ top, height: Math.max(height, 22) }}
      className={`absolute left-0.5 right-0.5 overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400 ${meta.block} ${
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${dragging ? "opacity-40" : ""}`}
    >
      {showTime && (
        <div className="font-semibold tabular-nums opacity-80">
          {compact ? start : `${start}–${end}`}
        </div>
      )}
      <div className="truncate font-semibold">{plate}</div>
      {!compact && <div className="truncate opacity-70">{custName(a)}</div>}
      {showReason && <div className="truncate opacity-60">{a.reason}</div>}
      {showMechanic && a.mechanic && <div className="truncate opacity-70">👤 {a.mechanic.name}</div>}
    </div>
  );
}