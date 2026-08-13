"use client";

import { useState } from "react";

import styles from "./usage.module.css";

type ProviderTransport =
  | "unconfigured"
  | "direct_openai"
  | "netlify_ai_gateway"
  | "custom_gateway";

type DiagnosticStatus =
  | "unconfigured"
  | "auth_error"
  | "billing_or_quota"
  | "rate_limit"
  | "permission"
  | "model_unavailable"
  | "reachable"
  | "timeout"
  | "provider_error";

type DiagnosticResult = {
  configured: boolean;
  transport: ProviderTransport;
  requestedModel: string;
  status: DiagnosticStatus;
  httpStatus?: number;
  requestId?: string;
};

const transports: Record<ProviderTransport, string> = {
  unconfigured: "Nicht konfiguriert",
  direct_openai: "Direkte OpenAI API",
  netlify_ai_gateway: "Netlify AI Gateway",
  custom_gateway: "Eigener AI-Gateway",
};

const statuses: Record<DiagnosticStatus, { label: string; detail: string }> = {
  unconfigured: {
    label: "Nicht konfiguriert",
    detail: "Auf dem Server ist kein nutzbarer OPENAI_API_KEY vorhanden.",
  },
  auth_error: {
    label: "Schl?ssel abgelehnt",
    detail: "OpenAI hat die Authentifizierung des API-Schl?ssels abgelehnt.",
  },
  billing_or_quota: {
    label: "Billing oder Quota blockiert",
    detail: "OpenAI blockiert die Anfrage wegen API-Guthaben, Billing oder Quota.",
  },
  rate_limit: {
    label: "Anfragelimit erreicht",
    detail: "OpenAI hat die Anfrage wegen des aktuellen RPM- oder TPM-Limits abgelehnt.",
  },
  permission: {
    label: "Keine Berechtigung",
    detail: "Der Schl?ssel hat f?r dieses Modell nicht die n?tige Berechtigung.",
  },
  model_unavailable: {
    label: "Modell nicht verf?gbar",
    detail: "Das konfigurierte Modell ist f?r dieses OpenAI-Projekt nicht verf?gbar.",
  },
  reachable: {
    label: "Schl?ssel und Modell erreichbar",
    detail:
      "Der Metadaten-Endpunkt antwortet. Das beweist die Verbindung, aber noch keine bezahlte Textgenerierung.",
  },
  timeout: {
    label: "Zeit?berschreitung",
    detail: "Der OpenAI-Metadaten-Endpunkt hat nicht rechtzeitig geantwortet.",
  },
  provider_error: {
    label: "Providerfehler",
    detail: "Die Verbindung konnte nicht eindeutig best?tigt werden.",
  },
};

const knownStatuses = new Set<DiagnosticStatus>(Object.keys(statuses) as DiagnosticStatus[]);
const knownTransports = new Set<ProviderTransport>(
  Object.keys(transports) as ProviderTransport[],
);

function parseDiagnostic(value: unknown): DiagnosticResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.configured !== "boolean" ||
    typeof record.transport !== "string" ||
    !knownTransports.has(record.transport as ProviderTransport) ||
    typeof record.requestedModel !== "string" ||
    typeof record.status !== "string" ||
    !knownStatuses.has(record.status as DiagnosticStatus)
  ) {
    return null;
  }
  return {
    configured: record.configured,
    transport: record.transport as ProviderTransport,
    requestedModel: record.requestedModel,
    status: record.status as DiagnosticStatus,
    ...(typeof record.httpStatus === "number"
      ? { httpStatus: record.httpStatus }
      : {}),
    ...(typeof record.requestId === "string"
      ? { requestId: record.requestId }
      : {}),
  };
}

export function ProviderDiagnosticPanel({
  initialTransport,
  requestedModel,
}: {
  initialTransport: ProviderTransport;
  requestedModel: string;
}) {
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function runDiagnostic() {
    setPending(true);
    setLocalError(null);
    try {
      const response = await fetch("/api/admin/ai-provider", {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (response.status === 401 || response.status === 403) {
        setLocalError("Admin-Sitzung abgelaufen. Bitte abmelden und erneut anmelden.");
        return;
      }
      const parsed = parseDiagnostic(await response.json());
      if (!parsed) {
        setLocalError("Die Diagnose lieferte keine auswertbare Antwort.");
        return;
      }
      setDiagnostic(parsed);
    } catch {
      setLocalError("Die Diagnose konnte nicht geladen werden.");
    } finally {
      setPending(false);
    }
  }

  const transport = diagnostic?.transport ?? initialTransport;
  const model = diagnostic?.requestedModel ?? requestedModel;
  const statusCopy = diagnostic ? statuses[diagnostic.status] : null;

  return (
    <section className={styles.providerPanel} aria-labelledby="provider-status-title">
      <div>
        <p className={styles.eyebrow}>OPENAI PROVIDER</p>
        <h2 id="provider-status-title">Verbindung und Modell</h2>
        <p>
          {statusCopy?.detail ??
            "Die Pr?fung liest nur Modell-Metadaten. Sie sendet keinen Prompt und verbraucht keine Modell-Tokens."}
        </p>
        {localError ? <p className={styles.providerError}>{localError}</p> : null}
      </div>
      <dl>
        <div>
          <dt>Transport</dt>
          <dd>{transports[transport]}</dd>
        </div>
        <div>
          <dt>Modell</dt>
          <dd><code>{model}</code></dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{statusCopy?.label ?? "Noch nicht gepr?ft"}</dd>
        </div>
        {diagnostic?.requestId ? (
          <div>
            <dt>OpenAI Request-ID</dt>
            <dd><code>{diagnostic.requestId}</code></dd>
          </div>
        ) : null}
      </dl>
      <button type="button" onClick={runDiagnostic} disabled={pending}>
        {pending ? "Pr?fung l?uft ?" : "Verbindung ohne Tokenverbrauch pr?fen"}
      </button>
    </section>
  );
}
