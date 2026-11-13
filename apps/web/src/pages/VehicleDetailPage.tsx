import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiDownload } from "../lib/api.js";
import { Badge, Button, Card, ErrorMsg, Field, Input, Modal, Textarea, formatCHF, formatDate } from "../components/ui.js";
import { BrandField, ModelField } from "../components/VehicleInputs.js";

interface VehicleDetail {
  id: string; licensePlate: string; vin?: string | null; brand: string; model: string;
  year?: number | null; mileage?: number | null; fuel?: string | null; notes?: string | null; archived: boolean;
  customer: { id: string; firstName?: string | null; lastName?: string | null; company?: string | null };
  workOrders: { id: string; number: string; status: string; openedAt: string; actualNet: string }[];
  invoices: { id: string; number: string; status: string; date: string; total: string }[];
  tyreSets: { id: string; location: string; season: string }[];
  reminderRules: { id: string; type: string; dueDate?: string | null; dueMileage?: number | null; active: boolean }[];
}

const emptyForm = { licensePlate: "", brand: "", model: "", year: "", mileage: "", vin: "", fuel: "", notes: "" };

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState("");

  const { data: v, isLoading, error } = useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => api<VehicleDetail>(`/vehicles/${id}`),
    enabled: !!id,
  });

  const save = useMutation({
    mutationFn: () =>
      api(`/vehicles/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          customerId: v!.customer.id,
          licensePlate: form.licensePlate, brand: form.brand, model: form.model,
          ...(form.year ? { year: Number(form.year) } : {}),
          ...(form.mileage ? { mileage: Number(form.mileage) } : {}),
          vin: form.vin || undefined, fuel: form.fuel || undefined, notes: form.notes || undefined,
        }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vehicle", id] }); qc.invalidateQueries({ queryKey: ["customers"] }); setEditOpen(false); setMsg("Fahrzeug gespeichert ✓"); },
  });

  const archive = useMutation({
    mutationFn: () => api(`/vehicles/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries(); navigate(`/kunden/${v!.customer.id}`); },
  });

  if (isLoading) return <div className="text-slate-500">Lädt…</div>;
  if (error) return <ErrorMsg error={error} />;
  if (!v) return null;
  const cust = v.customer.company || `${v.customer.firstName ?? ""} ${v.customer.lastName ?? ""}`.trim();
  const set = (key: keyof typeof emptyForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3 text-sm">
        <Link to={`/kunden/${v.customer.id}`} className="text-blue-600 hover:underline">← {cust}</Link>
      </div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{v.licensePlate} <span className="text-lg font-normal text-slate-500">· {v.brand} {v.model}</span></h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { setForm({ licensePlate: v.licensePlate, brand: v.brand, model: v.model, year: String(v.year ?? ""), mileage: String(v.mileage ?? ""), vin: v.vin ?? "", fuel: v.fuel ?? "", notes: v.notes ?? "" }); setEditOpen(true); }}>
            Bearbeiten
          </Button>
          {!v.archived && (
            <Button variant="danger" onClick={() => { if (window.confirm(`${v.licensePlate} archivieren? (Historie bleibt erhalten)`)) archive.mutate(); }}>
              Archivieren
            </Button>
          )}
        </div>
      </div>
      {msg && <div className="bg-green-50 text-green-700 rounded-lg px-4 py-2">{msg}</div>}
      {v.archived && <div className="bg-slate-100 text-slate-600 rounded-lg px-4 py-2 text-sm">Dieses Fahrzeug ist archiviert.</div>}
      <ErrorMsg error={save.error ?? archive.error} />

      <Card title="Fahrzeugdaten">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><span className="text-slate-500">KM-Stand:</span> {v.mileage?.toLocaleString("de-CH") ?? "—"}</div>
          <div><span className="text-slate-500">1. Inv.:</span> {v.year ?? "—"}</div>
          <div><span className="text-slate-500">Treibstoff:</span> {v.fuel ?? "—"}</div>
          <div><span className="text-slate-500">VIN:</span> {v.vin ?? "—"}</div>
        </div>
        {v.notes && <p className="text-sm text-slate-600 mt-3">{v.notes}</p>}
      </Card>

      <Card title={`Aufträge (${v.workOrders.length})`}>
        {v.workOrders.length === 0 ? <p className="text-sm text-slate-500">Noch keine Aufträge</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500 border-b"><th className="py-2">Nummer</th><th>Datum</th><th>Netto</th><th>Status</th></tr></thead>
            <tbody>
              {v.workOrders.map((wo) => (
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

      <Card title={`Rechnungen (${v.invoices.length})`}>
        {v.invoices.length === 0 ? <p className="text-sm text-slate-500">Keine Rechnungen</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500 border-b"><th className="py-2">Nummer</th><th>Datum</th><th>Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {v.invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-50">
                  <td className="py-2 font-mono">{inv.number}</td>
                  <td>{formatDate(inv.date)}</td>
                  <td>{formatCHF(inv.total)}</td>
                  <td>{inv.status}</td>
                  <td className="text-right"><Button variant="ghost" onClick={() => apiDownload(`/invoices/${inv.id}/pdf`, `${inv.number}.pdf`)}>PDF</Button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      {(v.tyreSets.length > 0 || v.reminderRules.length > 0) && (
        <Card title="Reifenhotel & Erinnerungen">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium mb-1">Eingelagert</p>
              {v.tyreSets.length === 0 ? <span className="text-slate-500">—</span> : v.tyreSets.map((t) => (
                <p key={t.id}><Badge color="blue">{t.season}</Badge> Lagerplatz {t.location}</p>
              ))}
            </div>
            <div>
              <p className="font-medium mb-1">Erinnerungsregeln</p>
              {v.reminderRules.length === 0 ? <span className="text-slate-500">—</span> : v.reminderRules.map((r) => (
                <p key={r.id}>{r.type}{r.dueDate ? ` · fällig ${formatDate(r.dueDate)}` : ""}{r.dueMileage ? ` · bei ${r.dueMileage.toLocaleString("de-CH")} km` : ""} {r.active ? "✓" : "(inaktiv)"}</p>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Modal open={editOpen} title="Fahrzeug bearbeiten" onClose={() => setEditOpen(false)}>
        {save.error && <ErrorMsg error={save.error} />}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Kennzeichen"><Input value={form.licensePlate} onChange={set("licensePlate")} required /></Field>
          <BrandField value={form.brand} onChange={(v2) => setForm((f) => ({ ...f, brand: v2 }))} required />
          <ModelField brand={form.brand} value={form.model} onChange={(v2) => setForm((f) => ({ ...f, model: v2 }))} required />
          <Field label="1. Inv. (Erstinverkehrsetzung)"><Input type="number" value={form.year} onChange={set("year")} min={1950} max={2100} placeholder="2016" /></Field>
          <Field label="KM-Stand"><Input type="number" value={form.mileage} onChange={set("mileage")} min={0} /></Field>
          <Field label="Treibstoff"><Input value={form.fuel} onChange={set("fuel")} placeholder="Benzin / Diesel / Elektro…" /></Field>
          <Field label="VIN"><Input value={form.vin} onChange={set("vin")} /></Field>
        </div>
        <div className="mt-4"><Field label="Notizen"><Textarea rows={2} value={form.notes} onChange={set("notes")} /></Field></div>
        <div className="flex gap-3 mt-6">
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.licensePlate || !form.brand || !form.model}>
            {save.isPending ? "Speichert…" : "Speichern"}
          </Button>
          <Button variant="secondary" onClick={() => setEditOpen(false)}>Abbrechen</Button>
        </div>
      </Modal>
    </div>
  );
}
