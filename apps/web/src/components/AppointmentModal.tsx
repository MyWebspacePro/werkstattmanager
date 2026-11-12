import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Badge, Button, ErrorMsg, Field, Input, Modal, Select, Textarea } from "./ui.js";
import { Combobox } from "./Combobox.js";
import { SKILL_LABELS, SKILL_LEVELS, SKILL_SHORT } from "../lib/skills.js";
import { confirmOverride } from "../lib/override.js";
import type { ResourceLite } from "../lib/planner.js";
import { fmtTime } from "../lib/slots.js";

export interface AppointmentDraft {
  id?: string;
  customerId: string;
  vehicleId: string;
  resourceId: string;
  mechanicId: string;
  /** ISO-Zeitstempel */
  start: string;
  end: string;
  reason: string;
  notes: string;
  status: string;
  requiredSkill: number;
}

export interface ComboVehicle {
  id: string;
  licensePlate: string;
  brand: string;
  model: string;
  customerId: string;
  customer?: { firstName?: string | null; lastName?: string | null; company?: string | null } | null;
}

interface Props {
  open: boolean;
  /** null = neuer Termin */
  initial: AppointmentDraft | null;
  resources: ResourceLite[];
  vehicles: ComboVehicle[];
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const splitDate = (iso: string) => {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return { date: `${y}-${m}-${day}`, time: fmtTime(d) };
};

/** Kunde in der Reihenfolge, in der man ihn sucht: Name zuerst, Kennzeichen danach. */
export function customerLabel(c?: { firstName?: string | null; lastName?: string | null; company?: string | null } | null): string {
  if (!c) return "Kunde";
  if (c.company) return c.company;
  const name = `${c.lastName ?? ""}${c.lastName && c.firstName ? ", " : ""}${c.firstName ?? ""}`.trim();
  return name || "Kunde";
}

export function AppointmentModal({ open, initial, resources, vehicles, isAdmin, onClose, onSaved }: Props) {
  const [form, setForm] = useState<AppointmentDraft | null>(initial);
  const [bypassSkill, setBypassSkill] = useState(false);

  useEffect(() => {
    setForm(initial);
    setBypassSkill(false);
  }, [initial, open]);

  const stations = useMemo(() => resources.filter((r) => r.type !== "MECHANIC"), [resources]);
  const mechanics = useMemo(() => resources.filter((r) => r.type === "MECHANIC"), [resources]);

  const vehicleOptions = useMemo(
    () =>
      vehicles.map((v) => ({
        value: v.id,
        label: `${customerLabel(v.customer)} — ${v.brand} ${v.model}`,
        hint: v.licensePlate,
      })),
    [vehicles]
  );

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      form?.id ? api(`/appointments/${form.id}`, { method: "PUT", body: JSON.stringify(body) }) : api("/appointments", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (err, vars) => confirmOverride(err, () => mutation.mutate({ ...(vars as Record<string, unknown>), override: true })),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api(`/appointments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  if (!open || !form) return null;

  const start = splitDate(form.start);
  const end = splitDate(form.end);
  const patch = (p: Partial<AppointmentDraft>) => setForm((f) => (f ? { ...f, ...p } : f));

  const submit = () => {
    const startIso = new Date(`${start.date}T${start.time}:00`).toISOString();
    const endIso = new Date(`${end.date}T${end.time}:00`).toISOString();
    mutation.mutate({
      customerId: form.customerId,
      vehicleId: form.vehicleId,
      resourceId: form.resourceId || undefined,
      mechanicId: form.mechanicId || undefined,
      requiredSkill: form.requiredSkill,
      start: startIso,
      end: endIso,
      reason: form.reason,
      notes: form.notes,
      status: form.status,
    });
  };

  return (
    <Modal open={open} title={form.id ? "Termin bearbeiten" : "Neuer Termin"} onClose={onClose}>
      {mutation.error && <ErrorMsg error={mutation.error} />}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Field label="Fahrzeug">
            <Combobox value={form.vehicleId} options={vehicleOptions} onChange={(id) => patch({ vehicleId: id })} placeholder="Name oder Kennzeichen …" />
          </Field>
        </div>
        <Field label="Benötigte Qualifikation">
          <Select
            value={form.requiredSkill}
            onChange={(e) => {
              const req = Number(e.target.value);
              const mech = resources.find((r) => r.id === form.mechanicId);
              patch({ requiredSkill: req, mechanicId: mech && (mech.skillLevel ?? 0) < req ? "" : form.mechanicId });
            }}
          >
            {SKILL_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {SKILL_LABELS[lvl]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => patch({ status: e.target.value })}>
            <option value="CONFIRMED">Bestätigt</option>
            <option value="REQUESTED">Beantragt</option>
            <option value="IN_PROGRESS">In Arbeit</option>
            <option value="DONE">Fertig</option>
          </Select>
        </Field>
        <Field label="Arbeitsplatz / Hebebühne">
          <Select value={form.resourceId} onChange={(e) => patch({ resourceId: e.target.value })}>
            <option value="">— kein —</option>
            {stations.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={form.requiredSkill > 0 ? `Mechaniker (min. ${SKILL_SHORT[form.requiredSkill]})` : "Mechaniker"}>
          <Select value={form.mechanicId} onChange={(e) => patch({ mechanicId: e.target.value })}>
            <option value="">— kein —</option>
            {mechanics
              .filter((r) => (isAdmin && bypassSkill ? true : (r.skillLevel ?? 0) >= form.requiredSkill))
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.jobTitle ? ` — ${r.jobTitle}` : ""}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Datum">
          <Input type="date" value={start.date} onChange={(e) => patch({ start: new Date(`${e.target.value}T${start.time}:00`).toISOString() })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Von">
            <Input type="time" value={start.time} onChange={(e) => patch({ start: new Date(`${start.date}T${e.target.value}:00`).toISOString() })} />
          </Field>
          <Field label="Bis">
            <Input type="time" value={end.time} onChange={(e) => patch({ end: new Date(`${end.date}T${e.target.value}:00`).toISOString() })} />
          </Field>
        </div>
        <Field label="Grund">
          <Input value={form.reason} onChange={(e) => patch({ reason: e.target.value })} placeholder="Service, Reparatur…" />
        </Field>
        {isAdmin && form.requiredSkill > 0 && (
          <label className="col-span-2 flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={bypassSkill} onChange={(e) => setBypassSkill(e.target.checked)} />
            Qualifikationsgrenze ignorieren (Chef) — erscheint im Audit-Log
          </label>
        )}
      </div>

      <div className="mt-4">
        <Field label="Notizen">
          <Textarea rows={2} value={form.notes} onChange={(e) => patch({ notes: e.target.value })} />
        </Field>
      </div>

      {form.id && (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Badge color="slate">Status</Badge>
          {form.status === "DONE" && <span>Der Termin ist als erledigt markiert.</span>}
          {form.status === "CANCELLED" && <span>Dieser Termin ist annulliert.</span>}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <Button onClick={submit} disabled={mutation.isPending || end.time <= start.time}>
          {mutation.isPending ? "Speichert…" : "Speichern"}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Abbrechen
        </Button>
        {form.id && (
          <Button variant="danger" className="ml-auto" disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate(form.id!)}>
            Termin annullieren
          </Button>
        )}
      </div>
    </Modal>
  );
}