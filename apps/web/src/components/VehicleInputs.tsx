import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Field, Input } from "./ui.js";

/** Übliche Marken im Schweizer Markt — Vorschlagsliste, Freitext bleibt möglich (neue Marken). */
export const BRANDS = [
  "Alfa Romeo", "Audi", "BMW", "Citroën", "Cupra", "Dacia", "DS", "Fiat", "Ford", "Honda",
  "Hyundai", "Infinity", "Isuzu", "Iveco", "Jaguar", "Jeep", "Kia", "Lada", "Land Rover", "Lexus",
  "Mazda", "Mercedes-Benz", "MG", "Mini", "Mitsubishi", "Nissan", "Opel", "Peugeot", "Polestar", "Porsche",
  "Renault", "Saab", "Seat", "Skoda", "Smart", "Subaru", "Suzuki", "Tesla", "Toyota", "Volkswagen",
  "Volvo",
];

export function BrandField({ value, onChange, required = false, disabled = false }: { value: string; onChange: (v: string) => void; required?: boolean; disabled?: boolean }) {
  return (
    <Field label="Marke">
      <Input list="wm-brand-list" value={value} onChange={(e) => onChange(e.target.value)} required={required} disabled={disabled} placeholder="z.B. Volkswagen" autoComplete="off" />
      <datalist id="wm-brand-list">
        {BRANDS.map((b) => <option key={b} value={b} />)}
      </datalist>
    </Field>
  );
}

/** Modell mit Auto-Vervollständigung aus bereits erfassten Fahrzeugen derselben Marke. */
export function ModelField({ brand, value, onChange, required = false, disabled = false }: { brand: string; value: string; onChange: (v: string) => void; required?: boolean; disabled?: boolean }) {
  const { data } = useQuery({
    queryKey: ["vehicles-models"],
    queryFn: () => api<{ items: { brand: string; model: string }[] }>("/vehicles?take=500"),
    staleTime: 60_000,
  });
  const known = [...new Set((data?.items ?? [])
    .filter((v) => brand && v.brand.toLowerCase() === brand.toLowerCase() && v.model)
    .map((v) => v.model))]
    .sort((a, b) => a.localeCompare(b, "de-CH"));

  return (
    <Field label={known.length > 0 ? `Modell (bekannt: ${known.length})` : "Modell"}>
      <Input list="wm-model-list" value={value} onChange={(e) => onChange(e.target.value)} required={required} disabled={disabled} placeholder={brand ? "z.B. Golf" : "erst Marke wählen"} autoComplete="off" />
      <datalist id="wm-model-list">
        {known.map((m) => <option key={m} value={m} />)}
      </datalist>
    </Field>
  );
}
