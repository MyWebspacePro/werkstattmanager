import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiDownload } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { confirmOverride } from "../lib/override.js";
import { Badge, Button, Card, Empty, ErrorMsg, Field, Input, Modal, Select, formatCHF, formatDate } from "../components/ui.js";

interface Invoice {
  id: string; number: string; type: string; status: string; date: string; dueDate: string;
  totalNet: string; totalVat: string; total: string; paidTotal: string; reminderLevel: number;
  customer: { firstName?: string | null; lastName?: string | null; company?: string | null; email?: string | null };
  vehicle?: { licensePlate: string } | null;
}

const statusLabel: Record<string, string> = {
  DRAFT: "Entwurf", SENT: "Versendet", PARTIALLY_PAID: "Teilbezahlt", PAID: "Bezahlt", OVERDUE: "Überfällig", CREDITED: "Gutgeschrieben", CANCELLED: "Annulliert",
};
const statusColor: Record<string, "slate" | "blue" | "yellow" | "green" | "red" | "purple"> = {
  DRAFT: "slate", SENT: "blue", PARTIALLY_PAID: "yellow", PAID: "green", OVERDUE: "red", CREDITED: "purple", CANCELLED: "slate",
};

export default function InvoicesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: 0, method: "TRANSFER", date: new Date().toISOString().slice(0, 10), note: "" });
  const [msg, setMsg] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["invoices", q, openOnly],
    queryFn: () => api<{ items: Invoice[]; total: number }>(`/invoices?q=${encodeURIComponent(q)}&open=${openOnly}&take=50`),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["invoices"] });

  const payMutation = useMutation({
    mutationFn: () => api(`/invoices/${detail!.id}/payments`, { method: "POST", body: JSON.stringify(payForm) }),
    onSuccess: () => { setPayOpen(false); refresh(); },
  });

  const remindMutation = useMutation({
    mutationFn: (opts?: { override?: boolean }) => api<{ fee: number; sentTo: string | null; warning?: string }>(`/invoices/${detail!.id}/remind`, { method: "POST", body: JSON.stringify({ override: opts?.override }) }),
    onSuccess: (r) => {
      setMsg(r.sentTo
        ? `${r.fee > 0 ? `Mahnung mit CHF ${r.fee.toFixed(2)} Gebühr` : "Mahnung"} erfasst und per E-Mail gesendet an ${r.sentTo}`
        : "Mahnung erfasst — kein E-Mail-Versand möglich (siehe Hinweis)");
      refresh();
    },
    onError: (err) => confirmOverride(err, () => remindMutation.mutate({ override: true })),
  });

  const sendMutation = useMutation({
    mutationFn: () => api<{ sentTo: string }>(`/invoices/${detail!.id}/send`, { method: "POST", body: "{}" }),
    onSuccess: (r) => { setMsg(`Rechnung per E-Mail gesendet an ${r.sentTo}`); refresh(); },
  });

  // Kreditnota: Originalrechnung laden, Positionen 1:1 als Gutschrift (Backend negiert), Original auf CREDITED
  const creditMutation = useMutation({
    mutationFn: async (inv: Invoice) => {
      const full = await api<{ lines: { type: string; description: string; qty: string; unit: string; unitPrice: string; vatRate: string }[]; customerId: string }>(`/invoices/${inv.id}`);
      const credit = await api<{ number: string }>(`/invoices`, {
        method: "POST",
        body: JSON.stringify({
          type: "CREDIT_NOTE",
          customerId: full.customerId,
          notes: `Kreditnota zu ${inv.number}`,
          lines: full.lines.map((l) => ({ type: l.type, description: l.description, qty: Number(l.qty), unit: l.unit, unitPrice: Number(l.unitPrice), vatRate: Number(l.vatRate) })),
        }),
      });
      await api(`/invoices/${inv.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "CREDITED" }) });
      return credit;
    },
    onSuccess: (credit) => { setMsg(`Kreditnota ${credit.number} erstellt — Original ist gutgeschrieben`); refresh(); },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api(`/invoices/${detail!.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) }),
    onSuccess: () => { setMsg("Rechnung annulliert"); refresh(); },
  });

  const openAmount = detail ? Number(detail.total) - Number(detail.paidTotal) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rechnungen</h1>
        {user?.role === "ADMIN" && (
          <Button variant="secondary" onClick={() => apiDownload("/invoices/export", "buchhaltung_export.csv")}>📥 Buchhaltungs-Export</Button>
        )}
      </div>
      <div className="flex gap-3 items-center">
        <Input placeholder="Nummer oder Kunde…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="w-5 h-5" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> nur offene
        </label>
      </div>
      {msg && <div className="bg-green-50 text-green-700 rounded-lg px-4 py-2">{msg}</div>}

      {error && <ErrorMsg error={error} />}
      {isLoading ? <div className="text-slate-500">Lädt…</div> : !data || data.items.length === 0 ? (
        <Card><Empty text="Noch keine Rechnungen — Rechnungen entstehen aus Aufträgen" /></Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="py-2">Nummer</th><th>Datum</th><th>Kunde</th><th>Total</th><th>Offen</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer" onClick={() => { setDetail(inv); setMsg(""); }}>
                  <td className="py-2 font-mono">{inv.number}</td>
                  <td>{formatDate(inv.date)}</td>
                  <td>{inv.customer.company || `${inv.customer.firstName ?? ""} ${inv.customer.lastName ?? ""}`.trim()}</td>
                  <td>{formatCHF(inv.total)}</td>
                  <td className={Number(inv.total) - Number(inv.paidTotal) > 0 ? "text-red-600 font-medium" : "text-slate-400"}>{formatCHF(Number(inv.total) - Number(inv.paidTotal))}</td>
                  <td><Badge color={statusColor[inv.status] ?? "slate"}>{statusLabel[inv.status] ?? inv.status}{inv.reminderLevel ? ` (M${inv.reminderLevel})` : ""}</Badge></td>
                  <td className="text-right text-slate-400">›</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}

      <Modal open={!!detail} title={detail ? `Rechnung ${detail.number}` : ""} onClose={() => setDetail(null)}>
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-slate-500">Kunde:</span> {detail.customer.company || `${detail.customer.firstName ?? ""} ${detail.customer.lastName ?? ""}`.trim()}</div>
              <div className="text-right"><Badge color={statusColor[detail.status] ?? "slate"}>{statusLabel[detail.status]}</Badge></div>
              <div><span className="text-slate-500">Datum:</span> {formatDate(detail.date)} · <span className="text-slate-500">Fällig:</span> {formatDate(detail.dueDate)}</div>
              {detail.vehicle && <div><span className="text-slate-500">Kontrollschild:</span> {detail.vehicle.licensePlate}</div>}
              <div className="font-semibold">Total: {formatCHF(detail.total)}</div>
              <div className="font-semibold">Offen: <span className={openAmount > 0 ? "text-red-600" : "text-green-600"}>{formatCHF(openAmount)}</span></div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => apiDownload(`/invoices/${detail.id}/pdf`, `${detail.number}.pdf`)}>📄 PDF / Drucken</Button>
              <Button variant="secondary" onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
                {sendMutation.isPending ? "Sendet…" : "✉️ Per E-Mail senden"}
              </Button>
              <Button variant="secondary" onClick={() => { setPayForm((f) => ({ ...f, amount: openAmount })); setPayOpen(true); }}>💰 Zahlung erfassen</Button>
              <Button variant="secondary" onClick={() => remindMutation.mutate()} disabled={["PAID", "CANCELLED", "CREDITED"].includes(detail.status) || (detail.reminderLevel >= 3 && user?.role !== "ADMIN")}>
                🔔 Mahnung ({Math.min(detail.reminderLevel + 1, 3)}.)
              </Button>
              {detail.reminderLevel > 0 && (
                <Button variant="secondary" onClick={() => apiDownload(`/invoices/${detail.id}/reminder-pdf`, `Mahnung-${detail.number}.pdf`)}>🔔 Mahn-PDF</Button>
              )}
              {!["CREDITED", "CANCELLED"].includes(detail.status) && (
                <Button variant="secondary" onClick={() => { if (window.confirm(`Kreditnota über den vollen Betrag von ${detail.number} erstellen?`)) creditMutation.mutate(detail); }} disabled={creditMutation.isPending}>
                  {creditMutation.isPending ? "Erstellt…" : "↩️ Kreditnota"}
                </Button>
              )}
              {detail.status === "DRAFT" && (
                <Button variant="danger" onClick={() => { if (window.confirm(`${detail.number} annullieren?`)) cancelMutation.mutate(); }}>Storno</Button>
              )}
            </div>
            <ErrorMsg error={sendMutation.error ?? remindMutation.error ?? creditMutation.error ?? cancelMutation.error} />
            {remindMutation.data?.warning && <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2">{remindMutation.data.warning}</p>}
            {detail.customer.email ? (
              <p className="text-xs text-slate-400">E-Mail des Kunden: {detail.customer.email}</p>
            ) : (
              <p className="text-xs text-red-500">Kunde hat keine E-Mail — Mahn-/Rechnungs-PDF drucken und posten.</p>
            )}
          </div>
        )}
      </Modal>

      <Modal open={payOpen} title="Zahlung erfassen" onClose={() => setPayOpen(false)}>
        {payMutation.error && <ErrorMsg error={payMutation.error} />}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Betrag CHF"><Input type="number" step="0.05" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: Number(e.target.value) }))} /></Field>
          <Field label="Methode">
            <Select value={payForm.method} onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}>
              <option value="QR_INVOICE">QR-Rechnung / Überweisung</option>
              <option value="CASH">Bargeld</option>
              <option value="CARD">Karte</option>
              <option value="TWINT">Twint</option>
              <option value="TRANSFER">Überweisung</option>
              <option value="OTHER">Anderes</option>
            </Select>
          </Field>
          <Field label="Datum"><Input type="date" value={payForm.date} onChange={(e) => setPayForm((f) => ({ ...f, date: e.target.value }))} /></Field>
          <Field label="Bemerkung"><Input value={payForm.note} onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))} /></Field>
        </div>
        <div className="flex gap-3 mt-6">
          <Button onClick={() => payMutation.mutate()} disabled={payMutation.isPending || payForm.amount <= 0}>Zahlung buchen</Button>
          <Button variant="secondary" onClick={() => setPayOpen(false)}>Abbrechen</Button>
        </div>
      </Modal>
    </div>
  );
}
