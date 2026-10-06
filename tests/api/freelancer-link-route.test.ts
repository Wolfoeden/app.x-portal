import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  rateLimit: vi.fn(),
  currentUser: vi.fn(),
  allowed: vi.fn(),
  links: null as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/security/shared-rate-limit", () => ({ consumeRateLimit: mocks.rateLimit }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/placement/requests", () => ({ placementBookingAllowed: mocks.allowed }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = async () => ({ data: { profile_links: mocks.links }, error: null });
    return { from: () => chain };
  },
}));

import { GET } from "@/app/api/freelancers/[id]/link/route";
import { contactLinkFlags, isAllowedContactLink } from "@/lib/profile/contact-links";

const PROFIL_ID = "11111111-1111-4111-8111-111111111111";
const KONTO = { id: "22222222-2222-4222-8222-222222222222", isAnonymous: false, isAdmin: false };
const GESPRAECH = `/gespraech?von=profile&profil=${PROFIL_ID}`;

function aufruf(kind = "linkedin") {
  return GET(new Request(`https://x-portal.eu/api/freelancers/${PROFIL_ID}/link?kind=${kind}`), {
    params: Promise.resolve({ id: PROFIL_ID }),
  });
}

/** Pfad und Query einer Weiterleitung innerhalb der Seite, sonst die volle Adresse. */
function ziel(response: Response) {
  const location = new URL(response.headers.get("location") ?? "", "https://invalid.example");
  return location.origin === "https://x-portal.eu" ? `${location.pathname}${location.search}` : location.href;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
  mocks.audit.mockResolvedValue("trace");
  mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  mocks.currentUser.mockResolvedValue(KONTO);
  mocks.allowed.mockResolvedValue(true);
  mocks.links = [
    { kind: "linkedin", url: "https://www.linkedin.com/in/mira-falk" },
    { kind: "github", url: "https://github.com/mirafalk" },
  ];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Die Kurzlinks auf der Karte öffnen LinkedIn und GitHub nur mit Abo (oder
// nach einer Vorstellung). Alle anderen landen bei „Gespräch buchen“.
describe("GET /api/freelancers/[id]/link", () => {
  it("leitet mit Abo zu LinkedIn und GitHub weiter", async () => {
    const linkedin = await aufruf("linkedin");
    expect(linkedin.status).toBe(302);
    expect(linkedin.headers.get("location")).toBe("https://www.linkedin.com/in/mira-falk");
    expect(linkedin.headers.get("cache-control")).toContain("no-store");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "freelancer_link_opened", targetId: PROFIL_ID, metadata: { kind: "linkedin" } }),
    );

    const github = await aufruf("github");
    expect(github.headers.get("location")).toBe("https://github.com/mirafalk");
  });

  it("schickt Gäste und Konten ohne Abo zu „Gespräch buchen“", async () => {
    mocks.currentUser.mockResolvedValue(null);
    expect(ziel(await aufruf())).toBe(GESPRAECH);

    mocks.currentUser.mockResolvedValue({ ...KONTO, isAnonymous: true });
    expect(ziel(await aufruf())).toBe(GESPRAECH);

    mocks.currentUser.mockResolvedValue(KONTO);
    mocks.allowed.mockResolvedValue(false);
    expect(ziel(await aufruf())).toBe(GESPRAECH);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("öffnet ohne Vermittlungsmodell für jedes Konto", async () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "false");
    mocks.allowed.mockResolvedValue(false);
    expect((await aufruf()).headers.get("location")).toBe("https://www.linkedin.com/in/mira-falk");
    expect(mocks.allowed).not.toHaveBeenCalled();
  });

  it("leitet nie auf eine fremde oder unverschlüsselte Adresse weiter", async () => {
    mocks.links = [
      { kind: "linkedin", url: "https://linkedin.com.evil.example/in/x" },
      { kind: "github", url: "http://github.com/mirafalk" },
    ];
    expect(ziel(await aufruf("linkedin"))).toBe(GESPRAECH);
    expect(ziel(await aufruf("github"))).toBe(GESPRAECH);
  });

  it("führt ohne hinterlegten Link oder mit unbekannter Art zu „Gespräch buchen“", async () => {
    mocks.links = [];
    expect(ziel(await aufruf("linkedin"))).toBe(GESPRAECH);
    expect(ziel(await aufruf("website"))).toBe(GESPRAECH);
    expect(mocks.allowed).toHaveBeenCalledTimes(1);
  });
});

describe("Kurzlink-Arten", () => {
  it("kennt nur LinkedIn und GitHub selbst als Ziel", () => {
    expect(isAllowedContactLink("linkedin", "https://de.linkedin.com/in/x")).toBe(true);
    expect(isAllowedContactLink("linkedin", "https://evil.example/linkedin.com")).toBe(false);
    expect(isAllowedContactLink("github", "https://user:pw@github.com/x")).toBe(false);
    expect(isAllowedContactLink("github", "https://gist.github.com/x")).toBe(false);
  });

  it("verrät der Karte nur, ob es einen Link gibt", () => {
    expect(contactLinkFlags([{ kind: "github", url: "https://github.com/x" }, { kind: "website", url: "https://x.example" }])).toEqual({
      linkedin: false,
      github: true,
    });
  });
});
