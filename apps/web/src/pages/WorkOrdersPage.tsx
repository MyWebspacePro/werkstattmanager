import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiDownload } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { Badge, Button, Card, Empty, ErrorMsg, Field, Input, Modal, Select, Textarea, formatCHF } from "../components/ui.js";
import { SKILL_LABELS, SKILL_SHORT } from "../lib/skills.js";
import { Combobox } from "../components/Combobox.js";
import { customerLabel } from "../components/AppointmentModal.js";
import { confirmOverride } from "../lib/override.js";

interface Line { type: "LABOR" | "PART" | "EXTERNAL" | "FLAT"; description: string; qty: number; unit: string; unitPrice: number; vatRate: number; partId?: string }
interface WorkOrder {
  id: string; number: string; status: string; customerId: string; vehicleId: string; laborRate: string;
  reportedIssues?: string | null; internalNotes?: string | null; plannedNet: string; actualNet: string;
  quote?: { id: string; number: string } | null;
  resourceId?: string | null; requiredSkill?: number;
  resource?: { id: string; name: string; jobTitle?: string | null } | null;
  lines: { id: string; type: string; description: string; qty: string; unit: string; unitPrice: string; vatRate: string; partId?: string | null }[];
  customer: { firstName?: string | null; lastName?: string | null; company?: string | null; phone?: string | null };
  vehicle: { licensePlate: string; brand: string; model: string };
  invoices: { id: string; number: string; status: string }[];
  timeEntries?: TimeEntryView[];
  assignments?: { id: string; plannedMinutes?: number | null; note?: string | null; resource: { id: string; name: string; jobTitle?: string | null; skillLevel: number } }[];
}
interface Customer { id: string; firstName?: string | null; lastName?: string | null; company?: string | null; vehicles: { id: string; licensePlate: string; brand: string; model: string }[] }

const statuses = ["OPEN", "PARTS_ORDERED", "IN_PROGRESS", "READY", "INVOICED", "PAID"] as const;
const statusLabel: Record<string, string> = {
  OPEN: "Offen", PARTS_ORDERED: "Teile bestellt", IN_PROGRESS: "In Arbeit", READY: "Fertig", INVOICED: "Fakturiert", PAID: "Bezahlt",
};
const statusColor: Record<string, "blue" | "yellow" | "purple" | "green" | "slate"> = {
  OPEN: "blue", PARTS_ORDERED: "yellow", IN_PROGRESS: "purple", READY: "green", INVOICED: "slate", PAID: "green",
};

const emptyOrder = { customerId: "", vehicleId: "", resourceId: "", requiredSkill: 1, appointmentId: "", reportedIssues: "", internalNotes: "" };

interface OpenAppointment {
  id: string; start: string; reason?: string | null; requiredSkill: number;
  customer?: { firstName?: string | null; lastName?: string | null; company?: string | null } | null;
  vehicle?: { licensePlate: string; brand: string; model: string } | null;
}
interface TimeEntryView { id: string; minutes: number; note?: string | null; startedAt: string; user: { id: string; name: string } }

export default function WorkOrdersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [openOnly, setOpenOnly] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selected, setSelected] = useState<WorkOrder | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [form, setForm] = useState(emptyOrder);
  const [lines, setLines] = useState<Line[]>([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["workorders", q, openOnly],
    queryFn: () => api<{ items: WorkOrder[]; total: number }>(`/workorders?q=${encodeURIComponent(q)}&open=${openOnly}&take=50`),
  });
  const { data: customers } = useQuery({ queryKey: ["customers-all"], queryFn: () => api<{ items: Customer[] }>("/customers?take=100") });
  const { data: parts } = useQuery({ queryKey: ["parts-all"], queryFn: () => api<{ items: { id: string; number: string; name: string; stock: number; salePrice: string }[] }>("/parts?take=500") });
  const { data: resources } = useQuery({ queryKey: ["resources"], queryFn: () => api<{ id: string; name: string; type: string; jobTitle?: string | null; skillLevel: number }[]>("/resources") });
  const { user } = useAuth();
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 21 * 86400000).toISOString();
  const { data: openAppts } = useQuery({ queryKey: ["appointments-open"], queryFn: () => api<OpenAppointment[]>(`/appointments?open=1&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`), enabled: editorOpen && !selected });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: () => api<{ id: string; name: string }[]>("/users"), enabled: editorOpen && user?.role === "ADMIN" });
  const [pageError, setPageError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["workorders"] });

  const openNew = () => {
    setSelected(null);
    setForm(emptyOrder);
    setLines([{ type: "LABOR", description: "", qty: 1, unit: "h", unitPrice: 145, vatRate: 8.1 }]);
    setEditorOpen(true);
  };

  const openDetail = async (id: string) => {
    try {
      const wo = await api<WorkOrder>(`/workorders/${id}`);
      setSelected(wo);
      setForm({ ...emptyOrder, customerId: wo.customerId, vehicleId: wo.vehicleId, resourceId: wo.resourceId ?? "", requiredSkill: wo.requiredSkill ?? 1, reportedIssues: wo.reportedIssues ?? "", internalNotes: wo.internalNotes ?? "" });
      setLines(wo.lines.map((l) => ({ type: l.type as Line["type"], description: l.description, qty: Number(l.qty), unit: l.unit, unitPrice: Number(l.unitPrice), vatRate: Number(l.vatRate), partId: l.partId ?? undefined })));
      setSaved(false);
      setPageError(null);
      setEditorOpen(true);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Auftrag konnte nicht geladen werden");
    }
  };

  const saveMutation = useMutation({
    mutationFn: (opts?: { override?: boolean }) => {
      // Leere FK-Felder sauber abschliessen («» würde FK-Verletzungen werfen)
      const { appointmentId, ...formRest } = form;
      const body: Record<string, unknown> = { ...formRest, lines };
      if (!body.resourceId) body.resourceId = null;
      if (!selected && appointmentId) body.appointmentId = appointmentId;
      if (opts?.override) body.override = true;
      return selected
        ? api(`/workorders/${selected.id}`, { method: "PUT", body: JSON.stringify(body) })
        : api("/workorders", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err) => confirmOverride(err, () => saveMutation.mutate({ override: true })),
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { id: string; status: string; override?: boolean }) => api(`/workorders/${payload.id}/status`, { method: "PATCH", body: JSON.stringify({ status: payload.status, override: payload.override }) }),
    onSuccess: refresh,
    onError: (err, vars) => confirmOverride(err, () => statusMutation.mutate({ ...vars, override: true })),
  });

  const assignMutation = useMutation({
    mutationFn: (body: { resourceId: string; plannedMinutes?: number; note?: string; override?: boolean }) =>
      api(`/workorders/${selected!.id}/assignments`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { setAssignForm({ resourceId: "", plannedMinutes: 30, note: "" }); if (selected) openDetail(selected.id); },
    onError: (err, vars) => confirmOverride(err, () => assignMutation.mutate({ ...vars, override: true })),
  });
  const assignDeleteMutation = useMutation({
    mutationFn: (assignmentId: string) => api(`/workorders/${selected!.id}/assignments/${assignmentId}`, { method: "DELETE" }),
    onSuccess: () => { if (selected) openDetail(selected.id); },
  });
  const [assignForm, setAssignForm] = useState({ resourceId: "", plannedMinutes: 30, note: "" });
  const [bypassSkill, setBypassSkill] = useState(false);
  const skillOpen = user?.role === "ADMIN" && bypassSkill;
  const skillFilter = (r: { type: string; skillLevel: number }) => r.type === "MECHANIC" && (skillOpen || r.skillLevel >= form.requiredSkill);

  const timeMutation = useMutation({
    mutationFn: (body: { minutes: number; note: string; userId?: string; override?: boolean }) =>
      api(`/workorders/${selected!.id}/time`, { method: "POST", body: JSON.stringify({ ...body, userId: body.userId || undefined }) }),
    onSuccess: () => { setTimeForm({ minutes: 30, note: "", userId: "" }); if (selected) openDetail(selected.id); },
    onError: (err, vars) => confirmOverride(err, () => timeMutation.mutate({ ...vars, override: true })),
  });
  const timeDeleteMutation = useMutation({
    mutationFn: (entryId: string) => api(`/workorders/${selected!.id}/time/${entryId}`, { method: "DELETE" }),
    onSuccess: () => { if (selected) openDetail(selected.id); },
  });
  const [timeForm, setTimeForm] = useState({ minutes: 30, note: "", userId: "" });

  const invoiceMutation = useMutation({
    mutationFn: () => api<{ id: string; number: string }>("/invoices", { method: "POST", body: JSON.stringify({ customerId: form.customerId, vehicleId: form.vehicleId, orderId: selected!.id }) }),
    onSuccess: (inv) => {
      refresh();
      setSaved(false);
      setPageError(null);
      openDetailAfterInvoice(inv.number);
    },
  });

  const openDetailAfterInvoice = async (number: string) => {
    setPageError(null);
    setMsg(`Rechnung ${number} erstellt`);
    if (selected) await openDetail(selected.id);
  };
  const [msg, setMsg] = useState("");

  const quoteMutation = useMutation({
    mutationFn: () => api("/quotes", { method: "POST", body: JSON.stringify({ customerId: form.customerId, vehicleId: form.vehicleId, notes: form.reportedIssues, lines }) }),
    onSuccess: () => { setQuoteOpen(false); refresh(); },
  });

  const printOrderSheet = () => {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w || !selected) return;
    const cust = selected.customer.company || `${selected.customer.firstName ?? ""} ${selected.customer.lastName ?? ""}`.trim();
    const rows = lines.map((l, i) => `<tr><td>${i + 1}</td><td>${l.description}</td><td>${l.qty} ${l.unit}</td><td>${l.type === "LABOR" ? "Arbeit" : l.type === "PART" ? "Teil" : l.type === "EXTERNAL" ? "Fremd" : "Pausch."}</td></tr>`).join("");
    w.document.write(`<!doctype html><html><head><title>Auftrag ${selected.number}</title>
      <style>body{font-family:-apple-system,Arial,sans-serif;padding:40px;color:#111}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border:1px solid #999;padding:8px;text-align:left}.meta{margin-top:8px;color:#333}</style></head><body>
      <h1>Auftrag ${selected.number}</h1>
      <div class="meta"><strong>${cust}</strong> · ${selected.vehicle.licensePlate} · ${selected.vehicle.brand} ${selected.vehicle.model}</div>
      <div class="meta">Zugewiesen: <strong>${form.resourceId ? (resources?.find((r) => r.id === form.resourceId)?.name ?? "—") : "offen"}</strong> · Qualifikation: ${SKILL_SHORT[form.requiredSkill] ?? "—"}</div>
      ${(selected?.assignments ?? []).length ? `<div class="meta">Einsatzplan: ${(selected?.assignments ?? []).map((a) => `${a.resource.name}${a.plannedMinutes ? ` (${a.plannedMinutes} min)` : ""}${a.note ? ` — ${a.note}` : ""}`).join(" · ")}</div>` : ""}
      ${selected.reportedIssues ? `<div class="meta"><em>Kundenauftrag:</em> ${selected.reportedIssues}</div>` : ""}
      <table><tr><th>Pos</th><th>Beschreibung</th><th>Menge</th><th>Art</th></tr>${rows}</table>
      <div class="meta" style="margin-top:24px">Erledigt: ☐ &nbsp; Kontrollschild: ☐ &nbsp; Abholung: ☐ &nbsp; Unterschrift Kunde: ____________</div>
      </body></html>`);
    w.document.close();
    w.print();
  };

  const netTotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Aufträge</h1>
        <Button onClick={openNew}>+ Neuer Auftrag</Button>
      </div>
      <div className="flex gap-3 items-center">
        <Input placeholder="Nummer, Kunde, Kontrollschild…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="w-5 h-5" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> nur offene
        </label>
      </div>

      {error && <ErrorMsg error={error} />}
      {isLoading ? <div className="text-slate-500">Lädt…</div> : !data || data.items.length === 0 ? (
        <Card><Empty text="Keine Aufträge" /></Card>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="py-2">Nummer</th><th>Kunde</th><th>Kontrollschild</th><th>Netto</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((wo) => (
                <tr key={wo.id} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(wo.id)}>
                  <td className="py-2 font-mono">{wo.number}</td>
                  <td>{wo.customer.company || `${wo.customer.firstName ?? ""} ${wo.customer.lastName ?? ""}`.trim()}</td>
                  <td>{wo.vehicle.licensePlate}</td>
                  <td>{formatCHF(wo.actualNet)}</td>
                  <td><Badge color={statusColor[wo.status] ?? "slate"}>{statusLabel[wo.status] ?? wo.status}</Badge></td>
                  <td className="text-right text-slate-400">›</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {pageError && <ErrorMsg error={pageError} />}
      <Modal open={editorOpen} title={selected ? `Auftrag ${selected.number}` : "Neuer Auftrag"} onClose={() => setEditorOpen(false)}>
        {saveMutation.error && <ErrorMsg error={saveMutation.error} />}
        {invoiceMutation.error && <ErrorMsg error={invoiceMutation.error} />}
        {statusMutation.error && <ErrorMsg error={statusMutation.error} />}
        {msg && <div className="bg-green-50 text-green-700 rounded-lg px-4 py-2 mb-3">{msg}</div>}
        {saved && <div className="bg-green-50 text-green-700 rounded-lg px-4 py-2 mb-3">Gespeichert ✓</div>}
        {!selected && (openAppts?.length ?? 0) > 0 && (
          <Field label="Von Termin übernehmen (nächste 3 Wochen)">
            <Select value="" onChange={(e) => {
              const a = openAppts?.find((x) => x.id === e.target.value);
              if (!a) return;
              setForm((f) => ({
                ...f, appointmentId: a.id,
                customerId: (a.customer ? "" : f.customerId) || f.customerId,
                vehicleId: a.vehicle?.licensePlate ? "" : f.vehicleId,
                reportedIssues: a.reason ?? f.reportedIssues,
                requiredSkill: Math.max(1, a.requiredSkill || 1),
              }));
              // Kunde/Fahrzeug aus dem Termin-Objekt bestimmen (via Fahrzeugliste matchen)
              if (a.vehicle) {
                const match = (customers?.items ?? []).find((c) => c.vehicles.some((v) => v.licensePlate === a.vehicle!.licensePlate));
                const veh = match?.vehicles.find((v) => v.licensePlate === a.vehicle!.licensePlate);
                if (match && veh) setForm((f) => ({ ...f, customerId: match.id, vehicleId: veh.id }));
              }
            }}>
              <option value="">— leerer Auftrag —</option>
              {(openAppts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {new Date(a.start).toLocaleDateString("de-CH")} {new Date(a.start).toTimeString().slice(0, 5)} · {a.vehicle?.licensePlate ?? "?"} · {a.reason ?? "Termin"}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {selected && ["INVOICED", "PAID", "CANCELLED"].includes(selected.status) && (
          <div className="bg-slate-100 text-slate-600 rounded-lg px-4 py-2 mb-3 text-sm">
            🔒 Dieser Auftrag ist {selected.status === "INVOICED" ? "fakturiert" : selected.status === "PAID" ? "bezahlt" : "annulliert"} und gesperrt. Korrekturen nur über Kreditnota (Rechnungen).
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Kunde / Fahrzeug">
            <Combobox
              value={form.vehicleId}
              onChange={(id) => {
                for (const c of customers?.items ?? []) {
                  const v = c.vehicles.find((x) => x.id === id);
                  if (v) {
                    setForm((f) => ({ ...f, customerId: c.id, vehicleId: v.id }));
                    return;
                  }
                }
              }}
              placeholder="Name oder Kennzeichen …"
              options={(customers?.items ?? []).flatMap((c) =>
                c.vehicles.map((v) => ({
                  value: v.id,
                  label: `${customerLabel(c)} — ${v.brand} ${v.model}`,
                  hint: v.licensePlate,
                }))
              )}
            />
          </Field>
          <Field label="Status">
            <Select value={selected?.status ?? "OPEN"} disabled={!selected}
              onChange={(e) => selected && statusMutation.mutate({ id: selected.id, status: e.target.value })}>
              {statuses.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
            </Select>
          </Field>
          <Field label="Benötigte Qualifikation">
            <Select value={form.requiredSkill} onChange={(e) => {
              const req = Number(e.target.value);
              setForm((f) => {
                const current = resources?.find((r) => r.id === f.resourceId);
                return { ...f, requiredSkill: req, resourceId: current && current.skillLevel < req ? "" : f.resourceId };
              });
            }}>
              {[1, 2, 3].map((lvl) => <option key={lvl} value={lvl}>{SKILL_LABELS[lvl]}</option>)}
            </Select>
          </Field>
          <Field label="Zugewiesen an">
            <Select value={form.resourceId} onChange={(e) => setForm((f) => ({ ...f, resourceId: e.target.value }))}>
              <option value="">— noch offen —</option>
              {(resources ?? []).filter(skillFilter).map((r) => (
                <option key={r.id} value={r.id}>{r.name}{r.jobTitle ? ` — ${r.jobTitle}` : ""}</option>
              ))}
            </Select>
          </Field>
        </div>
        {user?.role === "ADMIN" && (
          <label className="flex items-center gap-2 text-xs text-slate-500 -mt-2 mb-2">
            <input type="checkbox" className="w-4 h-4" checked={bypassSkill} onChange={(e) => setBypassSkill(e.target.checked)} />
            Qualifikationsfilter umgehen (Chef-Entscheid — z.B. Lernender unter Aufsicht)
          </label>
        )}
        <div className="mt-4">
          <Field label="Kundenauftrag / Mängelrüge"><Textarea rows={2} value={form.reportedIssues} onChange={(e) => setForm((f) => ({ ...f, reportedIssues: e.target.value }))} placeholder="Was meldet der Kunde?" /></Field>
        </div>

        <h3 className="font-semibold mt-6 mb-2">Positionen</h3>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <Select className="col-span-2" value={l.type} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, type: e.target.value as Line["type"], unit: e.target.value === "LABOR" ? "h" : "x", partId: undefined } : x))}>
                <option value="LABOR">Arbeit</option><option value="PART">Teil</option><option value="EXTERNAL">Fremd</option><option value="FLAT">Pauschale</option>
              </Select>
              {l.type === "PART" ? (
                <Select className="col-span-4" value={l.partId ?? ""} onChange={(e) => {
                  const pid = e.target.value;
                  const part = (parts?.items ?? []).find((p) => p.id === pid);
                  setLines((ls) => ls.map((x, j) => j === i ? {
                    ...x,
                    partId: pid || undefined,
                    description: part ? `${part.name}` : x.description,
                    unitPrice: part ? Number(part.salePrice) : x.unitPrice,
                  } : x));
                }}>
                  <option value="">— Teil aus Lager wählen —</option>
                  {(parts?.items ?? []).map((p) => (
                    <option key={p.id} value={p.id}>{p.number} · {p.name} — {formatCHF(p.salePrice)} (Lager: {p.stock})</option>
                  ))}
                </Select>
              ) : (
                <Input className="col-span-4" placeholder="Beschreibung" value={l.description} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
              )}
              <Input className="col-span-1" type="number" step="0.25" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} />
              <Input className="col-span-2" type="number" step="0.05" value={l.unitPrice} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, unitPrice: Number(e.target.value) } : x))} />
              <div className="col-span-2 text-right text-sm font-medium">{formatCHF(l.qty * l.unitPrice)}</div>
              <Button variant="ghost" className="col-span-1 justify-center" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</Button>
            </div>
          ))}
        </div>
        <Button variant="secondary" className="mt-3" onClick={() => setLines((ls) => [...ls, { type: "FLAT", description: "", qty: 1, unit: "x", unitPrice: 0, vatRate: 8.1 }])}>+ Position</Button>
        <div className="text-right font-semibold mt-3">Netto: {formatCHF(netTotal)}</div>

        {selected && (
          <div className="mt-5 border-t pt-4">
            <h3 className="font-semibold mb-2">Geplante Zuweisung (wer macht was)</h3>
            <p className="text-xs text-slate-400 mb-2">Mehrere Personen möglich — z.B. Diagnostiker 20 min Fehlersuche, danach der Mechaniker für die Arbeit.</p>
            {(selected.assignments ?? []).length === 0 && <p className="text-sm text-slate-400 mb-2">Noch niemand geplant — «Zugewiesen an» oben setzt den Hauptverantwortlichen.</p>}
            <ul className="text-sm space-y-1 mb-3">
              {(selected.assignments ?? []).map((a) => (
                <li key={a.id} className="flex items-center justify-between bg-blue-50 rounded px-3 py-1.5">
                  <span>
                    <strong>{a.resource.name}</strong>{a.resource.jobTitle ? ` (${a.resource.jobTitle})` : ""}
                    {a.plannedMinutes ? ` · geplant ${Math.floor(a.plannedMinutes / 60) ? `${Math.floor(a.plannedMinutes / 60)} h ` : ""}${a.plannedMinutes % 60} min` : ""}
                    {a.note ? ` · ${a.note}` : ""}
                  </span>
                  <button type="button" className="text-red-500 hover:underline text-xs" onClick={() => assignDeleteMutation.mutate(a.id)}>entfernen</button>
                </li>
              ))}
            </ul>
            {!["INVOICED", "PAID", "CANCELLED"].includes(selected.status) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end mb-2">
                <Field label="Person">
                  <Select value={assignForm.resourceId} onChange={(e) => setAssignForm((f) => ({ ...f, resourceId: e.target.value }))}>
                    <option value="">— wählen —</option>
                    {(resources ?? []).filter(skillFilter).map((r) => (
                      <option key={r.id} value={r.id}>{r.name}{r.jobTitle ? ` — ${r.jobTitle}` : ""}{!skillOpen && r.skillLevel > form.requiredSkill ? ` [überqualifiziert]` : ""}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Geplante Minuten"><Input type="number" min={1} value={assignForm.plannedMinutes} onChange={(e) => setAssignForm((f) => ({ ...f, plannedMinutes: Number(e.target.value) }))} /></Field>
                <Field label="Wofür"><Input value={assignForm.note} onChange={(e) => setAssignForm((f) => ({ ...f, note: e.target.value }))} placeholder="z.B. Fehlersuche" /></Field>
                <Button onClick={() => assignMutation.mutate({ resourceId: assignForm.resourceId, plannedMinutes: assignForm.plannedMinutes || undefined, note: assignForm.note || undefined })} disabled={assignMutation.isPending || !assignForm.resourceId}>
                  {assignMutation.isPending ? "…" : "+ Zuweisen"}
                </Button>
              </div>
            )}
          </div>
        )}

        {selected && (
          <div className="mt-5 border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Zeiterfassung (Ist)</h3>
              <span className="text-sm text-slate-500">
                Total: {(() => { const m = (selected.timeEntries ?? []).reduce((s2, t) => s2 + t.minutes, 0); return m ? `${Math.floor(m / 60)} h ${m % 60} min` : "—"; })()}
              </span>
            </div>
            {(selected.timeEntries ?? []).length === 0 && <p className="text-sm text-slate-400 mb-2">Noch keine Zeit erfasst.</p>}
            <ul className="text-sm space-y-1 mb-3">
              {(selected.timeEntries ?? []).map((t) => (
                <li key={t.id} className="flex items-center justify-between bg-slate-50 rounded px-3 py-1.5">
                  <span><strong>{t.user.name}</strong> · {Math.floor(t.minutes / 60)} h {t.minutes % 60} min{t.note ? ` · ${t.note}` : ""}</span>
                  <button type="button" className="text-red-500 hover:underline text-xs" onClick={() => timeDeleteMutation.mutate(t.id)}>löschen</button>
                </li>
              ))}
            </ul>
            {!["INVOICED", "PAID", "CANCELLED"].includes(selected.status) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                <Field label="Minuten"><Input type="number" min={1} value={timeForm.minutes} onChange={(e) => setTimeForm((f) => ({ ...f, minutes: Number(e.target.value) }))} /></Field>
                {user?.role === "ADMIN" && (
                  <Field label="Für">
                    <Select value={timeForm.userId} onChange={(e) => setTimeForm((f) => ({ ...f, userId: e.target.value }))}>
                      <option value="">mich selbst</option>
                      {(users ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </Select>
                  </Field>
                )}
                <Field label="Notiz"><Input value={timeForm.note} onChange={(e) => setTimeForm((f) => ({ ...f, note: e.target.value }))} placeholder="z.B. Bremsen zerlegt" /></Field>
                <Button onClick={() => timeMutation.mutate({ minutes: timeForm.minutes, note: timeForm.note, userId: timeForm.userId || undefined })} disabled={timeMutation.isPending || timeForm.minutes < 1}>
                  {timeMutation.isPending ? "…" : "+ Zeit buchen"}
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="mt-4">
          <Field label="Interne Notizen"><Textarea rows={2} value={form.internalNotes} onChange={(e) => setForm((f) => ({ ...f, internalNotes: e.target.value }))} /></Field>
        </div>

        <div className="flex flex-wrap gap-3 mt-6">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Speichert…" : "Speichern"}</Button>
          {selected && (
            <>
              <Button variant="secondary" onClick={printOrderSheet}>🖨 Auftragsblatt drucken</Button>
              {selected.invoices.length === 0 ? (
                <Button variant="secondary" onClick={() => invoiceMutation.mutate()} disabled={invoiceMutation.isPending}>
                  {invoiceMutation.isPending ? "Erstellt…" : "Rechnung erstellen"}
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => apiDownload(`/invoices/${selected.invoices[0].id}/pdf`, `${selected.invoices[0].number}.pdf`)}>
                  Rechnung {selected.invoices[0].number} (PDF)
                </Button>
              )}
              {!selected.quote && (
                <Button variant="ghost" onClick={() => setQuoteOpen(true)}>Als Kostenvoranschlag speichern</Button>
              )}
            </>
          )}
          <Button variant="secondary" className="ml-auto" onClick={() => setEditorOpen(false)}>Schliessen</Button>
        </div>
      </Modal>

      <Modal open={quoteOpen} title="Kostenvoranschlag aus Positionen erstellen" onClose={() => setQuoteOpen(false)}>
        <p className="text-sm text-slate-600 mb-4">Erstellt einen KV mit den aktuellen Positionen (Status: Entwurf).</p>
        {quoteMutation.error && <ErrorMsg error={quoteMutation.error} />}
        <Button onClick={() => quoteMutation.mutate()} disabled={quoteMutation.isPending}>KV erstellen</Button>
      </Modal>
    </div>
  );
}
