import { beforeAll, describe, expect, it, vi } from "vitest";

import type { AdminUsageSourceRow } from "@/lib/ai/admin-usage";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(),
}));

type AdminUsageModule = typeof import("@/lib/ai/admin-usage");

let aggregateAdminUsageRows: AdminUsageModule["aggregateAdminUsageRows"];
let classifyAdminUsageRow: AdminUsageModule["classifyAdminUsageRow"];

beforeAll(async () => {
  const adminUsage = await import("@/lib/ai/admin-usage");
  aggregateAdminUsageRows = adminUsage.aggregateAdminUsageRows;
  classifyAdminUsageRow = adminUsage.classifyAdminUsageRow;
});

function row(
  overrides: Partial<AdminUsageSourceRow> = {},
): AdminUsageSourceRow {
  return {
    id: "usage-1",
    user_id: "00000000-0000-4000-8000-000000000001",
    interaction_id: "00000000-0000-4000-8000-000000000010",
    provider_response_id: "resp_confirmed",
    requested_model: "gpt-5.6-luna",
    actual_model: "gpt-5.6-luna-2026-07-15",
    purpose: "project_brief",
    input_tokens: 10,
    cached_input_tokens: 2,
    output_tokens: 5,
    total_tokens: 15,
    actual_cost_nano_usd: "1000",
    credits_consumed: 3,
    outcome: "succeeded",
    settled_at: "2026-08-12T08:00:00.000Z",
    ...overrides,
  };
}

describe("admin AI usage truthfulness", () => {
  it("accepts complete provider usage regardless of the business outcome", () => {
    expect(classifyAdminUsageRow(row())).toBe("confirmed_provider");
    expect(
      classifyAdminUsageRow(row({ outcome: "provider_error" })),
    ).toBe("confirmed_provider");
  });

  it("keeps reconciliations and incomplete provider records as estimates", () => {
    expect(
      classifyAdminUsageRow(row({ outcome: "reconciled_estimate" })),
    ).toBe("estimated_or_reconciled");
    expect(
      classifyAdminUsageRow(row({ provider_response_id: null })),
    ).toBe("estimated_or_reconciled");
    expect(
      classifyAdminUsageRow(row({ actual_model: null })),
    ).toBe("estimated_or_reconciled");
    expect(
      classifyAdminUsageRow(row({ total_tokens: 14 })),
    ).toBe("estimated_or_reconciled");
    expect(
      classifyAdminUsageRow(row({ actual_cost_nano_usd: null })),
    ).toBe("confirmed_provider");
  });

  it("aggregates confirmed usage, estimates, failures and credits separately", () => {
    const totals = aggregateAdminUsageRows([
      row(),
      row({
        id: "usage-2",
        provider_response_id: "resp_billed_error",
        input_tokens: 20,
        cached_input_tokens: 0,
        output_tokens: 2,
        total_tokens: 22,
        actual_cost_nano_usd: "2000",
        credits_consumed: 4,
        outcome: "provider_error",
      }),
      row({
        id: "usage-3",
        input_tokens: 100,
        cached_input_tokens: 0,
        output_tokens: 0,
        total_tokens: 100,
        actual_cost_nano_usd: "5000",
        credits_consumed: 10,
        outcome: "reconciled_estimate",
      }),
      row({
        id: "usage-4",
        provider_response_id: null,
        actual_model: null,
        input_tokens: 50,
        cached_input_tokens: 0,
        output_tokens: 0,
        total_tokens: 50,
        actual_cost_nano_usd: null,
        credits_consumed: 5,
        outcome: "timeout",
      }),
    ]);

    expect(totals).toMatchObject({
      settlements: 4,
      reconciledEstimates: 1,
      failedAttempts: 2,
      creditsUsed: 22,
      confirmedProvider: {
        requests: 2,
        totalTokens: 37,
        costNanoUsd: "3000",
        costUsd: "0.000003",
        unknownCostRequests: 0,
      },
      estimatedOrReconciled: {
        requests: 2,
        totalTokens: 150,
        costNanoUsd: "5000",
        costUsd: "0.000005",
        unknownCostRequests: 1,
      },
    });
  });
});
