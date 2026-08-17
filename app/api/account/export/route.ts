import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      throw new Response("Serverkonfiguration unvollständig.", { status: 503 });
    }
    const admin = createAdminSupabaseClient();
    const owned = <T>(table: string, columns = "*") =>
      admin.from(table).select(columns).eq("owner_user_id", user.id) as unknown as Promise<{
        data: T[] | null;
        error: unknown;
      }>;

    const [
      userProfile,
      projectCollections,
      projects,
      messages,
      shortlists,
      matches,
      introductions,
      engagements,
      engagementStatusEvents,
      legacyCreditAccount,
      freeUsageAccounts,
      productCreditAccount,
      freeUsageReservations,
      productCreditReservations,
      productCreditLedger,
      externalSearchResults,
      aiUsage,
      auditEvents,
    ] = await Promise.all([
        admin.from("user_profiles").select("*").eq("id", user.id).maybeSingle(),
        owned("project_collections"),
        owned("projects"),
        owned("messages"),
        owned("shortlists"),
        owned("matches"),
        owned("intro_bookings"),
        owned("engagements"),
        owned("engagement_status_events"),
        admin
          .from("user_ai_credit_accounts")
          .select(
            "is_anonymous,credits_total,credits_used,credits_reserved,created_at,updated_at",
          )
          .eq("user_id", user.id)
          .maybeSingle(),
        admin
          .from("ai_free_usage_accounts")
          .select(
            "period_start,period_end,is_anonymous,usage_limit,used,reserved,created_at,updated_at",
          )
          .eq("user_id", user.id)
          .order("period_start", { ascending: true }),
        admin
          .from("product_credit_accounts")
          .select("balance,reserved,created_at,updated_at")
          .eq("user_id", user.id)
          .maybeSingle(),
        admin
          .from("ai_free_usage_reservations")
          .select(
            "period_start,request_key,status,result_outcome,expires_at,created_at,settled_at",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),
        admin
          .from("product_credit_reservations")
          .select(
            "request_key,purpose,amount,status,result_outcome,expires_at,created_at,settled_at",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),
        admin
          .from("product_credit_ledger")
          .select(
            "idempotency_key,entry_type,amount_delta,balance_after,reason,actor_reference,created_at",
          )
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: true }),
        admin
          .from("external_freelancer_search_results")
          .select(
            "project_id,result_count,result_snapshot,provider_response_id,actual_model,created_at",
          )
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: true }),
        admin
          .from("ai_usage_events")
          .select(
            "interaction_id,provider_response_id,requested_model,actual_model,purpose,input_tokens,cached_input_tokens,output_tokens,total_tokens,estimated_cost_nano_usd,actual_cost_nano_usd,credits_consumed,pricing_version,credit_policy_version,outcome,reserved_at,settled_at",
          )
          .eq("user_id", user.id)
          .order("settled_at", { ascending: true }),
        admin
          .from("audit_events")
          .select(
            "action,target_type,target_id,occurred_at,outcome,trace_id,metadata",
          )
          .eq("actor_user_id", user.id),
      ]);
    const failed = [
      userProfile,
      projectCollections,
      projects,
      messages,
      shortlists,
      matches,
      introductions,
      engagements,
      engagementStatusEvents,
      legacyCreditAccount,
      freeUsageAccounts,
      freeUsageReservations,
      productCreditAccount,
      productCreditReservations,
      productCreditLedger,
      externalSearchResults,
      aiUsage,
      auditEvents,
    ].find((result) => result.error);
    if (failed?.error) throw failed.error;

    await writeAuditEvent({
      actorUserId: user.id,
      action: "user_data_exported",
      targetType: "user",
      targetId: user.id,
      outcome: "success",
    });

    return NextResponse.json(
      {
        formatVersion: 5,
        generatedAt: new Date().toISOString(),
        user: { id: user.id, email: user.email },
        userProfile: userProfile.data ?? null,
        projectCollections: projectCollections.data ?? [],
        projects: projects.data ?? [],
        messages: messages.data ?? [],
        shortlists: shortlists.data ?? [],
        matches: matches.data ?? [],
        introductions: introductions.data ?? [],
        engagements: engagements.data ?? [],
        engagementStatusEvents: engagementStatusEvents.data ?? [],
        historicalProviderControlCredits: legacyCreditAccount.data ?? null,
        freeAnalysisUsage: freeUsageAccounts.data ?? [],
        freeAnalysisReservations: freeUsageReservations.data ?? [],
        productCredits: productCreditAccount.data ?? null,
        productCreditReservations: productCreditReservations.data ?? [],
        productCreditLedger: productCreditLedger.data ?? [],
        externalFreelancerSearchResults: externalSearchResults.data ?? [],
        aiUsage: aiUsage.data ?? [],
        auditEvents: auditEvents.data ?? [],
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": 'attachment; filename="x-portal-export.json"',
        },
      },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Der Datenexport konnte nicht erstellt werden." },
      { status: 503 },
    );
  }
}
