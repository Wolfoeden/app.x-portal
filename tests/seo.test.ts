import { describe, expect, it } from "vitest";

import {
  INDEXABLE_PATHS,
  NON_INDEXABLE_PREFIXES,
  SITE_URL,
  SITEMAP_ENTRIES,
} from "@/lib/seo";

describe("indexing rules", () => {
  it("never lists a page it also blocks", () => {
    // Der klassische Widerspruch: eine Seite steht in der Sitemap und ist
    // gleichzeitig in robots.txt gesperrt. Auffallen würde das sonst
    // niemandem.
    for (const path of INDEXABLE_PATHS) {
      for (const blocked of NON_INDEXABLE_PREFIXES) {
        expect(
          path.startsWith(blocked),
          `${path} steht in der Sitemap und unter ${blocked} in der Sperrliste`,
        ).toBe(false);
      }
    }
  });

  it("keeps the operator area and the personal views out", () => {
    expect(NON_INDEXABLE_PREFIXES).toContain("/chat/admin/");
    expect(NON_INDEXABLE_PREFIXES).toContain("/mein-team");
    expect(NON_INDEXABLE_PREFIXES).toContain("/api/");
    // Zwischenseiten ergeben ohne ID oder Token keinen Sinn.
    expect(NON_INDEXABLE_PREFIXES).toContain("/booking/");
    expect(NON_INDEXABLE_PREFIXES).toContain("/whitelist/");
  });

  it("keeps the product landing page indexable", () => {
    expect(INDEXABLE_PATHS).toContain("/chat");
    expect(SITEMAP_ENTRIES.find((entry) => entry.path === "/chat")?.priority).toBe(1);
  });

  it("lists every legal page a visitor must be able to find", () => {
    for (const page of ["/imprint", "/privacy", "/terms", "/contact"]) {
      expect(INDEXABLE_PATHS).toContain(page);
    }
  });

  it("builds absolute URLs without a double slash", () => {
    expect(SITE_URL.endsWith("/")).toBe(false);
    for (const entry of SITEMAP_ENTRIES) {
      expect(entry.path.startsWith("/")).toBe(true);
      expect(`${SITE_URL}${entry.path}`).not.toContain("//" + "chat");
    }
  });

  it("has no duplicate entries", () => {
    expect(new Set(INDEXABLE_PATHS).size).toBe(INDEXABLE_PATHS.length);
  });
});
