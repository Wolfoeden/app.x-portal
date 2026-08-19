"use client";

import { useId, useState } from "react";

export type TagInputClasses = {
  field: string;
  tagBox: string;
  tag: string;
  hint: string;
  optional?: string;
};

/**
 * Chip input for skills, languages, qualifications and industries.
 *
 * Colons are stripped on entry: a catalogue fact is stored as
 * `"Skill: React"`, so a value containing its own colon would be read back as
 * a different category (see `lib/freelancer/facts.ts`).
 */
export function TagInput({
  label,
  hint,
  placeholder,
  values,
  max,
  required,
  onChange,
  classes,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  values: string[];
  max: number;
  required?: boolean;
  onChange: (next: string[]) => void;
  classes: TagInputClasses;
}) {
  const [draft, setDraft] = useState("");
  const inputId = useId();

  function commit(raw: string) {
    const additions = raw
      .split(",")
      .map((value) => value.replace(/:/gu, " ").trim())
      .filter(Boolean);
    if (!additions.length) return;

    const next = [...values];
    for (const addition of additions) {
      const duplicate = next.some(
        (value) =>
          value.toLocaleLowerCase("de-DE") ===
          addition.toLocaleLowerCase("de-DE"),
      );
      if (!duplicate && next.length < max) next.push(addition);
    }
    onChange(next);
    setDraft("");
  }

  return (
    <div className={classes.field}>
      <label htmlFor={inputId}>
        {label}
        {required ? null : (
          <span className={classes.optional}> · optional</span>
        )}
      </label>
      <div className={classes.tagBox}>
        {values.map((value) => (
          <span key={value} className={classes.tag}>
            {value}
            <button
              type="button"
              onClick={() => onChange(values.filter((entry) => entry !== value))}
              aria-label={`${value} entfernen`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={inputId}
          value={draft}
          placeholder={values.length >= max ? "Maximum erreicht" : placeholder}
          disabled={values.length >= max}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commit(draft);
            }
            if (event.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
        />
      </div>
      <span className={classes.hint}>
        {hint ? `${hint} · ` : ""}Mit Enter oder Komma bestätigen ·{" "}
        {values.length}/{max}
      </span>
    </div>
  );
}
