import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  findOwnerForMember: vi.fn(),
}));
const { rpc, from, findOwnerForMember } = mocks;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/lib/data/plan-teams", () => ({
  findOwnerForMember: mocks.findOwnerForMember,
}));

import { resolveBillingAccount } from "@/lib/ai/quota";

const MEMBER = "22222222-2222-4222-8222-222222222222";
const OWNER = "11111111-1111-4111-8111-111111111111";

function snapshotWithRemaining(remaining: number) {
  rpc.mockResolvedValue({
    data: [
      {
        credits_total: 300,
        credits_used: 300 - remaining,
        credits_reserved: 0,
        credits_remaining: remaining,
      },
    ],
    error: null,
  });
  from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: { plan_id: "free", is_anonymous: false },
          error: null,
        }),
      }),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-tests";
});

describe("wer eine Anfrage bezahlt", () => {
  it("nimmt das eigene Kontingent, solange es reicht", async () => {
    // Die 300 Credits gehören dem Mitglied, auch wenn es eingeladen wurde.
    snapshotWithRemaining(120);
    findOwnerForMember.mockResolvedValue(OWNER);

    await expect(
      resolveBillingAccount({
        userId: MEMBER,
        isAnonymous: false,
        requiredCredits: 3,
      }),
    ).resolves.toEqual({
      userId: MEMBER,
      isAnonymous: false,
      billedToOwnerUserId: null,
    });
    expect(findOwnerForMember).not.toHaveBeenCalled();
  });

  it("fällt auf den Plan-Inhaber zurück, wenn das eigene leer ist", async () => {
    snapshotWithRemaining(2);
    findOwnerForMember.mockResolvedValue(OWNER);

    await expect(
      resolveBillingAccount({
        userId: MEMBER,
        isAnonymous: false,
        requiredCredits: 3,
      }),
    ).resolves.toEqual({
      userId: OWNER,
      isAnonymous: false,
      billedToOwnerUserId: OWNER,
    });
  });

  it("bleibt beim eigenen Konto, wenn es kein Team gibt", async () => {
    // Ohne Team muss die Reservierung ablehnen, damit der Nutzer die
    // richtige Meldung bekommt statt einer stillen Ausweichbuchung.
    snapshotWithRemaining(0);
    findOwnerForMember.mockResolvedValue(null);

    await expect(
      resolveBillingAccount({
        userId: MEMBER,
        isAnonymous: false,
        requiredCredits: 3,
      }),
    ).resolves.toEqual({
      userId: MEMBER,
      isAnonymous: false,
      billedToOwnerUserId: null,
    });
  });

  it("fragt für eine Gastsitzung gar nicht erst nach einem Team", async () => {
    await expect(
      resolveBillingAccount({
        userId: MEMBER,
        isAnonymous: true,
        requiredCredits: 3,
      }),
    ).resolves.toEqual({
      userId: MEMBER,
      isAnonymous: true,
      billedToOwnerUserId: null,
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(findOwnerForMember).not.toHaveBeenCalled();
  });

  it("zahlt aus dem eigenen Konto, wenn die Auflösung ausfällt", async () => {
    // Die Auflösung ist eine Optimierung, keine Zugangsprüfung: ein Ausfall
    // darf keine Anfrage blockieren.
    rpc.mockRejectedValue(new Error("supabase down"));
    findOwnerForMember.mockResolvedValue(OWNER);

    await expect(
      resolveBillingAccount({
        userId: MEMBER,
        isAnonymous: false,
        requiredCredits: 3,
      }),
    ).resolves.toEqual({
      userId: MEMBER,
      isAnonymous: false,
      billedToOwnerUserId: null,
    });
  });
});
