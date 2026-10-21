import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { readClaimToken } from "@/lib/freelancer/claim-token";
import {
  assertSameOrigin,
  getClientIp,
  pseudonymizeIp,
  readJsonWithLimit,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ClaimSchema = z
  .object({
    token: z.string().trim().min(1).max(200),
    consent: z.literal(true),
    consentSearchIndex: z.boolean().default(false),
    consentMarketStats: z.boolean().default(false),
  })
  .strict();

function failure(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Ein vom Betreiber angelegtes Profil mit dem eigenen Konto übernehmen
 * (lib/freelancer/claim-token.ts).
 *
 * Nur mit bestätigter Adresse, nur solange das Profil niemandem gehört und
 * nur, wenn das Konto noch kein Profil hat. `owner_user_id is null` in der
 * Bedingung ist die Sperre gegen ein zweites Übernehmen im selben Moment.
 */
export async function POST(request: Request) {
  const traceId = randomUUID();
  try {
    assertSameOrigin(request);
    const parsed = ClaimSchema.safeParse(await readJsonWithLimit(request, 2_000));
    if (!parsed.success) return failure(400, "Bitte stimmen Sie den AGB zu.");

    const user = await requireCurrentUser();
    if (user.isAnonymous || !user.email) return failure(401, "Bitte melden Sie sich zuerst an.");

    const limit = await consumeRateLimit(`profile-claim:${pseudonymizeIp(getClientIp(request))}`, 10, 60 * 60_000);
    if (!limit.allowed) return failure(429, "Zu viele Versuche. Bitte später erneut versuchen.");

    const profileId = readClaimToken(parsed.data.token);
    if (!profileId) return failure(400, "Der Link ist ungültig oder abgelaufen. Bitte schreiben Sie uns, wir schicken einen neuen.");

    const admin = createAdminSupabaseClient();
    const { data: account } = await admin.auth.admin.getUserById(user.id);
    if (!account.user?.email_confirmed_at) return failure(403, "Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.");

    const own = await admin
      .from("freelancer_profiles")
      .select("id", { head: true, count: "exact" })
      .eq("owner_user_id", user.id);
    if (own.error) throw own.error;
    if ((own.count ?? 0) > 0) return failure(409, "Ihr Konto hat bereits ein Profil. Bitte schreiben Sie uns, wir führen beide zusammen.");

    const { data: claimed, error } = await admin
      .from("freelancer_profiles")
      .update({
        owner_user_id: user.id,
        consent_search_index: parsed.data.consentSearchIndex,
        consent_market_stats: parsed.data.consentMarketStats,
      })
      .eq("id", profileId)
      .is("owner_user_id", null)
      .select("id");
    if (error) throw error;
    if (!claimed?.length) return failure(409, "Dieses Profil wurde bereits übernommen.");

    await writeAuditEvent({
      actorUserId: user.id,
      action: "freelancer_profile_claimed",
      targetType: "freelancer_profile",
      targetId: profileId,
      outcome: "success",
      traceId,
      metadata: {
        consentSearchIndex: parsed.data.consentSearchIndex,
        consentMarketStats: parsed.data.consentMarketStats,
      },
    });

    return NextResponse.json({ status: "claimed" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    await writeAuditEvent({
      actorUserId: null,
      action: "freelancer_profile_claim_failed",
      targetType: "freelancer_profile",
      outcome: "failed",
      traceId,
    }).catch(() => undefined);
    return failure(503, "Das Profil konnte gerade nicht übernommen werden. Bitte erneut versuchen.");
  }
}
