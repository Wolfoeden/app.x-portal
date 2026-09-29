import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/styles/legal.css";

import {
  PublicDocumentIntro,
  PublicFooter,
  PublicHeader,
} from "@/components/public/PublicChrome";
import { placementRequestsEnabled } from "@/lib/placement/config";
import { describeAnswerRequest } from "@/lib/placement/engagements";
import { isPlacementOutcome } from "@/lib/placement/follow-up-rules";

import { AnswerForm } from "./AnswerForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kurze Rückmeldung | XPORTAL",
  robots: { index: false, follow: false },
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Wohin die Links der Nachfrage-Mail führen. Die Seite zeigt, worum es geht,
 * und speichert erst nach einem Klick; siehe `lib/placement/answer-token.ts`.
 */
export default async function PlacementAnswerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!placementRequestsEnabled()) notFound();
  const params = await searchParams;
  const token = first(params.t) ?? "";
  const preselected = first(params.a);
  const request = token ? await describeAnswerRequest(token).catch(() => null) : null;

  return (
    <div className="xlegal" lang="de">
      <PublicHeader context="Kurze Rückmeldung" />
      <main className="xlegal-document xlegal-document-compact">
        {request ? (
          <>
            <PublicDocumentIntro
              eyebrow="Vermittlung über XPORTAL"
              title={
                request.role === "client"
                  ? `Wie ging es mit ${request.freelancerName} weiter?`
                  : "Wie ging es mit der Anfrage weiter?"
              }
              signal={{ label: "Projekt", value: request.projectTitle ?? "Ihre Anfrage" }}
            >
              <p>Eine Antwort genügt. Sie hilft uns, Sie und andere besser zu vermitteln.</p>
            </PublicDocumentIntro>
            <AnswerForm
              token={token}
              role={request.role}
              preselected={isPlacementOutcome(preselected) ? preselected : request.outcome}
            />
          </>
        ) : (
          <PublicDocumentIntro
            eyebrow="Vermittlung über XPORTAL"
            title="Dieser Link ist nicht mehr gültig."
            signal={{ label: "Status", value: "Link ungültig" }}
          >
            <p>Antworten Sie einfach auf unsere E-Mail; das kommt genauso an.</p>
          </PublicDocumentIntro>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
