import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

type Kind = "invoice" | "quote" | "order";

const config: Record<Kind, { prefixKey: keyof Prisma.SettingUncheckedUpdateInput; counterKey: keyof Prisma.SettingUncheckedUpdateInput }> = {
  invoice: { prefixKey: "invoicePrefix", counterKey: "invoiceNextNumber" },
  quote: { prefixKey: "quotePrefix", counterKey: "quoteNextNumber" },
  order: { prefixKey: "orderPrefix", counterKey: "orderNextNumber" },
};

/**
 * Nächste Belegnummer atomar vergeben (Race-Sicher über updateMany mit
 * erwartetem Zählerstand, mit Retry). Format: PREFIX-00001.
 */
export async function nextDocNumber(kind: Kind): Promise<string> {
  const { prefixKey, counterKey } = config[kind];
  for (let attempt = 0; attempt < 10; attempt++) {
    const s = await prisma.setting.findUnique({ where: { id: 1 } });
    if (!s) throw new Error("Settings nicht initialisiert");
    const n = s[counterKey] as number;
    const prefix = s[prefixKey] as string;
    const updated = await prisma.setting.updateMany({
      where: { id: 1, [counterKey]: n } as Prisma.SettingWhereInput,
      data: { [counterKey]: n + 1 } as Prisma.SettingUncheckedUpdateInput,
    });
    if (updated.count === 1) {
      return `${prefix}-${String(n).padStart(5, "0")}`;
    }
  }
  throw new Error(`Belegnummer konnte nach 10 Versuchen nicht vergeben werden (${kind})`);
}
