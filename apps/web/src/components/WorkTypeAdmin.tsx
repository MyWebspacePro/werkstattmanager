import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Badge, Button, ErrorMsg, Field, Input, Modal, Select } from "./ui.js";
import { SKILL_LABELS, SKILL_LEVELS } from "../lib/skills.js";

export interface WorkType {
  id: string;
  name: string;
  defaultMinutes: number;
  requiredSkill: number;
  laborRate: string; // Decimal als String
  active: boolean;
  sortOrder: number;
}

interface Props {
  open: boolean;
  workTypes: WorkType[];
  onClose: () => void;
  onChanged: () => void;
}

const fmtMin = (m: number) => (m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} h`);

/** Katalog der Arbeitsarten — Grundlage für Dauer und Skill in der Auto-Verplanung. */
export function WorkTypeAdmin({ open, workTypes, onClose, onChanged }: Props) {
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [skill, setSkill] = useState(1);
  const [rate, setRate] = useState(140);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/worktypes", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setName("");
      onChanged();
    },
  });
  const update = useMutation({
    mutationFn: (vars: { id: string; body: Record<string, unknown> }) => api(`/worktypes/${vars.id}`, { method: "PUT", body: JSON.stringify(vars.body) }),
    onSuccess: onChanged,
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => api(`/worktypes/${id}`, { method: "DELETE" }),
    onSuccess: onChanged,
  });

  const rows = [...workTypes].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "de"));
  const error = create.error ?? update.error ?? deactivate.error;

  return (
    <Modal open={open} title="Arbeitsarten verwalten" onClose={onClose}>
      {error && <ErrorMsg error={error} />}
      <p className="mb-3 text-xs text-slate-500">
        Dauer und Qualifikation aus dem Katalog steuern die Auto-Verplanung: die Annahme wählt Arten, das System rechnet
        die Gesamtdauer und sucht einen passenden Mechaniker.
      </p>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-1.5 font-medium">Arbeit</th>
              <th className="w-20 px-2 py-1.5 font-medium">Dauer</th>
              <th className="w-40 px-2 py-1.5 font-medium">Qualifikation</th>
              <th className="w-24 px-2 py-1.5 font-medium">Satz CHF/h</th>
              <th className="w-20 px-2 py-1.5 font-medium">Status</th>
              <th className="w-24 px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-2 py-3 text-xs text-slate-500">Noch keine Arbeitsarten erfasst.</td></tr>
            )}
            {rows.map((wt) => (
              <tr key={wt.id} className={`border-t border-slate-100 ${wt.active ? "" : "text-slate-400"}`}>
                <td className="px-2 py-1.5">
                  <input
                    defaultValue={wt.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== wt.name) update.mutate({ id: wt.id, body: { name: v } });
                    }}
                    className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-slate-200 focus:border-slate-300 focus:bg-white focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={15}
                    max={600}
                    step={15}
                    defaultValue={wt.defaultMinutes}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 15 && v !== wt.defaultMinutes) update.mutate({ id: wt.id, body: { defaultMinutes: v } });
                    }}
                    className="w-16 rounded border border-slate-200 px-1 py-0.5 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <span className="ml-1 text-[11px] text-slate-500">{fmtMin(wt.defaultMinutes)}</span>
                </td>
                <td className="px-2 py-1.5">
                  <Select
                    value={wt.requiredSkill}
                    className="!w-36 !min-h-[30px] !py-1"
                    onChange={(e) => update.mutate({ id: wt.id, body: { requiredSkill: Number(e.target.value) } })}
                  >
                    {SKILL_LEVELS.map((l) => (
                      <option key={l} value={l}>{SKILL_LABELS[l]}</option>
                    ))}
                  </Select>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    step={5}
                    defaultValue={Number(wt.laborRate)}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 0 && v !== Number(wt.laborRate)) update.mutate({ id: wt.id, body: { laborRate: v } });
                    }}
                    className="w-16 rounded border border-slate-200 px-1 py-0.5 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </td>
                <td className="px-2 py-1.5">{wt.active ? <Badge color="green">aktiv</Badge> : <Badge color="slate">inaktiv</Badge>}</td>
                <td className="px-2 py-1.5 text-right">
                  {wt.active && (
                    <button
                      onClick={() => deactivate.mutate(wt.id)}
                      disabled={deactivate.isPending}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      deaktivieren
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-3">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Neu anlegen</h3>
        <div className="grid grid-cols-4 gap-3">
          <Field label="Arbeit">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Bremsen vorne" />
          </Field>
          <Field label="Dauer (Min)">
            <Input type="number" min={15} step={15} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
          </Field>
          <Field label="Qualifikation">
            <Select value={skill} onChange={(e) => setSkill(Number(e.target.value))}>
              {SKILL_LEVELS.map((l) => (
                <option key={l} value={l}>{SKILL_LABELS[l]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Satz CHF/h">
            <Input type="number" min={0} step={5} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
          </Field>
        </div>
        <div className="mt-3">
          <Button disabled={!name.trim() || minutes < 15 || create.isPending} onClick={() => create.mutate({ name: name.trim(), defaultMinutes: minutes, requiredSkill: skill, laborRate: rate })}>
            {create.isPending ? "Anlegen…" : "Anlegen"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
