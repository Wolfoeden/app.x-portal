import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { GET as llmsText } from "@/app/llms.txt/route";
import { IMPRINT_EMAIL } from "@/lib/legal/policy";
import {
  breadcrumbStructuredData,
  serializeStructuredData,
  siteStructuredData,
} from "@/lib/structured-data";

import {
  INDEXABLE_PATHS,
  NON_INDEXABLE_PREFIXES,
  SITE_URL,
  SITEMAP_ENTRIES,
  AI_CRAWLER_POLICY,
  CHAT_PAGE,
  MARKETING_PAGES,
  ROBOTS_DISALLOW_PATHS,
  absoluteUrl,
  pageMetadata,
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

/** Evaluate path precedence, including $ and *, instead of assuming inheritance. */
function isAllowed(userAgent: string, path: string): boolean {
  const rules = robots().rules;
  const groups = Array.isArray(rules) ? rules : [rules];
  const agents = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value : [value];
  const group = groups.find((item) => agents(item.userAgent).includes(userAgent))
    ?? groups.find((item) => agents(item.userAgent).includes("*"));
  if (!group) throw new Error("Missing crawler group");
  const list = (value: string | string[] | undefined) =>
    value === undefined ? [] : Array.isArray(value) ? value : [value];
  const matches = (rule: string) => {
    const end = rule.endsWith("$");
    const source = (end ? rule.slice(0, -1) : rule)
      .split("*")
      .map((part) => part.replace(/[.*+?^{}()|[\]\\]/gu, "\\$&"))
      .join(".*");
    return new RegExp("^" + source + (end ? "$" : ""), "u").test(path);
  };
  const applicable = [
    ...list(group.allow).map((rule) => ({ rule, allow: true })),
    ...list(group.disallow).map((rule) => ({ rule, allow: false })),
  ].filter(({ rule }) => matches(rule));
  applicable.sort((a, b) =>
    b.rule.replace(/[*$]/gu, "").length - a.rule.replace(/[*$]/gu, "").length
    || Number(b.allow) - Number(a.allow));
  return applicable[0]?.allow ?? true;
}

describe("public SEO outputs", () => {
  it("derives sitemap, metadata and robots from the central registry", () => {
    expect(sitemap().map((entry) => entry.url)).toEqual(INDEXABLE_PATHS.map(absoluteUrl));
    expect(robots().sitemap).toBe(absoluteUrl("/sitemap.xml"));
    for (const page of [CHAT_PAGE, ...MARKETING_PAGES]) {
      expect(pageMetadata(page)).toMatchObject({
        title: page.title,
        description: page.description,
        alternates: { canonical: absoluteUrl(page.path) },
        robots: { index: true, follow: true },
        openGraph: { url: absoluteUrl(page.path), locale: "de_DE" },
      });
      expect(sitemap().filter((entry) => entry.url === absoluteUrl(page.path))).toHaveLength(1);
    }
  });

  it("uses unique titles, descriptions and canonical URLs", () => {
    const pages = [CHAT_PAGE, ...MARKETING_PAGES];
    for (const values of [
      pages.map((page) => page.title),
      pages.map((page) => page.description),
      pages.map((page) => pageMetadata(page).alternates?.canonical),
    ]) {
      expect(new Set(values).size).toBe(pages.length);
      expect(values.every(Boolean)).toBe(true);
    }
    for (const entry of sitemap()) {
      const url = new URL(entry.url);
      expect(["http:", "https:"]).toContain(url.protocol);
      expect(url.origin).toBe(new URL(SITE_URL).origin);
      expect(url.search).toBe("");
      expect(url.hash).toBe("");
      expect(url.pathname).not.toContain("//");
    }
  });

  it("keeps public pages crawlable for search and separate AI policies", () => {
    expect(Object.keys(AI_CRAWLER_POLICY)).toEqual([
      "OAI-SearchBot", "GPTBot", "Google-Extended",
    ]);
    for (const agent of ["Googlebot", "OAI-SearchBot", "GPTBot", "Google-Extended"]) {
      for (const path of INDEXABLE_PATHS) {
        expect(isAllowed(agent, path), agent + " " + path).toBe(true);
      }
      expect(isAllowed(agent, "/chat?q=SAP")).toBe(true);
    }
  });

  it("blocks private, auth and token routes even in specific bot groups", () => {
    const privatePaths = [
      "/api/", "/api/funnel-events", "/api?debug=1",
      "/chat/admin", "/chat/admin?tab=users", "/chat/admin/users",
      "/chat/preview", "/chat/agent-grid",
      "/mein-team", "/mein-team?list=1",
      "/booking", "/booking/secret", "/booking?token=secret",
      "/whitelist/confirm?token=secret", "/whitelist",
      "/auth", "/auth/callback?code=secret", "/auth?token=secret",
    ];
    for (const agent of ["Googlebot", "OAI-SearchBot", "GPTBot", "Google-Extended"]) {
      for (const path of privatePaths) {
        expect(isAllowed(agent, path), agent + " " + path).toBe(false);
      }
    }
    const groups = robots().rules;
    expect(Array.isArray(groups)).toBe(true);
    if (!Array.isArray(groups)) return;
    for (const group of groups) {
      expect(group.disallow).toEqual(ROBOTS_DISALLOW_PATHS);
    }
    expect(NON_INDEXABLE_PREFIXES).toContain("/auth/");
  });

  it("does not invent a content modification date on each build", () => {
    expect(sitemap().every((entry) => entry.lastModified === undefined)).toBe(true);
  });

  it("provides a small German llms.txt with real public URLs only", async () => {
    const response = llmsText();
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    const text = await response.text();
    expect(text).toMatch(/^# XPORTAL\n/u);
    expect(text).toContain("optional");
    expect(text).toContain("regelbasiert");
    for (const page of [CHAT_PAGE, ...MARKETING_PAGES]) {
      expect(text.split("(" + absoluteUrl(page.path) + ")")).toHaveLength(2);
    }
    const links = [...text.matchAll(/\]\((https?:\/\/[^)]+)\)/gu)];
    expect(links.length).toBeGreaterThan(0);
    for (const [, link] of links) {
      expect(INDEXABLE_PATHS).toContain(new URL(link).pathname);
    }
  });

  it("describes only the real brand and website, with no invented social proof", () => {
    const graph = siteStructuredData()["@graph"];
    expect(graph.map((node) => node["@type"])).toEqual(["Organization", "WebSite"]);
    expect(graph[0]).toMatchObject({
      name: "XPORTAL", email: IMPRINT_EMAIL, url: SITE_URL,
    });
    expect(graph[1]).toMatchObject({ inLanguage: "de-DE" });
    for (const node of graph) {
      expect(node).not.toHaveProperty("sameAs");
      expect(node).not.toHaveProperty("aggregateRating");
    }
    const breadcrumb = breadcrumbStructuredData(CHAT_PAGE);
    expect(breadcrumb.itemListElement.map((item) => item.position)).toEqual([1, 2]);
    expect(breadcrumb.itemListElement.at(-1)?.item).toBe(absoluteUrl("/chat"));
  });

  it("escapes script-closing input without corrupting JSON-LD", () => {
    const payload = { name: "</script><script>alert(1)</script>" };
    const serialized = serializeStructuredData(payload);
    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized)).toEqual(payload);
  });
});
