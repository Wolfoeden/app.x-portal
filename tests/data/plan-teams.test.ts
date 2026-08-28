import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const listUsers = vi.fn();
const getUserById = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    auth: { admin: { listUsers, getUserById } },
    from,
  }),
}));

import { addTeamMember, findOwnerForMember } from "@/lib/data/plan-teams";

const OWNER = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";

/** Eine Zeile aus plan_team_members, oder keine. */
function membershipQuery(ownerUserId: string | null) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () =>
          ownerUserId ? { data: { owner_user_id: ownerUserId }, error: null } : { data: null, error: null },
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserById.mockResolvedValue({ data: { user: { email: "neu@firma.de" } } });
});

describe("Teammitglieder eines Plans", () => {
  it("meldet eine unbekannte Adresse als noch nicht registriert", async () => {
    // Der Einladende soll erfahren, dass er die Person selbst anschreiben
    // muss — nicht, dass etwas schiefgegangen sei.
    listUsers.mockResolvedValue({ data: { users: [] }, error: null });

    await expect(
      addTeamMember({ ownerUserId: OWNER, email: "unbekannt@firma.de" }),
    ).resolves.toEqual({ ok: false, reason: "not_registered" });
  });

  it("nimmt eine Gastsitzung nicht als Mitglied auf", async () => {
    // Eine anonyme Sitzung überlebt den Browserwechsel nicht; ein Guthaben
    // daran zu hängen wäre eine Zusage, die niemand einlösen kann.
    listUsers.mockResolvedValue({
      data: {
        users: [{ id: MEMBER, email: "gast@firma.de", is_anonymous: true }],
      },
      error: null,
    });

    await expect(
      addTeamMember({ ownerUserId: OWNER, email: "gast@firma.de" }),
    ).resolves.toEqual({ ok: false, reason: "not_registered" });
  });

  it("lehnt ab, wer sich selbst einlädt", async () => {
    listUsers.mockResolvedValue({
      data: {
        users: [{ id: OWNER, email: "chef@firma.de", is_anonymous: false }],
      },
      error: null,
    });

    await expect(
      addTeamMember({ ownerUserId: OWNER, email: "chef@firma.de" }),
    ).resolves.toEqual({ ok: false, reason: "self" });
  });

  it("lehnt ein Konto ab, das schon zu einem Team gehört", async () => {
    listUsers.mockResolvedValue({
      data: {
        users: [{ id: MEMBER, email: "neu@firma.de", is_anonymous: false }],
      },
      error: null,
    });
    from.mockReturnValue(membershipQuery("33333333-3333-4333-8333-333333333333"));

    await expect(
      addTeamMember({ ownerUserId: OWNER, email: "neu@firma.de" }),
    ).resolves.toEqual({ ok: false, reason: "already_in_team" });
  });

  it("findet den Inhaber, aus dessen Plan ein Mitglied bezahlt", async () => {
    from.mockReturnValue(membershipQuery(OWNER));
    await expect(findOwnerForMember(MEMBER)).resolves.toBe(OWNER);
  });

  it("gibt null zurück, wenn ein Konto allein steht", async () => {
    from.mockReturnValue(membershipQuery(null));
    await expect(findOwnerForMember(MEMBER)).resolves.toBeNull();
  });
});
