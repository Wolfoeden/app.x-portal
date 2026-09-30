import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  engagement: null as Row | null,
  updates: [] as Row[],
  paidRow: null as Row | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let pending: Row | null = null;
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => (filters.push([column, value]), query),
        in: (column: string, value: unknown) => (filters.push([column, value]), query),
        update: (values: Row) => ((pending = values), query),
        maybeSingle: async () => {
          if (table === "freelancer_profiles") return { data: { display_name: "Kim Beispiel", role_title: "KI-Entwicklung" }, error: null };
          if (table === "projects") return { data: { title: "KI-Automatisierung" }, error: null };
          if (pending) {
            state.updates.push(pending);
            if ("fee_status" in pending && pending.fee_status === "paid" && filters.some(([c]) => c === "stripe_invoice_id")) {
              return { data: state.paidRow, error: null };
            }
            if (state.engagement) Object.assign(state.engagement, pending);
            return { data: { id: "eng-1" }, error: null };
          }
          return { data: state.engagement, error: null };
        },
        then(resolve: (value: { error: null }) => void) {
          if (pending) {
            state.updates.push(pending);
            if (state.engagement) Object.assign(state.engagement, pending);
          }
          resolve({ error: null });
        },
      };
      return query;
    },
  }),
}));

import { BillingDetailsSchema, issuePlacementInvoice, recordPlacementInvoicePaid } from "@/lib/placement/invoices";

const INTRO = "11111111-1111-4111-8111-111111111111";
const billing = BillingDetailsSchema.parse({
  company: "Beispiel GmbH",
  contact: "Alex Muster",
  email: "Buchhaltung@Beispiel.de",
  street: "Hauptstraße 1",
  postalCode: "80331",
  city: "München",
  country: "DE",
  vatId: "de 123 456 789",
});

type Call = { method: string; path: string; body: URLSearchParams; idempotency: string | null };
let calls: Call[] = [];
let invoiceState: Row;
let taxRate: Row;

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stripeFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/v1/u, "");
    const body = new URLSearchParams(typeof init?.body === "string" ? init.body : init?.body ? String(init.body) : "");
    const headers = new Headers(init?.headers);
    calls.push({ method: init?.method ?? "GET", path, body, idempotency: headers.get("idempotency-key") });
    if (path.startsWith("/tax_rates/")) return respond(taxRate);
    if (path === "/customers") return respond({ id: "cus_test1" });
    if (path === "/invoices") return respond({ ...invoiceState, id: "in_test1" });
    if (path === "/invoiceitems") {
      const subtotal = Number(body.get("amount"));
      invoiceState.subtotal = subtotal;
      invoiceState.total = Math.round(subtotal * 1.19);
      return respond({ id: "ii_1" });
    }
    if (path.endsWith("/finalize")) {
      Object.assign(invoiceState, { status: "open", number: "XP-0001", hosted_invoice_url: "https://invoice.stripe.com/i/x", invoice_pdf: "https://pay.stripe.com/invoice/x/pdf", due_date: 1_801_000_000 });
      return respond(invoiceState);
    }
    if (path.endsWith("/send")) return respond(invoiceState);
    if (path.startsWith("/invoices/")) return respond(invoiceState);
    return respond({ error: { message: "unexpected" } }, 400);
  });
}

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "rk_test_123");
  vi.stubEnv("STRIPE_PLACEMENT_TAX_RATE_ID", "txr_19");
  calls = [];
  state.updates = [];
  state.paidRow = null;
  state.engagement = {
    id: "eng-1",
    intro_booking_id: INTRO,
    owner_user_id: "client-1",
    project_id: "project-1",
    freelancer_profile_id: "profile-1",
    fee_minor: 355_200,
    fee_status: "open",
    day_rate_minor: 59_200,
    project_days: 60,
    starts_on: "2026-11-02",
    terms_version: "vermittlung-2026-09-1",
    stripe_customer_id: null,
    stripe_invoice_id: null,
  };
  invoiceState = { id: "in_test1", status: "draft", number: null, hosted_invoice_url: null, invoice_pdf: null, due_date: null, subtotal: 0, total: 0 };
  taxRate = { active: true, percentage: 19, inclusive: false, country: "DE" };
  vi.stubGlobal("fetch", stripeFetch());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("billing details", () => {
  it("normalises e-mail and VAT ID and accepts only German addresses for now", () => {
    expect(billing.email).toBe("buchhaltung@beispiel.de");
    expect(billing.vatId).toBe("DE123456789");
    expect(() => BillingDetailsSchema.parse({ ...billing, country: "AT" })).toThrow();
    expect(() => BillingDetailsSchema.parse({ ...billing, postalCode: "8033" })).toThrow();
    expect(() => BillingDetailsSchema.parse({ ...billing, vatId: "ATU12345678" })).toThrow();
    expect(BillingDetailsSchema.parse({ ...billing, vatId: "", contact: "" })).toMatchObject({ vatId: null, contact: null });
  });
});

describe("issuing a placement invoice through Stripe", () => {
  it("creates customer, invoice and line, finalises, sends and books the engagement as invoiced", async () => {
    const result = await issuePlacementInvoice(INTRO, billing);

    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /tax_rates/txr_19",
      "POST /customers",
      "POST /invoices",
      "GET /invoices/in_test1",
      "POST /invoiceitems",
      "GET /invoices/in_test1",
      "POST /invoices/in_test1/finalize",
      "POST /invoices/in_test1/send",
    ]);
    const customer = calls[1]!;
    expect(customer.body.get("name")).toBe("Beispiel GmbH");
    expect(customer.body.get("address[postal_code]")).toBe("80331");
    expect(customer.body.get("tax_id_data[0][value]")).toBe("DE123456789");
    expect(customer.idempotency).toBe("xportal-placement-customer-eng-1");
    const invoice = calls[2]!;
    expect(invoice.body.get("collection_method")).toBe("send_invoice");
    expect(invoice.body.get("days_until_due")).toBe("14");
    expect(invoice.body.get("default_tax_rates[0]")).toBe("txr_19");
    expect(invoice.body.get("metadata[xportal_kind]")).toBe("placement_fee");
    expect(invoice.body.get("custom_fields[0][value]")).toBe("Projektstart 02.11.2026");
    const item = calls[4]!;
    expect(item.body.get("amount")).toBe("355200");
    expect(item.body.get("description")).toContain("Kim Beispiel (KI-Entwicklung) für „KI-Automatisierung“");
    expect(item.body.get("description")).toContain("10 % von 60 Projekttagen");

    expect(state.engagement).toMatchObject({
      fee_status: "invoiced",
      invoice_reference: "XP-0001",
      stripe_customer_id: "cus_test1",
      stripe_invoice_id: "in_test1",
      invoice_url: "https://invoice.stripe.com/i/x",
      billing_company: "Beispiel GmbH",
      billing_email: "buchhaltung@beispiel.de",
    });
    expect(result).toMatchObject({ number: "XP-0001", feeMinor: 355_200, totalMinor: 422_688, clientUserId: "client-1" });
  });

  it("continues an interrupted attempt instead of creating a second customer or invoice", async () => {
    Object.assign(state.engagement!, { stripe_customer_id: "cus_test1", stripe_invoice_id: "in_test1" });
    Object.assign(invoiceState, { status: "open", number: "XP-0001", subtotal: 355_200, total: 422_688 });

    await issuePlacementInvoice(INTRO, billing);

    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /tax_rates/txr_19",
      "GET /invoices/in_test1",
      "POST /invoices/in_test1/send",
    ]);
    expect(state.engagement?.fee_status).toBe("invoiced");
  });

  it("refuses a tax rate that is not exactly 19 % exclusive", async () => {
    taxRate = { active: true, percentage: 7, inclusive: false, country: "DE" };
    await expect(issuePlacementInvoice(INTRO, billing)).rejects.toThrow(/19 %/u);
    expect(calls).toHaveLength(1);
    expect(state.engagement?.stripe_customer_id).toBeNull();
  });

  it("does not send an invoice whose amount differs from the fee", async () => {
    Object.assign(state.engagement!, { stripe_customer_id: "cus_test1", stripe_invoice_id: "in_test1" });
    Object.assign(invoiceState, { status: "draft", subtotal: 100 });
    const error = await issuePlacementInvoice(INTRO, billing).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(409);
    expect(calls.some((call) => call.path.endsWith("/finalize") || call.path.endsWith("/send"))).toBe(false);
  });

  it("does not invoice twice", async () => {
    state.engagement!.fee_status = "invoiced";
    const error = await issuePlacementInvoice(INTRO, billing).catch((caught: unknown) => caught);
    expect((error as Response).status).toBe(409);
    expect(calls).toHaveLength(0);
  });

  it("explains a missing Stripe configuration instead of calling Stripe", async () => {
    vi.stubEnv("STRIPE_PLACEMENT_TAX_RATE_ID", "");
    await expect(issuePlacementInvoice(INTRO, billing)).rejects.toThrow(/STRIPE_PLACEMENT_TAX_RATE_ID/u);
    expect(calls).toHaveLength(0);
  });
});

describe("a paid placement invoice", () => {
  it("returns the booking only the first time", async () => {
    state.paidRow = { intro_booking_id: INTRO, owner_user_id: "client-1", fee_minor: 355_200 };
    expect(await recordPlacementInvoicePaid("in_test1")).toEqual({ introId: INTRO, clientUserId: "client-1", feeMinor: 355_200 });
    state.paidRow = null;
    expect(await recordPlacementInvoicePaid("in_test1")).toBeNull();
  });
});
