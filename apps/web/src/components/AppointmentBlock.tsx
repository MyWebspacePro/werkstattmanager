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
  /** In der Mitarbeiter-Ansicht die Bühne mit anzeigen, in der Arbeitsplatz-Ansicht die Person. */
  showResource?: boolean;
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
export function AppointmentBlock({ a, top, height, compact, showResource, draggable, dragging, onOpen, onDragStart, onDragEnd }: Props) {
  const meta = statusMeta(a.status);
  const start = fmtTime(new Date(a.start));
  const end = fmtTime(new Date(a.end));
  const plate = a.vehicle?.licensePlate ?? "—";
  const showTime = height >= 26 || (compact && height >= 13);
  const showReason = height >= (compact ? 32 : 52) && !!a.reason;
  const showPerson = height >= (compact ? 48 : 74);
  const laneLabel = showResource ? (a.resource?.name ? `🛠 ${a.resource.name}` : null) : a.mechanic ? `👤 ${a.mechanic.name}` : null;
  const showLane = height >= (compact ? 48 : 74) && laneLabel;
  // Kompakt: Bühne/Person als Kürzel direkt hinter das Kennzeichen — passt in
  // jeden Block, auch 30-Minuten-Slots im Wochen-Gantt.
  const compactLane = compact
    ? showResource
      ? a.resource?.name?.replace(/^Hebebühne\s*/, "Hb ").replace(/^Reifenwechselplatz/, "RWZ")
      : a.mechanic?.name.split(" ")[0]
    : null;

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
      <div className="truncate font-semibold">
        {plate}
        {compactLane ? <span className="font-normal opacity-70"> · {compactLane}</span> : null}
      </div>
      {!compact && <div className="truncate opacity-70">{custName(a)}</div>}
      {showReason && <div className="truncate opacity-60">{a.reason}</div>}
      {showLane && <div className="truncate opacity-70">{laneLabel}</div>}
      {showPerson && !compact && !showResource && a.resource && <div className="truncate opacity-70">🛠 {a.resource.name}</div>}
    </div>
  );
}