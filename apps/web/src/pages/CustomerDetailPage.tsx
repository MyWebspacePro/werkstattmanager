import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, apiDownload } from "../lib/api.js";
import { Badge, Card, ErrorMsg, formatCHF, formatDate } from "../components/ui.js";

interface CustomerDetail {
  id: string; type: string; firstName?: string | null; lastName?: string | null; company?: string | null;
  email?: string | null; phone?: string | null; street?: string | null; zip?: string | null; city?: string | null;
  notes?: string | null; archived: boolean; createdAt: string;
  vehicles: { id: string; licensePlate: string; brand: string; model: string; mileage?: number | null }[];
  consents: { type: string; granted: boolean; grantedAt?: string | null; revokedAt?: string | null; source?: string | null }[];
  workOrders: { id: string; number: string; status: string; openedAt: string; actualNet: string }[];
  invoices: { id: string; number: string; status: string; date: string; total: string }[];
  tyreSets: { id: string; location: string; season: string; storedAt: string }[];
  loans: { id: string; outAt: string; returnedAt?: string | null; dueAt: string }[];
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: c, isLoading, error } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => api<CustomerDetail>(`/customers/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <div className="text-slate-500">Lädt…</div>;
  if (error) return <ErrorMsg error={error} />;
  if (!c) return null;
  const name = c.company || `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
  const marketing = c.consents.find((x) => x.type === "EMAIL_MARKETING");

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="text-sm"><Link to="/kunden" className="text-blue-600 hover:underline">← Alle Kunden</Link></div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{name || "—"} <Badge color="slate">{c.type}</Badge></h1>
      </div>
      {c.archived && <div className="bg-slate-100 text-slate-600 rounded-lg px-4 py-2 text-sm">Dieser Kunde ist archiviert.</div>}

      <Card title="Kontaktangaben">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div><span className="text-slate-500">E-Mail:</span> {c.email ?? "—"}</div>
          <div><span className="text-slate-500">Telefon:</span> {c.phone ?? "—"}</div>
          <div><span className="text-slate-500">Adresse:</span> {[c.street, [c.zip, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"}</div>
          <div>
            <span className="text-slate-500">E-Mail-Einwilligung:</span>{" "}
            {marketing?.granted ? <Badge color="green">erteilt {marketing.grantedAt ? `am ${formatDate(marketing.grantedAt)}` : ""}</Badge> : <Badge color="slate">keine</Badge>}
          </div>
          <div><span className="text-slate-500">Kunde seit:</span> {formatDate(c.createdAt)}</div>
        </div>
        {c.notes && <p className="text-sm text-slate-600 mt-3">{c.notes}</p>}
      </Card>

      <Card title={`Fahrzeuge (${c.vehicles.length})`}>
        {c.vehicles.length === 0 ? <p className="text-sm text-slate-500">Noch keine Fahrzeuge — über «+ Fahrzeug» in der Kundenliste erfassen</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {c.vehicles.map((v) => (
              <Link key={v.id} to={`/fahrzeuge/${v.id}`} className="border border-slate-200 rounded-lg px-4 py-3 hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
                <p className="font-semibold">{v.licensePlate}</p>
                <p className="text-sm text-slate-600">{v.brand} {v.model}{v.mileage ? ` · ${v.mileage.toLocaleString("de-CH")} km` : ""}</p>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card title={`Aufträge (${c.workOrders.length})`}>
        {c.workOrders.length === 0 ? <p className="text-sm text-slate-500">Keine Aufträge</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500 border-b"><th className="py-2">Nummer</th><th>Datum</th><th>Netto</th><th>Status</th></tr></thead>
            <tbody>
              {c.workOrders.map((wo) => (
                <tr key={wo.id} className="border-b border-slate-50">
                  <td className="py-2 font-mono">{wo.number}</td>
                  <td>{formatDate(wo.openedAt)}</td>
                  <td>{formatCHF(wo.actualNet)}</td>
                  <td>{wo.status}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      <Card title={`Rechnungen (${c.invoices.length})`}>
        {c.invoices.length === 0 ? <p className="text-sm text-slate-500">Keine Rechnungen</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500 border-b"><th className="py-2">Nummer</th><th>Datum</th><th>Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {c.invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-50">
                  <td className="py-2 font-mono">{inv.number}</td>
                  <td>{formatDate(inv.date)}</td>
                  <td>{formatCHF(inv.total)}</td>
                  <td>{inv.status}</td>
                  <td className="text-right"><a className="text-blue-600 hover:underline text-xs cursor-pointer" onClick={() => apiDownload(`/invoices/${inv.id}/pdf`, `${inv.number}.pdf`)}>PDF</a></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      {(c.tyreSets.length > 0 || c.loans.length > 0) && (
        <Card title="Reifenhotel & Leihwagen">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium mb-1">Eingelagerte Sätze</p>
              {c.tyreSets.length === 0 ? <span className="text-slate-500">—</span> : c.tyreSets.map((t) => (
                <p key={t.id}><Badge color="blue">{t.season}</Badge> {t.location} · seit {formatDate(t.storedAt)}</p>
              ))}
            </div>
            <div>
              <p className="font-medium mb-1">Letzte Leihwagen</p>
              {c.loans.length === 0 ? <span className="text-slate-500">—</span> : c.loans.map((l) => (
                <p key={l.id}>{formatDate(l.outAt)}{l.returnedAt ? ` — zurück ${formatDate(l.returnedAt)}` : ` — ausgeliehen (fällig ${formatDate(l.dueAt)})`}</p>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
