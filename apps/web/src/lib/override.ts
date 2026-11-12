import { ApiError } from "./api.js";

export interface ConflictInfo {
  plate: string;
  reason?: string | null;
  start: string;
  end: string;
  lane: string;
}

/**
 * Chef-Übersteuerung: Bei 409 mit canOverride zeigt der Dialog die konkreten
 * Kollisionen (wer/wann/wofür) und wiederholt die Mutation mit override: true.
 */
export async function confirmOverride(err: unknown, retry: () => void): Promise<void> {
  if (err instanceof ApiError && err.status === 409 && err.canOverride) {
    const conflicts: ConflictInfo[] =
      typeof err.body === "object" && err.body !== null && Array.isArray((err.body as { conflicts?: unknown }).conflicts)
        ? ((err.body as { conflicts: ConflictInfo[] }).conflicts)
        : [];
    const detail = conflicts.length
      ? conflicts
          .map((c) => `• ${c.lane} ${new Date(c.start).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}–${new Date(c.end).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}: ${c.plate}${c.reason ? ` — ${c.reason}` : ""}`)
          .join("\n")
      : "";
    if (window.confirm(`${err.message}\n\n${detail}\n\nAls Chef trotzdem ausführen? Die Ausnahme wird protokolliert.`)) retry();
  }
}
