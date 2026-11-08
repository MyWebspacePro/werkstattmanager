import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

/** Audit-Trail (nDSG/Nachvollziehbarkeit). Löst nie den Hauptfluss aus. */
export async function audit(
  userId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  details?: unknown
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId ?? undefined,
        action,
        entity,
        entityId: entityId ?? null,
        details: details == null ? null : JSON.stringify(details),
      },
    });
  } catch {
    // bewusst geschluckt: Audit darf den Geschäftsfluss nicht brechen
  }
}

export type AuditWhere = Prisma.AuditLogWhereInput;
