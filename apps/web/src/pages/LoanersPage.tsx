import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Badge, Button, Card, Empty, ErrorMsg, Field, Input, Modal, Select, formatCHF, formatDate } from "../components/ui.js";

interface Loaner {
  id: string; plate: string; brand: string; model: string; status: string; dailyRate: string; odometer: number;
  loans: { id: string; dueAt: string; customer: { firstName?: string | null; lastName?: string | null; company?: string | null } }[];
}
interface CustomerOption { id: string; firstName?: string | null; lastName?: string | null; company?: string | null }
interface OpenOrder { id: string; number: string; customerId: string; status: string }

const statusColor: Record<string, "green" | "yellow" | "red" | "slate"> = {
  AVAILABLE: "green", LOANED: "yellow", MAINTENANCE: "red", RETIRED: "slate",
};
const statusLabel: Record<string, string> = {
  AVAILABLE: "Verfügbar", LOANED: "Verliehen", MAINTENANCE: "In Werkstatt", RETIRED: "Ausgemustert",
};

export default function LoanersPage() {
  const qc = useQueryClient();
  const [loanerModal, setLoanerModal] = useState(false);
  const [loanModal, setLoanModal] = useState(false);
  const [selectedLoaner, setSelectedLoaner] = useState<Loaner | null>(null);
  const [returnLoanId, setReturnLoanId] = useState<string | null>(null);
  const [returnOdo, setReturnOdo] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [loanerForm, setLoanerForm] = useState({ plate: "", vin: "", brand: "", model: "", dailyRate: 40 });
  const [loanForm, setLoanForm] = useState({ customerId: "", orderId: "", dueAt: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) });

  const { data: loaners, error } = useQuery({ queryKey: ["loaners"], queryFn: () => api<Loaner[]>("/loaners") });
  const { data: customers } = useQuery({ queryKey: ["customers-all"], queryFn: () => api<{ items: CustomerOption[] }>("/customers?take=100") });
  const { data: openOrders } = useQuery({ queryKey: ["workorders-open"], queryFn: () => api<{ items: OpenOrder[] }>("/workorders?open=true&take=100"), enabled: loanModal });

  const addMutation = useMutation({
    mutationFn: () => api("/loaners", { method: "POST", body: JSON.stringify(loanerForm) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["loaners"] }); setLoanerModal(false); },
  });
  const loanMutation = useMutation({
    mutationFn: () => api<{ lineWarning?: string }>("/loans", { method: "POST", body: JSON.stringify({ loanerId: selectedLoaner!.id, customerId: loanForm.customerId, orderId: loanForm.orderId || undefined, dueAt: new Date(loanForm.dueAt).toISOString() }) }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["loaners"] }); qc.invalidateQueries({ queryKey: ["workorders"] });
      setLoanModal(false);
      setMsg(r.lineWarning ?? null);
    },
  });
  const returnMutation = useMutation({
    mutationFn: (payload: { loanId: string; endOdo: number }) => api(`/loans/${payload.loanId}/return`, { method: "POST", body: JSON.stringify({ endOdo: payload.endOdo }) }),
    onSuccess: () => { setReturnLoanId(null); qc.invalidateQueries({ queryKey: ["loaners"] }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Leihwagen</h1>
        <Button onClick={() => setLoanerModal(true)}>+ Leihwagen</Button>
      </div>
      {error && <ErrorMsg error={error} />}
      {msg && <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-4 py-2 text-sm">{msg}</div>}

      {!loaners || loaners.length === 0 ? (
        <Card><Empty text="Keine Leihwagen in der Flotte" /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loaners.map((l) => {
            const openLoan = l.loans[0];
            return (
              <Card key={l.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold">{l.plate}</div>
                    <div className="text-sm text-slate-500">{l.brand} {l.model} · {formatCHF(l.dailyRate)}/Tag · {l.odometer} km</div>
                  </div>
                  <Badge color={statusColor[l.status] ?? "slate"}>{statusLabel[l.status] ?? l.status}</Badge>
                </div>
                {openLoan ? (
                  <div className="mt-3 text-sm bg-yellow-50 rounded-lg p-2">
                    Verliehen an <strong>{openLoan.customer.company || `${openLoan.customer.firstName ?? ""} ${openLoan.customer.lastName ?? ""}`.trim()}</strong> · fällig {formatDate(openLoan.dueAt)}
                  </div>
                ) : null}
                <div className="flex gap-2 mt-3">
                  {l.status === "AVAILABLE" && (
                    <Button onClick={() => { setSelectedLoaner(l); setLoanForm((f) => ({ ...f, customerId: customers?.items[0]?.id ?? "" })); setLoanModal(true); }}>Herausgeben</Button>
                  )}
                  {openLoan && (
                    <Button variant="secondary" onClick={() => { setReturnLoanId(openLoan.id); setReturnOdo(l.odometer); }}>Rückgabe</Button>
                  )}
                </div>
                {returnLoanId === openLoan?.id && (
                  <div className="mt-3 border-t pt-3">
                    <Field label="KM bei Rückgabe"><Input type="number" value={returnOdo} onChange={(e) => setReturnOdo(Number(e.target.value))} /></Field>
                    <Button className="mt-2" onClick={() => returnMutation.mutate({ loanId: returnLoanId, endOdo: returnOdo })} disabled={returnMutation.isPending}>Rückgabe buchen</Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={loanerModal} title="Leihwagen aufnehmen" onClose={() => setLoanerModal(false)}>
        {addMutation.error && <ErrorMsg error={addMutation.error} />}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Kontrollschild"><Input value={loanerForm.plate} onChange={(e) => setLoanerForm((f) => ({ ...f, plate: e.target.value }))} /></Field>
          <Field label="VIN"><Input value={loanerForm.vin} onChange={(e) => setLoanerForm((f) => ({ ...f, vin: e.target.value }))} placeholder="17-stellig" maxLength={32} className="font-mono text-xs" /></Field>
          <Field label="Marke"><Input value={loanerForm.brand} onChange={(e) => setLoanerForm((f) => ({ ...f, brand: e.target.value }))} /></Field>
          <Field label="Modell"><Input value={loanerForm.model} onChange={(e) => setLoanerForm((f) => ({ ...f, model: e.target.value }))} /></Field>
          <Field label="Tagespauschale CHF"><Input type="number" value={loanerForm.dailyRate} onChange={(e) => setLoanerForm((f) => ({ ...f, dailyRate: Number(e.target.value) }))} /></Field>
        </div>
        <div className="flex gap-3 mt-6">
          <Button onClick={() => addMutation.mutate()} disabled={!loanerForm.plate || addMutation.isPending}>Aufnehmen</Button>
          <Button variant="secondary" onClick={() => setLoanerModal(false)}>Abbrechen</Button>
        </div>
      </Modal>

      <Modal open={loanModal} title={`${selectedLoaner?.plate} herausgeben`} onClose={() => setLoanModal(false)}>
        {loanMutation.error && <ErrorMsg error={loanMutation.error} />}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Kunde">
            <select className="w-full px-3 min-h-11 border border-slate-300 rounded-lg" value={loanForm.customerId} onChange={(e) => setLoanForm((f) => ({ ...f, customerId: e.target.value }))}>
              <option value="">— wählen —</option>
              {(customers?.items ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.company || `${c.firstName ?? ""} ${c.lastName ?? ""}`}</option>
              ))}
            </select>
          </Field>
          <Field label="Rückgabe erwartet"><Input type="date" value={loanForm.dueAt} onChange={(e) => setLoanForm((f) => ({ ...f, dueAt: e.target.value }))} /></Field>
          <Field label="Auftrag verknüpfen (Tagespauschale landet auf der Rechnung)">
            <Select value={loanForm.orderId} onChange={(e) => setLoanForm((f) => ({ ...f, orderId: e.target.value }))}>
              <option value="">— kein Auftrag —</option>
              {(openOrders?.items ?? []).filter((o) => o.customerId === loanForm.customerId).map((o) => (
                <option key={o.id} value={o.id}>{o.number}</option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="text-xs text-slate-400">Bei Rückgabe wird die Pauschale automatisch auf die tatsächlichen Tage angepasst.</p>
        <div className="flex gap-3 mt-6">
          <Button onClick={() => loanMutation.mutate()} disabled={!loanForm.customerId || loanMutation.isPending}>Herausgeben</Button>
          <Button variant="secondary" onClick={() => setLoanModal(false)}>Abbrechen</Button>
        </div>
      </Modal>
    </div>
  );
}
