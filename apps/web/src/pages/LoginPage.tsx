import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth.js";
import { Button, Input } from "../components/ui.js";

export default function LoginPage() {
  const { login, user } = useAuth();
  const [email, setEmail] = useState("chef@werkstatt.ch");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
    } catch {
      setError("Login fehlgeschlagen — E-Mail oder Passwort falsch.");
    } finally {
      setBusy(false);
    }
  };

  if (user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-center mb-6">Werkstattmanager</h1>
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
        <label className="block">
          <span className="block mb-1 text-sm font-medium">E-Mail</span>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="block">
          <span className="block mb-1 text-sm font-medium">Passwort</span>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <Button type="submit" disabled={busy} className="w-full justify-center">
          {busy ? "Lädt…" : "Einloggen"}
        </Button>
        <p className="text-xs text-slate-400 text-center">Demo: chef@werkstatt.ch / changeme</p>
      </form>
    </div>
  );
}
