import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  rateLimit: vi.fn(),
  download: vi.fn(),
  extract: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: mocks.currentUser }));
vi.mock("@/lib/security/shared-rate-limit", () => ({ consumeRateLimit: mocks.rateLimit }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ storage: { from: () => ({ download: mocks.download }) } }),
}));
vi.mock("@/lib/openai/cv-draft", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/openai/cv-draft")>()),
  extractCvDraft: mocks.extract,
}));

import { POST } from "@/app/api/freelancer-applications/cv-extract/route";
import { signCvObjectPath } from "@/lib/freelancer/cv-storage";
import { emptyDraft } from "@/lib/freelancer/import/draft";
import { cvDraftRequest } from "@/lib/openai/cv-draft";

/** Die echte Auswertung; die Route oben sieht die gemockte. */
async function realExtract(...args: Parameters<typeof import("@/lib/openai/cv-draft").extractCvDraft>) {
  const actual = await vi.importActual<typeof import("@/lib/openai/cv-draft")>("@/lib/openai/cv-draft");
  return actual.extractCvDraft(...args);
}

const PATH = "incoming/11111111-1111-4111-8111-111111111111/0123456789abcdef0123456789abcdef.pdf";
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

function request(body: unknown) {
  return new Request("https://x-portal.eu/api/freelancer-applications/cv-extract", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://x-portal.eu", "sec-fetch-site": "same-origin" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  mocks.currentUser.mockResolvedValue({ id: "user-1", isAnonymous: false });
  mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  mocks.download.mockResolvedValue({ data: new Blob([PDF]), error: null });
  mocks.extract.mockResolvedValue({ status: "ok", draft: emptyDraft("cv", "2026-10-05T10:00:00.000Z"), model: "m" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /api/freelancer-applications/cv-extract", () => {
  it("returns a draft for the applicant's own signed upload", async () => {
    const response = await POST(request({ storagePath: PATH, token: signCvObjectPath(PATH) }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).draft.source).toBe("cv");
    expect(mocks.extract).toHaveBeenCalledTimes(1);
    const input = mocks.extract.mock.calls[0]![0] as { safetyIdentifier: string };
    // Pseudonym, nicht die Konto-ID.
    expect(input.safetyIdentifier).not.toContain("user-1");
  });

  it("refuses guests", async () => {
    mocks.currentUser.mockResolvedValue({ id: "guest", isAnonymous: true });
    expect((await POST(request({ storagePath: PATH, token: signCvObjectPath(PATH) }))).status).toBe(403);
  });

  it("refuses a file reference without its signature", async () => {
    const response = await POST(request({ storagePath: PATH, token: "0".repeat(64) }));
    expect(response.status).toBe(400);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("stops after the daily limit", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 3600 });
    const response = await POST(request({ storagePath: PATH, token: signCvObjectPath(PATH) }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("3600");
    expect(mocks.extract).not.toHaveBeenCalled();
  });

  it("is unavailable without an AI key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect((await POST(request({ storagePath: PATH, token: signCvObjectPath(PATH) }))).status).toBe(503);
  });

  it("refuses a file that is not a PDF", async () => {
    mocks.download.mockResolvedValue({ data: new Blob(["<html>"]), error: null });
    expect((await POST(request({ storagePath: PATH, token: signCvObjectPath(PATH) }))).status).toBe(400);
  });

  it("reports an unreadable CV without a draft", async () => {
    mocks.extract.mockResolvedValue({ status: "invalid_output" });
    expect((await POST(request({ storagePath: PATH, token: signCvObjectPath(PATH) }))).status).toBe(502);
  });
});

describe("CV draft request", () => {
  it("sends the PDF as a file, stores nothing and asks for nothing beyond the CV", () => {
    const body = cvDraftRequest(PDF, "lebenslauf.pdf", "model", "hash");
    expect(body.store).toBe(false);
    expect(body.safety_identifier).toBe("hash");
    const content = (body.input as unknown as Array<{ content: Array<Record<string, unknown>> }>)[0]!.content;
    expect(content[0]).toMatchObject({ type: "input_file", filename: "lebenslauf.pdf" });
    expect(String(content[0]!.file_data)).toMatch(/^data:application\/pdf;base64,/u);
    expect(body.instructions).toContain("Erfinde nichts");
    expect(body.instructions).toContain("Geburtsdatum");
  });

  it("maps explicit employer and project evidence into an unverified draft", async () => {
    const result = await realExtract(
      { pdf: PDF, filename: "lebenslauf.pdf", safetyIdentifier: "hash", now: new Date("2026-10-05T10:00:00Z") },
      {
        responsesClient: {
          parse: async () => ({
            output_parsed: {
              roleTitle: "Data Engineer",
              experienceSummary: "Ich baue Datenplattformen.",
              locationText: "Berlin",
              skills: ["Python"],
              languages: ["Deutsch Muttersprache"],
              qualifications: [],
              industries: ["Versicherungen"],
              projects: [{
                title: "Datenplattform für einen Versicherer",
                client: "Beispiel Versicherung AG",
                industry: "Versicherungen",
                role: "Lead",
                startedOn: "2024-01",
                endedOn: "2023-01",
                ongoing: false,
                technologies: ["Python", "dbt"],
                outcome: "Eine Plattform für zwölf Teams aufgebaut.",
                link: "https://example.com/referenz",
              }],
            },
            model: "m",
          }),
        },
      },
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.draft.source).toBe("cv");
    expect(result.draft.importedAt).toBe("2026-10-05T10:00:00.000Z");
    expect(result.draft.projects[0]).toMatchObject({ client: "Beispiel Versicherung AG", link: "https://example.com/referenz", verified: false, source: "application", startedOn: "2024-01", endedOn: null });
  });

  it("returns invalid_output for a malformed answer and failed for an error", async () => {
    const malformed = await realExtract(
      { pdf: PDF, filename: "x.pdf", safetyIdentifier: "hash" },
      { responsesClient: { parse: async () => ({ output_parsed: { roleTitle: 3 } }) } },
    );
    expect(malformed.status).toBe("invalid_output");
    const failed = await realExtract(
      { pdf: PDF, filename: "x.pdf", safetyIdentifier: "hash" },
      { responsesClient: { parse: async () => { throw new Error("timeout"); } } },
    );
    expect(failed.status).toBe("failed");
    const unavailable = await realExtract({ pdf: PDF, filename: "x.pdf", safetyIdentifier: "hash" }, { apiKey: null });
    expect(unavailable.status).toBe("unavailable");
  });
});
