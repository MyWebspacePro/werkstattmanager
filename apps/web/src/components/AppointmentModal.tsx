import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Badge, Button, ErrorMsg, Field, Input, Modal, Select, Textarea } from "./ui.js";
import { Combobox } from "./Combobox.js";
import { SKILL_LABELS, SKILL_LEVELS, SKILL_SHORT } from "../lib/skills.js";
import { confirmOverride } from "../lib/override.js";
import type { ResourceLite } from "../lib/planner.js";
import { fmtTime } from "../lib/slots.js";
import type { WorkType } from "./WorkTypeAdmin.js";

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

export interface SlotSuggestion {
  start: string;
  end: string;
  resourceId: string;
  resourceName: string;
  mechanicId: string;
  mechanicName: string;
  mechanicLoadMin: number;
}

interface Props {
  open: boolean;
  /** null = neuer Termin */
  initial: AppointmentDraft | null;
  resources: ResourceLite[];
  vehicles: ComboVehicle[];
  workTypes: WorkType[];
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

const durationMinOf = (start: string, end: string) =>
  Math.max(15, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000));

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("de-CH", { weekday: "short", day: "numeric", month: "short" });

/**
 * Verplanungs-Dialog: Arbeitsarten wählen → Dauer/Skill automatisch, freien Slot
 * suchen lassen (Bühne + qualifizierter Mechaniker), Chef kann alles übersteuern.
 */
export function AppointmentModal({ open, initial, resources, vehicles, workTypes, isAdmin, onClose, onSaved }: Props) {
  const [form, setForm] = useState<AppointmentDraft | null>(initial);
  const [bypassSkill, setBypassSkill] = useState(false);
  const [pickedTypes, setPickedTypes] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<SlotSuggestion[] | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setForm(initial);
    setPickedTypes([]);
    setSuggestions(null);
    setApplied(null);
  }, [initial, open]);

  const stations = useMemo(() => resources.filter((r) => r.type !== "MECHANIC"), [resources]);
  const mechanics = useMemo(() => resources.filter((r) => r.type === "MECHANIC"), [resources]);
  const activeTypes = useMemo(() => workTypes.filter((w) => w.active).sort((a, b) => a.sortOrder - b.sortOrder), [workTypes]);

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

  /** Arbeitsart an/abwählen: Dauer = Summe, Skill = Maximum der gewählten Arten. */
  const toggleType = (id: string) => {
    const next = pickedTypes.includes(id) ? pickedTypes.filter((x) => x !== id) : [...pickedTypes, id];
    setPickedTypes(next);
    setSuggestions(null);
    setApplied(null);
    if (next.length > 0) {
      const minutes = next.reduce((sum, tid) => sum + (activeTypes.find((w) => w.id === tid)?.defaultMinutes ?? 0), 0);
      const skill = Math.min(
        3,
        Math.max(form.requiredSkill, ...next.map((tid) => activeTypes.find((w) => w.id === tid)?.requiredSkill ?? 0)),
      );
      const reason = next
        .map((tid) => activeTypes.find((w) => w.id === tid)?.name)
        .filter(Boolean)
        .join(" + ");
      patch({ requiredSkill: skill, end: new Date(new Date(form.start).getTime() + minutes * 60_000).toISOString(), reason });
    }
  };

  const callSuggest = async (extra: Record<string, string>) => {
    const qs = new URLSearchParams({
      durationMin: String(durationMinOf(form.start, form.end)),
      requiredSkill: String(form.requiredSkill),
      from: new Date(form.start).toISOString(),
      ...extra,
    });
    return (await api<{ suggestions: SlotSuggestion[] }>(`/appointments/suggest?${qs.toString()}`)).suggestions;
  };

  const applySuggestion = (s: SlotSuggestion) => {
    patch({ start: s.start, end: s.end, resourceId: s.resourceId, mechanicId: s.mechanicId });
    setApplied(`${s.mechanicName} · ${s.resourceName} · ${dayLabel(s.start)} ${fmtTime(new Date(s.start))}–${fmtTime(new Date(s.end))}`);
  };

  /** Freien Slot für den aktuellen Entwurf suchen und einsetzen. */
  const findSlots = async () => {
    setSearching(true);
    try {
      const found = await callSuggest({});
      setSuggestions(found);
      if (found.length > 0) applySuggestion(found[0]);
      else setApplied(null);
    } finally {
      setSearching(false);
    }
  };

  /** Bestehenden Termin auf den nächsten freien Slot verschieben — erst mit
   *  bisheriger Bühne/Mechaniker versuchen, sonst frei wählen. */
  const proposeNextSlot = async () => {
    setSearching(true);
    try {
      const preferred: Record<string, string> = {};
      if (form.resourceId) preferred.stationId = form.resourceId;
      if (form.mechanicId) preferred.mechanicId = form.mechanicId;
      let found = Object.keys(preferred).length ? await callSuggest(preferred) : [];
      if (found.length === 0) found = await callSuggest({});
      setSuggestions(found);
      if (found.length > 0) applySuggestion(found[0]);
      else setApplied(null);
    } finally {
      setSearching(false);
    }
  };

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
      autoAssign: true,
    });
  };

  return (
    <Modal open={open} title={form.id ? "Termin bearbeiten" : "Termin verplanen"} onClose={onClose}>
      {mutation.error && <ErrorMsg error={mutation.error} />}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Field label="Fahrzeug">
            <Combobox
              value={form.vehicleId}
              options={vehicleOptions}
              onChange={(id) => {
                const v = vehicles.find((x) => x.id === id);
                patch({ vehicleId: id, customerId: v?.customerId ?? form.customerId });
              }}
              placeholder="Name oder Kennzeichen …"
            />
          </Field>
        </div>

        <div className="col-span-2">
          <Field label="Arbeitsarten (bestimmen Dauer & Qualifikation)">
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
              {activeTypes.length === 0 && <span className="text-xs text-slate-500">Keine Arbeitsarten erfasst — in den Einstellungen anlegen.</span>}
              {activeTypes.map((wt) => {
                const on = pickedTypes.includes(wt.id);
                return (
                  <button
                    key={wt.id}
                    type="button"
                    onClick={() => toggleType(wt.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-blue-400"
                    }`}
                    title={`${wt.defaultMinutes} Min · ${SKILL_SHORT[wt.requiredSkill] ?? "keine Vorgabe"} · ${Number(wt.laborRate)} CHF/h`}
                  >
                    {wt.name} · {wt.defaultMinutes}′
                  </button>
                );
              })}
            </div>
          </Field>
        </div>

        <div className="col-span-2 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={findSlots} disabled={searching}>
            {searching ? "Sucht…" : "🔍 Freien Slot suchen"}
          </Button>
          {form.id && (
            <Button variant="secondary" onClick={proposeNextSlot} disabled={searching}>
              {searching ? "Sucht…" : "Auf nächsten freien Slot verschieben"}
            </Button>
          )}
          {applied && <Badge color="green">Vorschlag: {applied}</Badge>}
          {!applied && suggestions?.length === 0 && <span className="text-xs text-amber-700">Kein freier Slot gefunden — Zeitraum oder Qualifikation prüfen.</span>}
        </div>

        {suggestions && suggestions.length > 1 && (
          <div className="col-span-2 rounded-lg border border-slate-200">
            {suggestions.map((s, i) => (
              <button
                key={`${s.start}-${s.resourceId}-${i}`}
                type="button"
                onClick={() => applySuggestion(s)}
                className={`block w-full border-b border-slate-100 px-3 py-1.5 text-left text-xs last:border-b-0 hover:bg-blue-50 ${
                  applied?.startsWith(`${s.mechanicName} · ${s.resourceName} · ${dayLabel(s.start)}`) ? "bg-blue-50" : ""
                }`}
              >
                <strong>{dayLabel(s.start)}</strong> {fmtTime(new Date(s.start))}–{fmtTime(new Date(s.end))} · {s.mechanicName} · {s.resourceName}
              </button>
            ))}
          </div>
        )}

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
            <option value="REQUESTED">Beantragt (Chef bestätigt)</option>
            <option value="CONFIRMED">Bestätigt</option>
            <option value="IN_PROGRESS">In Arbeit</option>
            <option value="DONE">Fertig</option>
          </Select>
        </Field>
        <Field label="Arbeitsplatz / Hebebühne">
          <Select value={form.resourceId} onChange={(e) => patch({ resourceId: e.target.value })}>
            <option value="">— automatisch —</option>
            {stations.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={form.requiredSkill > 0 ? `Mechaniker (min. ${SKILL_SHORT[form.requiredSkill]})` : "Mechaniker"}>
          <Select value={form.mechanicId} onChange={(e) => patch({ mechanicId: e.target.value })}>
            <option value="">— automatisch —</option>
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
          <Input value={form.reason} onChange={(e) => patch({ reason: e.target.value })} placeholder="wird aus den Arbeitsarten vorgeschlagen" />
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

      <p className="mt-2 text-[11px] text-slate-500">
        Ohne gewählte Bühne/Mechaniker wird beim Speichern automatisch die am wenigsten belastete freie Kombination zugeteilt
        (Status «beantragt» muss der Chef bestätigen).
      </p>

      <div className="mt-4 flex gap-3">
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