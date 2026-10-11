import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { admitGuestContact, jsonResponse } from "@/lib/placement/guest-contact";
import { MANDATE_CONFIRMATION, MANDATE_EXISTS, SEARCH_MANDATE_CONSENT_VERSION } from "@/lib/placement/mandate-model";
import { createMandate, openMandateForProject } from "@/lib/placement/mandates";
import { assertSameOrigin, logEvent, readJsonWithLimit } from "@/lib/security/request";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Suchauftrag: „XPORTAL sucht für Sie“, provisionsfrei.
 *
 * Sechs von zehn Suchen fanden im Bestand keinen passenden Freelancer und
 * gingen bisher ohne Adresse. Ein Suchauftrag hält Projekt und Kontakt fest;
 * der Betreiber sucht gezielt und meldet sich innerhalb von 48 Stunden.
 *
 * Immer zu einem analysierten Projekt. Gäste (ältere Projekte aus der Zeit vor
 * der Registrierungspflicht) nennen ihre E-Mail; Honigtopf und Grenze je
 * Adresse teilt die Route mit app/api/introductions über
 * lib/placement/guest-contact.ts.
 */

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((value) => value || null);

const phone = z
  .string()
  .trim()
  .max(40)
  .regex(/^[+0-9 ()/-]*$/u)
  .optional()
  .transform((value) => value || null);

const InputSchema = z
  .object({
    projectId: z.string().uuid(),
    consentVersion: z.literal(SEARCH_MANDATE_CONSENT_VERSION),
    note: optionalText(1000),
    /** Nur ohne Konto Pflicht; mit Konto gilt die Adresse des Kontos. */
    guestContact: z
      .object({
        email: z.string().trim().toLowerCase().max(320).email(),
        company: optionalText(200),
        name: optionalText(120),
        phone,
        /** Honigtopf: Menschen sehen das Feld nicht. */
        website: z.string().max(200).optional(),
      })
      .strict()
      .optional(),
    accountContact: z
      .object({ company: optionalText(200), phone })
      .strict()
      .optional(),
  })
  .strict();

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const projectId = z.string().uuid().parse(new URL(request.url).searchParams.get("projectId"));
    const user = await requireCurrentUser();
    const mandate = await openMandateForProject(projectId, user.id);
    return NextResponse.json({ mandate: mandate ? { ...mandate, message: MANDATE_EXISTS } : null }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Projekt fehlt." }, { status: 400, headers: NO_STORE });
    return NextResponse.json({ mandate: null }, { status: 503, headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = InputSchema.safeParse(await readJsonWithLimit(request, 16_000));
    if (!parsed.success) {
      const consentMissing = parsed.error.issues.some((issue) => issue.path[0] === "consentVersion");
      throw jsonResponse(400, consentMissing
        ? "Bitte bestätigen Sie, dass XPORTAL Sie zu diesem Suchauftrag kontaktieren darf."
        : "Bitte prüfen Sie Ihre Angaben.");
    }
    const input = parsed.data;
    const user = await requireCurrentUser();
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      throw jsonResponse(503, "Der Suchauftrag kann gerade nicht angenommen werden.");
    }

    let contact: { email: string; company: string | null; name: string | null; phone: string | null };
    if (user.isAnonymous) {
      if (!input.guestContact) throw jsonResponse(400, "Bitte geben Sie Ihre E-Mail-Adresse an.");
      const admitted = await admitGuestContact(
        request,
        { ...input.guestContact, company: input.guestContact.company ?? "" },
        user.id,
        "mandate",
      );
      contact = { email: admitted.email, company: admitted.company || null, name: admitted.name, phone: input.guestContact.phone };
    } else {
      if (!user.email) throw jsonResponse(409, "Ihr Konto hat keine E-Mail-Adresse.");
      contact = {
        email: user.email.trim().toLowerCase(),
        company: input.accountContact?.company ?? null,
        name: null,
        phone: input.accountContact?.phone ?? null,
      };
    }

    const result = await createMandate({
      userId: user.id,
      isGuest: user.isAnonymous,
      projectId: input.projectId,
      contact,
      note: input.note,
      siteUrl: SITE_URL,
    });
    return NextResponse.json(
      result.created
        ? { created: true, mandate: result.mandate, message: MANDATE_CONFIRMATION }
        : { created: false, mandate: result.mandate, message: result.message },
      { status: result.created ? 201 : 200, headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    logEvent("search_mandate_failed", { reason: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Der Suchauftrag konnte gerade nicht gesendet werden. Bitte versuchen Sie es erneut." }, { status: 503, headers: NO_STORE });
  }
}
