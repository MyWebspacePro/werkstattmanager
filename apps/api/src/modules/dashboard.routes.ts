import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authGuard } from "../plugins/auth.js";

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authGuard);

  app.get("/dashboard", async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const [monthInvoices, yearInvoices, openInvoices, openOrders, lifts, lowParts, openTyres] = await Promise.all([
      prisma.invoice.aggregate({
        where: { date: { gte: monthStart }, type: "INVOICE", status: { notIn: ["CANCELLED"] } },
        _sum: { total: true, totalNet: true },
        _count: true,
      }),
      prisma.invoice.aggregate({
        where: { date: { gte: yearStart }, type: "INVOICE", status: { notIn: ["CANCELLED"] } },
        _sum: { total: true },
      }),
      prisma.invoice.findMany({
        where: { status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] }, archived: false },
        select: { total: true, paidTotal: true, dueDate: true, status: true },
      }),
      prisma.workOrder.findMany({
        where: { status: { in: ["OPEN", "PARTS_ORDERED", "IN_PROGRESS", "READY"] }, archived: false },
        select: { id: true, number: true, status: true, openedAt: true, vehicle: { select: { licensePlate: true } }, customer: { select: { lastName: true, company: true } } },
        orderBy: { openedAt: "desc" },
        take: 10,
      }),
      prisma.appointment.count({ where: { start: { gte: monthStart, lte: now }, status: { in: ["CONFIRMED", "IN_PROGRESS", "DONE"] } } }),
      prisma.part.findMany({ where: { archived: false }, select: { number: true, name: true, stock: true, minStock: true } }),
      prisma.tyreSet.count({ where: { retrievedAt: null } }),
    ]);

    const openTotal = openInvoices.reduce((s, i) => s + (Number(i.total) - Number(i.paidTotal)), 0);
    const overdue = openInvoices.filter((i) => i.dueDate < now);
    const overdueTotal = overdue.reduce((s, i) => s + (Number(i.total) - Number(i.paidTotal)), 0);

    return {
      revenueMonth: monthInvoices._sum.total ?? 0,
      revenueNetMonth: monthInvoices._sum.totalNet ?? 0,
      invoiceCountMonth: monthInvoices._count,
      revenueYear: yearInvoices._sum.total ?? 0,
      openReceivables: Math.round(openTotal * 100) / 100,
      overdueCount: overdue.length,
      overdueTotal: Math.round(overdueTotal * 100) / 100,
      openWorkOrders: openOrders,
      appointmentsThisMonth: lifts,
      tyreSetsStored: openTyres,
      lowStockParts: lowParts.filter((p) => p.stock <= p.minStock).slice(0, 10),
    };
  });
}
