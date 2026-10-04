import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  consume: vi.fn(),
  deliver: vi.fn(),
  record: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/email/deliver", () => ({ deliverEmail: mocks.deliver }));
vi.mock("@/lib/security/shared-rate-limit", () => ({ consumeRateLimit: mocks.consume }));
vi.mock("@/lib/crm/contacts-data", () => ({ recordInboundLead: mocks.record }));

import { POST } from "@/app/api/sales-call/route";
import { readSalesCallToken } from "@/lib/sales/sales-call";

const CONTACT = "0b5c2b9e-3c55-4a43-9a7e-2f1d6c7a8b90";
const ORIGINAL = { ...process.env };

function request(fields: Record<string, string>, origin = "https://x-portal.eu") {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  return new Request("https://x-portal.eu/api/sales-call", {
    method: "POST",
    headers: { origin, "sec-fetch-site": origin === "https://x-portal.eu" ? "same-origin" : "cross-site", "x-forwarded-for": "203.0.113.9" },
    body,
  });
}

const valid = {
  company: "Muster Maschinenbau GmbH",
  fullName: "Erika Mustermann",
  email: "Erika@Muster.example",
  role: "SAP S/4HANA Finance",
  phone: "",
  start: "November",
  duration: "",
  rate: "",
  note: "",
  consent: "on",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "s".repeat(40);
  process.env.SALES_CALL_URL = "https://calendly.com/xportal/20min";
  mocks.audit.mockResolvedValue("audit-id");
  mocks.consume.mockResolvedValue({ allowed: true, remaining: 4, retryAfterSeconds: 0 });
  mocks.deliver.mockResolvedValue({ delivered: true });
  mocks.record.mockResolvedValue({ id: CONTACT, created: true });
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("POST /api/sales-call", () => {
  it("stores the request as a CRM contact, notifies both sides and returns a calendar token", async () => {
    const response = await POST(request(valid));

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/gespraech");
    expect(location.searchParams.get("status")).toBe("sent");
    expect(location.hash).toBe("#termin");
    expect(readSalesCallToken(location.searchParams.get("t"))).toBe(CONTACT);
    // Kein Name und keine Adresse in der eigenen Adresszeile.
    expect(location.toString()).not.toContain("Erika");

    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        company: "Muster Maschinenbau GmbH",
        contactName: "Erika Mustermann",
        email: "erika@muster.example",
        kind: "Gesprächsanfrage (Website)",
        focus: "SAP S/4HANA Finance",
        emailKind: "personal",
      }),
      expect.objectContaining({ source: "website_gespraech", today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u) }),
    );

    expect(mocks.deliver).toHaveBeenCalledTimes(2);
    const [toOperator, toSender] = mocks.deliver.mock.calls.map((call) => call[0]);
    expect(toOperator.subject).toBe("Gesprächsanfrage: Muster Maschinenbau GmbH – SAP S/4HANA Finance");
    expect(toOperator.text).toContain(`/chat/admin/kontakte/${CONTACT}`);
    expect(toSender.to).toBe("erika@muster.example");
    expect(toSender.text).toContain("https://calendly.com/xportal/20min?name=Erika+Mustermann");
    expect(toSender.kind).toBe("transactional");

    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sales_call_requested", targetId: CONTACT, outcome: "success" }),
    );
  });

  it("answers a filled honeypot like a person but stores nothing", async () => {
    const response = await POST(request({ ...valid, website: "https://spam.example" }));
    expect(new URL(response.headers.get("location")!).searchParams.get("status")).toBe("sent");
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("sends incomplete forms back", async () => {
    const response = await POST(request({ ...valid, consent: "" }));
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("status")).toBe("invalid");
    expect(location.hash).toBe("#formular");
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("limits repeated requests", async () => {
    mocks.consume.mockResolvedValueOnce({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
    mocks.consume.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 600 });
    const response = await POST(request(valid));
    expect(new URL(response.headers.get("location")!).searchParams.get("status")).toBe("limited");
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("keeps the request when mail delivery fails", async () => {
    mocks.deliver.mockResolvedValue({ delivered: false, reason: "provider_not_configured" });
    const response = await POST(request(valid));
    expect(new URL(response.headers.get("location")!).searchParams.get("status")).toBe("sent");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ notified: false, acknowledged: false }) }),
    );
  });

  it("reports a storage failure without losing the visitor", async () => {
    mocks.record.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await POST(request(valid));
    expect(new URL(response.headers.get("location")!).searchParams.get("status")).toBe("error");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "sales_call_failed" }));
  });

  it("refuses cross-site posts", async () => {
    const response = await POST(request(valid, "https://evil.example"));
    expect(response.status).toBe(403);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("works without a calendar", async () => {
    delete process.env.SALES_CALL_URL;
    await POST(request(valid));
    const toSender = mocks.deliver.mock.calls[1]![0];
    expect(toSender.text).not.toContain("calendly");
  });
});
