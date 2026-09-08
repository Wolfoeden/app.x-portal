import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fetchSite, rejectUrl } from "@/lib/sourcing/fetch-site";

describe("rejectUrl", () => {
  it("lässt eine gewöhnliche HTTPS-Seite durch", () => {
    expect(rejectUrl("https://www.schankin-it.de/impressum")).toBeNull();
  });

  it("weist alles ab, was nicht ins offene Netz zeigt", () => {
    expect(rejectUrl("http://schankin-it.de")).toBe("not_https");
    expect(rejectUrl("https://user:pass@schankin-it.de")).toBe("has_credentials");
    expect(rejectUrl("https://127.0.0.1/")).toBe("ip_literal");
    expect(rejectUrl("https://169.254.169.254/latest/meta-data/")).toBe("ip_literal");
    expect(rejectUrl("https://[::1]/")).toBe("ip_literal");
    expect(rejectUrl("https://localhost/")).toBe("internal_name");
    expect(rejectUrl("https://metadata.google.internal/")).toBe("internal_name");
    expect(rejectUrl("https://buildserver.internal/")).toBe("internal_name");
    expect(rejectUrl("https://intranet/")).toBe("internal_name");
    expect(rejectUrl("nicht mal eine adresse")).toBe("unparsable");
  });
});

describe("fetchSite", () => {
  function antwort(
    body: string,
    init: { status?: number; headers?: Record<string, string> } = {},
  ): Response {
    return new Response(body, {
      status: init.status ?? 200,
      headers: { "content-type": "text/html", ...(init.headers ?? {}) },
    });
  }

  it("holt eine Seite", async () => {
    const ergebnis = await fetchSite("https://schankin-it.de/", {
      fetchImpl: async () => antwort("<html>hallo</html>"),
    });
    expect(ergebnis.ok).toBe(true);
    if (ergebnis.ok) expect(ergebnis.html).toContain("hallo");
  });

  it("prüft auch das Ziel einer Weiterleitung", async () => {
    // Der gefährliche Fall: harmlose Adresse, die nach innen weiterleitet.
    const gerufen: string[] = [];
    const ergebnis = await fetchSite("https://schankin-it.de/", {
      fetchImpl: async (url) => {
        gerufen.push(String(url));
        return antwort("", {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        });
      },
    });
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.reason).toBe("not_https");
    // Genau ein Abruf: das Weiterleitungsziel wurde nicht mehr geöffnet.
    expect(gerufen).toHaveLength(1);
  });

  it("folgt einer harmlosen Weiterleitung", async () => {
    let erster = true;
    const ergebnis = await fetchSite("https://schankin-it.de/", {
      fetchImpl: async () => {
        if (erster) {
          erster = false;
          return antwort("", {
            status: 301,
            headers: { location: "https://www.schankin-it.de/" },
          });
        }
        return antwort("<html>ziel</html>");
      },
    });
    expect(ergebnis.ok).toBe(true);
    if (ergebnis.ok) {
      expect(ergebnis.url).toBe("https://www.schankin-it.de/");
      expect(ergebnis.html).toContain("ziel");
    }
  });

  it("lehnt ab, was kein HTML ist", async () => {
    const ergebnis = await fetchSite("https://schankin-it.de/datei.pdf", {
      fetchImpl: async () =>
        antwort("%PDF", { headers: { "content-type": "application/pdf" } }),
    });
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.reason).toBe("not_html");
  });

  it("schneidet eine übergroße Seite ab, statt sie ganz zu laden", async () => {
    const ergebnis = await fetchSite("https://schankin-it.de/", {
      maxBytes: 10,
      fetchImpl: async () => antwort("x".repeat(500)),
    });
    expect(ergebnis.ok).toBe(true);
    if (ergebnis.ok) {
      expect(ergebnis.html).toHaveLength(10);
      expect(ergebnis.truncated).toBe(true);
    }
  });

  it("meldet einen Fehlerstatus, statt ihn zu verschlucken", async () => {
    const ergebnis = await fetchSite("https://schankin-it.de/", {
      fetchImpl: async () => antwort("weg", { status: 404 }),
    });
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.reason).toBe("http_error");
  });
});
