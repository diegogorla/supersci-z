"use client";

import { Languages } from "lucide-react";
import { locales, type Locale } from "./content-public";

export function LanguageSelect({ value, label, onChange }: { value: Locale; label: string; onChange: (locale: Locale) => void }) {
  return (
    <label className="language-picker">
      <Languages aria-hidden="true" size={16} />
      <span className="sr-only">{label}</span>
      <select
        className="language-trigger"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value as Locale)}
      >
        {locales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
      </select>
    </label>
  );
}
