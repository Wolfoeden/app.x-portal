"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { Card, cockpitStyles as styles } from "@/components/admin/Cockpit";
import { appPath } from "@/lib/app-path";
import {
  LINK_KINDS,
  LINK_LABELS,
  MAX_LINKS,
  MAX_PROJECTS,
  PROJECT_LIMITS,
  type LinkKind,
  type ProfileLink,
  type ProfileProject,
  type ProjectSource,
} from "@/lib/profile/project-limits";

const SOURCE_LABELS: Readonly<Record<ProjectSource, string>> = {
  operator: "Betreiber",
  freelancer: "Freelancer",
  application: "Bewerbung",
  research: "Online-Recherche",
};

const EMPTY_PROJECT: ProfileProject = {
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

type Feedback = { tone: "error" | "success"; text: string } | null;

function useSave() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function send(path: string, method: "PUT" | "PATCH", body: unknown, success: string): Promise<boolean> {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(appPath(path), {
        method,
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setFeedback({ tone: "error", text: payload.error ?? `Fehler ${response.status}.` });
        return false;
      }
      setFeedback({ tone: "success", text: success });
      startTransition(() => router.refresh());
      return true;
    } catch {
      setFeedback({ tone: "error", text: "Die Verbindung ist abgebrochen." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, feedback, send };
}

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return feedback.tone === "error" ? (
    <p className={styles.error} role="alert">{feedback.text}</p>
  ) : (
    <p className={styles.success} role="status">{feedback.text}</p>
  );
}

function TextField({
  label,
  value,
  onChange,
  max,
  placeholder,
  type = "text",
}: {
  label: ReactNode;
  value: string | null;
  onChange: (value: string | null) => void;
  max?: number;
  placeholder?: string;
  type?: "text" | "url" | "month";
}) {
  return (
    <label className={styles.field}>
      {label}
      <input
        className={styles.input}
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
  onChange,
  onMove,
  onRemove,
}: {
  project: ProfileProject;
  index: number;
  count: number;
  onChange: (next: ProfileProject) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const set = <K extends keyof ProfileProject>(key: K, value: ProfileProject[K]) => onChange({ ...project, [key]: value });
  const proposal = project.source === "research" && !project.isPublic;
  return (
    <fieldset style={{ display: "grid", gap: 8, minWidth: 0, border: "1px solid var(--border)", borderRadius: 10, padding: 12, margin: 0 }}>
      <legend className={styles.tileLabel} style={{ padding: "0 4px" }}>
        Projekt {index + 1}
        {proposal ? " · Vorschlag aus der Recherche, noch unsichtbar" : ""}
      </legend>
      {proposal ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {project.sourceUrl ? (
            <a className={styles.textLink} href={project.sourceUrl} target="_blank" rel="noopener noreferrer">
              Quelle prüfen ↗
            </a>
          ) : null}
          <button type="button" className={styles.buttonPrimary} onClick={() => set("isPublic", true)}>
            Übernehmen
          </button>
          <button type="button" className={styles.button} onClick={onRemove}>
            Verwerfen
          </button>
        </div>
      ) : null}
      <TextField label="Titel" value={project.title} max={PROJECT_LIMITS.title} onChange={(value) => set("title", value ?? "")} placeholder="Service-Agent für Schadenmeldungen" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <TextField label="Rolle" value={project.role} max={PROJECT_LIMITS.role} onChange={(value) => set("role", value)} placeholder="Lead Developer" />
        <TextField label="Branche" value={project.industry} max={PROJECT_LIMITS.industry} onChange={(value) => set("industry", value)} placeholder="Versicherungen" />
      </div>
      <TextField
        label="Kunde (nur, wenn genannt werden darf)"
        value={project.client}
        max={PROJECT_LIMITS.client}
        onChange={(value) => set("client", value)}
        placeholder="Versicherer, 4.000 Mitarbeitende"
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
        <TextField label="Beginn" type="month" value={project.startedOn} onChange={(value) => set("startedOn", value)} />
        <TextField label="Ende" type="month" value={project.ongoing ? null : project.endedOn} onChange={(value) => set("endedOn", value)} />
        <label className={styles.field} style={{ flexDirection: "row", display: "flex", gap: 6, alignItems: "center", minHeight: 34 }}>
          <input
            type="checkbox"
            checked={project.ongoing}
            onChange={(event) => onChange({ ...project, ongoing: event.target.checked, endedOn: event.target.checked ? null : project.endedOn })}
          />
          laufend
        </label>
      </div>
      <TextField
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
      <label className={styles.field}>
        Ergebnis (ein, zwei Sätze)
        <textarea
          className={styles.textarea}
          style={{ minHeight: 64 }}
          maxLength={PROJECT_LIMITS.outcome}
          value={project.outcome ?? ""}
          onChange={(event) => set("outcome", event.target.value.trim() ? event.target.value : null)}
        />
      </label>
      <TextField label="Link zum Projekt (optional, https)" type="url" value={project.link} max={PROJECT_LIMITS.url} onChange={(value) => set("link", value)} />
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8, alignItems: "end" }}>
        <label className={styles.field}>
          Quelle
          <select className={styles.select} value={project.source} onChange={(event) => set("source", event.target.value as ProjectSource)}>
            {(Object.keys(SOURCE_LABELS) as ProjectSource[]).map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABELS[source]}
              </option>
            ))}
          </select>
        </label>
        {project.source === "research" ? (
          <TextField label="Quelle (https)" type="url" value={project.sourceUrl} max={PROJECT_LIMITS.url} onChange={(value) => set("sourceUrl", value)} />
        ) : (
          <span />
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={project.isPublic} onChange={(event) => set("isPublic", event.target.checked)} />
          öffentlich
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }} title="Nur setzen, wenn ein Nachweis vorliegt (Lebenslauf, Referenz, Gespräch).">
          <input type="checkbox" checked={project.verified} onChange={(event) => set("verified", event.target.checked)} />
          von XPORTAL geprüft
        </label>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button type="button" className={styles.button} disabled={index === 0} onClick={() => onMove(-1)} aria-label="Nach oben">
            ↑
          </button>
          <button type="button" className={styles.button} disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Nach unten">
            ↓
          </button>
          {proposal ? null : (
            <button type="button" className={styles.buttonDanger} onClick={onRemove}>
              Entfernen
            </button>
          )}
        </span>
      </div>
    </fieldset>
  );
}

/**
 * Der Editor auf der Pflegeseite eines Profils. Jeder Abschnitt speichert
 * für sich; danach lädt die Seite neu und die Vorschau links zeigt den Stand.
 */
export function ProfileEditor({
  profileId,
  initialProjects,
  initialLinks,
  initialReferences,
  status,
  projectsAvailable,
  referencesPublic,
}: {
  profileId: string;
  initialProjects: ProfileProject[];
  initialLinks: ProfileLink[];
  initialReferences: string | null;
  status: string;
  projectsAvailable: boolean;
  referencesPublic: boolean;
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [links, setLinks] = useState(initialLinks);
  const [references, setReferences] = useState(initialReferences ?? "");
  const projectSave = useSave();
  const linkSave = useSave();
  const referenceSave = useSave();
  const statusSave = useSave();
  const base = `/api/admin/freelancer-profiles/${profileId}`;

  const move = (index: number, direction: -1 | 1) =>
    setProjects((current) => {
      const next = [...current];
      const [entry] = next.splice(index, 1);
      next.splice(index + direction, 0, entry!);
      return next;
    });

  return (
    <>
      <Card title={`Referenzprojekte (${projects.length} von ${MAX_PROJECTS})`}>
        <div className={styles.cardBody} style={{ display: "grid", gap: 10 }}>
          {projectsAvailable ? null : (
            <p className={styles.error}>Die Migration 20261006090000_referenzprojekte fehlt noch; Speichern geht erst danach.</p>
          )}
          {projects.map((project, index) => (
            <ProjectFields
              key={index}
              project={project}
              index={index}
              count={projects.length}
              onChange={(next) => setProjects((current) => current.map((entry, position) => (position === index ? next : entry)))}
              onMove={(direction) => move(index, direction)}
              onRemove={() => setProjects((current) => current.filter((_, position) => position !== index))}
            />
          ))}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className={styles.button}
              disabled={projects.length >= MAX_PROJECTS}
              onClick={() => setProjects((current) => [...current, { ...EMPTY_PROJECT }])}
            >
              Projekt hinzufügen
            </button>
            <button
              type="button"
              className={styles.buttonPrimary}
              disabled={projectSave.busy || !projectsAvailable}
              onClick={() => void projectSave.send(`${base}/projects`, "PUT", { projects }, "Projekte gespeichert.")}
            >
              Projekte speichern
            </button>
          </div>
          <FeedbackLine feedback={projectSave.feedback} />
          <p className={styles.cardNote}>
            Kundennamen nur, wenn sie genannt werden dürfen; sonst Branche und Größe. „Geprüft“ nur mit Nachweis.
          </p>
        </div>
      </Card>

      <Card title={`Links (${links.length} von ${MAX_LINKS})`}>
        <div className={styles.cardBody} style={{ display: "grid", gap: 8 }}>
          {links.map((link, index) => (
            <div key={index} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "end" }}>
              <label className={styles.field}>
                Art
                <select
                  className={styles.select}
                  value={link.kind}
                  onChange={(event) =>
                    setLinks((current) => current.map((entry, position) => (position === index ? { ...entry, kind: event.target.value as LinkKind } : entry)))
                  }
                >
                  {LINK_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {LINK_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </label>
              <TextField
                label="Adresse (https)"
                type="url"
                value={link.url}
                max={PROJECT_LIMITS.url}
                onChange={(value) => setLinks((current) => current.map((entry, position) => (position === index ? { ...entry, url: value ?? "" } : entry)))}
              />
              <button type="button" className={styles.buttonDanger} onClick={() => setLinks((current) => current.filter((_, position) => position !== index))}>
                Entfernen
              </button>
            </div>
          ))}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className={styles.button}
              disabled={links.length >= MAX_LINKS}
              onClick={() => setLinks((current) => [...current, { kind: "linkedin", url: "" }])}
            >
              Link hinzufügen
            </button>
            <button
              type="button"
              className={styles.buttonPrimary}
              disabled={linkSave.busy || !projectsAvailable}
              onClick={() => void linkSave.send(base, "PATCH", { links: links.filter((link) => link.url.trim()) }, "Links gespeichert.")}
            >
              Links speichern
            </button>
          </div>
          <FeedbackLine feedback={linkSave.feedback} />
        </div>
      </Card>

      <Card title="Referenznotiz">
        <div className={styles.cardBody} style={{ display: "grid", gap: 8 }}>
          <textarea className={styles.textarea} maxLength={2000} value={references} onChange={(event) => setReferences(event.target.value)} />
          <p className={styles.cardNote}>
            {referencesPublic
              ? "Öffentlich sichtbar auf Karte und Profil."
              : "Noch nicht öffentlich: Sichtbar erst mit PROFILE_REFERENCES_VISIBLE=true, nachdem alle Notizen auf Kundennamen geprüft sind."}
          </p>
          <div>
            <button
              type="button"
              className={styles.buttonPrimary}
              disabled={referenceSave.busy}
              onClick={() => void referenceSave.send(base, "PATCH", { referencesSummary: references }, "Notiz gespeichert.")}
            >
              Notiz speichern
            </button>
          </div>
          <FeedbackLine feedback={referenceSave.feedback} />
        </div>
      </Card>

      <Card title="Sichtbarkeit">
        <div className={styles.cardBody} style={{ display: "grid", gap: 8 }}>
          <p className={styles.cardNote}>
            {status === "active"
              ? "Das Profil erscheint in Suche, Shortcuts und unter seinem Link."
              : "Das Profil ist pausiert: nicht in der Suche, der Link zeigt „nicht verfügbar“."}
          </p>
          <div>
            {status === "active" ? (
              <button
                type="button"
                className={styles.buttonDanger}
                disabled={statusSave.busy}
                onClick={() => {
                  if (window.confirm("Profil pausieren? Es verschwindet aus Suche und Shortcuts, bis es wieder aktiviert wird.")) {
                    void statusSave.send(base, "PATCH", { status: "paused" }, "Profil pausiert.");
                  }
                }}
              >
                Profil pausieren
              </button>
            ) : (
              <button type="button" className={styles.buttonPrimary} disabled={statusSave.busy} onClick={() => void statusSave.send(base, "PATCH", { status: "active" }, "Profil wieder aktiv.")}>
                Wieder aktivieren
              </button>
            )}
          </div>
          <FeedbackLine feedback={statusSave.feedback} />
        </div>
      </Card>
    </>
  );
}
