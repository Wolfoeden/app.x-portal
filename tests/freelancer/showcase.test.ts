import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  profiles: vi.fn(),
  admin: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/freelancers", () => ({ fetchActiveBookableRealProfiles: mocks.profiles }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: mocks.admin }));

import { RegisteredShowcasePanel, showcaseHeading } from "@/components/chat/registered-showcase";
import { ShowcaseCard } from "@/components/chat/showcase-card";
import { FreelancerProfileSchema, type FreelancerProfile } from "@/lib/domain";
import {
  emptyShowcase,
  isShowcaseTheme,
  selectShowcase,
  type RegisteredShowcase,
  type ShowcaseProfile,
} from "@/lib/freelancer/showcase";
import { profileFixtures } from "../domain/fixtures";

const NOW = new Date("2026-10-02T10:00:00.000Z");
const FRESH = "2026-09-25T08:00:00.000Z";
const STALE = "2026-08-13T08:00:00.000Z";

function profile(
  id: string,
  displayName: string,
  role: string,
  skills: Array<string | { value: string; source: "verified" | "self_reported" }>,
  overrides: Partial<FreelancerProfile> = {},
): FreelancerProfile {
  return FreelancerProfileSchema.parse({
    ...profileFixtures[0],
    id,
    displayName,
    role,
    skillTags: skills.map((skill) => (typeof skill === "string" ? { value: skill, source: "self_reported" } : skill)),
    hourlyRate: null,
    dayRate: null,
    availability: { status: "available", availableFrom: null, checkedAt: FRESH },
    ...overrides,
  });
}

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const names = (showcase: RegisteredShowcase) => showcase.profiles.map((entry) => entry.displayName);

const agent = profile(ID(1), "Kim Agent", "AI Engineer", [
  "Python",
  { value: "AI Agents", source: "verified" },
  "LangChain",
  "Requirements Engineering",
  "n8n",
], {
  dayRate: { amount: 800, currency: "EUR" },
  location: { value: "Berlin", source: "self_reported" },
  workModes: ["remote", "hybrid"],
  referenceStatus: "verified",
});
const germanAgent = profile(ID(2), "Robin Agentin", "KI-Entwicklung", ["TypeScript", "React", "KI-Agenten", "RAG"]);
const workflows = profile(ID(3), "Jo Workflow", "Automatisierung & Systemintegration", ["n8n", "Make", "LLM"]);
const aiRoleOnly = profile(ID(4), "Alex Beratung", "KI-Beraterin", ["Workshops", "Strategie"]);
const reactOnly = profile(ID(5), "Sam React", "Frontend-Entwickler", ["React", "JavaScript"]);
const reactTs = profile(ID(6), "Anna Web", "Fullstack Developer", ["React", "Typescript", "Next.js"], {
  availability: { status: "available", availableFrom: null, checkedAt: STALE },
});
const analyst = profile(ID(7), "Toni Analyse", "Business Analyst & Requirements Engineer", [
  "Anforderungsmanagement",
  "BPMN",
  "Business-Analyse",
]);
const noRole = profile(ID(8), "Lou Beratung", "Beratung", ["Requirements Engineering"]);
const researched = profile(ID(9), "Recherchiert Ohne Anmeldung", "AI Engineer", ["AI Agents", "LLM"]);
const paused = profile(ID(10), "Pausiert", "KI-Agenten-Entwicklung", ["KI-Agenten"], { profileStatus: "paused" });
const unavailable = profile(ID(11), "Nicht verfügbar", "AI Engineer", ["AI Agents"], {
  availability: { status: "unavailable", availableFrom: null, checkedAt: FRESH },
});
const demo = profile(ID(12), "Demo", "AI Engineer", ["AI Agents"], { demoStatus: "demo" });

const everyone = [agent, germanAgent, workflows, aiRoleOnly, reactOnly, reactTs, analyst, noRole, researched, paused, unavailable, demo];
const registered = new Set(everyone.filter((entry) => entry !== researched).map((entry) => entry.id));

describe("the role showcases", () => {
  it("knows only its three roles", () => {
    expect(isShowcaseTheme("ai-agents")).toBe(true);
    expect(isShowcaseTheme("react-typescript")).toBe(true);
    expect(isShowcaseTheme("requirements-engineering")).toBe(true);
    expect(isShowcaseTheme("automation")).toBe(false);
    expect(isShowcaseTheme("constructor")).toBe(false);
    expect(emptyShowcase("ai-agents")).toEqual({ theme: "ai-agents", label: "AI-Agent-Entwicklung", total: 0, profiles: [] });
  });

  // Wer keine AI Agents nennt, fällt im Abgleich des unveränderten Anfangs
  // unter die Empfehlungsschwelle — und gehört deshalb auch nicht hierher.
  it("lists AI agent builders by the vocabulary skill, not workflow tools or an AI-sounding role", () => {
    expect(names(selectShowcase("ai-agents", everyone, registered, NOW))).toEqual(["Kim Agent", "Robin Agentin"]);
  });

  it("requires React and TypeScript together, in any spelling", () => {
    expect(names(selectShowcase("react-typescript", everyone, registered, NOW))).toEqual(["Robin Agentin", "Anna Web"]);
  });

  it("leaves out a profile whose role is plainly something other than requirements engineering", () => {
    const showcase = selectShowcase("requirements-engineering", everyone, registered, NOW);
    // „AI Engineer“ nennt Requirements Engineering als eine Fähigkeit unter vielen.
    expect(names(showcase)).toEqual(["Toni Analyse", "Lou Beratung"]);
  });

  it("lists only self-registered, active, real and not unavailable profiles", () => {
    const ids = selectShowcase("ai-agents", everyone, registered, NOW).profiles.map((entry) => entry.id);
    for (const excluded of [researched, paused, unavailable, demo]) expect(ids).not.toContain(excluded.id);
  });

  it("answers on the card why a conversation is worth it: evidence, rate, dated availability, contact", () => {
    const [card] = selectShowcase("ai-agents", [agent], registered, NOW, { placement: false }).profiles;
    expect(card).toEqual({
      id: agent.id,
      displayName: "Kim Agent",
      role: "AI Engineer",
      avatarUrl: null,
      evidence: [
        { skill: "AI Agents", required: true, verified: true },
        { skill: "LangChain", required: false, verified: false },
        { skill: "n8n", required: false, verified: false },
      ],
      rate: expect.stringMatching(/^800\s€ \/ Tag$/u),
      availability: { status: "available", updatedAt: FRESH, availableFrom: null },
      contact: "calendar",
      location: "Berlin",
      workModes: ["remote", "hybrid"],
      verified: true,
      field: "ai",
      summaryExcerpt: expect.any(String),
    } satisfies ShowcaseProfile);
  });

  it("names the actual contact route", () => {
    const withoutCalendar = profile(ID(20), "Ohne Kalender", "AI Engineer", ["AI Agents"], {
      introPolicy: { type: "premium", label: "Über XPORTAL", bookingUrl: null },
    });
    const pick = (placement: boolean) =>
      selectShowcase("ai-agents", [agent, withoutCalendar], new Set([...registered, withoutCalendar.id]), NOW, { placement })
        .profiles.map((entry) => entry.contact);
    expect(pick(false)).toEqual(["calendar", "none"]);
    expect(pick(true)).toEqual(["request", "request"]);
  });

  it("puts fresh availability first, then more evidence, then a stated rate, then the name", () => {
    const stale = { status: "available" as const, availableFrom: null, checkedAt: STALE };
    const many = [
      profile(ID(30), "A Alt mit viel", "AI Engineer", ["AI Agents", "LangChain", "RAG", "MCP"], { availability: stale }),
      profile(ID(31), "B Frisch", "AI Engineer", ["AI Agents"]),
      profile(ID(32), "C Frisch mit Honorar", "AI Engineer", ["AI Agents"], { hourlyRate: { amount: 90, currency: "EUR" } }),
      profile(ID(33), "D Frisch mit mehr", "AI Engineer", ["AI Agents", "RAG"]),
    ];
    const ids = new Set(many.map((entry) => entry.id));
    const first = selectShowcase("ai-agents", many, ids, NOW);
    expect(names(first)).toEqual(["D Frisch mit mehr", "C Frisch mit Honorar", "B Frisch", "A Alt mit viel"]);
    expect(selectShowcase("ai-agents", [...many].reverse(), ids, NOW)).toEqual(first);
  });

  it("counts everyone but shows at most the limit", () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      profile(ID(40 + index), `Person ${String.fromCharCode(72 - index)}`, "AI Engineer", ["AI Agents"]),
    );
    const showcase = selectShowcase("ai-agents", many, new Set(many.map((entry) => entry.id)), NOW);
    expect(showcase.total).toBe(8);
    expect(showcase.profiles).toHaveLength(6);
    expect(showcase.profiles[0]?.displayName).toBe("Person A");
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
      approved: [{ published_profile_id: germanAgent.id }, { published_profile_id: null }],
    });
    mocks.admin.mockReturnValue(client);
    mocks.profiles.mockResolvedValue([agent, germanAgent, researched]);

    const { loadShowcase } = await import("@/lib/freelancer/showcase-data");
    const showcase = await loadShowcase("ai-agents", NOW.getTime());

    expect(showcase.profiles.map((entry) => entry.id).sort()).toEqual([agent.id, germanAgent.id].sort());
    expect(calls).toContainEqual(["not", "freelancer_profiles", "owner_user_id", "is", null]);
    expect(calls).toContainEqual(["eq", "freelancer_applications", "status", "approved"]);
  });

  it("keeps the profiles for five minutes, shared by all roles", async () => {
    mocks.admin.mockReturnValue(adminClient({ owned: [{ id: germanAgent.id }], approved: [] }).client);
    mocks.profiles.mockResolvedValue([germanAgent]);

    const { loadShowcase } = await import("@/lib/freelancer/showcase-data");
    const start = NOW.getTime();
    expect((await loadShowcase("ai-agents", start)).total).toBe(1);
    expect((await loadShowcase("react-typescript", start + 4 * 60_000)).total).toBe(1);
    expect(mocks.profiles).toHaveBeenCalledTimes(1);
    await loadShowcase("ai-agents", start + 5 * 60_000);
    expect(mocks.profiles).toHaveBeenCalledTimes(2);
  });

  it("stays empty without a server key", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { loadShowcase } = await import("@/lib/freelancer/showcase-data");
    expect(await loadShowcase("react-typescript")).toEqual(emptyShowcase("react-typescript"));
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("answers with an empty list instead of an error when the lookup fails", async () => {
    mocks.admin.mockReturnValue(adminClient({ owned: [], approved: [] }).client);
    mocks.profiles.mockRejectedValue(new Error("database down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { GET } = await import("@/app/api/showcase/route");
    const response = await GET(new NextRequest("https://x-portal.eu/api/showcase?theme=ai-agents"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(emptyShowcase("ai-agents"));
    consoleError.mockRestore();
  });

  it("refuses an unknown role without touching the database", async () => {
    const { GET } = await import("@/app/api/showcase/route");
    const response = await GET(new NextRequest("https://x-portal.eu/api/showcase?theme=automation"));
    expect(response.status).toBe(404);
    expect(mocks.profiles).not.toHaveBeenCalled();
  });
});

describe("the showcase panel", () => {
  const card = (overrides: Partial<ShowcaseProfile>): ShowcaseProfile => ({
    id: agent.id,
    displayName: "Kim Agent",
    role: "AI Engineer",
    avatarUrl: null,
    evidence: [
      { skill: "AI Agents", required: true, verified: true },
      { skill: "LangChain", required: false, verified: false },
    ],
    rate: "800 € / Tag",
    availability: { status: "available", updatedAt: FRESH, availableFrom: null },
    contact: "calendar",
    location: "Berlin",
    workModes: ["remote", "hybrid"],
    verified: true,
    field: "ai",
    summaryExcerpt: "Baut Agenten für den Kundenservice.",
    ...overrides,
  });
  const showcase: RegisteredShowcase = {
    theme: "ai-agents",
    label: "AI-Agent-Entwicklung",
    total: 8,
    profiles: [
      card({}),
      card({
        id: germanAgent.id,
        displayName: "Robin Agentin",
        rate: null,
        availability: { status: "available", updatedAt: STALE, availableFrom: null },
        location: null,
        workModes: ["remote"],
        verified: false,
      }),
    ],
  };
  const render = (value: RegisteredShowcase, theme: RegisteredShowcase["theme"] = "ai-agents") =>
    renderToStaticMarkup(createElement(RegisteredShowcasePanel, { theme, initial: value, now: NOW }));

  it("names the count for the role and links each profile page", () => {
    const html = render(showcase);
    expect(showcaseHeading(8, "AI-Agent-Entwicklung")).toBe("8 selbst angemeldete Profile für AI-Agent-Entwicklung");
    expect(html).toContain("8 selbst angemeldete Profile für AI-Agent-Entwicklung");
    expect(html).toContain(`/profil/${agent.id}?via=shortcut`);
    expect(html).toContain("Dazu 6 weitere.");
    expect(html).toContain("Selbst registriert und von XPORTAL freigegeben");
  });

  it("shows evidence, rate, the date of the availability statement and the contact route", () => {
    const html = render(showcase);
    expect(html).toContain("Im Profil belegt: ");
    expect(html).toContain("AI Agents<small> · geprüft</small>");
    expect(html).toContain("LangChain");
    expect(html).toContain("800 € / Tag");
    expect(html).toContain("Verfügbar · Stand 25.09.");
    expect(html).toContain("Kontakt: eigener Terminkalender");
    expect(html).toContain("Berlin · Remote, Hybrid");
    expect(html).toContain("Profil geprüft");
  });

  it("shows that the card opens the profile, and reads the whole card out", () => {
    const html = render(showcase);
    expect(html.match(/Profil ansehen/gu)).toHaveLength(2);
    expect(html).toContain("(öffnet in neuem Tab)");
    expect(html).toContain('class="availability available"');
    expect(html).not.toContain("aria-label=\"Profil von");
  });

  it("renders the same card without a link as a preview", () => {
    const html = renderToStaticMarkup(createElement(ShowcaseCard, { profile: card({}), now: NOW, href: null }));
    expect(html).toMatch(/^<div class="showcase-card">/u);
    expect(html).not.toContain("<a");
    expect(html).not.toContain("Profil ansehen");
    expect(html).toContain("Kim Agent");
  });

  it("says what to clarify before a conversation and promises no fit", () => {
    const html = render(showcase);
    expect(html).toContain("Vorher klären: Honorar nicht angegeben · Verfügbarkeit zuletzt am 13.08.2026 angegeben");
    expect(html).toContain("Ob Aufgabe, Muss-Skills, Start und Budget passen, zeigt der Abgleich");
    expect(html).not.toMatch(/\d+\s?%|passt|sofort verfügbar|garantiert/iu);
  });

  it("renders nothing when nobody is listed or the list belongs to another role", () => {
    expect(render(emptyShowcase("ai-agents"))).toBe("");
    expect(render(showcase, "react-typescript")).toBe("");
    expect(showcaseHeading(1, "React & TypeScript")).toBe("1 selbst angemeldetes Profil für React & TypeScript");
  });
});
