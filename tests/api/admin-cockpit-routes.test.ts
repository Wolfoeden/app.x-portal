import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  importContacts: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
  updateAutomation: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireAdminUser: mocks.requireAdmin }));
vi.mock("@/lib/crm/contacts-data", () => ({
  importContacts: mocks.importContacts,
  updateContact: mocks.updateContact,
  deleteContact: mocks.deleteContact,
}));
vi.mock("@/lib/leadgen/automation", async () => ({
  ...(await import("@/lib/leadgen/automation-model")),
  updateLeadAutomation: mocks.updateAutomation,
}));

import { PATCH as patchAutomation } from "@/app/api/admin/leadgen/automation/route";
import { DELETE as deleteContactRoute, PATCH as patchContact } from "@/app/api/admin/contacts/[id]/route";
import { POST as importRoute } from "@/app/api/admin/contacts/import/route";

const ID = "11111111-2222-4333-8444-555555555555";

function request(path: string, method: string, body?: unknown, origin = "https://x-portal.eu"): Request {
  return new Request(`https://x-portal.eu${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin,
      "sec-fetch-site": origin === "https://x-portal.eu" ? "same-origin" : "cross-site",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: ID }) };
const TABLE = "Unternehmen\tAnsprechpartner\tE-Mail-Adresse\nA GmbH\tEva Beispiel\teva@a.invalid\n";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://x-portal.eu";
  mocks.requireAdmin.mockResolvedValue({ id: "admin-1", isAdmin: true });
  mocks.importContacts.mockResolvedValue({ created: 1, updated: 0 });
  mocks.updateContact.mockResolvedValue({ id: ID, stage: "contacted" });
  mocks.deleteContact.mockResolvedValue(true);
  mocks.updateAutomation.mockResolvedValue({ sendMode: "manual" });
});

describe("contact import", () => {
  it("previews without writing", async () => {
    const response = await importRoute(request("/api/admin/contacts/import", "POST", { text: TABLE, dryRun: true }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.count).toBe(1);
    expect(payload.preview[0]).toMatchObject({ company: "A GmbH", email: "eva@a.invalid" });
    expect(mocks.importContacts).not.toHaveBeenCalled();
  });

  it("imports with the given source", async () => {
    const response = await importRoute(request("/api/admin/contacts/import", "POST", { text: TABLE, source: "AI-Recruiter" }));
    expect(response.status).toBe(200);
    expect(mocks.importContacts).toHaveBeenCalledWith(
      [expect.objectContaining({ company: "A GmbH", contactName: "Eva Beispiel" })],
      "admin-1",
      "AI-Recruiter",
    );
  });

  it("is closed to everyone but an admin and to foreign pages", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Response("Forbidden", { status: 403 }));
    expect((await importRoute(request("/api/admin/contacts/import", "POST", { text: TABLE }))).status).toBe(403);
    const crossSite = await importRoute(request("/api/admin/contacts/import", "POST", { text: TABLE }, "https://evil.invalid"));
    expect(crossSite.status).toBe(403);
    expect(mocks.importContacts).not.toHaveBeenCalled();
  });
});

describe("contact updates", () => {
  it("changes the stage and adds a note", async () => {
    const response = await patchContact(request(`/api/admin/contacts/${ID}`, "PATCH", { stage: "replied", addNote: "Rückruf" }), params);
    expect(response.status).toBe(200);
    expect(mocks.updateContact).toHaveBeenCalledWith(ID, { stage: "replied", addNote: "Rückruf" }, "admin-1");
  });

  it("rejects unknown stages and fields", async () => {
    expect((await patchContact(request(`/api/admin/contacts/${ID}`, "PATCH", { stage: "spam" }), params)).status).toBe(400);
    expect((await patchContact(request(`/api/admin/contacts/${ID}`, "PATCH", { company: "X" }), params)).status).toBe(400);
    expect(mocks.updateContact).not.toHaveBeenCalled();
  });

  it("answers 404 for a contact that does not exist", async () => {
    mocks.updateContact.mockResolvedValueOnce(null);
    expect((await patchContact(request(`/api/admin/contacts/${ID}`, "PATCH", { stage: "replied" }), params)).status).toBe(404);
  });

  it("deletes", async () => {
    const response = await deleteContactRoute(request(`/api/admin/contacts/${ID}`, "DELETE"), params);
    expect(response.status).toBe(200);
    expect(mocks.deleteContact).toHaveBeenCalledWith(ID, "admin-1");
  });
});

describe("lead automation switch", () => {
  it("accepts the documented modes only", async () => {
    expect((await patchAutomation(request("/api/admin/leadgen/automation", "PATCH", { sendMode: "scheduled", dailyLimit: 20 }))).status).toBe(200);
    expect(mocks.updateAutomation).toHaveBeenCalledWith({ sendMode: "scheduled", dailyLimit: 20 }, "admin-1");
    expect((await patchAutomation(request("/api/admin/leadgen/automation", "PATCH", { sendMode: "on_arrival" }))).status).toBe(400);
    expect((await patchAutomation(request("/api/admin/leadgen/automation", "PATCH", {}))).status).toBe(400);
  });
});
