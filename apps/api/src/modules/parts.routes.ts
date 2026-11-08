import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard, requireRole } from "../plugins/auth.js";

const partSchema = z.object({
  number: z.string().min(1),
  name: z.string().min(1),
  supplierId: z.string().optional(),
  barcode: z.string().optional(),
  location: z.string().optional(),
  stock: z.coerce.number().int().min(0).default(0),
  minStock: z.coerce.number().int().min(0).default(0),
  purchasePrice: z.coerce.number().min(0).default(0),
  salePrice: z.coerce.number().min(0).default(0),
});

const stockSchema = z.object({
  type: z.enum(["IN", "OUT", "ADJUST", "RETURN"]),
  qty: z.coerce.number().int().min(1),
  reason: z.string().optional(),
});

export async function partsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authGuard);

  // ── Lieferanten ──
  app.get("/suppliers", async () => prisma.supplier.findMany({ orderBy: { name: "asc" } }));

  app.post("/suppliers", async (req) => {
    const data = z.object({ name: z.string().min(1), email: z.string().optional(), phone: z.string().optional() }).parse(req.body);
    const supplier = await prisma.supplier.create({ data });
    await audit(req.user!.id, "CREATE", "Supplier", supplier.id, { name: supplier.name });
    return supplier;
  });

  // ── Teile ──
  app.get("/parts", async (req) => {
    const { q, lowStock, skip = 0, take = 50, supplierId } = (req.query ?? {}) as {
      q?: string; lowStock?: string; skip?: number; take?: number; supplierId?: string;
    };
    const where: Record<string, unknown> = { archived: false };
    if (q) {
      where.OR = [
        { number: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
      ];
    }
    if (supplierId) where.supplierId = supplierId;
    const all = await prisma.part.findMany({
      where,
      orderBy: { name: "asc" },
      include: { supplier: { select: { name: true } } },
    });
    const filtered = lowStock === "true" ? all.filter((p) => p.stock <= p.minStock) : all;
    const skipN = Number(skip);
    const takeN = Math.min(Number(take), 200);
    return { items: filtered.slice(skipN, skipN + takeN), total: filtered.length };
  });

  app.get("/parts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const part = await prisma.part.findUnique({
      where: { id },
      include: { supplier: true, stockMoves: { orderBy: { createdAt: "desc" }, take: 30 } },
    });
    if (!part) return reply.code(404).send({ error: "Teil nicht gefunden" });
    return part;
  });

  app.post("/parts", async (req) => {
    const { supplierId, ...data } = partSchema.parse(req.body);
    const part = await prisma.part.create({
      data: { ...data, supplierId: supplierId || null },
    });
    if (data.stock > 0) {
      await prisma.stockMovement.create({
        data: { partId: part.id, type: "IN", qty: data.stock, reason: "Erstanlage", userId: req.user!.id },
      });
    }
    await audit(req.user!.id, "CREATE", "Part", part.id, { number: part.number });
    return part;
  });

  app.put("/parts/:id", async (req) => {
    const { id } = req.params as { id: string };
    const { supplierId, stock, ...data } = partSchema.parse(req.body);
    const existing = await prisma.part.findUniqueOrThrow({ where: { id } });
    const part = await prisma.part.update({
      where: { id },
      data: { ...data, supplierId: supplierId || null },
    });
    if (stock !== existing.stock) {
      await prisma.stockMovement.create({
        data: { partId: id, type: "ADJUST", qty: Math.abs(stock - existing.stock), reason: `Korrektur ${existing.stock} → ${stock}`, userId: req.user!.id },
      });
      await prisma.part.update({ where: { id }, data: { stock } });
    }
    await audit(req.user!.id, "UPDATE", "Part", id, { number: part.number });
    return prisma.part.findUniqueOrThrow({ where: { id } });
  });

  app.post("/parts/:id/stock", async (req) => {
    const { id } = req.params as { id: string };
    const { type, qty, reason } = stockSchema.parse(req.body);
    const delta = type === "IN" ? qty : type === "OUT" || type === "RETURN" ? -qty : 0; // ADJUST via PUT
    const part = await prisma.part.update({
      where: { id },
      data: { stock: { increment: delta } },
    });
    await prisma.stockMovement.create({
      data: { partId: id, type, qty, reason, userId: req.user!.id },
    });
    await audit(req.user!.id, "STOCK", "Part", id, { type, qty });
    return part;
  });

  app.delete("/parts/:id", async (req) => {
    const { id } = req.params as { id: string };
    const part = await prisma.part.update({ where: { id }, data: { archived: true } });
    await audit(req.user!.id, "ARCHIVE", "Part", id);
    return part;
  });

  // ── CSV-Import von Lieferantenpreislisten ──
  // Das Frontend parst die CSV und sendet JSON-Zeilen + Spalten-Mapping.
  const importSchema = z.object({
    supplierId: z.string().min(1),
    fileName: z.string().min(1),
    mapping: z.object({
      number: z.string().min(1),
      name: z.string().min(1),
      salePrice: z.string().optional(),
      purchasePrice: z.string().optional(),
      stock: z.string().optional(),
      barcode: z.string().optional(),
      location: z.string().optional(),
    }),
    rows: z.array(z.record(z.string())).min(1).max(20000),
  });

  function toNum(v: string | undefined): number {
    if (!v) return 0;
    const n = Number(String(v).replace(/['\s]/g, "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  app.post("/parts/import", async (req) => {
    const body = importSchema.parse(req.body);
    const imp = await prisma.supplierPriceImport.create({
      data: { supplierId: body.supplierId, fileName: body.fileName, itemCount: body.rows.length },
    });
    let created = 0;
    let updated = 0;
    try {
      await prisma.$transaction(async (tx) => {
        for (const row of body.rows) {
          const number = (row[body.mapping.number] ?? "").trim();
          const name = (row[body.mapping.name] ?? "").trim();
          if (!number || !name) continue;
          const data = {
            name,
            salePrice: toNum(body.mapping.salePrice ? row[body.mapping.salePrice] : undefined),
            purchasePrice: toNum(body.mapping.purchasePrice ? row[body.mapping.purchasePrice] : undefined),
            barcode: body.mapping.barcode ? row[body.mapping.barcode] || null : null,
            location: body.mapping.location ? row[body.mapping.location] || null : null,
          };
          const existing = await tx.part.findUnique({ where: { number } });
          if (existing) {
            await tx.part.update({ where: { number }, data });
            updated++;
          } else {
            await tx.part.create({ data: { number, supplierId: body.supplierId, ...data } });
            created++;
          }
        }
      });
      const done = await prisma.supplierPriceImport.update({
        where: { id: imp.id },
        data: { status: "PROCESSED", createdCnt: created, updatedCnt: updated },
      });
      await audit(req.user!.id, "IMPORT", "SupplierPriceImport", imp.id, { created, updated });
      return done;
    } catch (err) {
      await prisma.supplierPriceImport.update({
        where: { id: imp.id },
        data: { status: "FAILED", error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  });

  app.get("/parts/imports", async () =>
    prisma.supplierPriceImport.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { supplier: { select: { name: true } } } })
  );

  // Nachbestellvorschläge: Teile auf oder unter Mindestbestand (Spaltenvergleich in JS — Prisma kann das nicht)
  app.get("/parts/reorder", async () => {
    const parts = await prisma.part.findMany({
      where: { archived: false },
      include: { supplier: { select: { name: true, email: true } } },
      orderBy: { name: "asc" },
    });
    return parts.filter((p) => Number(p.stock) <= Number(p.minStock));
  });
}
