import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  rateLimit: vi.fn(),
  extras: vi.fn(),
  inspect: vi.fn(),
  audit: vi.fn(),
  conversion: vi.fn(),
  createSignedUploadUrl: vi.fn(),
  remove: vi.fn(),
  inserted: [] as Array<Record<string, unknown>>,
  pending: [] as Array<Record<string, unknown>>,
  pendingColumns: "",
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: mocks.currentUser }));
vi.mock("@/lib/security/shared-rate-limit", () => ({ consumeRateLimit: mocks.rateLimit }));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/sourcing/conversion", () => ({ recordInviteConversion: mocks.conversion }));
vi.mock("@/lib/freelancer/applications-data", () => ({ applicationExtrasAvailable: mocks.extras }));
vi.mock("@/lib/freelancer/avatar-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/freelancer/avatar-storage")>()),
  inspectUploadedAvatar: mocks.inspect,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    storage: { from: () => ({ createSignedUploadUrl: mocks.createSignedUploadUrl, remove: mocks.remove }) },
    from: () => {
      let op = "select";
      const builder: Record<string, unknown> = {
        select: (columns?: string) => {
          if (op === "select") mocks.pendingColumns = columns ?? "";
          return builder;
        },
        eq: () => builder,
        in: () => builder,
        delete: () => {
          op = "delete";
          return builder;
        },
        insert: (row: Record<string, unknown>) => {
          op = "insert";
          mocks.inserted.push(row);
          return builder;
        },
        single: async () => ({ data: { id: "application-1" }, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(op === "select" ? { data: mocks.pending, error: null } : { data: null, error: null }).then(resolve),
      };
      return builder;
    },
  }),
}));

import { POST as submit } from "@/app/api/freelancer-applications/route";
import { POST as ticket } from "@/app/api/freelancer-applications/photo-upload/route";
import { APPLICATION_PHOTO_PATH_PATTERN } from "@/lib/freelancer/avatar-limits";
import { signApplicationPhotoPath } from "@/lib/freelancer/avatar-storage";

const PHOTO = "incoming/33333333-3333-4333-8333-333333333333/avatar-0123456789abcdef0123456789abcdef.webp";

function request(url: string, body: unknown, origin = "https://x-portal.eu") {
  return new Request(`https://x-portal.eu${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "sec-fetch-site": origin === "https://x-portal.eu" ? "same-origin" : "cross-site" },
    body: JSON.stringify(body),
  });
}

function application(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Kim Beispiel",
    contactEmail: "kim@example.com",
    roleTitle: "AI Engineer",
    experienceSummary: "Baut seit sechs Jahren Agenten und Suchsysteme für Versicherer und Händler.",
    skills: ["Python"],
    languages: ["Deutsch"],
    workModes: ["remote"],
    dayRate: "900",
    consent: true,
    projects: [{ title: "Service-Agent", technologies: ["Python"], isPublic: true }],
    photo: { storagePath: PHOTO, token: signApplicationPhotoPath(PHOTO) },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://x-portal.eu");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
  mocks.currentUser.mockResolvedValue({ id: "user-1", isAnonymous: false, email: "kim@example.com" });
  mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  mocks.extras.mockResolvedValue(true);
  mocks.inspect.mockResolvedValue({ mimeType: "image/webp", sizeBytes: 2048 });
  mocks.audit.mockResolvedValue(undefined);
  mocks.conversion.mockResolvedValue(false);
  mocks.createSignedUploadUrl.mockResolvedValue({ data: { token: "upload-token" }, error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.inserted = [];
  mocks.pending = [];
});

describe("POST /api/freelancer-applications/photo-upload", () => {
  it("hands out a signed ticket below incoming/", async () => {
    const response = await ticket(request("/api/freelancer-applications/photo-upload", { mimeType: "image/png", sizeBytes: 1000 }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { path: string; pathToken: string; uploadToken: string };
    expect(body.path).toMatch(APPLICATION_PHOTO_PATH_PATTERN);
    expect(body.path.endsWith(".png")).toBe(true);
    expect(body.pathToken).toBe(signApplicationPhotoPath(body.path));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("refuses guests, other files, foreign pages and a missing migration", async () => {
    mocks.currentUser.mockResolvedValueOnce({ id: "guest", isAnonymous: true });
    expect((await ticket(request("/api/freelancer-applications/photo-upload", { mimeType: "image/png", sizeBytes: 1000 }))).status).toBe(403);
    expect((await ticket(request("/api/freelancer-applications/photo-upload", { mimeType: "image/svg+xml", sizeBytes: 1000 }))).status).toBe(400);
    expect((await ticket(request("/api/freelancer-applications/photo-upload", { mimeType: "image/png", sizeBytes: 6_000_000 }))).status).toBe(400);
    expect(
      (await ticket(request("/api/freelancer-applications/photo-upload", { mimeType: "image/png", sizeBytes: 1000 }, "https://evil.example"))).status,
    ).toBe(403);
    mocks.extras.mockResolvedValueOnce(false);
    expect((await ticket(request("/api/freelancer-applications/photo-upload", { mimeType: "image/png", sizeBytes: 1000 }))).status).toBe(409);
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});

describe("POST /api/freelancer-applications with projects and photo", () => {
  it("stores the projects as claims and the checked photo", async () => {
    const response = await submit(request("/api/freelancer-applications", application()));
    expect(response.status).toBe(201);
    expect(mocks.inserted[0]).toMatchObject({
      photo_storage_path: PHOTO,
      reference_projects: [expect.objectContaining({ title: "Service-Agent", verified: false, source: "application" })],
    });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ projectCount: 1, hasPhoto: true }) }));
  });

  it("refuses a photo without the server's signature or with the wrong content", async () => {
    const forged = await submit(request("/api/freelancer-applications", application({ photo: { storagePath: PHOTO, token: "0".repeat(64) } })));
    expect(forged.status).toBe(400);
    mocks.inspect.mockResolvedValueOnce({ mimeType: "image/png", sizeBytes: 2048 });
    const mismatch = await submit(request("/api/freelancer-applications", application()));
    expect(mismatch.status).toBe(400);
    expect((await mismatch.json()).error).toContain("kein gültiges Bild");
    expect(mocks.remove).toHaveBeenCalledWith([PHOTO]);
    expect(mocks.inserted).toHaveLength(0);
  });

  it("drops projects and photo before the migration instead of failing", async () => {
    mocks.extras.mockResolvedValue(false);
    const response = await submit(request("/api/freelancer-applications", application({ photo: null })));
    expect(response.status).toBe(201);
    expect(mocks.inserted[0]).not.toHaveProperty("reference_projects");
    expect(mocks.inserted[0]).not.toHaveProperty("photo_storage_path");
    expect(mocks.pendingColumns).toBe("id,cv_storage_path");
  });

  it("removes the photo of a replaced pending application", async () => {
    const stale = "incoming/44444444-4444-4444-8444-444444444444/avatar-fedcba9876543210fedcba9876543210.jpg";
    mocks.pending = [{ id: "old", cv_storage_path: null, photo_storage_path: stale }];
    expect((await submit(request("/api/freelancer-applications", application({ photo: null })))).status).toBe(201);
    expect(mocks.remove).toHaveBeenCalledWith([stale]);
  });
});
