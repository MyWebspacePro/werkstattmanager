import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Button, Field, Input, Select } from "./ui.js";

/** Übliche Marken im Schweizer Markt. */
export const BRANDS = [
  "Alfa Romeo", "Audi", "BMW", "BYD", "Cadillac", "Chevrolet", "Chrysler", "Citroën", "Cupra", "Dacia",
  "Dodge", "DS", "Fiat", "Ford", "Honda", "Hyundai", "Infinity", "Isuzu", "Iveco", "Jaguar",
  "Jeep", "Kia", "Lada", "Land Rover", "Lexus", "Maserati", "Mazda", "Mercedes-Benz", "MG", "Mini",
  "Mitsubishi", "Nissan", "Opel", "Peugeot", "Polestar", "Porsche", "Renault", "Saab", "Seat", "Skoda",
  "Smart", "Subaru", "Suzuki", "Tesla", "Toyota", "Volkswagen", "Volvo",
];

/** Freitext bleibt möglich, wenn eine Marke nicht in der Liste steht. */
const OTHER = "__other__";

export function BrandField({ value, onChange, required = false, disabled = false }: { value: string; onChange: (v: string) => void; required?: boolean; disabled?: boolean }) {
  // Eigene Marken (aus dem Fahrzeugbestand) zuerst — sie sind im Betrieb am häufigsten.
  const { data } = useQuery({
    queryKey: ["vehicles-brands"],
    queryFn: () => api<{ items: { brand: string }[] }>("/vehicles?take=500"),
    staleTime: 60_000,
  });
  const own = [...new Set((data?.items ?? []).map((v) => v.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de-CH"));
  const isKnown = BRANDS.some((b) => b.toLowerCase() === value.trim().toLowerCase()) || own.some((b) => b.toLowerCase() === value.trim().toLowerCase());
  // „Andere Marke …" ist ein Umschalter: dann erscheint statt der Liste ein Freitextfeld.
  const [otherMode, setOtherMode] = useState(false);
  const showOtherField = otherMode && !isKnown;

  if (showOtherField) {
    return (
      <Field label="Marke">
        <div className="flex gap-1">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            disabled={disabled}
            placeholder="Markenname"
            autoFocus
          />
          <Button type="button" variant="ghost" className="shrink-0 px-2" disabled={disabled} onClick={() => { setOtherMode(false); onChange(""); }} title="Zurück zur Liste">
            ↑
          </Button>
        </div>
      </Field>
    );
  }

  return (
    <Field label="Marke">
      <Select
        value={isKnown ? value : ""}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setOtherMode(true);
            onChange("");
          } else {
            setOtherMode(false);
            onChange(e.target.value);
          }
        }}
        required={required && !showOtherField}
        disabled={disabled}
      >
        <option value="">— Marke wählen —</option>
        {own.length > 0 && (
          <optgroup label="Im Betrieb erfasst">
            {own.map((b) => <option key={`own-${b}`} value={b}>{b}</option>)}
          </optgroup>
        )}
        <optgroup label="Weitere Marken">
          {BRANDS.filter((b) => !own.some((o) => o.toLowerCase() === b.toLowerCase())).map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </optgroup>
        <option value={OTHER}>+ Neue Marke …</option>
      </Select>
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
