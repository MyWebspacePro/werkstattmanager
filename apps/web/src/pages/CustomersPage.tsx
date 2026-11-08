import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Badge, Button, Card, Empty, ErrorMsg, Field, Input, Modal, Select, Textarea } from "../components/ui.js";

interface Customer {
  id: string; type: "PRIVATE" | "COMPANY" | "FLEET"; firstName?: string | null; lastName?: string | null;
  company?: string | null; email?: string | null; phone?: string | null; street?: string | null;
  zip?: string | null; city?: string | null; notes?: string | null; archived: boolean;
  vehicles: { id: string; licensePlate: string; brand: string; model: string }[];
  consents: { type: string; granted: boolean }[];
}

const emptyForm = {
  type: "PRIVATE" as "PRIVATE" | "COMPANY" | "FLEET", firstName: "", lastName: "", company: "", email: "", phone: "",
  street: "", zip: "", city: "", notes: "", emailMarketingConsent: false, consentSource: "",
};

export default function CustomersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading, error } = useQuery({
    queryKey: ["customers", q],
    queryFn: () => api<{ items: Customer[]; total: number }>(`/customers?q=${encodeURIComponent(q)}`),
  });

  const saveMutation = useMutation({
    mutationFn: (body: typeof emptyForm) =>
      editing
        ? api(`/customers/${editing.id}`, { method: "PUT", body: JSON.stringify(body) })
        : api("/customers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      setModalOpen(false);
    },
  });

  const openNew = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      type: c.type, firstName: c.firstName ?? "", lastName: c.lastName ?? "", company: c.company ?? "",
      email: c.email ?? "", phone: c.phone ?? "", street: c.street ?? "", zip: c.zip ?? "",
      city: c.city ?? "", notes: c.notes ?? "",
      emailMarketingConsent: c.consents.some((x) => x.type === "EMAIL_MARKETING" && x.granted),
      consentSource: "",
    });
    setModalOpen(true);
  };

  const set = (key: keyof typeof emptyForm) => (e: { target: { value: string; type?: string; checked?: boolean } }) =>
    setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

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
                const name = c.company ?? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
                return (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 font-medium">{name || "—"}</td>
                    <td><Badge color={c.type === "COMPANY" ? "blue" : c.type === "FLEET" ? "purple" : "slate"}>{c.type}</Badge></td>
                    <td className="text-slate-600">{[c.email, c.phone].filter(Boolean).join(" · ")}</td>
                    <td className="text-slate-600">{[c.zip, c.city].filter(Boolean).join(" ")}</td>
                    <td>{c.vehicles.map((v) => v.licensePlate).join(", ") || "—"}</td>
                    <td>{c.consents.some((x) => x.type === "EMAIL_MARKETING" && x.granted) ? "✓" : "—"}</td>
                    <td><Button variant="ghost" onClick={() => openEdit(c)}>Bearbeiten</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={modalOpen} title={editing ? "Kunde bearbeiten" : "Neuer Kunde"} onClose={() => setModalOpen(false)}>
        {saveMutation.error && <ErrorMsg error={saveMutation.error} />}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Typ">
            <Select value={form.type} onChange={set("type")}>
              <option value="PRIVATE">Privat</option>
              <option value="COMPANY">Firma</option>
              <option value="FLEET">Flotte</option>
            </Select>
          </Field>
          {form.type === "PRIVATE" ? (
            <>
              <Field label="Vorname"><Input value={form.firstName} onChange={set("firstName")} /></Field>
              <Field label="Nachname"><Input value={form.lastName} onChange={set("lastName")} /></Field>
            </>
          ) : (
            <Field label="Firma"><Input value={form.company} onChange={set("company")} /></Field>
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
          <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Speichert…" : "Speichern"}
          </Button>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Abbrechen</Button>
        </div>
      </Modal>
    </div>
  );
}
