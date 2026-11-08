import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Badge, Button, Card, Empty, ErrorMsg, Field, Input, Modal, Select, formatCHF, formatDate } from "../components/ui.js";

interface TyreSet {
  id: string; slotCode: string; season: "SUMMER" | "WINTER" | "ALLSEASON"; inches?: number | null;
  storedAt: string; seasonFee: string; notes?: string | null;
  customer: { firstName?: string | null; lastName?: string | null; company?: string | null; phone?: string | null };
  vehicle?: { licensePlate: string } | null;
}
interface ReminderRow { customerId: string; name: string; email?: string | null; marketingAllowed: boolean; slots: string[]; count: number }
interface VehicleOption { id: string; licensePlate: string; brand: string; model: string; customerId: string }
interface CustomerOption { id: string; firstName?: string | null; lastName?: string | null; company?: string | null; vehicles: { id: string }[] }

export default function TyreHotelPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ customerId: "", vehicleId: "", slotCode: "", season: "WINTER", inches: 17, seasonFee: 60, notes: "" });

  const { data, error } = useQuery({ queryKey: ["tyres"], queryFn: () => api<{ items: TyreSet[] }>("/tyres") });
  const { data: reminders } = useQuery({ queryKey: ["tyre-reminders"], queryFn: () => api<ReminderRow[]>("/tyres/reminders") });
  const { data: vehicles } = useQuery({ queryKey: ["vehicles-all"], queryFn: () => api<{ items: VehicleOption[] }>("/vehicles?take=100") });
  const { data: customers } = useQuery({ queryKey: ["customers-all"], queryFn: () => api<{ items: CustomerOption[] }>("/customers?take=100") });

  const saveMutation = useMutation({
    mutationFn: () => api("/tyres", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tyres"] }); qc.invalidateQueries({ queryKey: ["tyre-reminders"] }); setModalOpen(false); },
  });
  const retrieveMutation = useMutation({
    mutationFn: (id: string) => api(`/tyres/${id}/retrieve`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tyres"] }); qc.invalidateQueries({ queryKey: ["tyre-reminders"] }); },
  });

  const seasonLabel = { SUMMER: "Sommer", WINTER: "Winter", ALLSEASON: "Allseason" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reifenhotel</h1>
        <Button onClick={() => setModalOpen(true)}>+ Einlagerung</Button>
      </div>
      {error && <ErrorMsg error={error} />}

      <Card title={`Eingelagert (${data?.items.length ?? 0} Sätze)`}>
        {!data || data.items.length === 0 ? (
          <Empty text="Keine Räder eingelagert" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="py-2">Platz</th><th>Kunde</th><th>Kontrollschild</th><th>Saison</th><th>Zoll</th><th>seit</th><th>Gebühr/Saison</th><th></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((t) => (
                <tr key={t.id} className="border-b border-slate-50">
                  <td className="py-2 font-mono font-semibold">{t.slotCode}</td>
                  <td>{t.customer.company || `${t.customer.firstName ?? ""} ${t.customer.lastName ?? ""}`.trim()}</td>
                  <td>{t.vehicle?.licensePlate ?? "—"}</td>
                  <td><Badge color={t.season === "WINTER" ? "blue" : t.season === "SUMMER" ? "yellow" : "slate"}>{seasonLabel[t.season]}</Badge></td>
                  <td>{t.inches ?? "—"}</td>
                  <td>{formatDate(t.storedAt)}</td>
                  <td>{formatCHF(t.seasonFee)}</td>
                  <td><Button variant="ghost" onClick={() => retrieveMutation.mutate(t.id)}>Auslagern</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Saison-Erinnerungen (Kunden mit eingelagerten Sätzen)">
        {!reminders || reminders.length === 0 ? (
          <Empty text="Niemand eingelagert" />
        ) : (
          <ul className="text-sm space-y-2">
            {reminders.map((r) => (
              <li key={r.customerId} className="flex items-center justify-between border-b border-slate-50 py-2">
                <span>
                  <span className="font-medium">{r.name}</span>
                  <span className="text-slate-500"> · Plätze {r.slots.join(", ")} · {r.email ?? "keine E-Mail"}</span>
                </span>
                <Badge color={r.marketingAllowed ? "green" : "slate"}>{r.marketingAllowed ? "Einwilligung ✓" : "kein Marketing-Opt-in"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={modalOpen} title="Reifen einlagern" onClose={() => setModalOpen(false)}>
        {saveMutation.error && <ErrorMsg error={saveMutation.error} />}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Kunde / Fahrzeug">
            <Select value={form.vehicleId} onChange={(e) => {
              const v = vehicles?.items.find((x) => x.id === e.target.value);
              setForm((f) => ({ ...f, vehicleId: e.target.value, customerId: v?.customerId ?? f.customerId }));
            }}>
              <option value="">— wählen —</option>
              {(vehicles?.items ?? []).map((v) => <option key={v.id} value={v.id}>{v.licensePlate} — {v.brand} {v.model}</option>)}
            </Select>
          </Field>
          <Field label="Lagerplatz"><Input value={form.slotCode} onChange={(e) => setForm((f) => ({ ...f, slotCode: e.target.value }))} placeholder="z.B. R1-04" /></Field>
          <Field label="Saison">
            <Select value={form.season} onChange={(e) => setForm((f) => ({ ...f, season: e.target.value }))}>
              <option value="WINTER">Winter</option><option value="SUMMER">Sommer</option><option value="ALLSEASON">Allseason</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Zoll"><Input type="number" value={form.inches} onChange={(e) => setForm((f) => ({ ...f, inches: Number(e.target.value) }))} /></Field>
            <Field label="Gebühr CHF/Saison"><Input type="number" step="5" value={form.seasonFee} onChange={(e) => setForm((f) => ({ ...f, seasonFee: Number(e.target.value) }))} /></Field>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button onClick={() => saveMutation.mutate()} disabled={!form.vehicleId || !form.slotCode || saveMutation.isPending}>Einlagern</Button>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Abbrechen</Button>
        </div>
      </Modal>
    </div>
  );
}
