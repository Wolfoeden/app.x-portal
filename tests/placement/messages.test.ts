import { describe, expect, it } from "vitest";

import {
  declineForClient,
  introductionForClient,
  introductionForFreelancer,
  placementRequestNotice,
} from "@/lib/placement/messages";

const PARTIES = {
  siteUrl: "https://x-portal.eu",
  clientName: "Erika Muster",
  clientEmail: "erika@firma.example",
  freelancerName: "Mira Falk",
  freelancerRole: "Senior Data Engineer",
  projectTitle: "Datenplattform für den Vertrieb",
};

describe("placement emails", () => {
  it("tells the operator what is missing before an introduction can go out", () => {
    const notice = placementRequestNotice({
      siteUrl: "https://x-portal.eu",
      clientEmail: "erika@firma.example",
      freelancerName: "Mira Falk",
      freelancerRole: "Senior Data Engineer",
      projectTitle: null,
      requestId: "req-1",
      freelancerReachable: false,
    });

    expect(notice.subject).toBe("Vermittlungsanfrage: Mira Falk");
    expect(notice.text).toContain("erika@firma.example");
    expect(notice.text).toContain("Freelancer-E-Mail: fehlt");
    expect(notice.text).toContain("https://x-portal.eu/chat/admin/vermittlungen");
  });

  // Wer vorgestellt wird, soll vom Honorar nicht erst aus der Rechnung erfahren.
  it("gives the client the calendar and repeats the fee with the terms", () => {
    const mail = introductionForClient({
      ...PARTIES,
      bookingUrl: "https://calendly.com/mira",
      freelancerNotified: true,
    });

    expect(mail.subject).toBe("Vorstellung: Mira Falk für Datenplattform für den Vertrieb");
    expect(mail.text).toContain("Guten Tag Erika Muster,");
    expect(mail.text).toContain("https://calendly.com/mira");
    expect(mail.text).toContain("10 % des vereinbarten Honorars der ersten 3 Monate");
    expect(mail.text).toContain("https://x-portal.eu/vermittlungsbedingungen");
    expect(mail.text).toContain("ebenfalls erhalten");
  });

  it("does not claim the freelancer was told when no mail went out", () => {
    const mail = introductionForClient({ ...PARTIES, bookingUrl: null, freelancerNotified: false });

    expect(mail.text).toContain("meldet sich in den nächsten Tagen");
    expect(mail.text).not.toContain("ebenfalls erhalten");
  });

  it("gives the freelancer the contact and says the placement is free for them", () => {
    const mail = introductionForFreelancer({ ...PARTIES, hasCalendar: true });

    expect(mail.subject).toBe("Anfrage über XPORTAL: Datenplattform für den Vertrieb");
    expect(mail.text).toContain("Erika Muster, erika@firma.example");
    expect(mail.text).toContain("für Sie kostenlos");
    expect(mail.text).toContain("Beauftragung");
  });

  it("explains a decline and offers another profile", () => {
    const mail = declineForClient({
      siteUrl: "https://x-portal.eu",
      clientName: null,
      freelancerName: "Mira Falk",
      projectTitle: "Datenplattform",
      reason: "Sie ist bis Dezember ausgebucht.",
    });

    expect(mail.text).toContain("Guten Tag,");
    expect(mail.text).toContain("derzeit nicht vorstellen. Sie ist bis Dezember ausgebucht.");
    expect(mail.text).toContain("weitere passende Profile");
  });
});
