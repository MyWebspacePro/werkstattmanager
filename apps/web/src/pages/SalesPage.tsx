import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Badge, Button, Card, Empty, ErrorMsg, Field, Input, Modal, Select, Textarea, formatCHF } from "../components/ui.js";

interface Purchase {
  id: string; brand: string; model: string; year?: number | null; mileage?: number | null; vin?: string | null;
  status: string; purchasePrice?: string | null; prepCosts: string; salePrice?: string | null;
  evaluationNotes?: string | null;
  seller: { firstName?: string | null; lastName?: string | null; company?: string | null };
  vehicle?: { licensePlate: string } | null;
}

const statusLabel: Record<string, string> = {
  EVALUATION: "Bewertung", ACQUIRED: "Angekauft", PREPARING: "Aufbereitung", LISTED: "Im Verkauf", SOLD: "Verkauft",
};
const statusColor: Record<string, "yellow" | "blue" | "purple" | "slate" | "green"> = {
  EVALUATION: "yellow", ACQUIRED: "blue", PREPARING: "purple", LISTED: "slate", SOLD: "green",
};

const emptyForm = { sellerId: "", brand: "", model: "", year: "", mileage: "", vin: "", purchasePrice: "", prepCosts: "0", evaluationNotes: "" };

export default function SalesPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, error } = useQuery({ queryKey: ["purchases"], queryFn: () => api<{ items: Purchase[] }>("/purchases") });
  const { data: margin } = useQuery({ queryKey: ["margin"], queryFn: () => api<{ soldCount: number; totalPurchase: number; totalSales: number; margin: number }>("/purchases/summary/margin") });
  const { data: customers } = useQuery({ queryKey: ["customers-all"], queryFn: () => api<{ items: { id: string; firstName?: string | null; lastName?: string | null; company?: string | null }[] }>("/customers?take=100") });

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        year: form.year ? Number(form.year) : undefined,
        mileage: form.mileage ? Number(form.mileage) : undefined,
        purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
        prepCosts: Number(form.prepCosts) || 0,
      };
      return editing ? api(`/purchases/${editing.id}`, { method: "PUT", body: JSON.stringify(body) }) : api("/purchases", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchases"] }); qc.invalidateQueries({ queryKey: ["margin"] }); setModalOpen(false); },
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { id: string; status: string }) => api(`/purchases/${payload.id}`, { method: "PUT", body: JSON.stringify({ status: payload.status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchases"] }),
  });

  const openEdit = (p: Purchase) => {
    setEditing(p);
    setForm({
      sellerId: "", brand: p.brand, model: p.model, year: String(p.year ?? ""), mileage: String(p.mileage ?? ""),
      vin: p.vin ?? "", purchasePrice: p.purchasePrice ?? "", prepCosts: p.prepCosts ?? "0", evaluationNotes: p.evaluationNotes ?? "",
    });
    setModalOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ankauf & Verkauf</h1>
        <Button onClick={() => { setEditing(null); setForm(emptyForm); setModalOpen(true); }}>+ Fahrzeug ankaufen</Button>
      </div>

      {margin && margin.soldCount > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card><div className="text-sm text-slate-500">Verkauft</div><div className="text-xl font-bold">{margin.soldCount} Fahrzeuge</div></Card>
          <Card><div className="text-sm text-slate-500">Einkauf + Aufbereitung</div><div className="text-xl font-bold">{formatCHF(margin.totalPurchase)}</div></Card>
          <Card><div className="text-sm text-slate-500">Marge</div><div className={`text-xl font-bold ${margin.margin >= 0 ? "text-green-600" : "text-red-600"}`}>{formatCHF(margin.margin)}</div></Card>
        </div>
      )}

      {error && <ErrorMsg error={error} />}
      {!data || data.items.length === 0 ? (
        <Card><Empty text="Noch keine Ankäufe erfasst" /></Card>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="py-2">Fahrzeug</th><th>Verkäufer</th><th>Ankauf</th><th>Aufbereitung</th><th>Verkauf</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 font-medium">{p.brand} {p.model} <span className="text-slate-400">({p.year ?? "?"})</span></td>
                  <td>{p.seller.company ?? `${p.seller.firstName ?? ""} ${p.seller.lastName ?? ""}`.trim()}</td>
                  <td>{p.purchasePrice ? formatCHF(p.purchasePrice) : "—"}</td>
                  <td>{formatCHF(p.prepCosts)}</td>
                  <td>{p.salePrice ? formatCHF(p.salePrice) : "—"}</td>
                  <td>
                    <Select className="!min-h-9 !py-1 text-xs" value={p.status} onChange={(e) => statusMutation.mutate({ id: p.id, status: e.target.value })}>
                      {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                  </td>
                  <td><Button variant="ghost" onClick={() => openEdit(p)}>Bearbeiten</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={modalOpen} title={editing ? "Ankauf bearbeiten" : "Fahrzeug ankaufen"} onClose={() => setModalOpen(false)}>
        {saveMutation.error && <ErrorMsg error={saveMutation.error} />}
        <div className="grid grid-cols-2 gap-4">
          {!editing && (
            <Field label="Verkäufer (Kunde)">
              <Select value={form.sellerId} onChange={(e) => setForm((f) => ({ ...f, sellerId: e.target.value }))}>
                <option value="">— wählen —</option>
                {(customers?.items ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.company ?? `${c.firstName ?? ""} ${c.lastName ?? ""}`}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Marke"><Input value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} /></Field>
          <Field label="Modell"><Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jahrgang"><Input type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} /></Field>
            <Field label="KM"><Input type="number" value={form.mileage} onChange={(e) => setForm((f) => ({ ...f, mileage: e.target.value }))} /></Field>
          </div>
          <Field label="VIN"><Input value={form.vin} onChange={(e) => setForm((f) => ({ ...f, vin: e.target.value }))} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ankaufspreis CHF"><Input type="number" value={form.purchasePrice} onChange={(e) => setForm((f) => ({ ...f, purchasePrice: e.target.value }))} /></Field>
            <Field label="Aufbereitung CHF"><Input type="number" value={form.prepCosts} onChange={(e) => setForm((f) => ({ ...f, prepCosts: e.target.value }))} /></Field>
          </div>
        </div>
        <div className="mt-4">
          <Field label="Bewertung / Zustand (Bewertungsbogen-Freitext)"><Textarea rows={3} value={form.evaluationNotes} onChange={(e) => setForm((f) => ({ ...f, evaluationNotes: e.target.value }))} placeholder="Reifen, Bremsen, Karosserie, Servicehistorie…" /></Field>
        </div>
        <div className="flex gap-3 mt-6">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || (!editing && !form.sellerId) || !form.brand}>
            {saveMutation.isPending ? "Speichert…" : "Speichern"}
          </Button>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Abbrechen</Button>
        </div>
      </Modal>
    </div>
  );
}
