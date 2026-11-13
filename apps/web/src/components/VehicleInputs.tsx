import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Button, Field, Input, Select } from "./ui.js";

/**
 * Standard-Katalog der Marken im Schweizer Markt. Wird verwendet, solange in
 * den Einstellungen nichts anderes hinterlegt ist (`usualBrands` leer) — dort
 * kann der Betrieb die Liste selbst pflegen (Einstellungen → «Marken»).
 */
export const BRAND_CATALOG: { usual: string[]; other: string[] } = {
  // Sehr verbreitet in CH-Werkstätten — inkl. der aktuellen E-Marken.
  usual: [
    "Audi", "BMW", "BYD", "Citroën", "Dacia", "Fiat", "Ford", "Hyundai",
    "Mercedes-Benz", "Nissan", "Opel", "Peugeot", "Polestar", "Renault", "Seat",
    "Skoda", "Tesla", "Toyota", "Volkswagen", "Volvo", "XPeng", "Zeekr",
  ],
  // Weitere Marken mit CH-Präsenz (Händler, Importeure, Flotten).
  other: [
    "Alfa Romeo", "Alpine", "Aston Martin", "Bentley", "BYD", "Cadillac",
    "Chevrolet", "Chrysler", "Cupra", "Dodge", "DS", "Ferrari",
    "Genesis", "Honda", "Infinity", "Isuzu", "Iveco",
    "Jaguar", "Jeep", "Kia", "Lada", "Lamborghini", "Land Rover", "Lexus", "Lincoln",
    "Maserati", "Mazda", "MG", "Mini", "Mitsubishi",
    "Polestar", "Porsche", "Rolls-Royce", "Saab",
    "Smart", "Subaru", "Suzuki", "Tesla",
    "XPeng", "Zeekr",
  ],
};

/** Freitext bleibt möglich, wenn eine Marke nicht in der Liste steht. */
const OTHER = "__other__";

interface SettingsShape {
  shopStartMin: number;
  shopEndMin: number;
  saturdayOpen: boolean;
  usualBrands?: string[] | null;
}

export function BrandField({ value, onChange, required = false, disabled = false }: { value: string; onChange: (v: string) => void; required?: boolean; disabled?: boolean }) {
  // Eigene Marken (aus dem Fahrzeugbestand) zuerst — sie sind im Betrieb am häufigsten.
  const { data: fleet } = useQuery({
    queryKey: ["vehicles-brands"],
    queryFn: () => api<{ items: { brand: string }[] }>("/vehicles?take=500"),
    staleTime: 60_000,
  });
  // Vom Betrieb gepflegte Liste; leer = Standardkatalog.
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<SettingsShape>("/settings"),
    staleTime: 60_000,
  });

  const own = [...new Set((fleet?.items ?? []).map((v) => v.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de-CH"));
  const custom = settings?.usualBrands ?? [];
  // Eigene Auswahl bestimmt Gruppe 1. Nicht gewählte Standardmarken bleiben als
  // «Weitere Marken» erhalten — sie verschwinden nicht, sie rutschen nur nach unten.
  const catalog = custom.length > 0
    ? {
        usual: [...new Set(custom)].sort((a, b) => a.localeCompare(b, "de-CH")),
        other: [...new Set([...BRAND_CATALOG.other, ...BRAND_CATALOG.usual])].sort((a, b) => a.localeCompare(b, "de-CH")),
      }
    : BRAND_CATALOG;

  const lower = (s: string) => s.trim().toLowerCase();
  const known = new Set([...catalog.usual, ...catalog.other, ...own].map(lower));
  const [otherMode, setOtherMode] = useState(false);
  const showOtherField = otherMode && !known.has(lower(value));
  const otherBrands = catalog.other.filter((b) => !catalog.usual.some((u) => lower(u) === lower(b)) && !own.some((o) => lower(o) === lower(b)));

  const opts = useMemo(() => ({
    usual: catalog.usual,
    other: otherBrands,
  }), [catalog.usual.join("|"), otherBrands.join("|")]);

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
        value={known.has(lower(value)) ? value : ""}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setOtherMode(true);
            onChange("");
          } else {
            setOtherMode(false);
            onChange(e.target.value);
          }
        }}
        required={required}
        disabled={disabled}
      >
        <option value="">— Marke wählen —</option>
        {opts.usual.length > 0 && (
          <optgroup label={custom.length > 0 ? "Übliche Marken" : "Übliche Marken (Standard)"}>
            {opts.usual.map((b) => <option key={`u-${b}`} value={b}>{b}</option>)}
          </optgroup>
        )}
        {own.filter((b) => !known.has(lower(b))).length > 0 && (
          <optgroup label="Im Betrieb erfasst">
            {own.filter((b) => !known.has(lower(b))).map((b) => <option key={`own-${b}`} value={b}>{b}</option>)}
          </optgroup>
        )}
        {opts.other.length > 0 && (
          <optgroup label="Weitere Marken">
            {opts.other.map((b) => <option key={`o-${b}`} value={b}>{b}</option>)}
          </optgroup>
        )}
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