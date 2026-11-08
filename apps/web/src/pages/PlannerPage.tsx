import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Badge, Button, Card, ErrorMsg, Field, Input, Modal, Select, Textarea } from "../components/ui.js";
import { SKILL_LABELS, SKILL_SHORT, SKILL_LEVELS } from "../lib/skills.js";

interface Resource { id: string; name: string; type: "LIFT" | "MECHANIC" | "BAY"; active: boolean; jobTitle?: string | null; skillLevel: number }
interface Vehicle { id: string; licensePlate: string; brand: string; model: string; customerId: string; customer?: { firstName?: string | null; lastName?: string | null; company?: string | null } }
interface Appointment {
  id: string; customerId: string; vehicleId: string; resourceId?: string | null; requiredSkill?: number;
  start: string; end: string; status: string; reason?: string | null; notes?: string | null;
  resource?: { name: string; jobTitle?: string | null } | null;
  customer?: { firstName?: string | null; lastName?: string | null; company?: string | null };
  vehicle?: { licensePlate: string; brand: string; model: string };
}

const statusColor: Record<string, "blue" | "green" | "yellow" | "red" | "purple"> = {
  REQUESTED: "yellow", CONFIRMED: "blue", IN_PROGRESS: "purple", DONE: "green", CANCELLED: "red",
};

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Montag = 0
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default function PlannerPage() {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [form, setForm] = useState({ customerId: "", vehicleId: "", resourceId: "", date: "", start: "08:00", end: "10:00", reason: "", notes: "", status: "CONFIRMED", requiredSkill: 0 });

  const weekEnd = useMemo(() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); return d; }, [weekStart]);
  const days = useMemo(() => Array.from({ length: 5 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; }), [weekStart]);

  const { data: resources } = useQuery({ queryKey: ["resources"], queryFn: () => api<Resource[]>("/resources") });
  const { data: vehicles } = useQuery({ queryKey: ["vehicles-all"], queryFn: () => api<{ items: Vehicle[] }>("/vehicles?take=100") });
  const { data: appts, error } = useQuery({
    queryKey: ["appointments", weekStart.toISOString()],
    queryFn: () => api<Appointment[]>(`/appointments?from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}`),
  });

  const saveMutation = useMutation({
    mutationFn: (body: unknown) =>
      editing
        ? api(`/appointments/${editing.id}`, { method: "PUT", body: JSON.stringify(body) })
        : api("/appointments", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      setModalOpen(false);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api(`/appointments/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });

  const toLocalDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const openNew = (date?: Date, resourceId?: string) => {
    setEditing(null);
    setForm({
      customerId: vehicles?.items[0]?.customerId ?? "", vehicleId: vehicles?.items[0]?.id ?? "",
      resourceId: resourceId ?? "", date: date ? toLocalDate(date) : toLocalDate(new Date()),
      start: "08:00", end: "10:00", reason: "", notes: "", status: "CONFIRMED", requiredSkill: 0,
    });
    setModalOpen(true);
  };

  const openEdit = (a: Appointment) => {
    setEditing(a);
    const s = new Date(a.start), e = new Date(a.end);
    setForm({
      customerId: a.customerId, vehicleId: a.vehicleId, resourceId: a.resourceId ?? "",
      date: toLocalDate(s), start: s.toTimeString().slice(0, 5), end: e.toTimeString().slice(0, 5),
      reason: a.reason ?? "", notes: a.notes ?? "", status: a.status, requiredSkill: a.requiredSkill ?? 0,
    });
    setModalOpen(true);
  };

  const submit = () => {
    const body = {
      customerId: form.customerId, vehicleId: form.vehicleId,
      resourceId: form.resourceId || undefined,
      requiredSkill: form.requiredSkill,
      start: new Date(`${form.date}T${form.start}:00`).toISOString(),
      end: new Date(`${form.date}T${form.end}:00`).toISOString(),
      reason: form.reason, notes: form.notes, status: form.status,
    };
    saveMutation.mutate(body);
  };

  const dayAppts = (day: Date) =>
    (appts ?? []).filter((a) => {
      const d = new Date(a.start);
      return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
    });

  const custName = (a: Appointment) => a.customer?.company || (`${a.customer?.firstName ?? ""} ${a.customer?.lastName ?? ""}`.trim() || "Kunde");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Werkstattplaner</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }}>‹ Woche</Button>
          <Button variant="secondary" onClick={() => setWeekStart(startOfWeek(new Date()))}>Heute</Button>
          <Button variant="secondary" onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }}>Woche ›</Button>
          <Button onClick={() => openNew()}>+ Termin</Button>
        </div>
      </div>

      {error && <ErrorMsg error={error} />}

      <div className="grid grid-cols-5 gap-3">
        {days.map((day) => (
          <div key={day.toISOString()} className="bg-white rounded-xl border border-slate-200 min-h-80">
            <div className={`px-3 py-2 border-b border-slate-100 font-semibold text-sm ${day.toDateString() === new Date().toDateString() ? "bg-blue-50 text-blue-700" : ""}`}>
              {day.toLocaleDateString("de-CH", { weekday: "short", day: "numeric", month: "short" })}
            </div>
            <div className="p-2 space-y-2">
              {dayAppts(day).map((a) => (
                <button
                  key={a.id}
                  onClick={() => openEdit(a)}
                  className="w-full text-left bg-slate-50 hover:bg-blue-50 rounded-lg p-2 text-xs border border-slate-100"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">{new Date(a.start).toTimeString().slice(0, 5)}</span>
                    <Badge color={statusColor[a.status] ?? "slate"}>{a.status === "CONFIRMED" ? "bestätigt" : a.status === "IN_PROGRESS" ? "in Arbeit" : a.status === "DONE" ? "fertig" : a.status === "REQUESTED" ? "beantragt" : "annulliert"}</Badge>
                  </div>
                  <div className="font-medium mt-1">{a.vehicle?.licensePlate}</div>
                  <div className="text-slate-500">{custName(a)}</div>
                  {a.reason && <div className="text-slate-400 truncate">{a.reason}</div>}
                  {a.resource && <div className="text-blue-600 truncate">👤 {a.resource.name}</div>}
                </button>
              ))}
              <button onClick={() => openNew(day)} className="w-full text-slate-300 hover:text-blue-500 text-lg leading-none">+</button>
            </div>
          </div>
        ))}
      </div>

      <Card title="Ressourcen (Hebebühnen & Mechaniker)">
        <div className="flex flex-wrap gap-2">
          {(resources ?? []).map((r) => (
            <Badge key={r.id} color={r.type === "LIFT" ? "blue" : r.skillLevel >= 3 ? "purple" : "slate"}>
              {r.name}{r.jobTitle ? ` · ${r.jobTitle}` : ""}
            </Badge>
          ))}
        </div>
      </Card>

      <Modal open={modalOpen} title={editing ? "Termin bearbeiten" : "Neuer Termin"} onClose={() => setModalOpen(false)}>
        {saveMutation.error && <ErrorMsg error={saveMutation.error} />}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Fahrzeug">
            <Select value={form.vehicleId} onChange={(e) => {
              const v = vehicles?.items.find((x) => x.id === e.target.value);
              setForm((f) => ({ ...f, vehicleId: e.target.value, customerId: v?.customerId ?? f.customerId }));
            }}>
              {(vehicles?.items ?? []).map((v) => (
                <option key={v.id} value={v.id}>{v.licensePlate} — {v.brand} {v.model}{v.customer ? ` (${v.customer.company || v.customer.lastName})` : ""}</option>
              ))}
            </Select>
          </Field>
          <Field label="Benötigte Qualifikation">
            <Select value={form.requiredSkill} onChange={(e) => {
              const req = Number(e.target.value);
              setForm((f) => {
                const current = resources?.find((r) => r.id === f.resourceId);
                const insufficient = current && current.skillLevel < req;
                return { ...f, requiredSkill: req, resourceId: insufficient ? "" : f.resourceId };
              });
            }}>
              {SKILL_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{SKILL_LABELS[lvl]}</option>)}
            </Select>
          </Field>
          <Field label={form.requiredSkill > 0 ? "Zuweisen (min. " + SKILL_SHORT[form.requiredSkill] + ")" : "Ressource"}>
            <Select value={form.resourceId} onChange={(e) => setForm((f) => ({ ...f, resourceId: e.target.value }))}>
              <option value="">— keine —</option>
              {(resources ?? []).filter((r) => r.skillLevel === 0 || r.skillLevel >= form.requiredSkill).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}{r.jobTitle ? ` — ${r.jobTitle}` : ""}{r.skillLevel > 0 ? ` [${SKILL_SHORT[r.skillLevel]}]` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Datum"><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Von"><Input type="time" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} /></Field>
            <Field label="Bis"><Input type="time" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} /></Field>
          </div>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="CONFIRMED">Bestätigt</option>
              <option value="REQUESTED">Beantragt</option>
              <option value="IN_PROGRESS">In Arbeit</option>
              <option value="DONE">Fertig</option>
            </Select>
          </Field>
          <Field label="Grund"><Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Service, Reparatur…" /></Field>
        </div>
        <div className="mt-4"><Field label="Notizen"><Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></Field></div>
        <div className="flex gap-3 mt-6">
          <Button onClick={submit} disabled={saveMutation.isPending || form.end <= form.start}>{saveMutation.isPending ? "Speichert…" : "Speichern"}</Button>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Abbrechen</Button>
          {editing && (
            <Button variant="danger" className="ml-auto" onClick={() => { cancelMutation.mutate(editing.id); setModalOpen(false); }}>
              Termin annullieren
            </Button>
          )}
        </div>
      </Modal>
    </div>
  );
}
