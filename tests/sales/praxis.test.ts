import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { mintPraxisToken, readPraxisToken } from "@/lib/sales/praxis";
import { mintSalesCallToken, readSalesCallToken } from "@/lib/sales/sales-call";
import { praxisLink, praxisMailDraft } from "@/lib/sales/praxis-model";

const CONTACT = "0b5c2b9e-3c55-4a43-9a7e-2f1d6c7a8b90";

beforeEach(() => {
  vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "a".repeat(40));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("praxis link token", () => {
  it("round-trips the contact id without a name or an address", () => {
    const token = mintPraxisToken(CONTACT)!;
    expect(readPraxisToken(token)).toBe(CONTACT);
    expect(Buffer.from(token.split(".")[0]!, "base64url").toString("utf8")).toMatch(/^[0-9a-f-]{36}:\d+$/u);
  });

  it("is not interchangeable with the calendar token", () => {
    expect(readPraxisToken(mintSalesCallToken(CONTACT))).toBeNull();
    expect(readSalesCallToken(mintPraxisToken(CONTACT))).toBeNull();
  });

  it("rejects tampering and stays valid for half a year", () => {
    const issued = new Date("2026-10-16T10:00:00Z");
    const token = mintPraxisToken(CONTACT, issued)!;
    expect(readPraxisToken(`${token}x`)).toBeNull();
    expect(readPraxisToken(token, new Date("2027-03-01T10:00:00Z"))).toBe(CONTACT);
    expect(readPraxisToken(token, new Date("2027-05-01T10:00:00Z"))).toBeNull();
    expect(readPraxisToken(undefined)).toBeNull();
  });

  it("does nothing without a secret", () => {
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "");
    expect(mintPraxisToken(CONTACT)).toBeNull();
  });
});

describe("praxis mail", () => {
  it("greets by name, carries the link and says how to opt out", () => {
    const link = praxisLink("https://x-portal.eu", "abc.def");
    expect(link).toBe("https://x-portal.eu/praxis?t=abc.def");
    const mail = praxisMailDraft({ contactName: "Maria Muster" }, link);
    expect(mail.subject).toBe("Wie besprochen: so arbeiten andere Unternehmen schon mit KI");
    expect(mail.body.startsWith("Guten Tag Maria Muster,")).toBe(true);
    expect(mail.body).toContain(link);
    expect(mail.body).toContain("+49 175 8934338");
    expect(mail.body).toContain("im Telefonat zugestimmt");
    expect(mail.body).toContain("keine weiteren Nachrichten");
  });

  it("works without a name and without a token", () => {
    expect(praxisMailDraft({ contactName: null }, praxisLink("https://x-portal.eu", null)).body).toMatch(/^Guten Tag,\n[\s\S]*https:\/\/x-portal\.eu\/praxis\n/u);
  });
});
