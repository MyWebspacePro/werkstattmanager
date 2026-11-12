import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Badge, Button, ErrorMsg, Field, Input, Modal, Select } from "./ui.js";
import { SKILL_LABELS, SKILL_LEVELS } from "../lib/skills.js";
import type { ResourceLite, ResourceType } from "../lib/planner.js";

interface Props {
  open: boolean;
  resources: ResourceLite[];
  onClose: () => void;
  onChanged: () => void;
}

const TYPE_LABEL: Record<ResourceType, string> = {
  LIFT: "Hebebühne",
  BAY: "Arbeitsplatz",
  MECHANIC: "Mitarbeiter",
};

/**
 * Arbeitsplätze und Team verwalten. Ohne das kann der Betreiber keine eigene
 * Bühne oder einen Reifenwechselplatz anlegen — genau das ist im Planer aber
 * der Kern jeder Spur.
 */
export function ResourceAdmin({ open, resources, onClose, onChanged }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ResourceType>("LIFT");
  const [jobTitle, setJobTitle] = useState("");
  const [skillLevel, setSkillLevel] = useState(1);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/resources", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setName("");
      setJobTitle("");
      onChanged();
    },
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; body: Record<string, unknown> }) => api(`/resources/${vars.id}`, { method: "PUT", body: JSON.stringify(vars.body) }),
    onSuccess: onChanged,
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api(`/resources/${id}`, { method: "DELETE" }),
    onSuccess: onChanged,
  });

  const grouped: Array<[ResourceType, ResourceLite[]]> = (["LIFT", "BAY", "MECHANIC"] as ResourceType[]).map((t) => [
    t,
    [...resources].filter((r) => r.type === t).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, "de")),
  ]);

  const error = create.error ?? update.error ?? deactivate.error;

  return (
    <Modal open={open} title="Arbeitsplätze & Team verwalten" onClose={onClose}>
      {error && <ErrorMsg error={error} />}

      <div className="space-y-4">
        {grouped.map(([t, rows]) => (
          <div key={t}>
            <h3 className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
              {TYPE_LABEL[t]}
              <span className="text-xs font-normal text-slate-400">{rows.length}</span>
            </h3>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Name</th>
                    <th className="w-16 px-2 py-1.5 font-medium">Reihe</th>
                    <th className="w-20 px-2 py-1.5 font-medium">Status</th>
                    <th className="w-16 px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-2 py-2 text-xs text-slate-500">
                        Keine Einträge.
                      </td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.id} className={`border-t border-slate-100 ${r.active === false ? "text-slate-400" : ""}`}>
                      <td className="px-2 py-1.5">
                        <input
                          defaultValue={r.name}
                          disabled={update.isPending}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== r.name) update.mutate({ id: r.id, body: { name: v } });
                          }}
                          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-slate-200 focus:border-slate-300 focus:bg-white focus:outline-none"
                        />
                        {r.jobTitle && <div className="px-1 text-[11px] text-slate-500">{r.jobTitle}</div>}
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={0}
                          max={9999}
                          defaultValue={r.sortOrder ?? 0}
                          disabled={update.isPending}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v) && v !== (r.sortOrder ?? 0)) update.mutate({ id: r.id, body: { sortOrder: v } });
                          }}
                          className="w-14 rounded border border-slate-200 px-1 py-0.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        {r.active === false ? (
                          <Badge color="slate">inaktiv</Badge>
                        ) : (
                          <Badge color="green">aktiv</Badge>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {r.active !== false && (
                          <button
                            onClick={() => deactivate.mutate(r.id)}
                            disabled={deactivate.isPending}
                            className="text-xs text-red-600 hover:underline disabled:opacity-50"
                            title="Aus dem Planer nehmen — Termine und Historie bleiben erhalten"
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
          </div>
        ))}

        <div className="rounded-lg border border-dashed border-slate-300 p-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Neu anlegen</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bezeichnung">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Reifenwechselplatz" />
            </Field>
            <Field label="Art">
              <Select value={type} onChange={(e) => setType(e.target.value as ResourceType)}>
                <option value="LIFT">Hebebühne</option>
                <option value="BAY">Arbeitsplatz</option>
                <option value="MECHANIC">Mitarbeiter</option>
              </Select>
            </Field>
            {type === "MECHANIC" && (
              <>
                <Field label="Funktion">
                  <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="z. B. Automechatroniker" />
                </Field>
                <Field label="Qualifikation">
                  <Select value={skillLevel} onChange={(e) => setSkillLevel(Number(e.target.value))}>
                    {SKILL_LEVELS.filter((l) => l > 0).map((l) => (
                      <option key={l} value={l}>
                        {SKILL_LABELS[l]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button
              disabled={!name.trim() || create.isPending}
              onClick={() =>
                create.mutate({
                  name: name.trim(),
                  type,
                  ...(type === "MECHANIC" ? { jobTitle: jobTitle.trim() || undefined, skillLevel } : { skillLevel: 0 }),
                })
              }
            >
              {create.isPending ? "Anlegen…" : "Anlegen"}
            </Button>
            <span className="text-[11px] text-slate-500">
              {type === "MECHANIC" ? "Erscheint im Umschalter «Mitarbeiter»." : "Erscheint im Umschalter «Arbeitsplätze»."}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}