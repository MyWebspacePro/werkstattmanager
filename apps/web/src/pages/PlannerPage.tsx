import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Button, Card, ErrorMsg } from "../components/ui.js";
import { TimeGrid } from "../components/TimeGrid.js";
import { WeekGrid } from "../components/WeekGrid.js";
import { CapacityView } from "../components/CapacityView.js";
import type { WorkType } from "../components/WorkTypeAdmin.js";
import { AppointmentModal, customerLabel, type AppointmentDraft } from "../components/AppointmentModal.js";
import { ResourceAdmin } from "../components/ResourceAdmin.js";
import { confirmOverride } from "../lib/override.js";
import { useAuth } from "../lib/auth.js";
import {
  buildLanes,
  custName,
  laneKeyOf,
  STATUS_META,
  STATUS_ORDER,
  UNASSIGNED,
  type MoveTarget,
  type PlannerAppointment,
  type ResourceLite,
} from "../lib/planner.js";
import { SHOP_END_MIN, SHOP_START_MIN, addDays, atMinutes, dayRange, isSameDay, startOfDay, startOfWeek } from "../lib/slots.js";

type View = "day" | "week" | "capacity";
type GroupBy = "station" | "mechanic";

export default function PlannerPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [view, setView] = useState<View>("week");
  const [groupBy, setGroupBy] = useState<GroupBy>("station");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [sixDays, setSixDays] = useState(false);
  const [hiddenStatus, setHiddenStatus] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<AppointmentDraft | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);

  const dayCount = view === "day" ? 1 : sixDays ? 6 : 5;
  const rangeStart = useMemo(() => (view === "day" ? startOfDay(anchor) : startOfWeek(anchor)), [view, anchor]);
  const days = useMemo(() => dayRange(rangeStart, dayCount), [rangeStart, dayCount]);
  const rangeEnd = useMemo(() => addDays(days[days.length - 1], 1), [days]);

  const { data: resourceRows, error: resError } = useQuery({
    queryKey: ["resources", "all"],
    queryFn: () => api<ResourceLite[]>("/resources?all=1"),
  });
  const { data: vehicleRows } = useQuery({
    queryKey: ["vehicles-all"],
    queryFn: () => api<{ items: Array<{ id: string; licensePlate: string; brand: string; model: string; customerId: string; customer?: { firstName?: string | null; lastName?: string | null; company?: string | null } | null }> }>("/vehicles?take=100"),
  });
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ shopStartMin: number; shopEndMin: number; saturdayOpen: boolean }>("/settings"),
  });
  const shopStartMin = settings?.shopStartMin ?? SHOP_START_MIN;
  const shopEndMin = settings?.shopEndMin ?? SHOP_END_MIN;
  const { data: workTypes } = useQuery({ queryKey: ["worktypes"], queryFn: () => api<WorkType[]>("/worktypes") });
  const { data: appts, error } = useQuery({
    queryKey: ["appointments", rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: () => api<PlannerAppointment[]>(`/appointments?from=${encodeURIComponent(rangeStart.toISOString())}&to=${encodeURIComponent(rangeEnd.toISOString())}`),
  });

  const allResources = resourceRows ?? [];
  const activeResources = allResources.filter((r) => r.active !== false);

  const mechanics = useMemo(() => activeResources.filter((r) => r.type === "MECHANIC"), [activeResources]);
  const requested = useMemo(() => (appts ?? []).filter((a) => a.status === "REQUESTED"), [appts]);
  const requestedCount = requested.length;

  const confirmMutation = useMutation({
    mutationFn: (id: string) => api(`/appointments/${id}`, { method: "PUT", body: JSON.stringify({ status: "CONFIRMED" }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });

  const visible = useMemo(
    () => (appts ?? []).filter((a) => !hiddenStatus.has(a.status)),
    [appts, hiddenStatus]
  );

  /** Spuren + Sammelspur, wenn in diesem Zeitraum etwas nicht zugewiesen ist. */
  const lanes = useMemo(() => {
    const base = buildLanes(activeResources, groupBy);
    const hasUnassigned = (appts ?? []).some((a) => laneKeyOf(a, groupBy) === UNASSIGNED);
    return hasUnassigned
      ? [...base, { key: UNASSIGNED, title: "Nicht zugewiesen", subtitle: "bitte zuordnen", kind: "UNASSIGNED" as const }]
      : base;
  }, [activeResources, groupBy, appts]);

  const moveMutation = useMutation({
    mutationFn: (vars: { id: string; body: Record<string, unknown> }) => api(`/appointments/${vars.id}`, { method: "PUT", body: JSON.stringify(vars.body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
    onError: (err, vars) => confirmOverride(err, () => moveMutation.mutate({ ...vars, body: { ...(vars.body as object), override: true } })),
  });

  const moveAppointment = (id: string, target: MoveTarget) => {
    const appt = (appts ?? []).find((a) => a.id === id);
    if (!appt) return;
    const day = target.day ? startOfDay(target.day) : startOfDay(new Date(appt.start));
    const body: Record<string, unknown> = {
      start: atMinutes(day, target.startMin).toISOString(),
      end: atMinutes(day, Math.min(target.endMin, SHOP_END_MIN)).toISOString(),
    };
    // Beim Ziehen in der «Arbeitsplätze»-Ansicht wird die Bühne gesetzt,
    // in der «Mitarbeiter»-Ansicht die Person — die andere Zuweisung bleibt.
    if (groupBy === "station") {
      body.resourceId = target.laneKey === UNASSIGNED ? undefined : target.laneKey;
    } else {
      body.mechanicId = target.laneKey === UNASSIGNED ? undefined : target.laneKey;
    }
    moveMutation.mutate({ id, body });
  };

  const openNew = (opts: { day?: Date; startMin?: number; laneKey?: string; laneIsMechanic?: boolean } = {}) => {
    const day = startOfDay(opts.day ?? (view === "day" ? anchor : new Date()));
    const startMin = opts.startMin ?? 8 * 60;
    const start = atMinutes(day, startMin);
    const end = atMinutes(day, Math.min(startMin + 60, SHOP_END_MIN));
    // Die Kapazitätsansicht klickt immer eine Mechaniker-Lücke an — unabhängig
    // davon, wie die Spalten im Raster gerade gruppiert sind.
    const laneIsStation = opts.laneIsMechanic === true ? false : groupBy === "station";
    setDraft({
      customerId: "",
      vehicleId: vehicleRows?.items[0]?.id ?? "",
      resourceId: laneIsStation && opts.laneKey && opts.laneKey !== UNASSIGNED ? opts.laneKey : "",
      mechanicId: !laneIsStation && opts.laneKey && opts.laneKey !== UNASSIGNED ? opts.laneKey : "",
      start: start.toISOString(),
      end: end.toISOString(),
      reason: "",
      notes: "",
      status: "CONFIRMED",
      requiredSkill: 0,
    });
    setModalOpen(true);
  };

  const openEdit = (a: PlannerAppointment) => {
    setDraft({
      id: a.id,
      customerId: a.customerId ?? "",
      vehicleId: a.vehicleId ?? "",
      resourceId: a.resourceId ?? "",
      mechanicId: a.mechanicId ?? "",
      start: a.start,
      end: a.end,
      reason: a.reason ?? "",
      notes: a.notes ?? "",
      status: a.status,
      requiredSkill: a.requiredSkill ?? 0,
    });
    setModalOpen(true);
  };

  const shift = (dir: -1 | 1) => {
    if (view === "day") setAnchor((d) => addDays(d, dir));
    else setAnchor((d) => addDays(d, dir * 7));
  };

  const rangeLabel =
    view === "day"
      ? anchor.toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" })
      : `${days[0].toLocaleDateString("de-CH", { day: "numeric", month: "short" })} – ${days[days.length - 1].toLocaleDateString("de-CH", { day: "numeric", month: "short" })}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Werkstattplaner</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            {(
              [
                ["day", "Tag"],
                ["week", "Woche"],
                ["capacity", "Kapazität"],
              ] as Array<[View, string]>
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-sm font-medium ${view === v ? "bg-blue-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            {(
              [
                ["station", "Arbeitsplätze"],
                ["mechanic", "Mitarbeiter"],
              ] as Array<[GroupBy, string]>
            ).map(([g, label]) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`px-3 py-1.5 text-sm font-medium ${groupBy === g ? "bg-slate-800 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {view === "week" && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={sixDays} onChange={(e) => setSixDays(e.target.checked)} />
              Samstag
            </label>
          )}
          {isAdmin && requestedCount > 0 && (
            <Button variant="secondary" onClick={() => requested.forEach((a) => confirmMutation.mutate(a.id))} disabled={confirmMutation.isPending}>
              ✓ Beantragte bestätigen ({requestedCount})
            </Button>
          )}
          <Button onClick={() => openNew()}>+ Termin</Button>
          <Button variant="secondary" onClick={() => setAdminOpen(true)}>
            Arbeitsplätze verwalten
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => shift(-1)} aria-label="zurück">
            ‹
          </Button>
          <Button variant="secondary" onClick={() => setAnchor(startOfDay(new Date()))}>
            Heute
          </Button>
          <Button variant="secondary" onClick={() => shift(1)} aria-label="vor">
            ›
          </Button>
          <span className="ml-1 text-sm font-medium text-slate-700">{rangeLabel}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_ORDER.map((s) => {
            const off = hiddenStatus.has(s);
            return (
              <button
                key={s}
                onClick={() =>
                  setHiddenStatus((prev) => {
                    const next = new Set(prev);
                    if (next.has(s)) next.delete(s);
                    else next.add(s);
                    return next;
                  })
                }
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity ${
                  off ? "border-slate-200 text-slate-400 line-through" : "border-slate-300 text-slate-700"
                }`}
                title={off ? "Wieder einblenden" : "Ausblenden"}
              >
                <span className={`h-2 w-2 rounded-full ${STATUS_META[s].dot}`} />
                {STATUS_META[s].label}
              </button>
            );
          })}
        </div>
      </div>

      {(error || resError) && <ErrorMsg error={error ?? resError} />}

      {view === "capacity" ? (
        <CapacityView
          days={days}
          mechanics={mechanics}
          appointments={visible}
          shopStartMin={shopStartMin}
          shopEndMin={shopEndMin}
          onGapClick={(mechanicId, day, startMin) => openNew({ day, startMin, laneKey: mechanicId, laneIsMechanic: true })}
        />
      ) : view === "day" ? (
        <TimeGrid
          day={days[0]}
          lanes={lanes}
          appointments={visible}
          groupBy={groupBy}
          shopStartMin={shopStartMin}
          shopEndMin={shopEndMin}
          onCreate={(laneKey, startMin, endMin) => openNew({ day: days[0], startMin, laneKey })}
          onOpen={openEdit}
          onMove={moveAppointment}
        />
      ) : (
        <WeekGrid
          days={days}
          lanes={lanes}
          appointments={visible}
          groupBy={groupBy}
          shopStartMin={shopStartMin}
          shopEndMin={shopEndMin}
          today={new Date()}
          onCreate={(laneKey, day, startMin) => openNew({ day, startMin, laneKey })}
          onOpen={openEdit}
          onMove={moveAppointment}
        />
      )}

      {isSameDay(days[0], new Date()) && view === "day" && (
        <p className="text-xs text-slate-500">
          Tipp: in eine leere Fläche klicken legt einen Termin an, ein Block lässt sich greifen und in eine andere Spur ziehen.
        </p>
      )}

      <AppointmentModal
        open={modalOpen}
        initial={draft}
        resources={allResources}
        vehicles={vehicleRows?.items ?? []}
        workTypes={workTypes ?? []}
        isAdmin={isAdmin}
        onClose={() => setModalOpen(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["appointments"] })}
      />

      <ResourceAdmin
        open={adminOpen}
        resources={allResources}
        onClose={() => setAdminOpen(false)}
        onChanged={() => qc.invalidateQueries({ queryKey: ["resources"] })}
      />

      {/* Kleine Übersicht über die Auslastung der Woche — hilft beim Planen. */}
      <Card title="Kurz-Übersicht">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
          <span>
            <strong className="text-slate-900">{visible.length}</strong> Termine im Zeitraum
          </span>
          <span>
            <strong className="text-slate-900">{lanes.filter((l) => l.kind !== "UNASSIGNED").length}</strong>{" "}
            {groupBy === "station" ? "Arbeitsplätze" : "Mitarbeiter"}
          </span>
          <span>
            <strong className="text-slate-900">{visible.filter((a) => !a.resourceId && !a.mechanicId).length}</strong> ohne Zuweisung
          </span>
        </div>
      </Card>
    </div>
  );
}

/** Für die Kundenanzeige anderswo im Repo weiterverwendbar. */
export { customerLabel };