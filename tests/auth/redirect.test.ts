import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applicationDestination,
  applicationOrigin,
  safeApplicationPath,
} from "@/lib/auth/redirect";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  vi.unstubAllEnvs();
  process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

describe("safeApplicationPath", () => {
  it("preserves the recovery destination without permitting another origin", () => {
    expect(safeApplicationPath("/chat?set-password=1")).toBe(
      "/chat?set-password=1",
    );
    expect(safeApplicationPath("/%5Cevil.example")).toBe("/chat");
  });
});

describe("applicationOrigin", () => {
  it("uses the configured public origin behind a hosting proxy", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://x-portal.eu";

    expect(
      applicationOrigin(
        new Request("https://main--app-x-portal-chat.netlify.app/auth/callback"),
      ),
    ).toBe("https://x-portal.eu");
  });

  it("falls back to the request origin when no site URL is configured", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;

    expect(
      applicationOrigin(new Request("http://localhost:3001/auth/callback")),
    ).toBe("http://localhost:3001");
  });

  it.each(["http://localhost:3001", "http://127.0.0.1:3001"])(
    "rejects a local site URL in production: %s",
    (siteUrl) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", siteUrl);

      expect(
        applicationOrigin(new Request("https://x-portal.eu/auth/callback")),
      ).toBe("https://x-portal.eu");
    },
  );

  it("rejects a non-HTTPS site URL in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://x-portal.eu");

    expect(
      applicationOrigin(new Request("https://x-portal.eu/auth/callback")),
    ).toBe("https://x-portal.eu");
  });

  it("keeps a Netlify deploy preview on its own HTTPS origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CONTEXT", "deploy-preview");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://x-portal.eu");

    expect(
      applicationOrigin(
        new Request(
          "https://deploy-preview-12--app-x-portal-chat.netlify.app/auth/callback",
        ),
      ),
    ).toBe("https://deploy-preview-12--app-x-portal-chat.netlify.app");
  });

  it("falls back safely when the configured site URL is malformed", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "not a URL");

    expect(
      applicationOrigin(new Request("https://x-portal.eu/auth/callback")),
    ).toBe("https://x-portal.eu");
  });
});

describe("applicationDestination", () => {
  it("keeps an internal path and query on the configured public origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://x-portal.eu";

    expect(
      applicationDestination(
        new Request("https://main--app-x-portal-chat.netlify.app/auth/callback"),
        "/chat?set-password=1",
      ).toString(),
    ).toBe("https://x-portal.eu/chat?set-password=1");
  });

  it.each(["//evil.example", "/\\evil.example", "https://evil.example"])(
    "rejects an unsafe next destination: %s",
    (candidate) => {
      process.env.NEXT_PUBLIC_SITE_URL = "https://x-portal.eu";

      expect(
        applicationDestination(
          new Request("https://x-portal.eu/auth/callback"),
          candidate,
        ).toString(),
      ).toBe("https://x-portal.eu/chat");
    },
  );
});
