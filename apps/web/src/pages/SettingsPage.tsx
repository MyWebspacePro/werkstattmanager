import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Button, Card, ErrorMsg, Field, Input, Select, Textarea } from "../components/ui.js";
import { useAuth } from "../lib/auth.js";

interface Settings {
  companyName: string; addressLine: string; zip: string; city: string; phone: string; email: string; website: string;
  vatNumber: string; vatScheme: "STANDARD" | "SMALL_BUSINESS"; vatRateStandard: string; vatRateReduced: string;
  iban: string; qrIban: string; bankName: string; defaultLaborRate: string;
  invoicePrefix: string; quotePrefix: string; orderPrefix: string; paymentTermsDays: number; invoiceFooter: string;
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

        <Card title="Zahlungsverkehr (QR-Rechnung)">
          <div className="grid grid-cols-2 gap-4">
            <Field label="QR-IBAN (empfohlen)"><Input value={form.qrIban} onChange={set("qrIban")} placeholder="CHxx 3xxx xxxx xxxx xxxx x" disabled={readOnly} /></Field>
            <Field label="IBAN (normal)"><Input value={form.iban} onChange={set("iban")} disabled={readOnly} /></Field>
            <Field label="Bank"><Input value={form.bankName} onChange={set("bankName")} disabled={readOnly} /></Field>
            <Field label="Zahlfrist Tage"><Input type="number" value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: Number(e.target.value) })} disabled={readOnly} /></Field>
          </div>
        </Card>

        <Card title="Kalkulation & Belegnummern">
          <div className="grid grid-cols-4 gap-4">
            <Field label="Stundensatz CHF"><Input type="number" step="0.5" value={form.defaultLaborRate} onChange={set("defaultLaborRate")} disabled={readOnly} /></Field>
            <Field label="Rechnung Präfix"><Input value={form.invoicePrefix} onChange={set("invoicePrefix")} disabled={readOnly} /></Field>
            <Field label="KV Präfix"><Input value={form.quotePrefix} onChange={set("quotePrefix")} disabled={readOnly} /></Field>
            <Field label="Auftrag Präfix"><Input value={form.orderPrefix} onChange={set("orderPrefix")} disabled={readOnly} /></Field>
          </div>
          <div className="mt-4">
            <Field label="Fusstext Rechnung"><Textarea rows={2} value={form.invoiceFooter} onChange={set("invoiceFooter")} disabled={readOnly} /></Field>
          </div>
        </Card>

        {!readOnly && (
          <div className="flex gap-3">
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Speichert…" : "Speichern"}</Button>
          </div>
        )}
        {readOnly && <p className="text-sm text-slate-500">Nur die Chef-Rolle kann Einstellungen ändern.</p>}
      </form>
    </div>
  );
}
