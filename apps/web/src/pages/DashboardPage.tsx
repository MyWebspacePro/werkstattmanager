import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Badge, Card, ErrorMsg, Empty, formatCHF, formatDate } from "../components/ui.js";

interface Dashboard {
  revenueMonth: number;
  revenueYear: number;
  invoiceCountMonth: number;
  openReceivables: number;
  overdueCount: number;
  overdueTotal: number;
  openWorkOrders: { id: string; number: string; status: string; openedAt: string; vehicle: { licensePlate: string }; customer: { lastName: string | null; company: string | null } }[];
  appointmentsThisMonth: number;
  tyreSetsStored: number;
  lowStockParts: { number: string; name: string; stock: number; minStock: number }[];
}

const woStatusColor: Record<string, "blue" | "yellow" | "purple" | "green"> = {
  OPEN: "blue",
  PARTS_ORDERED: "yellow",
  IN_PROGRESS: "purple",
  READY: "green",
};

export default function DashboardPage() {
  const { data, error, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/dashboard") });

  if (isLoading) return <div className="text-slate-500">Lädt…</div>;
  if (error) return <ErrorMsg error={error} />;
  if (!data) return null;

  const kpi = (label: string, value: string, sub?: string) => (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpi("Umsatz Monat", formatCHF(data.revenueMonth), `${data.invoiceCountMonth} Rechnungen`)}
        {kpi("Umsatz Jahr", formatCHF(data.revenueYear))}
        {kpi("Offene Forderungen", formatCHF(data.openReceivables), data.overdueCount ? `${data.overdueCount} überfällig: ${formatCHF(data.overdueTotal)}` : "keine überfällig")}
        {kpi("Reifenhotel", `${data.tyreSetsStored} Sätze`, `${data.appointmentsThisMonth} Termine im Monat`)}
      </div>

      <Card title="Offene Aufträge">
        {data.openWorkOrders.length === 0 ? (
          <Empty text="Keine offenen Aufträge" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="py-2">Nummer</th><th>Kunde</th><th>Kontrollschild</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.openWorkOrders.map((wo) => (
                <tr key={wo.id} className="border-b border-slate-50">
                  <td className="py-2 font-mono">{wo.number}</td>
                  <td>{wo.customer.company ?? wo.customer.lastName}</td>
                  <td>{wo.vehicle.licensePlate}</td>
                  <td><Badge color={woStatusColor[wo.status] ?? "slate"}>{wo.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Tiefer Lagerbestand (Nachbestellung)">
        {data.lowStockParts.length === 0 ? (
          <Empty text="Alles ausreichend gelagert" />
        ) : (
          <ul className="text-sm space-y-1">
            {data.lowStockParts.map((p) => (
              <li key={p.number} className="flex justify-between border-b border-slate-50 py-1">
                <span><span className="font-mono text-slate-500">{p.number}</span> {p.name}</span>
                <Badge color="red">Lager: {p.stock} / Min: {p.minStock}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
