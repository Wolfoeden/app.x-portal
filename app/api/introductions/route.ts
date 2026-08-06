import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { FreelancerProfileSchema } from "@/lib/domain";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const IntroductionInputSchema = z
  .object({
    projectId: z.string().uuid(),
    profileId: z.string().uuid(),
    idempotencyKey: z.string().trim().min(8).max(160),
  })
  .strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = IntroductionInputSchema.parse(
      await readJsonWithLimit(request, 4_000),
    );
    const user = await requireCurrentUser();
    if (user.isAnonymous) {
      return NextResponse.json(
        { error: "Bitte melden Sie sich an, um die Auswahl zu bestätigen." },
        { status: 409 },
      );
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      throw new Response("Serverkonfiguration unvollständig.", { status: 503 });
    }

    const admin = createAdminSupabaseClient();
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id")
      .eq("id", input.projectId)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) throw new Response("Projekt nicht gefunden.", { status: 404 });

    // A contact can only be requested for a profile that was explicitly shown
    // to this owner. The stored profile snapshot, not current AI output, drives
    // the introduction state.
    const { data: match, error: matchError } = await admin
      .from("matches")
      .select("id,profile_snapshot")
      .eq("project_id", input.projectId)
      .eq("owner_user_id", user.id)
      .eq("freelancer_profile_id", input.profileId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (matchError) throw matchError;
    if (!match) {
      throw new Response("Dieses Profil gehört nicht zur angezeigten Auswahl.", {
        status: 409,
      });
    }

    const profile = FreelancerProfileSchema.parse(match.profile_snapshot);
    const { data: currentProfile, error: profileError } = await admin
      .from("freelancer_profiles")
      .select(
        "intro_policy,booking_url,demo_status,profile_status,availability_status",
      )
      .eq("id", input.profileId)
      .eq("profile_status", "active")
      .eq("availability_status", "available")
      .maybeSingle();
    if (profileError) throw profileError;
    if (!currentProfile) {
      throw new Response("Dieses Profil ist aktuell nicht verfügbar.", {
        status: 409,
      });
    }

    // A change to manual approval can only make the workflow more restrictive;
    // it never silently unlocks a direct booking that was not shown before.
    const freeIntroduction =
      profile.introPolicy.type === "free" &&
      currentProfile.intro_policy === "free";
    const bookingUrl = freeIntroduction
      ? currentProfile.demo_status === "demo"
        ? process.env.NEXT_PUBLIC_CALENDLY_URL ?? null
        : currentProfile.booking_url ??
          process.env.NEXT_PUBLIC_CALENDLY_URL ??
          null
      : null;
    const timestamp = new Date().toISOString();
    const insert = {
      project_id: input.projectId,
      owner_user_id: user.id,
      freelancer_profile_id: input.profileId,
      match_id: match.id,
      intro_policy_snapshot: freeIntroduction ? "free" : "manual_approval",
      status: freeIntroduction ? "ready_to_book" : "manual_review",
      booking_provider: freeIntroduction ? "calendly" : "manual",
      booking_url: bookingUrl,
      idempotency_key: input.idempotencyKey,
      explicit_confirmation_at: timestamp,
    };

    const { data: booking, error: bookingError } = await admin
      .from("intro_bookings")
      .upsert(insert, {
        onConflict: "owner_user_id,idempotency_key",
        ignoreDuplicates: false,
      })
      .select("id,status,booking_url,intro_policy_snapshot,requested_at")
      .single();
    if (bookingError) throw bookingError;

    const { error: updateError } = await admin
      .from("projects")
      .update({ status: "intro_requested" })
      .eq("id", input.projectId)
      .eq("owner_user_id", user.id);
    if (updateError) throw updateError;

    return NextResponse.json({
      introduction: {
        id: booking.id,
        status: booking.status,
        bookingUrl: booking.booking_url,
        treatment: booking.intro_policy_snapshot,
        requestedAt: booking.requested_at,
      },
      message: freeIntroduction
        ? "Die Einführung ist bestätigt. Calendly kann jetzt geladen werden."
        : "Ihre Kontaktanfrage ist eingegangen. Roman Dering prüft die Einführung persönlich.",
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Die Auswahl ist ungültig." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Die Kontaktanfrage konnte nicht gespeichert werden." },
      { status: 503 },
    );
  }
}
