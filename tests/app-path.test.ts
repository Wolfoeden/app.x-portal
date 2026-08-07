import { describe, expect, it } from "vitest";

import { appPath, normalizeAppBasePath } from "@/lib/app-path";

describe("application base path", () => {
  it("normalizes configured deployment prefixes", () => {
    expect(normalizeAppBasePath("/chat/")).toBe("/chat");
    expect(normalizeAppBasePath(" chat ")).toBe("/chat");
    expect(normalizeAppBasePath(undefined)).toBe("");
  });

  it("keeps local paths unchanged when no prefix is configured", () => {
    expect(appPath("/api/chat")).toBe("/api/chat");
  });
});
