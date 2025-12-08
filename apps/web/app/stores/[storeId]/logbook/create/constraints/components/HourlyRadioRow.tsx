"use client";

import { useState } from "react";

export type HourlyRadioRowPerson = {
  id: string;
  name: string;
  inStock?: boolean;
};

export default function HourlyRadioRow({ label, people }: { label: string; people: HourlyRadioRowPerson[] }) {
  const visibleOptions = people;
  const [selected, setSelected] = useState<string[]>([]);

  const toggleOption = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sel) => sel !== id) : [...prev, id]
    );
  };

  return (
    <fieldset aria-label={label}>
      <div className="flex items-center justify-between">
        <div className="text-sm/6 font-medium text-gray-900">{label}</div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-5">
        {visibleOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-label={option.name}
            disabled={option.inStock === false}
            onClick={() => (option.inStock !== false) && toggleOption(option.id)}
            className={
              [
                "group relative flex items-center justify-center rounded-md border p-3 transition-colors",
                option.inStock !== false ? "cursor-pointer bg-white border-gray-300 hover:brand-border" : "bg-gray-200 border-gray-400 opacity-50 cursor-not-allowed",
                selected.includes(option.id) ? "brand-bg text-white border-transparent" : "text-gray-900",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]"
              ].join(" ")
            }
          >
            <span className="text-sm font-medium">
              {option.name}
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
