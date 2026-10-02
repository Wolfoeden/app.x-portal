import { describe, expect, it } from "vitest";

import { PLACEMENT_TERMS } from "@/lib/placement/config";
import {
  MANDATE_STATUSES,
  briefLine,
  isMandateStatus,
  mandateAge,
  mandateMailDraft,
} from "@/lib/placement/mandate-model";
import { mandateNotice } from "@/lib/placement/messages";

describe("search mandate rules", () => {
  it("knows its statuses", () => {
    expect(MANDATE_STATUSES).toEqual(["open", "in_progress", "introduced", "closed", "declined"]);
    expect(isMandateStatus("in_progress")).toBe(true);
    expect(isMandateStatus("paid")).toBe(false);
  });

  it("puts the understood requirements into one line", () => {
    expect(
      briefLine({
        requiredSkills: ["AI Agents", "Python", "LangGraph"],
        startWindow: { raw: "Start im November" },
        workMode: "remote",
      }),
    ).toBe("AI Agents, Python, LangGraph · Start im November · remote");
    expect(briefLine({ requiredSkills: [], workMode: "on_site" })).toBe("vor Ort");
    expect(briefLine({ requiredSkills: [], workMode: "unknown" })).toBeNull();
    expect(briefLine(null)).toBeNull();
  });

  it("drafts the first answer with what is missing and the fee", () => {
    const draft = mandateMailDraft({ contactName: "Kim", projectTitle: "AI Agent für den Support", briefSummary: "AI Agents, Python" });
    expect(draft.subject).toBe("Ihr Suchauftrag bei XPORTAL: AI Agent für den Support");
    expect(draft.body).toMatch(/^Guten Tag Kim,/u);
    expect(draft.body).toContain("Verstanden haben wir: AI Agents, Python");
    expect(draft.body).toContain(`${PLACEMENT_TERMS.feePercent} % des vereinbarten Honorars der ersten ${PLACEMENT_TERMS.feeMonths} Monate`);
    expect(mandateMailDraft({ contactName: null, projectTitle: null, briefSummary: null }).body).toMatch(/^Guten Tag,\n/u);
  });

  it("says how long a mandate has been waiting", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    expect(mandateAge("2026-10-03T11:30:00Z", now)).toBe("gerade eben");
    expect(mandateAge("2026-10-03T07:00:00Z", now)).toBe("seit 5 Std.");
    expect(mandateAge("2026-10-02T09:00:00Z", now)).toBe("seit 1 Tag");
    expect(mandateAge("2026-09-30T09:00:00Z", now)).toBe("seit 3 Tagen");
  });

  it("tells the operator who wants what, and warns about an unconfirmed address", () => {
    const notice = mandateNotice({
      siteUrl: "https://x-portal.eu",
      contactEmail: "kunde@firma.invalid",
      company: "Firma GmbH",
      name: "Kim",
      phone: "+49 30 123456",
      note: "Start im November",
      guest: true,
      projectTitle: "AI Agent für den Support",
      briefSummary: "AI Agents, Python",
      mandateId: "m-1",
    });
    expect(notice.subject).toBe("Suchauftrag: AI Agent für den Support");
    expect(notice.text).toContain("Kontakt: kunde@firma.invalid · Kim · Firma GmbH");
    expect(notice.text).toContain("Telefon: +49 30 123456");
    expect(notice.text).toContain("Notiz: Start im November");
    expect(notice.text).toContain("E-Mail-Adresse ist nicht bestätigt");
    expect(notice.text).toContain("https://x-portal.eu/chat/admin/vermittlungen");
  });
});
