import { afterEach, describe, expect, it } from "vitest";

import {
  applicationDestination,
  applicationOrigin,
} from "@/lib/auth/redirect";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
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
