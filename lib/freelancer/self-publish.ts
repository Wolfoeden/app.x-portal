import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { deliverEmail } from "@/lib/email/deliver";
import { profileUrl } from "@/lib/profile/profile-link";
import { logEvent } from "@/lib/security/request";
import { absoluteUrl, SITE_URL } from "@/lib/seo";

import { applicationReceivedMessage, profileLiveMessage } from "./application-mails";
import { getApplication, publishApplication } from "./applications-data";
import {
  AUTO_PUBLISH_BLOCKER_TEXT,
  autoPublishDecision,
  type AutoPublishBlocker,
} from "./auto-publish";

export type SelfPublishResult =
  | { status: "published"; profileId: string }
  | { status: "received"; blockers: AutoPublishBlocker[] };

/** `%`, `_` und `\` stehen in einem Namen für sich, nicht als Muster. */
function literalPattern(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

/**
 * Ein Profil dieses Kontos oder eines mit demselben Namen. Der zweite Fall
 * trifft die 62 Profile, die das Team angelegt hat: Meldet sich eine dieser
 * Personen selbst an, ordnet das Team zu, statt dass sie doppelt im Katalog
 * steht.
 */
async function catalogueHasDuplicate(admin: SupabaseClient, userId: string, fullName: string): Promise<boolean> {
  const [own, named] = await Promise.all([
    admin.from("freelancer_profiles").select("id", { head: true, count: "exact" }).eq("owner_user_id", userId),
    admin.from("freelancer_profiles").select("id", { head: true, count: "exact" }).ilike("display_name", literalPattern(fullName.trim())),
  ]);
  if (own.error) throw own.error;
  if (named.error) throw named.error;
  return (own.count ?? 0) > 0 || (named.count ?? 0) > 0;
}

async function rejectedBefore(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { count, error } = await admin
    .from("freelancer_applications")
    .select("id", { head: true, count: "exact" })
    .eq("submitted_by_user_id", userId)
    .eq("status", "rejected");
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Bestätigt heißt: Supabase hat die Adresse per Link oder Anbieter belegt. */
async function emailConfirmed(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return false;
  return Boolean(data.user.email_confirmed_at);
}

/**
 * Nach dem Speichern einer Bewerbung: Besteht sie die Prüfungen aus
 * lib/freelancer/auto-publish.ts, geht sie sofort live; sonst wartet sie wie
 * bisher auf das Team. Danach eine Mail mit dem Ergebnis.
 *
 * Wirft nie: Die Bewerbung ist schon gespeichert. Scheitert hier etwas, bleibt
 * sie offen, das Team sieht sie, und die Person bekommt die Eingangsmail.
 */
export async function concludeApplication(
  admin: SupabaseClient,
  input: { applicationId: string; userId: string; email: string; name: string; autoPublish: boolean },
): Promise<SelfPublishResult> {
  let result: SelfPublishResult = { status: "received", blockers: [] };
  if (input.autoPublish) {
    try {
      result = await tryPublish(admin, input);
    } catch (error) {
      logEvent("freelancer_self_publish_failed", { applicationId: input.applicationId, message: error instanceof Error ? error.message : "unknown" });
    }
  }

  const portalUrl = absoluteUrl("/bewerber-portal/apply");
  const message =
    result.status === "published"
      ? profileLiveMessage({ name: input.name, profileUrl: profileUrl(SITE_URL, result.profileId), portalUrl, reviewed: false })
      : applicationReceivedMessage({ name: input.name, reasons: result.blockers.map((blocker) => AUTO_PUBLISH_BLOCKER_TEXT[blocker]), portalUrl });
  const sent = await deliverEmail({ to: input.email, ...message, kind: "transactional" }).catch(() => null);
  if (!sent?.delivered) logEvent("freelancer_application_mail_failed", { applicationId: input.applicationId, reason: sent?.reason ?? "error" });

  return result;
}

async function tryPublish(
  admin: SupabaseClient,
  input: { applicationId: string; userId: string },
): Promise<SelfPublishResult> {
  const application = await getApplication(input.applicationId);
  if (!application) return { status: "received", blockers: [] };

  const [confirmed, duplicate, rejected] = await Promise.all([
    emailConfirmed(admin, input.userId),
    catalogueHasDuplicate(admin, input.userId, application.full_name),
    rejectedBefore(admin, input.userId),
  ]);
  const outcome = autoPublishDecision(application, { emailConfirmed: confirmed, duplicate, rejectedBefore: rejected });
  if (!outcome.ok) return { status: "received", blockers: outcome.blockers };

  const published = await publishApplication({ application, decision: outcome.decision, reviewerUserId: null });
  return { status: "published", profileId: published.profileId };
}
