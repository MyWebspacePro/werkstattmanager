import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Badge, Button, Card, Empty, ErrorMsg, Field, Input, Modal, Select, formatCHF } from "../components/ui.js";

interface Part { id: string; number: string; name: string; stock: number; minStock: number; purchasePrice: string; salePrice: string; location?: string | null; barcode?: string | null; supplierId?: string | null; supplier?: { name: string } | null }
interface Supplier { id: string; name: string }
interface ImportResult { status: string; itemCount: number; createdCnt: number; updatedCnt: number; error?: string | null }

const emptyPart = { number: "", name: "", supplierId: "", barcode: "", location: "", stock: 0, minStock: 0, purchasePrice: 0, salePrice: 0 };

/** Minimaler CSV-Parser (Komma oder Semikolon, Anführungszeichen). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const delim = text.includes(";") && !text.includes(",") ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (field || row.length) { row.push(field); rows.push(row); row = []; field = ""; }
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export default function PartsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Part | null>(null);
  const [form, setForm] = useState(emptyPart);
  const [importOpen, setImportOpen] = useState(false);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [mapping, setMapping] = useState({ number: "", name: "", salePrice: "", purchasePrice: "", barcode: "", location: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["parts", q],
    queryFn: () => api<{ items: Part[]; total: number }>(`/parts?q=${encodeURIComponent(q)}&take=100`),
  });
  const { data: suppliers } = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });

  const saveMutation = useMutation({
    mutationFn: (body: typeof emptyPart) =>
      editing ? api(`/parts/${editing.id}`, { method: "PUT", body: JSON.stringify(body) }) : api("/parts", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["parts"] }); setModalOpen(false); },
  });

  const importMutation = useMutation({
    mutationFn: () =>
      api<ImportResult>("/parts/import", {
        method: "POST",
        body: JSON.stringify({
          supplierId: (suppliers ?? [])[0]?.id ?? "",
          fileName: csvFileName,
          mapping: Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)),
          rows: csvRows.slice(1).map((r) => Object.fromEntries(csvHeaders.map((h, i) => [h, r[i] ?? ""]))),
        }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["parts"] }); },
  });

  const onCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result).replace(/^\uFEFF/, "");
      const rows = parseCsv(text);
      if (rows.length > 1) {
        setCsvRows(rows);
        setCsvHeaders(rows[0]);
        setCsvFileName(file.name);
        // Auto-Mapping nach gebräuchlichen Spaltennamen
        const find = (...keys: string[]) => rows[0].find((h) => keys.some((k) => h.toLowerCase().includes(k))) ?? "";
        setMapping({ number: find("nummer", "article", "artikel-nr", "sku", "item"), name: find("bezeichnung", "name", "description"), salePrice: find("vk", "verkaufs", "sale", "preis"), purchasePrice: find("ek", "einkauf", "purchase"), barcode: find("ean", "barcode", "gtin"), location: find("lager", "ort", "location") });
      }
    };
    reader.readAsText(file, "utf-8");
  };

  const set = (key: keyof typeof emptyPart) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: key.includes("Price") || key === "stock" || key === "minStock" ? Number(e.target.value) : e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Teile & Lager</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setImportOpen(true)}>CSV-Import</Button>
          <Button onClick={() => { setEditing(null); setForm(emptyPart); setModalOpen(true); }}>+ Neues Teil</Button>
        </div>
      </div>
      <Input placeholder="Nummer, Bezeichnung, Barcode…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />

      {error && <ErrorMsg error={error} />}
      {isLoading ? <div className="text-slate-500">Lädt…</div> : !data || data.items.length === 0 ? (
        <Card><Empty text="Keine Teile erfasst — Preislisten per CSV-Import laden oder manuell anlegen" /></Card>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="py-2">Nummer</th><th>Bezeichnung</th><th>Lieferant</th><th>Lagerort</th><th>Verkauf</th><th>Lager</th><th></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 font-mono">{p.number}</td>
                  <td className="font-medium">{p.name}</td>
                  <td className="text-slate-600">{p.supplier?.name ?? "—"}</td>
                  <td>{p.location ?? "—"}</td>
                  <td>{formatCHF(p.salePrice)}</td>
                  <td>{p.stock <= p.minStock ? <Badge color="red">{p.stock} / min {p.minStock}</Badge> : <Badge color="green">{p.stock}</Badge>}</td>
                  <td><Button variant="ghost" onClick={() => { setEditing(p); setForm({ ...emptyPart, ...p, barcode: p.barcode ?? "", location: p.location ?? "", supplierId: p.supplierId ?? "", purchasePrice: Number(p.purchasePrice), salePrice: Number(p.salePrice) }); setModalOpen(true); }}>Bearbeiten</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={modalOpen} title={editing ? `Teil ${editing.number} bearbeiten` : "Neues Teil"} onClose={() => setModalOpen(false)}>
        {saveMutation.error && <ErrorMsg error={saveMutation.error} />}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Artikelnummer"><Input value={form.number} onChange={set("number")} required /></Field>
          <Field label="Bezeichnung"><Input value={form.name} onChange={set("name")} required /></Field>
          <Field label="Lieferant">
            <Select value={form.supplierId} onChange={set("supplierId")}>
              <option value="">— keiner —</option>
              {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Lagerort"><Input value={form.location} onChange={set("location")} placeholder="Regal 2 / Fach 4" /></Field>
          <Field label="Barcode / EAN"><Input value={form.barcode} onChange={set("barcode")} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lagerbestand"><Input type="number" value={form.stock} onChange={set("stock")} /></Field>
            <Field label="Mindestbestand"><Input type="number" value={form.minStock} onChange={set("minStock")} /></Field>
          </div>
          <Field label="Einkaufspreis CHF"><Input type="number" step="0.05" value={form.purchasePrice} onChange={set("purchasePrice")} /></Field>
          <Field label="Verkaufspreis CHF"><Input type="number" step="0.05" value={form.salePrice} onChange={set("salePrice")} /></Field>
        </div>
        <div className="flex gap-3 mt-6">
          <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Speichert…" : "Speichern"}</Button>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Abbrechen</Button>
        </div>
      </Modal>

      <Modal open={importOpen} title="Lieferanten-Preisliste importieren (CSV)" onClose={() => setImportOpen(false)}>
        {importMutation.error && <ErrorMsg error={importMutation.error} />}
        {importMutation.data && (
          <div className="bg-green-50 text-green-700 rounded-lg px-4 py-2 mb-4">
            Import ok: {importMutation.data.createdCnt} neu, {importMutation.data.updatedCnt} aktualisiert ({importMutation.data.itemCount} Zeilen)
          </div>
        )}
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onCsvFile(e.target.files[0])} />
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>CSV-Datei wählen…</Button>
        {csvHeaders.length > 0 && (
          <>
            <p className="text-sm text-slate-500 mt-4">{csvFileName} — {csvRows.length - 1} Datenzeilen. Spalten zuordnen:</p>
            <div className="grid grid-cols-2 gap-3 mt-2">
              {[["number", "Artikelnummer *"], ["name", "Bezeichnung *"], ["salePrice", "Verkaufspreis"], ["purchasePrice", "Einkaufspreis"], ["barcode", "Barcode/EAN"], ["location", "Lagerort"]].map(([key, label]) => (
                <Field key={key} label={label}>
                  <Select value={mapping[key as keyof typeof mapping]} onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}>
                    <option value="">— keine —</option>
                    {csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </Field>
              ))}
            </div>
            <div className="mt-4">
              <Button onClick={() => importMutation.mutate()} disabled={!mapping.number || !mapping.name || importMutation.isPending}>
                {importMutation.isPending ? "Importiert…" : `${csvRows.length - 1} Zeilen importieren`}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
