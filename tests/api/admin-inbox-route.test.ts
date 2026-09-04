import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  detail: vi.fn(),
  requireAdmin: vi.fn(),
  updateContact: vi.fn(),
  updateIntroduction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/auth/current-user", () => ({
  requireAdminUser: mocks.requireAdmin,
}));
vi.mock("@/lib/admin/inbox-data", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/lib/admin/inbox-data")
  >();
  return {
    ...original,
    getAdminInboxDetail: mocks.detail,
    updateContactInboxItem: mocks.updateContact,
    updateIntroductionInboxItem: mocks.updateIntroduction,
  };
});

import { GET, PATCH } from "@/app/api/admin/inbox/[kind]/[id]/route";
import { AdminInboxConflictError } from "@/lib/admin/inbox-data";

const ADMIN = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "roman@dering.info",
  isAnonymous: false,
  isAdmin: true,
};
const CONTACT_ID = "10000000-0000-4000-8000-000000000001";
const INTRO_ID = "20000000-0000-4000-8000-000000000001";
const UPDATED_AT = "2026-09-03T09:00:00.000Z";

function context(kind: string, id: string) {
  return { params: Promise.resolve({ kind, id }) };
}

function patchRequest(
  kind: string,
  id: string,
  body: Record<string, unknown>,
  origin = "https://x-portal.eu",
) {
  return new Request(`https://x-portal.eu/api/admin/inbox/${kind}/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue(ADMIN);
  mocks.audit.mockResolvedValue("audit-id");
  mocks.detail.mockResolvedValue({
    kind: "contact",
    id: CONTACT_ID,
    email: "kunde@example.invalid",
    message: "Eine ausreichend lange Testnachricht.",
    source: "contact_form",
  });
  mocks.updateContact.mockResolvedValue({
    kind: "contact",
    id: CONTACT_ID,
    handledAt: "2026-09-03T10:00:00.000Z",
    updatedAt: "2026-09-03T10:00:00.000Z",
  });
  mocks.updateIntroduction.mockResolvedValue({
    kind: "introduction",
    id: INTRO_ID,
    previousStatus: "manual_review",
    status: "ready_to_book",
    bookingProvider: "calendly",
    bookingUrl: "https://calendly.com/example/intro",
    confirmedAt: null,
    cancelledAt: null,
    updatedAt: "2026-09-03T10:00:00.000Z",
  });
});

describe("admin inbox detail", () => {
  it("loads sensitive detail only after an admin check and required audit", async () => {
    const response = await GET(
      new Request(`https://x-portal.eu/api/admin/inbox/contact/${CONTACT_ID}`),
      context("contact", CONTACT_ID),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.detail).toHaveBeenCalledWith("contact", CONTACT_ID);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin_inbox_detail_viewed",
        required: true,
      }),
    );
  });

  it("preserves a denied admin response and reads no detail", async () => {
    mocks.requireAdmin.mockRejectedValue(new Response("Forbidden", { status: 403 }));

    const response = await GET(
      new Request(`https://x-portal.eu/api/admin/inbox/contact/${CONTACT_ID}`),
      context("contact", CONTACT_ID),
    );

    expect(response.status).toBe(403);
    expect(mocks.detail).not.toHaveBeenCalled();
  });
});

describe("admin inbox updates", () => {
  it("rejects a foreign origin before auth or data access", async () => {
    const response = await PATCH(
      patchRequest(
        "contact",
        CONTACT_ID,
        { action: "mark_handled", expectedUpdatedAt: UPDATED_AT },
        "https://boese.example",
      ),
      context("contact", CONTACT_ID),
    );

    expect(response.status).toBe(403);
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.updateContact).not.toHaveBeenCalled();
  });

  it("passes the exact compare-and-set contact action to the data service", async () => {
    const response = await PATCH(
      patchRequest("contact", CONTACT_ID, {
        action: "mark_handled",
        expectedUpdatedAt: UPDATED_AT,
      }),
      context("contact", CONTACT_ID),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateContact).toHaveBeenCalledWith({
      id: CONTACT_ID,
      action: "mark_handled",
      expectedUpdatedAt: UPDATED_AT,
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin_contact_request_handled",
        required: true,
      }),
    );
  });

  it("requires an HTTPS link when an Introduction is approved", async () => {
    const response = await PATCH(
      patchRequest("introduction", INTRO_ID, {
        action: "approve",
        expectedStatus: "manual_review",
        expectedUpdatedAt: UPDATED_AT,
        bookingUrl: "http://example.invalid/booking",
      }),
      context("introduction", INTRO_ID),
    );

    expect(response.status).toBe(400);
    expect(mocks.updateIntroduction).not.toHaveBeenCalled();
  });

  it("updates an Introduction without putting personal data in the audit", async () => {
    const response = await PATCH(
      patchRequest("introduction", INTRO_ID, {
        action: "approve",
        expectedStatus: "manual_review",
        expectedUpdatedAt: UPDATED_AT,
        bookingUrl: "https://calendly.com/example/intro",
      }),
      context("introduction", INTRO_ID),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateIntroduction).toHaveBeenCalledWith({
      id: INTRO_ID,
      action: "approve",
      expectedStatus: "manual_review",
      expectedUpdatedAt: UPDATED_AT,
      bookingUrl: "https://calendly.com/example/intro",
    });
    const auditText = JSON.stringify(mocks.audit.mock.calls);
    expect(auditText).not.toContain("kunde@example.invalid");
    expect(auditText).not.toContain("Testnachricht");
  });

  it("reports a stale operator view as a conflict", async () => {
    mocks.updateIntroduction.mockRejectedValue(new AdminInboxConflictError());

    const response = await PATCH(
      patchRequest("introduction", INTRO_ID, {
        action: "mark_booked",
        expectedStatus: "ready_to_book",
        expectedUpdatedAt: UPDATED_AT,
      }),
      context("introduction", INTRO_ID),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("inzwischen");
  });

  it("rejects unknown kinds and invalid ids without a write", async () => {
    const response = await PATCH(
      patchRequest("other", "not-a-uuid", {
        action: "mark_handled",
        expectedUpdatedAt: UPDATED_AT,
      }),
      context("other", "not-a-uuid"),
    );

    expect(response.status).toBe(400);
    expect(mocks.updateContact).not.toHaveBeenCalled();
    expect(mocks.updateIntroduction).not.toHaveBeenCalled();
  });
});
