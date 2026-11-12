import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Button, Card, ErrorMsg, Field, Input, Select, Textarea } from "../components/ui.js";
import { WorkTypeAdmin, type WorkType } from "../components/WorkTypeAdmin.js";
import { useAuth } from "../lib/auth.js";

interface AppUser {
  id: string; email: string; name: string; jobTitle?: string | null; role: "ADMIN" | "STAFF" | "MECHANIC"; active: boolean; createdAt: string;
}

function PasswordCard() {
  const qc = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ok, setOk] = useState(false);
  const mutation = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api("/auth/password", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      setOk(true); setCurrent(""); setNext(""); setConfirm("");
      qc.invalidateQueries({ queryKey: ["me"] });
      setTimeout(() => setOk(false), 3000);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return;
    mutation.mutate({ currentPassword: current, newPassword: next });
  };

  return (
    <Card title="Mein Passwort ändern">
      <form onSubmit={submit} className="space-y-4 max-w-md">
        <Field label="Aktuelles Passwort">
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        </Field>
        <Field label="Neues Passwort (min. 8 Zeichen)">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required autoComplete="new-password" />
        </Field>
        <Field label="Neues Passwort wiederholen">
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required autoComplete="new-password" />
        </Field>
        {next && confirm && next !== confirm && <p className="text-sm text-red-600">Passwörter stimmen nicht überein.</p>}
        <ErrorMsg error={mutation.error} />
        {ok && <p className="text-sm text-green-700">Passwort geändert ✓</p>}
        <Button type="submit" disabled={mutation.isPending || (!!next && !!confirm && next !== confirm)}>
          {mutation.isPending ? "Speichert…" : "Passwort ändern"}
        </Button>
      </form>
    </Card>
  );
}

function UsersCard() {
  const qc = useQueryClient();
  const { data: users, isLoading, error } = useQuery({ queryKey: ["users"], queryFn: () => api<AppUser[]>("/users") });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; role?: string; active?: boolean }) =>
      api(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });
  const resetPw = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api(`/users/${id}/password`, { method: "POST", body: JSON.stringify({ password }) }),
    onSuccess: invalidate,
  });
  const create = useMutation({
    mutationFn: (body: { email: string; name: string; password: string; role: string }) =>
      api("/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(); setNewUser({ name: "", email: "", jobTitle: "", password: "", role: "STAFF" }); },
  });

  const [newUser, setNewUser] = useState({ name: "", email: "", jobTitle: "", password: "", role: "STAFF" });

  const askResetPassword = (u: AppUser) => {
    const pw = window.prompt(`Neues Passwort für ${u.name} (min. 8 Zeichen):`);
    if (pw) resetPw.mutate({ id: u.id, password: pw });
  };

  if (isLoading) return null;
  if (error) return <ErrorMsg error={error} />;

  return (
    <Card title="Benutzerverwaltung (Chef)">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">E-Mail</th>
              <th className="py-2 pr-3">Rolle</th>
              <th className="py-2 pr-3">Aktiv</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="py-2 pr-3 font-medium">{u.name}{u.jobTitle ? <span className="block text-xs text-slate-400">{u.jobTitle}</span> : null}</td>
                <td className="py-2 pr-3 text-slate-500">{u.email}</td>
                <td className="py-2 pr-3">
                  <Select
                    value={u.role}
                    onChange={(e) => update.mutate({ id: u.id, role: e.target.value })}
                    className="!py-1 !text-sm"
                  >
                    <option value="ADMIN">Chef (Admin)</option>
                    <option value="STAFF">Annahme/Administration</option>
                    <option value="MECHANIC">Mechaniker</option>
                  </Select>
                </td>
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    onClick={() => update.mutate({ id: u.id, active: !u.active })}
                    className={`px-2 py-0.5 rounded text-xs ${u.active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}
                  >
                    {u.active ? "aktiv" : "gesperrt"}
                  </button>
                </td>
                <td className="py-2 text-right">
                  <button type="button" onClick={() => askResetPassword(u)} className="text-blue-600 hover:underline text-xs">
                    Passwort setzen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ErrorMsg error={update.error ?? resetPw.error ?? create.error} />

      <form
        onSubmit={(e) => { e.preventDefault(); create.mutate(newUser); }}
        className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-3 items-end border-t pt-4"
      >
        <Field label="Name"><Input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} required minLength={2} /></Field>
        <Field label="Funktion"><Input value={newUser.jobTitle} onChange={(e) => setNewUser({ ...newUser, jobTitle: e.target.value })} placeholder="z.B. Automechatroniker" /></Field>
        <Field label="E-Mail"><Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required /></Field>
        <Field label="Passwort (min. 8)"><Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required minLength={8} /></Field>
        <Field label="Rolle">
          <Select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
            <option value="ADMIN">Chef (Admin)</option>
            <option value="STAFF">Annahme/Administration</option>
            <option value="MECHANIC">Mechaniker</option>
          </Select>
        </Field>
        <Button type="submit" disabled={create.isPending}>{create.isPending ? "Legt an…" : "Benutzer anlegen"}</Button>
      </form>
    </Card>
  );
}

interface Settings {
  companyName: string; addressLine: string; zip: string; city: string; phone: string; email: string; website: string;
  vatNumber: string; vatScheme: "STANDARD" | "SMALL_BUSINESS"; vatRateStandard: string; vatRateReduced: string;
  iban: string; qrIban: string; bankName: string; defaultLaborRate: string;
  invoicePrefix: string; quotePrefix: string; orderPrefix: string; creditPrefix: string; paymentTermsDays: number;
  reminderLevel1Days: number; reminderLevel2Days: number; reminderLevel3Days: number;
  reminderFee1: string; reminderFee2: string; reminderFee3: string;
  invoiceFooter: string;
  shopStartMin: number; shopEndMin: number; saturdayOpen: boolean;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["settings"], queryFn: () => api<Settings>("/settings") });
  const [form, setForm] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (data) setForm(data); }, [data]);

  const mutation = useMutation({
    mutationFn: (body: Settings) => api("/settings", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); setSaved(true); setTimeout(() => setSaved(false), 2500); },
  });

  if (isLoading) return <div className="text-slate-500">Lädt…</div>;
  if (error) return <ErrorMsg error={error} />;
  if (!form) return null;

  const set = (key: keyof Settings) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value } as Settings);

  const readOnly = user?.role !== "ADMIN";

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Einstellungen</h1>
      {saved && <div className="bg-green-50 text-green-700 rounded-lg px-4 py-2">Gespeichert ✓</div>}
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
        <Card title="Werkstatt-Stammdaten">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Firmenname"><Input value={form.companyName} onChange={set("companyName")} disabled={readOnly} required /></Field>
            <Field label="Telefon"><Input value={form.phone} onChange={set("phone")} disabled={readOnly} /></Field>
            <Field label="Strasse"><Input value={form.addressLine} onChange={set("addressLine")} disabled={readOnly} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="PLZ"><Input value={form.zip} onChange={set("zip")} disabled={readOnly} /></Field>
              <Field label="Ort"><Input value={form.city} onChange={set("city")} disabled={readOnly} /></Field>
            </div>
            <Field label="E-Mail"><Input type="email" value={form.email} onChange={set("email")} disabled={readOnly} /></Field>
            <Field label="Webseite"><Input value={form.website} onChange={set("website")} disabled={readOnly} /></Field>
          </div>
        </Card>

        <Card title="Mehrwertsteuer (MWSTG)">
          <div className="grid grid-cols-3 gap-4">
            <Field label="MWST-Nummer"><Input value={form.vatNumber} onChange={set("vatNumber")} placeholder="CHE-123.456.789 MWST" disabled={readOnly} /></Field>
            <Field label="Verfahren">
              <Select value={form.vatScheme} onChange={set("vatScheme")} disabled={readOnly}>
                <option value="STANDARD">Standard (MWST-pflichtig)</option>
                <option value="SMALL_BUSINESS">Kleingeschäft (ohne MWST)</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Normalsatz %"><Input type="number" step="0.1" value={form.vatRateStandard} onChange={set("vatRateStandard")} disabled={readOnly} /></Field>
              <Field label="Red. Satz %"><Input type="number" step="0.1" value={form.vatRateReduced} onChange={set("vatRateReduced")} disabled={readOnly} /></Field>
            </div>
          </div>
        </Card>

        <Card title="Werkstattzeiten (für die Auto-Verplanung)">
          <div className="grid grid-cols-3 gap-4">
            <Field label="Öffnung ab">
              <Input type="time" value={minutesToTime(form.shopStartMin)} onChange={(e) => setForm({ ...form, shopStartMin: timeToMinutes(e.target.value) })} disabled={readOnly} />
            </Field>
            <Field label="Öffnung bis">
              <Input type="time" value={minutesToTime(form.shopEndMin)} onChange={(e) => setForm({ ...form, shopEndMin: timeToMinutes(e.target.value) })} disabled={readOnly} />
            </Field>
            <Field label="Samstag offen">
              <Select value={form.saturdayOpen ? "1" : "0"} onChange={(e) => setForm({ ...form, saturdayOpen: e.target.value === "1" })} disabled={readOnly}>
                <option value="0">Samstag zu</option>
                <option value="1">Samstag offen (gleiche Zeiten)</option>
              </Select>
            </Field>
          </div>
          <p className="mt-2 text-xs text-slate-500">Grundlage der Slot-Suche im Planer. Kapazität pro Mitarbeiter: «Arbeitsplätze verwalten» im Planer.</p>
        </Card>

        <Card title="Zahlungsverkehr (QR-Rechnung)">
          <div className="grid grid-cols-2 gap-4">
            <Field label="QR-IBAN (empfohlen)"><Input value={form.qrIban} onChange={set("qrIban")} placeholder="CHxx 3xxx xxxx xxxx xxxx x" disabled={readOnly} /></Field>
            <Field label="IBAN (normal)"><Input value={form.iban} onChange={set("iban")} disabled={readOnly} /></Field>
            <Field label="Bank"><Input value={form.bankName} onChange={set("bankName")} disabled={readOnly} /></Field>
            <Field label="Zahlfrist Tage"><Input type="number" value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: Number(e.target.value) })} disabled={readOnly} /></Field>
          </div>
        </Card>

        <Card title="Kalkulation & Belegnummern">
          <div className="grid grid-cols-5 gap-4">
            <Field label="Stundensatz CHF"><Input type="number" step="0.5" value={form.defaultLaborRate} onChange={set("defaultLaborRate")} disabled={readOnly} /></Field>
            <Field label="Rechnung Präfix"><Input value={form.invoicePrefix} onChange={set("invoicePrefix")} disabled={readOnly} /></Field>
            <Field label="KV Präfix"><Input value={form.quotePrefix} onChange={set("quotePrefix")} disabled={readOnly} /></Field>
            <Field label="Auftrag Präfix"><Input value={form.orderPrefix} onChange={set("orderPrefix")} disabled={readOnly} /></Field>
            <Field label="Kreditnota Präfix"><Input value={form.creditPrefix} onChange={set("creditPrefix")} disabled={readOnly} /></Field>
          </div>
          <div className="mt-4">
            <Field label="Fusstext Rechnung"><Textarea rows={2} value={form.invoiceFooter} onChange={set("invoiceFooter")} disabled={readOnly} /></Field>
          </div>
        </Card>

        <Card title="Mahnwesen (3 Stufen)">
          <p className="text-xs text-slate-500 mb-3">Fristen in Tagen nach Fälligkeit, Gebühren in CHF pro Stufe. Die Mahnung wird als PDF erstellt und per E-Mail versendet (wenn der Kunde eine E-Mail-Adresse hat).</p>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            <Field label="1. Mahnung: Tage"><Input type="number" min={1} value={form.reminderLevel1Days} onChange={(e) => setForm({ ...form, reminderLevel1Days: Number(e.target.value) })} disabled={readOnly} /></Field>
            <Field label="Gebühr CHF"><Input type="number" step="1" min={0} value={form.reminderFee1} onChange={set("reminderFee1")} disabled={readOnly} /></Field>
            <Field label="2. Mahnung: Tage"><Input type="number" min={1} value={form.reminderLevel2Days} onChange={(e) => setForm({ ...form, reminderLevel2Days: Number(e.target.value) })} disabled={readOnly} /></Field>
            <Field label="Gebühr CHF"><Input type="number" step="1" min={0} value={form.reminderFee2} onChange={set("reminderFee2")} disabled={readOnly} /></Field>
            <Field label="3. Mahnung: Tage"><Input type="number" min={1} value={form.reminderLevel3Days} onChange={(e) => setForm({ ...form, reminderLevel3Days: Number(e.target.value) })} disabled={readOnly} /></Field>
            <Field label="Gebühr CHF"><Input type="number" step="1" min={0} value={form.reminderFee3} onChange={set("reminderFee3")} disabled={readOnly} /></Field>
          </div>
        </Card>

        {!readOnly && (
          <div className="flex gap-3">
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Speichert…" : "Speichern"}</Button>
          </div>
        )}
        {readOnly && <p className="text-sm text-slate-500">Nur die Chef-Rolle kann Einstellungen ändern.</p>}
      </form>

      <PasswordCard />
      {user?.role === "ADMIN" && <UsersCard />}
      {user?.role === "ADMIN" && <WorkTypesCard />}
    </div>
  );
}

const minutesToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const timeToMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 420);
};

function WorkTypesCard() {
  const { data } = useQuery({ queryKey: ["worktypes"], queryFn: () => api<WorkType[]>("/worktypes") });
  const [adminOpen, setAdminOpen] = useState(false);
  const qc = useQueryClient();
  const count = (data ?? []).filter((wt) => wt.active).length;
  return (
    <Card
      title="Arbeitsarten (Auto-Verplanung)"
      actions={<Button variant="secondary" onClick={() => setAdminOpen(true)}>Verwalten ({count})</Button>}
    >
      <p className="text-sm text-slate-600">
        Standarddauer und Qualifikation pro Arbeit. Die Annahme wählt im Planer die passenden Arten aus — Dauer,
        Mechaniker und freier Slot werden automatisch vorgeschlagen.
      </p>
      <WorkTypeAdmin
        open={adminOpen}
        workTypes={data ?? []}
        onClose={() => setAdminOpen(false)}
        onChanged={() => qc.invalidateQueries({ queryKey: ["worktypes"] })}
      />
    </Card>
  );
}
