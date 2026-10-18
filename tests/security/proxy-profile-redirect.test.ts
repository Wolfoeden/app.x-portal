import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import proxy, { config } from "@/proxy";

const ID = "c314d7c4-4428-45ac-ba54-1a657b9f6b62";
const PROJECT = "11111111-1111-4111-8111-111111111111";

const call = (path: string) => proxy(new NextRequest(`https://x-portal.eu${path}`));

// 14.10.2026: Das Profil-Panel im Talent Index ist weg; alte Links mit
// `?profil=` landen direkt auf der Profilseite.
describe("proxy: /chat?profil=", () => {
  it("sends a profile link straight to the profile page", () => {
    const response = call(`/chat?profil=${ID}`);
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe(`/profil/${ID}`);
    expect(location.searchParams.get("profil")).toBeNull();
  });

  it("keeps the project so the page shows its evidence", () => {
    const location = new URL(call(`/chat?profil=${ID}&projekt=${PROJECT}`).headers.get("location")!);
    expect(location.searchParams.get("projekt")).toBe(PROJECT);
  });

  it("leaves the Talent Index and anything else alone", () => {
    expect(call("/chat").headers.get("location")).toBeNull();
    expect(call("/chat?profil=../admin").headers.get("location")).toBeNull();
    expect(call(`/fuer-unternehmen?profil=${ID}`).headers.get("location")).toBeNull();
  });
});

// 18.10.2026: Der Proxy läuft nur noch, wo Seiten je Anfrage entstehen; die
// öffentlichen Seiten kommen ohne Edge-Funktion aus dem CDN. Gespräche und
// Merkliste zeigen denselben Talent Index und gehören dazu.
describe("proxy: where it runs", () => {
  it("covers the Talent Index, its views and the profile pages, nothing else", () => {
    expect(config.matcher.map((entry) => entry.source)).toEqual([
      "/chat/:path*",
      "/profil/:path*",
      "/gespraeche/:path*",
      "/mein-team/:path*",
    ]);
  });
});
