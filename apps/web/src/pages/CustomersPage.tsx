import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Badge, Button, Card, Empty, ErrorMsg, Field, Input, Modal, Select, Textarea } from "../components/ui.js";
import { BrandField, ModelField } from "../components/VehicleInputs.js";

interface Customer {
  id: string; type: "PRIVATE" | "COMPANY" | "FLEET"; firstName?: string | null; lastName?: string | null;
  company?: string | null; email?: string | null; phone?: string | null; street?: string | null;
  zip?: string | null; city?: string | null; notes?: string | null; archived: boolean;
  vehicles: { id: string; licensePlate: string; brand: string; model: string }[];
  consents: { type: string; granted: boolean }[];
}

const emptyVehicleRow = { plate: "", vin: "", brand: "", model: "", year: "", mileage: "" };
const emptyForm = {
  type: "PRIVATE" as "PRIVATE" | "COMPANY" | "FLEET", firstName: "", lastName: "", company: "", email: "", phone: "",
  street: "", zip: "", city: "", notes: "", emailMarketingConsent: false, consentSource: "",
  vehicles: [{ ...emptyVehicleRow }],
};

const emptyVehicle = { licensePlate: "", vin: "", brand: "", model: "", year: "", mileage: "" };

export default function CustomersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [vehicleModalFor, setVehicleModalFor] = useState<Customer | null>(null);
  const [vform, setVform] = useState(emptyVehicle);

  const { data, isLoading, error } = useQuery({
    queryKey: ["customers", q],
    queryFn: () => api<{ items: Customer[]; total: number }>(`/customers?q=${encodeURIComponent(q)}`),
  });

  const saveMutation = useMutation({
    mutationFn: (body: Omit<typeof emptyForm, "vehicles"> & { vehicles?: Array<{ licensePlate: string; vin?: string; brand: string; model: string; year?: number; mileage?: number }> }) =>
      editing
        ? api(`/customers/${editing.id}`, { method: "PUT", body: JSON.stringify(body) })
        : api("/customers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      setModalOpen(false);
    },
  });

  const vehicleMutation = useMutation({
    mutationFn: (customerId: string) =>
      api("/vehicles", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          licensePlate: vform.licensePlate.trim(),
          ...(vform.vin.trim() ? { vin: vform.vin.trim() } : {}),
          brand: vform.brand.trim(),
          model: vform.model.trim(),
          ...(vform.year ? { year: Number(vform.year) } : {}),
          ...(vform.mileage ? { mileage: Number(vform.mileage) } : {}),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      setVehicleModalFor(null);
      setVform(emptyVehicle);
    },
  });

  const openNew = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      ...emptyForm,
      type: c.type, firstName: c.firstName ?? "", lastName: c.lastName ?? "", company: c.company || "",
      email: c.email ?? "", phone: c.phone ?? "", street: c.street ?? "", zip: c.zip ?? "",
      city: c.city ?? "", notes: c.notes ?? "",
      emailMarketingConsent: c.consents.some((x) => x.type === "EMAIL_MARKETING" && x.granted),
    });
    setModalOpen(true);
  };

  const set = (key: keyof typeof emptyForm) => (e: { target: { value: string; type?: string; checked?: boolean } }) =>
    setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const setV = (key: keyof typeof emptyVehicle) => (e: { target: { value: string } }) =>
    setVform((f) => ({ ...f, [key]: e.target.value }));

  const submitCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    const vehicles = !editing
      ? form.vehicles
          .filter((v) => v.plate.trim())
          .map((v) => ({
            licensePlate: v.plate.trim(),
            ...(v.vin.trim() ? { vin: v.vin.trim() } : {}),
            brand: v.brand.trim(),
            model: v.model.trim(),
            ...(v.year ? { year: Number(v.year) } : {}),
            ...(v.mileage ? { mileage: Number(v.mileage) } : {}),
          }))
      : undefined;
    const { vehicles: _formVehicles, ...rest } = form;
    saveMutation.mutate({ ...rest, ...(vehicles ? { vehicles } : {}) });
  };

  const isPrivate = form.type === "PRIVATE";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kunden</h1>
        <Button onClick={openNew}>+ Neuer Kunde</Button>
      </div>
      <Input placeholder="Name, Firma, E-Mail, Telefon, Ort…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />

      {error && <ErrorMsg error={error} />}
      {isLoading ? (
        <div className="text-slate-500">Lädt…</div>
      ) : !data || data.items.length === 0 ? (
        <Card><Empty text="Noch keine Kunden angelegt" /></Card>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="py-2">Kunde</th><th>Typ</th><th>Kontakt</th><th>Ort</th><th>Fahrzeuge</th><th>Newsletter</th><th></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => {
                const name = c.company || `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
                return (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 font-medium">
                      <Link to={`/kunden/${c.id}`} className="hover:text-blue-600 hover:underline" title="Kundendossier öffnen">{name || "—"}</Link>
                    </td>
                    <td><Badge color={c.type === "COMPANY" ? "blue" : c.type === "FLEET" ? "purple" : "slate"}>{c.type}</Badge></td>
                    <td className="text-slate-600">{[c.email, c.phone].filter(Boolean).join(" · ")}</td>
                    <td className="text-slate-600">{[c.zip, c.city].filter(Boolean).join(" ")}</td>
                    <td>
                      {c.vehicles.length === 0 ? "—" : c.vehicles.map((v) => (
                        <Link key={v.id} to={`/fahrzeuge/${v.id}`} className="mr-2 hover:text-blue-600 hover:underline" title="Fahrzeugakte öffnen">{v.licensePlate}</Link>
                      ))}
                    </td>
                    <td>{c.consents.some((x) => x.type === "EMAIL_MARKETING" && x.granted) ? "✓" : "—"}</td>
                    <td className="whitespace-nowrap">
                      <Button variant="ghost" onClick={() => setVehicleModalFor(c)}>+ Fahrzeug</Button>
                      <Button variant="ghost" onClick={() => openEdit(c)}>Bearbeiten</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={modalOpen} title={editing ? "Kunde bearbeiten" : "Neuer Kunde"} onClose={() => setModalOpen(false)}>
        {saveMutation.error && <ErrorMsg error={saveMutation.error} />}
        <form onSubmit={submitCustomer}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Typ">
              <Select value={form.type} onChange={set("type")}>
                <option value="PRIVATE">Privat</option>
                <option value="COMPANY">Firma</option>
                <option value="FLEET">Flotte</option>
              </Select>
            </Field>
            {isPrivate ? (
              <>
                <Field label="Vorname"><Input value={form.firstName} onChange={set("firstName")} /></Field>
                <Field label="Nachname"><Input value={form.lastName} onChange={set("lastName")} required={isPrivate} /></Field>
              </>
            ) : (
              <Field label="Firma"><Input value={form.company} onChange={set("company")} required={!isPrivate} /></Field>
            )}
            <Field label="E-Mail"><Input type="email" value={form.email} onChange={set("email")} /></Field>
            <Field label="Telefon"><Input value={form.phone} onChange={set("phone")} /></Field>
            <Field label="Strasse"><Input value={form.street} onChange={set("street")} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="PLZ"><Input value={form.zip} onChange={set("zip")} /></Field>
              <Field label="Ort"><Input value={form.city} onChange={set("city")} /></Field>
            </div>
          </div>
          <div className="mt-4">
            <Field label="Notizen"><Textarea rows={2} value={form.notes} onChange={set("notes")} /></Field>
          </div>

          {!editing && (
            <div className="mt-4 border-t pt-4">
              <p className="text-sm font-medium text-slate-700 mb-1">Fahrzeuge (optional — auch Zweitwagen gleich miterfassen)</p>
              <p className="text-xs text-slate-400 mb-3">Zeile leer lassen = kein Fahrzeug. Mit Kennzeichen sind Marke und Modell Pflicht.</p>
              <div className="space-y-3">
                {form.vehicles.map((v, i) => {
                  const active = !!v.plate.trim();
                  const setV = (key: keyof typeof emptyVehicleRow) => (e: { target: { value: string } }) =>
                    setForm((f) => ({ ...f, vehicles: f.vehicles.map((row, j) => (j === i ? { ...row, [key]: e.target.value } : row)) }));
                  return (
                    <div key={i} className="grid grid-cols-2 md:grid-cols-7 gap-3 items-end">
                      <Field label={i === 0 ? "Kennzeichen" : ""}>
                        <Input value={v.plate} onChange={setV("plate")} placeholder="SH 123 456" />
                      </Field>
                      <Field label={i === 0 ? "VIN" : ""}>
                        <Input value={v.vin} onChange={setV("vin")} placeholder="17-stellig" maxLength={32} className="font-mono text-xs" />
                      </Field>
                      <BrandField value={v.brand} onChange={(val) => setForm((f) => ({ ...f, vehicles: f.vehicles.map((row, j) => (j === i ? { ...row, brand: val } : row)) }))} required={active} />
                      <ModelField brand={v.brand} value={v.model} onChange={(val) => setForm((f) => ({ ...f, vehicles: f.vehicles.map((row, j) => (j === i ? { ...row, model: val } : row)) }))} required={active} />
                      <Field label={i === 0 ? "Jahr" : ""}><Input type="number" value={v.year} onChange={setV("year")} min={1950} max={2100} /></Field>
                      <Field label={i === 0 ? "KM-Stand" : ""}><Input type="number" value={v.mileage} onChange={setV("mileage")} min={0} /></Field>
                      <Button type="button" variant="ghost" className="justify-center" onClick={() => setForm((f) => ({ ...f, vehicles: f.vehicles.filter((_, j) => j !== i) }))} disabled={form.vehicles.length === 1}>✕</Button>
                    </div>
                  );
                })}
              </div>
              <Button type="button" variant="secondary" className="mt-3" onClick={() => setForm((f) => ({ ...f, vehicles: [...f.vehicles, { ...emptyVehicleRow }] }))}>
                + Weiteres Fahrzeug
              </Button>
            </div>
          )}

          <label className="flex items-center gap-2 mt-4 text-sm">
            <input type="checkbox" className="w-5 h-5" checked={form.emailMarketingConsent} onChange={set("emailMarketingConsent")} />
            E-Mail-Einwilligung (Erinnerungen/Marketing) — nDSG: Nachweis wird protokolliert
          </label>
          {form.emailMarketingConsent && (
            <div className="mt-2">
              <Field label="Quelle der Einwilligung"><Input value={form.consentSource} onChange={set("consentSource")} placeholder="z.B. Formular am Empfang" /></Field>
            </div>
          )}
          <div className="flex gap-3 mt-6">
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Speichert…" : "Speichern"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Abbrechen</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!vehicleModalFor} title={vehicleModalFor ? `Fahrzeug hinzufügen — ${vehicleModalFor.company || `${vehicleModalFor.firstName ?? ""} ${vehicleModalFor.lastName ?? ""}`.trim()}` : ""} onClose={() => setVehicleModalFor(null)}>
        {vehicleMutation.error && <ErrorMsg error={vehicleMutation.error} />}
        <form onSubmit={(e) => { e.preventDefault(); vehicleMutation.mutate(vehicleModalFor!.id); }}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Kennzeichen"><Input value={vform.licensePlate} onChange={setV("licensePlate")} required placeholder="SH 123 456" /></Field>
            <Field label="VIN (Fahrgestellnummer)"><Input value={vform.vin} onChange={setV("vin")} placeholder="17-stellig" maxLength={32} className="font-mono text-xs" /></Field>
            <BrandField value={vform.brand} onChange={(v) => setVform((f) => ({ ...f, brand: v }))} required />
            <ModelField brand={vform.brand} value={vform.model} onChange={(v) => setVform((f) => ({ ...f, model: v }))} required />
            <Field label="Jahr"><Input type="number" value={vform.year} onChange={setV("year")} min={1950} max={2100} /></Field>
            <Field label="KM-Stand"><Input type="number" value={vform.mileage} onChange={setV("mileage")} min={0} /></Field>
          </div>
          <div className="flex gap-3 mt-6">
            <Button type="submit" disabled={vehicleMutation.isPending}>
              {vehicleMutation.isPending ? "Speichert…" : "Fahrzeug speichern"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setVehicleModalFor(null)}>Abbrechen</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
