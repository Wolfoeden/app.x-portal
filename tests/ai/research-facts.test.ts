import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { RESEARCH_MAX_RESULTS } from "@/components/chat/agent-launch";
import { MAX_EXTERNAL_FREELANCER_RESULTS } from "@/lib/openai/external-freelancer-search";

// Die Zeile „bis zu 3 Profile“ vor dem Start (Audit F09) muss zur Suche passen.
describe("research facts before the start", () => {
  it("states the same result limit the search enforces", () => {
    expect(RESEARCH_MAX_RESULTS).toBe(MAX_EXTERNAL_FREELANCER_RESULTS);
  });
});
