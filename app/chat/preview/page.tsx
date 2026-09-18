import { notFound } from "next/navigation";

import { ChatWorkspace } from "@/components/ChatWorkspace";
import {
  previewAnalysis,
  previewAuth,
  previewBrief,
  previewGuestAuth,
  previewMessages,
  previewProfiles,
  previewProjects,
  previewUsage,
  automationBrief,
  automationPartialProfiles,
  automationProfiles,
  automationReplies,
  automationRequest,
  automationStrictBrief,
  automationStrictRequest,
} from "@/components/chat/preview-fixtures";

export const metadata = {
  title: "Chat UI-Vorschau | XPORTAL",
  robots: { index: false, follow: false },
};

/**
 * Die Zustände, die sich sonst nur mit echten Daten herstellen lassen.
 *
 * `no-match` ist der Fall, für den der Katalog nichts hergibt — die Stelle mit
 * der höchsten Absprungrate und deshalb die, die man beim Gestalten sehen
 * muss. Sie im laufenden Betrieb zu erzeugen hieße, ein Projekt zu formulieren,
 * das absichtlich an allen Profilen vorbeigeht. `searching` zeigt denselben
 * Bereich, während der Agent arbeitet.
 *
 * `credits` setzt den Kontostand, um die Knopfzustände durchzuspielen: genug
 * Guthaben und zu wenig (unter dem Preis einer Recherche).
 *
 * `scenario=automation` spielt die Anfrage „KI & Automatisierungen“ durch:
 * `ranked` mit zwei Empfehlungen, `partial` und `no_match` mit n8n als Muss
 * und einer festen Tagessatzgrenze — mit Teiltreffern und ganz ohne.
 */
type PreviewState = "ranked" | "no_match" | "searching" | "empty" | "partial";

const STATES: Readonly<Record<string, PreviewState>> = {
  ranked: "ranked",
  "no-match": "no_match",
  no_match: "no_match",
  searching: "searching",
  empty: "empty",
  partial: "partial",
};

function resultState(value: string | string[] | undefined): PreviewState {
  const key = Array.isArray(value) ? value[0] : value;
  return (key && STATES[key]) || "ranked";
}

function usageFixture(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || !/^\d+$/u.test(raw)) return previewUsage;
  const remaining = Number(raw);
  return {
    credits: {
      ...previewUsage.credits,
      remaining,
      used: Math.max(0, previewUsage.credits.total - remaining),
      exhausted: remaining <= 0,
    },
  };
}

export default async function ChatPreviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = (await searchParams) ?? {};
  const state = resultState(params.state);
  const authParam = Array.isArray(params.auth) ? params.auth[0] : params.auth;
  const automation = params.scenario === "automation";
  const strict = automation && (state === "partial" || state === "no_match");
  const brief = automation ? (strict ? automationStrictBrief : automationBrief) : previewBrief;
  const messages = !automation
    ? previewMessages
    : [
        { id: "preview-request", role: "user" as const, content: strict ? automationStrictRequest : automationRequest },
        {
          id: "preview-result",
          role: "assistant" as const,
          content: state === "partial" ? automationReplies.partial : strict ? automationReplies.noMatch : automationReplies.ranked,
        },
      ];

  return (
    <ChatWorkspace
      previewData={{
        auth: authParam === "guest" ? previewGuestAuth : previewAuth,
        projects: automation
          ? [{ ...previewProjects[0], title: brief.projectTitle }, ...previewProjects.slice(1)]
          : previewProjects,
        messages: state === "empty" ? [] : messages,
        brief,
        profiles: automation ? automationProfiles : previewProfiles,
        partialProfiles: automation && state === "partial" ? automationPartialProfiles : [],
        // Ohne diese Freigabe blendet das Ergebnis den Agenten aus — im leeren
        // Fall wäre die Vorschau dann genau um das ärmer, was sie zeigen soll.
        analysis: {
          ...previewAnalysis,
          externalSearchAvailable: state !== "ranked" && state !== "empty",
        },
        usage: usageFixture(params.credits),
        resultState: state === "empty" ? "ranked" : state === "partial" ? "no_match" : state,
      }}
    />
  );
}
