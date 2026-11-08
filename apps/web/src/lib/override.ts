import { ApiError } from "./api.js";

/**
 * Chef-Übersteuerung: Bei 409 mit canOverride fragt der Browser nach und
 * wiederholt die Mutation mit override: true.
 */
export async function confirmOverride(err: unknown, retry: () => void): Promise<void> {
  if (err instanceof ApiError && err.status === 409 && err.canOverride) {
    if (window.confirm(`${err.message}\n\nAls Chef trotzdem ausführen? Die Ausnahme wird protokolliert.`)) retry();
  }
}
