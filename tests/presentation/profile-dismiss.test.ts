import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BRIEF_FIELDS } from "@/components/chat/brief-editor";
import { previewBrief, previewProfiles } from "@/components/chat/preview-fixtures";
import { ResultSection } from "@/components/chat/results";
import {
  PROFILE_FEEDBACK_REASONS,
  PROFILE_FEEDBACK_REFINEMENT,
  readDismissedProfiles,
  summarizeProfileFeedback,
} from "@/lib/freelancer/profile-feedback";

type SectionProps = ComponentProps<typeof ResultSection>;

function section(overrides: Partial<SectionProps> = {}) {
  return renderToStaticMarkup(
    createElement(ResultSection, {
      brief: previewBrief,
      projectId: "project/test",
      profiles: previewProfiles,
      partialProfiles: [],
      matchingStatus: "ranked",
      analysis: null,
      analysisMode: "ai",
      externalSearch: null,
      externalSearchState: "idle",
      onExternalSearch: () => undefined,
      isAccountUser: true,
      creditsRemaining: 90,
      onNeedCredits: () => undefined,
      onRequireLogin: () => undefined,
      selectedProfileId: null,
      onSelect: () => undefined,
      onContact: () => undefined,
      onRequestBooking: () => undefined,
      expandedProfileUrl: null,
      onToggleExpand: () => undefined,
      savedFreelancerIds: [],
      onToggleSave: () => undefined,
      profileFocus: false,
      onToggleProfileFocus: () => undefined,
      onUpdateBrief: () => undefined,
      onDismissProfile: () => undefined,
      onRestoreProfile: () => undefined,
      ...overrides,
    }),
  );
}

describe("Passt nicht", () => {
  const [first, second] = previewProfiles;

  it("bietet an jeder Profilkarte „Passt nicht“ an", () => {
    const markup = section();

    expect(markup.split("profile-dismiss-toggle").length - 1).toBe(
      Math.min(previewProfiles.length, 3),
    );
  });

  it("zeigt den Knopf nur, wenn jemand die Rückmeldung annimmt", () => {
    expect(section({ onDismissProfile: undefined })).not.toContain("profile-dismiss-toggle");
  });

  it("blendet ein verworfenes Profil aus und bietet Rückgängig an", () => {
    const markup = section({
      dismissedProfiles: [{ profileId: first!.id, reason: "price" }],
    });

    expect(markup).toContain(`<strong>${first!.displayName}</strong> ausgeblendet · Zu teuer`);
    expect(markup).toContain("Rückgängig");
    expect(markup.split(`aria-label="${first!.displayName} passt nicht"`).length - 1).toBe(0);
    expect(markup).toContain(second!.displayName);
  });

  it("öffnet das Kriterium, das zum Grund gehört, und sucht erst auf Anweisung", () => {
    const markup = section({
      dismissedProfiles: [{ profileId: first!.id, reason: "price" }],
    });

    expect(markup).toContain("refine-field-budgetOrRate");
    expect(markup).toContain("Teurere Profile fallen dann heraus.");
    expect(markup).not.toContain("refine-field-hardRequirements");
  });

  it("macht aus „alle verworfen“ den Weg zur Recherche", () => {
    const markup = section({
      dismissedProfiles: previewProfiles.map((profile) => ({
        profileId: profile.id,
        reason: "role" as const,
      })),
    });

    expect(markup).toContain("Alle Vorschläge als unpassend markiert");
    expect(markup).toContain("Öffentlich weitersuchen");
    expect(markup).not.toContain("keine Qualitätsklassifikation");
  });
});

describe("Gründe und ihre Wirkung", () => {
  it("führt jeder Grund mit Kriterium auf ein Feld, das der Editor kennt", () => {
    const felder = new Set(BRIEF_FIELDS.map(({ field }) => field));
    for (const reason of PROFILE_FEEDBACK_REASONS) {
      const refinement = PROFILE_FEEDBACK_REFINEMENT[reason];
      if (refinement) expect(felder.has(refinement.field as never), reason).toBe(true);
    }
  });

  it("verrechnet ein Zurücknehmen mit dem Grund, zu dem es gehört", () => {
    expect(
      summarizeProfileFeedback([
        { action: "profile_feedback_unsuitable", reason: "price" },
        { action: "profile_feedback_unsuitable", reason: "price" },
        { action: "profile_feedback_unsuitable", reason: "role" },
        { action: "profile_feedback_withdrawn", reason: "role" },
        { action: "profile_feedback_unsuitable", reason: "unbekannt" },
      ]),
    ).toEqual([{ reason: "price", count: 2 }]);
  });

  it("liest nur gültige Einträge aus dem Browser-Speicher", () => {
    expect(readDismissedProfiles(null)).toEqual({});
    expect(readDismissedProfiles("kein json")).toEqual({});
    expect(
      readDismissedProfiles(
        JSON.stringify({
          p1: [
            { profileId: "a", reason: "price" },
            { profileId: "b", reason: "erfunden" },
          ],
          p2: "falsch",
        }),
      ),
    ).toEqual({ p1: [{ profileId: "a", reason: "price" }] });
  });
});
