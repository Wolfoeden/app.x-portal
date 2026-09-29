import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  profiles: vi.fn(),
  admin: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/freelancers", () => ({ fetchActiveBookableRealProfiles: mocks.profiles }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: mocks.admin }));

import { RegisteredShowcasePanel, showcaseHeading } from "@/components/chat/registered-showcase";
import { FreelancerProfileSchema, type FreelancerProfile } from "@/lib/domain";
import {
  isAutomationProfile,
  selectAutomationShowcase,
  type RegisteredShowcase,
} from "@/lib/freelancer/showcase";
import { profileFixtures } from "../domain/fixtures";

function profile(
  id: string,
  displayName: string,
  role: string,
  skills: string[],
  overrides: Partial<FreelancerProfile> = {},
): FreelancerProfile {
  return FreelancerProfileSchema.parse({
    ...profileFixtures[0],
    id,
    displayName,
    role,
    skillTags: skills.map((value) => ({ value, source: "self_reported" })),
    ...overrides,
  });
}

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const agent = profile(ID(1), "Kim Agent", "KI / Full Stack / Cloud", ["React", "AI Agents", "LLM", "RAG"]);
const workflows = profile(ID(2), "Jo Workflow", "Automatisierung & Systemintegration", ["n8n", "Make"]);
const aiRoleOnly = profile(ID(3), "Alex Beratung", "KI-Beraterin", ["Workshops", "Strategie"]);
const react = profile(ID(4), "Anna React", "Senior React Engineer", ["React", "TypeScript"]);
const researched = profile(ID(5), "Recherchiert Ohne Anmeldung", "AI Engineer", ["AI Agents", "LLM"]);
const paused = profile(ID(6), "Pausiert", "KI-Agenten-Entwicklung", ["KI-Agenten"], { profileStatus: "paused" });
const unavailable = profile(ID(7), "Nicht verfügbar", "Workflow-Automatisierung", ["Zapier"], {
  availability: { status: "unavailable", availableFrom: null, checkedAt: "2026-09-01T08:00:00.000Z" },
});
const demo = profile(ID(8), "Demo", "AI Engineer", ["AI Agents"], { demoStatus: "demo" });

const registered = new Set([agent.id, workflows.id, aiRoleOnly.id, react.id, paused.id, unavailable.id, demo.id]);

describe("the automation shortcut showcase", () => {
  it("recognises the theme by vocabulary skill, tool or role — not by any AI-sounding word", () => {
    expect(isAutomationProfile(agent)).toBe(true);
    expect(isAutomationProfile(workflows)).toBe(true);
    expect(isAutomationProfile(aiRoleOnly)).toBe(true);
    expect(isAutomationProfile(react)).toBe(false);
    expect(isAutomationProfile(profile(ID(9), "Make-up", "Maskenbildnerin", ["Make-up Artist"]))).toBe(false);
    expect(isAutomationProfile(profile(ID(10), "Agentur", "Inhaberin Werbeagentur", ["Branding"]))).toBe(false);
  });

  it("lists only self-registered, active, real and not unavailable profiles", () => {
    const showcase = selectAutomationShowcase(
      [agent, workflows, aiRoleOnly, react, researched, paused, unavailable, demo],
      registered,
    );
    expect(showcase.total).toBe(3);
    expect(showcase.profiles.map((entry) => entry.displayName)).toEqual([
      // Drei Themen-Skills vor zwei vor keinem.
      "Kim Agent",
      "Jo Workflow",
      "Alex Beratung",
    ]);
    expect(showcase.profiles.map((entry) => entry.id)).not.toContain(researched.id);
  });

  it("puts theme skills first on the card, in the profile's own wording", () => {
    const [card] = selectAutomationShowcase([agent], registered).profiles;
    expect(card).toEqual({
      id: agent.id,
      displayName: "Kim Agent",
      role: "KI / Full Stack / Cloud",
      avatarUrl: null,
      skills: ["AI Agents", "LLM", "RAG"],
    });
  });

  it("counts everyone but shows at most the limit, in a fixed order", () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      profile(ID(20 + index), `Person ${String.fromCharCode(72 - index)}`, "Workflow-Automatisierung", ["n8n"]),
    );
    const ids = new Set(many.map((entry) => entry.id));
    const first = selectAutomationShowcase(many, ids);
    const again = selectAutomationShowcase([...many].reverse(), ids);
    expect(first.total).toBe(8);
    expect(first.profiles).toHaveLength(6);
    expect(first.profiles[0]?.displayName).toBe("Person A");
    expect(again).toEqual(first);
  });
});

describe("loading the showcase", () => {
  function adminClient(input: {
    owned: Array<{ id: string }>;
    approved: Array<{ published_profile_id: string | null }>;
  }) {
    const calls: Array<[string, ...unknown[]]> = [];
    const client = {
      from(table: string) {
        calls.push(["from", table]);
        const rows = table === "freelancer_profiles" ? input.owned : input.approved;
        const query = {
          select: (value: string) => (calls.push(["select", table, value]), query),
          eq: (column: string, value: unknown) => (calls.push(["eq", table, column, value]), query),
          not: (column: string, operator: string, value: unknown) => {
            calls.push(["not", table, column, operator, value]);
            return Object.assign(Promise.resolve({ data: rows, error: null }), query);
          },
        };
        return query;
      },
    };
    return { client: client as unknown as SupabaseClient, calls };
  }

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("counts profiles owned by an account or published from an approved application", async () => {
    const { client, calls } = adminClient({
      owned: [{ id: agent.id }],
      approved: [{ published_profile_id: workflows.id }, { published_profile_id: null }],
    });
    mocks.admin.mockReturnValue(client);
    mocks.profiles.mockResolvedValue([agent, workflows, researched]);

    const { loadAutomationShowcase } = await import("@/lib/freelancer/showcase-data");
    const showcase = await loadAutomationShowcase(1_000);

    expect(showcase.profiles.map((entry) => entry.id)).toEqual([agent.id, workflows.id]);
    expect(calls).toContainEqual(["not", "freelancer_profiles", "owner_user_id", "is", null]);
    expect(calls).toContainEqual(["eq", "freelancer_applications", "status", "approved"]);
  });

  it("keeps the result for five minutes", async () => {
    mocks.admin.mockReturnValue(adminClient({ owned: [{ id: agent.id }], approved: [] }).client);
    mocks.profiles.mockResolvedValue([agent]);

    const { loadAutomationShowcase } = await import("@/lib/freelancer/showcase-data");
    await loadAutomationShowcase(0);
    await loadAutomationShowcase(4 * 60_000);
    expect(mocks.profiles).toHaveBeenCalledTimes(1);
    await loadAutomationShowcase(5 * 60_000);
    expect(mocks.profiles).toHaveBeenCalledTimes(2);
  });

  it("stays empty without a server key", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { loadAutomationShowcase } = await import("@/lib/freelancer/showcase-data");
    expect(await loadAutomationShowcase()).toEqual({ theme: "automation", total: 0, profiles: [] });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("answers with an empty list instead of an error when the lookup fails", async () => {
    mocks.admin.mockReturnValue(adminClient({ owned: [], approved: [] }).client);
    mocks.profiles.mockRejectedValue(new Error("database down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { GET } = await import("@/app/api/showcase/automation/route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ theme: "automation", total: 0, profiles: [] });
    consoleError.mockRestore();
  });
});

describe("the showcase panel", () => {
  const showcase: RegisteredShowcase = {
    theme: "automation",
    total: 8,
    profiles: [
      { id: agent.id, displayName: "Kim Agent", role: "KI / Full Stack / Cloud", avatarUrl: null, skills: ["AI Agents", "LLM"] },
    ],
  };

  it("names the count, links each profile page and makes no availability promise", () => {
    const html = renderToStaticMarkup(createElement(RegisteredShowcasePanel, { initial: showcase }));
    expect(html).toContain(showcaseHeading(8).replace("&", "&amp;"));
    expect(html).toContain(`/profil/${agent.id}?via=shortcut`);
    expect(html).toContain("Dazu 7 weitere.");
    expect(html).toContain("Selbst registriert und von XPORTAL freigegeben.");
    expect(html).toContain("klären Sie im Gespräch");
    expect(html).not.toMatch(/sofort verfügbar|garantiert/iu);
  });

  it("renders nothing when nobody is listed", () => {
    expect(
      renderToStaticMarkup(
        createElement(RegisteredShowcasePanel, { initial: { theme: "automation", total: 0, profiles: [] } }),
      ),
    ).toBe("");
    expect(showcaseHeading(1)).toBe("1 selbst angemeldetes Profil für KI-Agenten & Automatisierung");
  });
});
