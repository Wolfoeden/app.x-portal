import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { mintSalesCallToken, readSalesCallToken, salesCallUrl } from "@/lib/sales/sales-call";

const CONTACT = "0b5c2b9e-3c55-4a43-9a7e-2f1d6c7a8b90";
const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "a".repeat(40);
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("sales call token", () => {
  it("round-trips the contact id", () => {
    const token = mintSalesCallToken(CONTACT)!;
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    expect(readSalesCallToken(token)).toBe(CONTACT);
  });

  it("never carries a name or an address", () => {
    const token = mintSalesCallToken(CONTACT)!;
    const payload = Buffer.from(token.split(".")[0]!, "base64url").toString("utf8");
    expect(payload).toMatch(/^[0-9a-f-]{36}:\d+$/u);
  });

  it("rejects a tampered token", () => {
    const token = mintSalesCallToken(CONTACT)!;
    const [payload, signature] = token.split(".");
    const other = Buffer.from(`${"1".repeat(8)}-1111-4111-8111-111111111111:${Math.floor(Date.now() / 1000)}`).toString("base64url");
    expect(readSalesCallToken(`${other}.${signature}`)).toBeNull();
    expect(readSalesCallToken(`${payload}.${signature}x`)).toBeNull();
    expect(readSalesCallToken(`${token}.extra`)).toBeNull();
    expect(readSalesCallToken(42)).toBeNull();
  });

  it("expires after two weeks", () => {
    const issued = new Date("2026-10-04T10:00:00Z");
    const token = mintSalesCallToken(CONTACT, issued)!;
    expect(readSalesCallToken(token, new Date("2026-10-17T10:00:00Z"))).toBe(CONTACT);
    expect(readSalesCallToken(token, new Date("2026-10-19T10:00:00Z"))).toBeNull();
  });

  it("does nothing without a secret", () => {
    const token = mintSalesCallToken(CONTACT)!;
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    expect(mintSalesCallToken(CONTACT)).toBeNull();
    expect(readSalesCallToken(token)).toBeNull();
  });
});

describe("salesCallUrl", () => {
  it("returns only a valid https calendar", () => {
    process.env.SALES_CALL_URL = " https://calendly.com/xportal/20min ";
    expect(salesCallUrl()).toBe("https://calendly.com/xportal/20min");
    process.env.SALES_CALL_URL = "http://calendly.com/xportal";
    expect(salesCallUrl()).toBeNull();
    delete process.env.SALES_CALL_URL;
    expect(salesCallUrl()).toBeNull();
  });
});
