import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { PLACEMENT_TERMS, placementRequestsEnabled } from "@/lib/placement/config";
import { GuestContactSchema, admitGuestContact, jsonResponse } from "@/lib/placement/guest-contact";
import { MANDATE_CONFIRMATION, MANDATE_EXISTS } from "@/lib/placement/mandate-model";
import { createMandate, openMandateForProject } from "@/lib/placement/mandates";
import { assertSameOrigin, logEvent, readJsonWithLimit } from "@/lib/security/request";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Suchauftrag: „XPORTAL sucht für Sie“.
 *
 * Wer ein Ergebnis gesehen hat, beauftragt XPORTAL, passende Freelancer
 * persönlich vorzustellen — auch ohne Konto. Wie bei einer Anfrage aus der
 * Ergebnisliste gilt: ohne Zustimmung zur aktuellen Fassung der
 * Vermittlungsbedingungen kein Auftrag, und Gäste nennen E-Mail und Firma.
 * Die Prüfungen für Gäste (Honigtopf, Grenze je Adresse) teilt die Route mit
 * app/api/introductions über lib/placement/guest-contact.ts.
 */

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
    placementTermsVersion: z.string().trim().min(1).max(80),
    note: z.string().trim().max(1000).optional().transform((value) => value || null),
    /** Nur ohne Konto Pflicht; mit Konto gilt die Adresse des Kontos. */
    guestContact: GuestContactSchema.extend({ phone }).optional(),
    /** Mit Konto: was zusätzlich hilft. */
    accountContact: z
      .object({
        company: z.string().trim().max(200).optional().transform((value) => value || null),
        name: z.string().trim().max(120).optional().transform((value) => value || null),
        phone,
      })
      .strict()
      .optional(),
  })
  .strict();

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  if (!placementRequestsEnabled()) return new Response(null, { status: 404 });
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
    if (!placementRequestsEnabled()) return new Response(null, { status: 404 });
    const input = InputSchema.parse(await readJsonWithLimit(request, 6_000));
    const user = await requireCurrentUser();
    if (input.placementTermsVersion !== PLACEMENT_TERMS.version) {
      throw jsonResponse(409, "Bitte stimmen Sie den Vermittlungsbedingungen zu.");
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      throw jsonResponse(503, "Der Suchauftrag kann gerade nicht angenommen werden.");
    }

    let contact: { email: string; company: string | null; name: string | null; phone: string | null };
    if (user.isAnonymous) {
      if (!input.guestContact) throw jsonResponse(400, "Bitte geben Sie Ihre E-Mail-Adresse und Ihre Firma an.");
      const admitted = await admitGuestContact(request, input.guestContact, user.id, "mandate");
      contact = { ...admitted, phone: input.guestContact.phone };
    } else {
      if (!user.email) throw jsonResponse(409, "Ihr Konto hat keine E-Mail-Adresse.");
      contact = {
        email: user.email.trim().toLowerCase(),
        company: input.accountContact?.company ?? null,
        name: input.accountContact?.name ?? null,
        phone: input.accountContact?.phone ?? null,
      };
    }

    const result = await createMandate({
      userId: user.id,
      isGuest: Boolean(user.isAnonymous),
      projectId: input.projectId,
      contact,
      note: input.note,
      siteUrl: SITE_URL,
    });
    return NextResponse.json(
      {
        mandate: result.mandate,
        created: result.created,
        message: result.created ? MANDATE_CONFIRMATION : result.message,
      },
      { status: result.created ? 201 : 200, headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof NextResponse) return error;
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Bitte prüfen Sie Ihre Angaben." }, { status: 400, headers: NO_STORE });
    }
    logEvent("search_mandate_failed", { reason: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
    return NextResponse.json(
      { error: "Der Suchauftrag konnte gerade nicht gespeichert werden. Bitte versuchen Sie es gleich noch einmal." },
      { status: 500, headers: NO_STORE },
    );
  }
}
