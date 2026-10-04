import { describe, expect, it } from "vitest";

import { profileStrength, type StrengthInput } from "@/lib/freelancer/profile-strength";

const NOW = new Date("2026-10-02T10:00:00.000Z");
const full: StrengthInput = {
  hasPhoto: true,
  summaryLength: 320,
  projects: [{ hasOutcome: true }, { hasOutcome: true }],
  hasRate: true,
  seeking: "projects",
  availabilityUpdatedAt: "2026-09-20T08:00:00.000Z",
  skillsCount: 8,
  industriesCount: 2,
  now: NOW,
};

describe("profile strength", () => {
  it("counts a complete profile as strong", () => {
    const strength = profileStrength(full);
    expect(strength).toMatchObject({ done: 8, total: 8, level: "Stark", next: null });
  });

  it("names the most helpful next step first", () => {
    const bare = profileStrength({ ...full, hasPhoto: false, projects: [], summaryLength: 40 });
    expect(bare.next?.key).toBe("project");
    expect(bare.done).toBe(4);
    expect(profileStrength({ ...full, hasPhoto: false }).next?.key).toBe("photo");
  });

  it("does not ask people looking for a permanent job for a fee", () => {
    const strength = profileStrength({ ...full, seeking: "employment", hasRate: false });
    expect(strength.total).toBe(7);
    expect(strength.steps.some((step) => step.key === "rate")).toBe(false);
  });

  it("treats an old availability statement as open", () => {
    expect(profileStrength({ ...full, availabilityUpdatedAt: "2026-07-01T08:00:00.000Z" }).next?.key).toBe("availability");
    expect(profileStrength({ ...full, availabilityUpdatedAt: null }).done).toBe(7);
  });

  it("speaks in counts, not percentages", () => {
    const text = JSON.stringify(profileStrength({ ...full, projects: [] }));
    expect(text).not.toMatch(/\d+\s?%/u);
  });
});
