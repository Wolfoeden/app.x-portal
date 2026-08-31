import { describe, expect, it } from "vitest";

import { shouldHighlightProfile } from "@/components/chat/profile-fit";

const THRESHOLD = 70;

describe("profile highlight", () => {
  it("highlights a profile above the recommendation threshold", () => {
    expect(
      shouldHighlightProfile({ coreCoverage: 100, recommendationRole: "primary" }, THRESHOLD),
    ).toBe(true);
    expect(
      shouldHighlightProfile({ coreCoverage: 71, recommendationRole: "alternative" }, THRESHOLD),
    ).toBe(true);
  });

  // Genau auf der Schwelle ist ein Profil gerade noch empfehlbar, aber kein
  // Fund, den man jemandem entgegenleuchten laesst.
  it("stays quiet at or below the threshold", () => {
    expect(
      shouldHighlightProfile({ coreCoverage: THRESHOLD, recommendationRole: "primary" }, THRESHOLD),
    ).toBe(false);
    expect(
      shouldHighlightProfile({ coreCoverage: 40, recommendationRole: "primary" }, THRESHOLD),
    ).toBe(false);
  });

  // Ein Teiltreffer steht ausdruecklich als "nicht empfohlen" da. Ein gruener
  // Puls daneben wuerde genau das Gegenteil sagen.
  it("never highlights a profile that is not recommended", () => {
    expect(
      shouldHighlightProfile({ coreCoverage: 100, recommendationRole: "partial" }, THRESHOLD),
    ).toBe(false);
  });

  it("stays quiet when nothing was scored", () => {
    expect(
      shouldHighlightProfile({ coreCoverage: null, recommendationRole: "primary" }, THRESHOLD),
    ).toBe(false);
  });
});
