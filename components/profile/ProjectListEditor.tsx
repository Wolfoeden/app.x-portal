"use client";

import type { CSSProperties, ReactNode } from "react";

import {
  MAX_PROJECTS,
  PROJECT_LIMITS,
  type ProfileProject,
  type ProjectSource,
} from "@/lib/profile/project-limits";

/**
 * Referenzprojekte bearbeiten — im Admin (alle Felder, „geprüft“, Quelle,
 * Vorschläge aus der Recherche) und für Freelancer selbst im Dashboard und in
 * der Bewerbung (ohne „geprüft“ und Quelle). Gespeichert wird außerhalb; die
 * Komponente hält nur die Liste.
 */

export type ProjectEditorClasses = {
  field: string;
  input: string;
  textarea: string;
  select: string;
  button: string;
  buttonPrimary: string;
  buttonDanger: string;
  textLink: string;
  note: string;
};

export const EMPTY_PROJECT: ProfileProject = {
  title: "",
  client: null,
  industry: null,
  role: null,
  startedOn: null,
  endedOn: null,
  ongoing: false,
  technologies: [],
  outcome: null,
  link: null,
  isPublic: true,
  verified: false,
  source: "operator",
  sourceUrl: null,
};

const SOURCE_LABELS: Readonly<Record<ProjectSource, string>> = {
  operator: "Betreiber",
  freelancer: "Freelancer",
  application: "Bewerbung",
  research: "Online-Recherche",
};

const row = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8 } as const;
const monthField = { flex: "1 1 130px", minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" } as const;

function TextField({
  classes,
  label,
  value,
  onChange,
  max,
  placeholder,
  type = "text",
  style,
}: {
  classes: ProjectEditorClasses;
  label: ReactNode;
  value: string | null;
  onChange: (value: string | null) => void;
  max?: number;
  placeholder?: string;
  type?: "text" | "url" | "month";
  style?: CSSProperties;
}) {
  return (
    <label className={classes.field} style={style}>
      <span>{label}</span>
      <input
        className={classes.input}
        type={type}
        value={value ?? ""}
        maxLength={max}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value.trim() ? event.target.value : null)}
      />
    </label>
  );
}

function ProjectFields({
  project,
  index,
  count,
  mode,
  classes,
  onChange,
  onMove,
  onRemove,
}: {
  project: ProfileProject;
  index: number;
  count: number;
  mode: "admin" | "owner";
  classes: ProjectEditorClasses;
  onChange: (next: ProfileProject) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const set = <K extends keyof ProfileProject>(key: K, value: ProfileProject[K]) => onChange({ ...project, [key]: value });
  const proposal = mode === "admin" && project.source === "research" && !project.isPublic;
  return (
    <fieldset style={{ display: "grid", gap: 8, minWidth: 0, border: "1px solid var(--border)", borderRadius: 10, padding: 12, margin: 0 }}>
      <legend style={{ padding: "0 4px", fontSize: "var(--fs-2xs)", fontWeight: 650, color: "var(--muted)" }}>
        Projekt {index + 1}
        {proposal ? " · Vorschlag aus der Recherche, noch unsichtbar" : ""}
        {mode === "owner" && project.verified ? " · von XPORTAL geprüft" : ""}
      </legend>
      {proposal ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {project.sourceUrl ? (
            <a className={classes.textLink} href={project.sourceUrl} target="_blank" rel="noopener noreferrer">
              Quelle prüfen ↗
            </a>
          ) : null}
          <button type="button" className={classes.buttonPrimary} onClick={() => set("isPublic", true)}>
            Übernehmen
          </button>
          <button type="button" className={classes.button} onClick={onRemove}>
            Verwerfen
          </button>
        </div>
      ) : null}
      <TextField classes={classes} label="Titel" value={project.title} max={PROJECT_LIMITS.title} onChange={(value) => set("title", value ?? "")} placeholder="Service-Agent für Schadenmeldungen" />
      <div style={row}>
        <TextField classes={classes} label="Ihre Rolle" value={project.role} max={PROJECT_LIMITS.role} onChange={(value) => set("role", value)} placeholder="Lead Developer" />
        <TextField classes={classes} label="Branche" value={project.industry} max={PROJECT_LIMITS.industry} onChange={(value) => set("industry", value)} placeholder="Versicherungen" />
      </div>
      <TextField
        classes={classes}
        label="Kunde (nur, wenn er genannt werden darf)"
        value={project.client}
        max={PROJECT_LIMITS.client}
        onChange={(value) => set("client", value)}
        placeholder="Versicherer, 4.000 Mitarbeitende"
      />
      {/* Monatsfelder sind breit; auf dem Handy rutscht „laufend“ in die nächste Zeile. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
        <TextField classes={classes} label="Beginn" type="month" value={project.startedOn} onChange={(value) => set("startedOn", value)} style={monthField} />
        <TextField
          classes={classes}
          label="Ende"
          type="month"
          value={project.ongoing ? null : project.endedOn}
          onChange={(value) => set("endedOn", value)}
          style={monthField}
        />
        <label style={{ display: "flex", gap: 6, alignItems: "center", minHeight: 34 }}>
          <input
            type="checkbox"
            checked={project.ongoing}
            onChange={(event) => onChange({ ...project, ongoing: event.target.checked, endedOn: event.target.checked ? null : project.endedOn })}
          />
          laufend
        </label>
      </div>
      <TextField
        classes={classes}
        label="Technologien (mit Komma getrennt)"
        value={project.technologies.join(", ")}
        onChange={(value) =>
          set(
            "technologies",
            (value ?? "")
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean),
          )
        }
        placeholder="LangChain, Azure OpenAI, Python"
      />
      <label className={classes.field}>
        <span>Ergebnis (ein, zwei Sätze)</span>
        <textarea
          className={classes.textarea}
          style={{ minHeight: 64 }}
          maxLength={PROJECT_LIMITS.outcome}
          value={project.outcome ?? ""}
          placeholder="Was hat das Projekt erreicht? Zum Beispiel: Durchlaufzeit halbiert."
          onChange={(event) => set("outcome", event.target.value.trim() ? event.target.value : null)}
        />
      </label>
      <TextField classes={classes} label="Link zum Projekt (optional, https)" type="url" value={project.link} max={PROJECT_LIMITS.url} onChange={(value) => set("link", value)} />
      {mode === "admin" ? (
        <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 8, alignItems: "end" }}>
          <label className={classes.field}>
            <span>Quelle</span>
            <select className={classes.select} value={project.source} onChange={(event) => set("source", event.target.value as ProjectSource)}>
              {(Object.keys(SOURCE_LABELS) as ProjectSource[]).map((source) => (
                <option key={source} value={source}>
                  {SOURCE_LABELS[source]}
                </option>
              ))}
            </select>
          </label>
          {project.source === "research" ? (
            <TextField classes={classes} label="Quelle (https)" type="url" value={project.sourceUrl} max={PROJECT_LIMITS.url} onChange={(value) => set("sourceUrl", value)} />
          ) : (
            <span />
          )}
        </div>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={project.isPublic} onChange={(event) => set("isPublic", event.target.checked)} />
          {mode === "admin" ? "öffentlich" : "im Profil zeigen"}
        </label>
        {mode === "admin" ? (
          <label style={{ display: "flex", gap: 6, alignItems: "center" }} title="Nur setzen, wenn ein Nachweis vorliegt (Lebenslauf, Referenz, Gespräch).">
            <input type="checkbox" checked={project.verified} onChange={(event) => set("verified", event.target.checked)} />
            von XPORTAL geprüft
          </label>
        ) : null}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button type="button" className={classes.button} disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Projekt ${index + 1} nach oben`}>
            ↑
          </button>
          <button type="button" className={classes.button} disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Projekt ${index + 1} nach unten`}>
            ↓
          </button>
          {proposal ? null : (
            <button type="button" className={classes.buttonDanger} onClick={onRemove}>
              Entfernen
            </button>
          )}
        </span>
      </div>
    </fieldset>
  );
}

export function ProjectListEditor({
  projects,
  onChange,
  mode,
  classes,
  max = MAX_PROJECTS,
}: {
  projects: ProfileProject[];
  onChange: (projects: ProfileProject[]) => void;
  mode: "admin" | "owner";
  classes: ProjectEditorClasses;
  max?: number;
}) {
  const move = (index: number, direction: -1 | 1) => {
    const next = [...projects];
    const [entry] = next.splice(index, 1);
    next.splice(index + direction, 0, entry!);
    onChange(next);
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {projects.map((project, index) => (
        <ProjectFields
          key={index}
          project={project}
          index={index}
          count={projects.length}
          mode={mode}
          classes={classes}
          onChange={(next) => onChange(projects.map((entry, position) => (position === index ? next : entry)))}
          onMove={(direction) => move(index, direction)}
          onRemove={() => onChange(projects.filter((_, position) => position !== index))}
        />
      ))}
      <div>
        <button
          type="button"
          className={classes.button}
          disabled={projects.length >= max}
          onClick={() => onChange([...projects, { ...EMPTY_PROJECT, source: mode === "admin" ? "operator" : "freelancer" }])}
        >
          Projekt hinzufügen
        </button>
      </div>
      <p className={classes.note}>
        Kundennamen nur, wenn sie genannt werden dürfen; sonst Branche und Größe.
        {mode === "admin" ? " „Geprüft“ nur mit Nachweis." : " Eine inhaltliche Änderung setzt einen Haken „geprüft“ zurück."}
      </p>
    </div>
  );
}
