import { describe, expect, it } from "vitest";

import {
  LEAD_BULK_SEND_LIMIT,
  isLeadScope,
  isLeadStatus,
  leadHeadline,
  leadSourceUrl,
} from "@/lib/leadgen/limits";

describe("Lead-Konstanten", () => {
  it("erkennt nur die vier Zustände, die die Datenbank zulässt", () => {
    expect(isLeadStatus("new")).toBe(true);
    expect(isLeadStatus("contacted")).toBe(true);
    expect(isLeadStatus("replied")).toBe(true);
    expect(isLeadStatus("dismissed")).toBe(true);
    expect(isLeadStatus("archived")).toBe(false);
    expect(isLeadStatus(null)).toBe(false);
  });

  it("erkennt nur die drei Ansichten", () => {
    expect(isLeadScope("open")).toBe(true);
    expect(isLeadScope("archived")).toBe(true);
    expect(isLeadScope("all")).toBe(true);
    expect(isLeadScope("offen")).toBe(false);
  });

  it("hält den Stapelversand bei der Tagesmenge eines Postfachs", () => {
    expect(LEAD_BULK_SEND_LIMIT).toBe(20);
  });
});

describe("leadHeadline", () => {
  it("nimmt den Titel vor dem ersten Gedankenstrich", () => {
    expect(
      leadHeadline(
        "Senior DevOps Engineer – Kubernetes | Remote — Baut CI/CD auf. — https://example.invalid/x",
      ),
    ).toBe("Senior DevOps Engineer – Kubernetes | Remote");
  });

  it("gibt den ganzen Text zurück, wenn kein Trenner vorkommt", () => {
    expect(leadHeadline("Projektmanager gesucht")).toBe(
      "Projektmanager gesucht",
    );
  });
});

describe("leadSourceUrl", () => {
  it("findet die Adresse am Ende der Zeile", () => {
    expect(
      leadSourceUrl("Rolle — Beschreibung — https://www.example.invalid/p/123"),
    ).toBe("https://www.example.invalid/p/123");
  });

  it("lässt ein Satzzeichen am Ende weg, statt es mitzunehmen", () => {
    expect(leadSourceUrl("Rolle — siehe https://example.invalid/p/9.")).toBe(
      "https://example.invalid/p/9",
    );
  });

  it("gibt null zurück, wenn keine Adresse enthalten ist", () => {
    expect(leadSourceUrl("Rolle — Beschreibung ohne Link")).toBeNull();
  });
});
