import { useRef } from "react";
import type { DragEvent } from "react";
import { SHOP_END_MIN, SHOP_START_MIN, snapMinutes } from "../lib/slots.js";

interface DragPayload {
  id: string;
  durationMin: number;
  /** Wo im Block gegriffen wurde (Minuten von oben) — verhindert Springen. */
  grabMin: number;
}

/**
 * Drag & Drop für beide Raster-Ansichten: greifen, über eine Spur ziehen, fallen
 * lassen. Die Minute der Ablage rechnet die Kachel selbst (clientY), hier wird nur
 * der Griffversatz ausgeglichen und auf das Raster gerastet.
 */
export function useGridDrag(pxPerMin: number) {
  const ref = useRef<DragPayload | null>(null);

  const begin = (e: DragEvent<HTMLElement>, id: string, durationMin: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const grabMin = (e.clientY - rect.top) / pxPerMin;
    ref.current = { id, durationMin, grabMin: Math.min(Math.max(grabMin, 0), durationMin) };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const end = () => {
    ref.current = null;
  };

  /** `slotStartMin` = Minute, auf die der Cursor zeigt (vom Aufrufer gerastet). */
  const drop = (e: DragEvent<HTMLElement>, slotStartMin: number): { id: string; startMin: number; endMin: number } | null => {
    e.preventDefault();
    const payload = ref.current;
    ref.current = null;
    if (!payload) return null;
    const start = snapMinutes(slotStartMin - payload.grabMin);
    const clamped = Math.min(Math.max(start, SHOP_START_MIN), SHOP_END_MIN - payload.durationMin);
    return { id: payload.id, startMin: clamped, endMin: clamped + payload.durationMin };
  };

  return { begin, end, drop };
}