import { useEffect, useMemo, useRef, useState } from "react";

export interface ComboOption {
  value: string;
  /** Was in der Zeile steht — zuerst das, wonach man sucht (Name). */
  label: string;
  hint?: string;
}

interface Props {
  value: string;
  options: ComboOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
}

/**
 * Filterbare Auswahl. Der native <select> kann nur den ersten Buchstaben
 * springen — hier tippt man „ban" und findet Bannwart, Baumann, Bänziger.
 * Auswahl per Maus, Pfeiltasten und Enter, Escape schliesst.
 */
export function Combobox({ value, options, onChange, placeholder = "Suchen…", emptyText = "Nichts gefunden", disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const needle = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!needle) return options;
    return options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(needle));
  }, [options, needle]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [needle, open]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="combo-list"
        autoComplete="off"
        disabled={disabled}
        value={open ? query : selected?.label ?? ""}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setCursor((c) => Math.min(c + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const hit = matches[cursor];
            if (hit) pick(hit.value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            setQuery("");
          }
        }}
        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
      />
      {open && (
        <div id="combo-list" role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {matches.length === 0 && <div className="px-3 py-2 text-sm text-slate-500">{emptyText}</div>}
          {matches.slice(0, 60).map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setCursor(i)}
              onClick={() => pick(o.value)}
              className={`block w-full px-3 py-1.5 text-left text-sm ${i === cursor ? "bg-blue-50 text-blue-900" : "text-slate-700 hover:bg-slate-50"}`}
            >
              <div className="truncate font-medium">{o.label}</div>
              {o.hint && <div className="truncate text-[11px] text-slate-500">{o.hint}</div>}
            </button>
          ))}
          {matches.length > 60 && <div className="px-3 py-1 text-[11px] text-slate-400">… und {matches.length - 60} weitere — weiter tippen</div>}
        </div>
      )}
    </div>
  );
}