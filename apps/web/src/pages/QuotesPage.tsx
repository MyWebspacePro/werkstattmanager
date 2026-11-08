import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiDownload } from "../lib/api.js";
import { Badge, Button, Card, Empty, ErrorMsg, Input, Select, formatCHF, formatDate } from "../components/ui.js";

interface Quote {
  id: string; number: string; status: string; createdAt: string; validUntil?: string | null;
  totalNet: string; totalVat: string; total: string;
  customer: { firstName?: string | null; lastName?: string | null; company?: string | null };
  vehicle: { licensePlate: string; brand: string; model: string };
}

const statusLabel: Record<string, string> = {
  DRAFT: "Entwurf", SENT: "Gesendet", ACCEPTED: "Angenommen", REJECTED: "Abgelehnt", EXPIRED: "Abgelaufen",
};
const statusColor: Record<string, "slate" | "blue" | "green" | "red" | "yellow"> = {
  DRAFT: "slate", SENT: "blue", ACCEPTED: "green", REJECTED: "red", EXPIRED: "yellow",
};

export default function QuotesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [msg, setMsg] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["quotes", q, status],
    queryFn: () => api<{ items: Quote[]; total: number }>(`/quotes?q=${encodeURIComponent(q)}${status ? `&status=${status}` : ""}&take=50`),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["quotes"] });

  const action = useMutation({
    mutationFn: (payload: { id: string; act: string; reason?: string }) =>
      api(`/quotes/${payload.id}/${payload.act}`, { method: "POST", body: JSON.stringify({ rejectionReason: payload.reason }) }),
    onSuccess: (_r, v) => {
      setMsg(v.act === "send" ? "KV als gesendet markiert" : v.act === "accept" ? "KV als angenommen dokumentiert (Datum protokolliert)" : "KV als abgelehnt dokumentiert");
      refresh();
    },
  });

  const convert = useMutation({
    mutationFn: (id: string) => api<{ number: string }>(`/quotes/${id}/convert`, { method: "POST" }),
    onSuccess: (wo) => {
      setMsg(`Auftrag ${wo.number} wurde aus dem KV erstellt (Positionen übernommen)`);
      refresh();
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Kostenvoranschläge</h1>
      <div className="flex gap-3 items-center">
        <Input placeholder="Nummer oder Kunde…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-48">
          <option value="">Alle Status</option>
          <option value="DRAFT">Entwurf</option>
          <option value="SENT">Gesendet</option>
          <option value="ACCEPTED">Angenommen</option>
          <option value="REJECTED">Abgelehnt</option>
        </Select>
      </div>
      {msg && <div className="bg-green-50 text-green-700 rounded-lg px-4 py-2">{msg}</div>}
      <ErrorMsg error={error ?? action.error ?? convert.error} />

      {isLoading ? <div className="text-slate-500">Lädt…</div> : !data || data.items.length === 0 ? (
        <Card><Empty text="Keine Kostenvoranschläge — KVs entstehen aus Aufträgen («Als Kostenvoranschlag speichern»)" /></Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="py-2">Nummer</th><th>Datum</th><th>Kunde</th><th>Fahrzeug</th><th>Total</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((qt) => {
                const cust = qt.customer.company ?? `${qt.customer.firstName ?? ""} ${qt.customer.lastName ?? ""}`.trim();
                return (
                  <tr key={qt.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 font-mono">{qt.number}</td>
                    <td>{formatDate(qt.createdAt)}</td>
                    <td>{cust || "—"}</td>
                    <td>{qt.vehicle?.licensePlate ?? "—"}</td>
                    <td className="font-medium">{formatCHF(qt.total)}</td>
                    <td><Badge color={statusColor[qt.status] ?? "slate"}>{statusLabel[qt.status] ?? qt.status}</Badge></td>
                    <td className="whitespace-nowrap text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" onClick={() => apiDownload(`/quotes/${qt.id}/pdf`, `${qt.number}.pdf`)}>PDF</Button>
                        {qt.status === "DRAFT" && (
                          <Button variant="ghost" onClick={() => action.mutate({ id: qt.id, act: "send" })}>Senden</Button>
                        )}
                        {qt.status === "SENT" && (
                          <>
                            <Button variant="ghost" onClick={() => action.mutate({ id: qt.id, act: "accept" })}>✓ Angenommen</Button>
                            <Button variant="ghost" onClick={() => {
                              const reason = window.prompt("Ablehnungsgrund (wird dokumentiert):") ?? "";
                              action.mutate({ id: qt.id, act: "reject", reason });
                            }}>✕ Abgelehnt</Button>
                          </>
                        )}
                        {qt.status === "ACCEPTED" && (
                          <Button variant="ghost" onClick={() => convert.mutate(qt.id)} disabled={convert.isPending}>
                            {convert.isPending ? "…" : "→ Auftrag"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </Card>
      )}
    </div>
  );
}
