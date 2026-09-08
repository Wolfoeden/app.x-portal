import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveContactAddress } from "@/lib/sourcing/resolve-address";
import { isOwnSiteHost, searchPersonalSite } from "@/lib/sourcing/site-search";

function suchclient(sites: unknown[]) {
  return {
    parse: async () => ({
      output_parsed: { sites },
      model: "gpt-5.4-nano-2026-03-17",
      usage: { input_tokens: 900, output_tokens: 120 },
    }),
  };
}

const START_SEITE = `
  <html><body>
    <h1>Schankin IT-Beratung</h1>
    <a href="/impressum">Impressum</a>
  </body></html>`;

const EIGENES_IMPRESSUM = `
  <html><body>
    <h1>Impressum</h1>
    <p>Schankin IT-Beratung<br>
    Vertreten durch: Nikolai Schankin<br>
    Musterweg 3, 20095 Hamburg</p>
    <p>E-Mail: nikolai.schankin@schankin-it.de</p>
    <p>Bewerbungen bitte an bewerbung@schankin-it.de</p>
  </body></html>`;

const ARBEITGEBER_IMPRESSUM = `
  <html><body>
    <h1>Impressum</h1>
    <p>Grosse Software GmbH<br>
    Geschäftsführer: Petra Baumann</p>
    <p>E-Mail: info@grosse-software.de</p>
  </body></html>`;

function seitenGeber(seiten: Record<string, string>) {
  return async (url: string | URL): Promise<Response> => {
    const schluessel = String(url);
    const inhalt = seiten[schluessel];
    if (inhalt === undefined) {
      return new Response("weg", {
        status: 404,
        headers: { "content-type": "text/html" },
      });
    }
    return new Response(inhalt, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  };
}

describe("isOwnSiteHost", () => {
  it("hält Marktplätze und Netzwerke nicht für die eigene Seite", () => {
    for (const url of [
      "https://www.freelancermap.de/profil/x",
      "https://de.linkedin.com/in/x",
      "https://www.xing.com/profile/x",
      "https://www.northdata.de/x",
      "https://github.com/x",
    ]) {
      expect(isOwnSiteHost(url)).toBe(false);
    }
  });

  it("lässt eine eigene Domain gelten", () => {
    expect(isOwnSiteHost("https://www.schankin-it.de/")).toBe(true);
  });
});

describe("searchPersonalSite", () => {
  it("wirft Marktplätze weg, auch wenn das Modell sie nennt", async () => {
    const ergebnis = await searchPersonalSite(
      { displayName: "Nikolai Schankin", role: "Entwickler" },
      {
        client: suchclient([
          {
            url: "https://de.linkedin.com/in/nikolai",
            kind: "own_site",
            siteName: "LinkedIn",
            evidence: "Profil",
          },
          {
            url: "https://www.schankin-it.de/",
            kind: "own_company",
            siteName: "Schankin IT",
            evidence: "Inhaber Nikolai Schankin",
          },
        ]),
      },
    );
    expect(ergebnis.sites.map((seite) => seite.url)).toEqual([
      "https://www.schankin-it.de/",
    ]);
  });

  it("meldet einen Anbieterausfall als Ergebnis, statt zu werfen", async () => {
    const ergebnis = await searchPersonalSite(
      { displayName: "Nikolai Schankin", role: "Entwickler" },
      {
        client: {
          parse: async () => {
            throw new Error("Zeitüberschreitung");
          },
        },
      },
    );
    expect(ergebnis.providerAvailable).toBe(false);
    expect(ergebnis.sites).toEqual([]);
  });
});

describe("resolveContactAddress", () => {
  const person = {
    displayName: "Nikolai Schankin",
    role: "Freiberuflicher Software-Entwickler",
    skills: ["PostgreSQL", "Docker"],
  };

  it("findet die persönliche Adresse über das Impressum", async () => {
    const ergebnis = await resolveContactAddress({
      // Diese Faelle pruefen die bezahlte Spur; der kostenlose Vorlauf wuerde
      // hier nur fremde Domains abklappern.
      skipDerivedDomains: true,
      ...person,
      searchClient: suchclient([
        {
          url: "https://www.schankin-it.de/",
          kind: "own_company",
          siteName: "Schankin IT-Beratung",
          evidence: "Vertreten durch: Nikolai Schankin",
        },
      ]),
      fetchImpl: seitenGeber({
        "https://www.schankin-it.de/": START_SEITE,
        "https://www.schankin-it.de/impressum": EIGENES_IMPRESSUM,
      }) as unknown as typeof fetch,
    });

    expect(ergebnis.resolved).toBe(true);
    if (ergebnis.resolved) {
      expect(ergebnis.address.email).toBe("nikolai.schankin@schankin-it.de");
      expect(ergebnis.address.verdict).toBe("usable");
      expect(ergebnis.imprintUrl).toBe("https://www.schankin-it.de/impressum");
      // Das Bewerbungspostfach wurde gesehen und begründet verworfen.
      expect(
        ergebnis.considered.some(
          (wert) =>
            wert.email === "bewerbung@schankin-it.de" &&
            wert.verdict === "wrong_purpose",
        ),
      ).toBe(true);
    }
  });

  it("nimmt das Postfach des Arbeitgebers nicht", async () => {
    const ergebnis = await resolveContactAddress({
      // Diese Faelle pruefen die bezahlte Spur; der kostenlose Vorlauf wuerde
      // hier nur fremde Domains abklappern.
      skipDerivedDomains: true,
      ...person,
      searchClient: suchclient([
        {
          url: "https://www.grosse-software.de/",
          kind: "employer",
          siteName: "Grosse Software GmbH",
          evidence: "Team-Seite nennt Nikolai Schankin",
        },
      ]),
      fetchImpl: seitenGeber({
        "https://www.grosse-software.de/": '<a href="/impressum">Impressum</a>',
        "https://www.grosse-software.de/impressum": ARBEITGEBER_IMPRESSUM,
      }) as unknown as typeof fetch,
    });

    expect(ergebnis.resolved).toBe(false);
    if (!ergebnis.resolved) {
      expect(ergebnis.reason).toBe("no_usable_address");
      expect(ergebnis.considered[0]!.verdict).toBe("third_party_mailbox");
    }
  });

  it("nimmt die eigene Firma vor dem vermuteten Arbeitgeber", async () => {
    const gerufen: string[] = [];
    const geber = seitenGeber({
      "https://www.schankin-it.de/": START_SEITE,
      "https://www.schankin-it.de/impressum": EIGENES_IMPRESSUM,
      "https://www.grosse-software.de/": '<a href="/impressum">Impressum</a>',
      "https://www.grosse-software.de/impressum": ARBEITGEBER_IMPRESSUM,
    });

    const ergebnis = await resolveContactAddress({
      // Diese Faelle pruefen die bezahlte Spur; der kostenlose Vorlauf wuerde
      // hier nur fremde Domains abklappern.
      skipDerivedDomains: true,
      ...person,
      searchClient: suchclient([
        {
          url: "https://www.grosse-software.de/",
          kind: "employer",
          siteName: "Grosse Software GmbH",
          evidence: "Team",
        },
        {
          url: "https://www.schankin-it.de/",
          kind: "own_company",
          siteName: "Schankin IT",
          evidence: "Inhaber",
        },
      ]),
      fetchImpl: (async (url: string | URL) => {
        gerufen.push(String(url));
        return geber(url);
      }) as unknown as typeof fetch,
    });

    expect(ergebnis.resolved).toBe(true);
    // Die eigene Firma wurde zuerst geöffnet, der Arbeitgeber gar nicht.
    expect(gerufen[0]).toBe("https://www.schankin-it.de/");
    expect(gerufen.some((url) => url.includes("grosse-software"))).toBe(false);
  });

  it("findet das Impressum auch ohne Link über den üblichen Pfad", async () => {
    const ergebnis = await resolveContactAddress({
      // Diese Faelle pruefen die bezahlte Spur; der kostenlose Vorlauf wuerde
      // hier nur fremde Domains abklappern.
      skipDerivedDomains: true,
      ...person,
      searchClient: suchclient([
        {
          url: "https://www.schankin-it.de/",
          kind: "own_company",
          siteName: null,
          evidence: "x",
        },
      ]),
      fetchImpl: seitenGeber({
        "https://www.schankin-it.de/": "<html><body>keine Links</body></html>",
        "https://www.schankin-it.de/impressum": EIGENES_IMPRESSUM,
      }) as unknown as typeof fetch,
    });
    expect(ergebnis.resolved).toBe(true);
  });

  it("sagt, wenn die Suche gar nichts fand", async () => {
    const ergebnis = await resolveContactAddress({
      // Diese Faelle pruefen die bezahlte Spur; der kostenlose Vorlauf wuerde
      // hier nur fremde Domains abklappern.
      skipDerivedDomains: true,
      ...person,
      searchClient: suchclient([]),
      fetchImpl: seitenGeber({}) as unknown as typeof fetch,
    });
    expect(ergebnis.resolved).toBe(false);
    if (!ergebnis.resolved) expect(ergebnis.reason).toBe("no_site_found");
  });

  it("unterscheidet 'kein Impressum' von 'keine Adresse'", async () => {
    const ohneImpressum = await resolveContactAddress({
      // Diese Faelle pruefen die bezahlte Spur; der kostenlose Vorlauf wuerde
      // hier nur fremde Domains abklappern.
      skipDerivedDomains: true,
      ...person,
      searchClient: suchclient([
        { url: "https://www.schankin-it.de/", kind: "own_site", siteName: null, evidence: "x" },
      ]),
      fetchImpl: seitenGeber({
        "https://www.schankin-it.de/": "<html><body>nur Text</body></html>",
      }) as unknown as typeof fetch,
    });
    expect(ohneImpressum.resolved).toBe(false);
    if (!ohneImpressum.resolved) expect(ohneImpressum.reason).toBe("no_imprint");

    const ohneAdresse = await resolveContactAddress({
      // Diese Faelle pruefen die bezahlte Spur; der kostenlose Vorlauf wuerde
      // hier nur fremde Domains abklappern.
      skipDerivedDomains: true,
      ...person,
      searchClient: suchclient([
        { url: "https://www.schankin-it.de/", kind: "own_site", siteName: null, evidence: "x" },
      ]),
      fetchImpl: seitenGeber({
        "https://www.schankin-it.de/": START_SEITE,
        "https://www.schankin-it.de/impressum":
          "<h1>Impressum</h1><p>Nikolai Schankin, Inhaber. Telefon 040 1234.</p>",
      }) as unknown as typeof fetch,
    });
    expect(ohneAdresse.resolved).toBe(false);
    if (!ohneAdresse.resolved) expect(ohneAdresse.reason).toBe("no_address");
  });

  it("meldet einen Anbieterausfall gesondert", async () => {
    const ergebnis = await resolveContactAddress({
      // Diese Faelle pruefen die bezahlte Spur; der kostenlose Vorlauf wuerde
      // hier nur fremde Domains abklappern.
      skipDerivedDomains: true,
      ...person,
      searchClient: {
        parse: async () => {
          throw new Error("kaputt");
        },
      },
      fetchImpl: seitenGeber({}) as unknown as typeof fetch,
    });
    expect(ergebnis.resolved).toBe(false);
    if (!ergebnis.resolved) expect(ergebnis.reason).toBe("provider_unavailable");
  });
});

describe("Impressum-Erkennung", () => {
  const person = {
    displayName: "Edgar Behrend",
    role: "IT-Consultant",
  };

  it("nimmt die Seite, die die Suche direkt geliefert hat", async () => {
    // Gemessen: Die Suche liefert oft schon /impressum/. Die erste Fassung
    // hat darauf nach einem Impressumslink gesucht und die Adresse verpasst.
    const gerufen: string[] = [];
    const ergebnis = await resolveContactAddress({
      // Diese Faelle pruefen die bezahlte Spur; der kostenlose Vorlauf wuerde
      // hier nur fremde Domains abklappern.
      skipDerivedDomains: true,
      ...person,
      searchClient: suchclient([
        {
          url: "https://www.behrendek.com/impressum/",
          kind: "own_company",
          siteName: null,
          evidence: "x",
        },
      ]),
      fetchImpl: (async (url: string | URL) => {
        gerufen.push(String(url));
        return new Response(
          "<p>Edgar Behrend, Musterweg 1</p><p>edgar@behrendek.com</p>",
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }) as unknown as typeof fetch,
    });

    expect(ergebnis.resolved).toBe(true);
    // Genau ein Abruf — kein Umweg über Startseite und Pfadraten.
    expect(gerufen).toEqual(["https://www.behrendek.com/impressum/"]);
  });

  it("hält eine Startseite mit Impressumslink nicht für das Impressum", async () => {
    const gerufen: string[] = [];
    await resolveContactAddress({
      // Diese Faelle pruefen die bezahlte Spur; der kostenlose Vorlauf wuerde
      // hier nur fremde Domains abklappern.
      skipDerivedDomains: true,
      ...person,
      searchClient: suchclient([
        { url: "https://www.behrendek.com/", kind: "own_site", siteName: null, evidence: "x" },
      ]),
      fetchImpl: (async (url: string | URL) => {
        gerufen.push(String(url));
        const inhalt = String(url).endsWith("/impressum")
          ? "<h1>Impressum</h1><p>Edgar Behrend</p><p>edgar@behrendek.com</p>"
          : '<html><body><a href="/impressum">Impressum</a></body></html>';
        return new Response(inhalt, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }) as unknown as typeof fetch,
    });

    expect(gerufen).toContain("https://www.behrendek.com/impressum");
  });
});

describe("Der kostenlose Vorlauf", () => {
  const IMPRESSUM =
    "<h1>Impressum</h1><p>Nikolai Schankin, Musterweg 3, Hamburg</p>" +
    "<p>E-Mail: kontakt@nikolai-schankin.de</p>";

  it("findet die Adresse ohne einen einzigen Suchaufruf", async () => {
    let suchen = 0;
    const gerufen: string[] = [];
    const ergebnis = await resolveContactAddress({
      displayName: "Nikolai Schankin",
      role: "IT-Berater",
      searchClient: {
        parse: async () => {
          suchen += 1;
          return { output_parsed: { sites: [] } };
        },
      },
      fetchImpl: (async (url: string | URL) => {
        gerufen.push(String(url));
        const treffer = String(url).startsWith("https://nikolai-schankin.de");
        return new Response(treffer ? IMPRESSUM : "weg", {
          status: treffer ? 200 : 404,
          headers: { "content-type": "text/html" },
        });
      }) as unknown as typeof fetch,
    });

    expect(ergebnis.resolved).toBe(true);
    if (ergebnis.resolved) {
      expect(ergebnis.address.email).toBe("kontakt@nikolai-schankin.de");
      // Das ist der Zweck der Übung: kein Cent ausgegeben.
      expect(suchen).toBe(0);
      expect(ergebnis.sites).toEqual([]);
    }
    expect(gerufen[0]).toBe("https://nikolai-schankin.de/");
  });

  it("geht zur bezahlten Suche über, wenn keine abgeleitete Domain trägt", async () => {
    let suchen = 0;
    const ergebnis = await resolveContactAddress({
      displayName: "Nikolai Schankin",
      role: "IT-Berater",
      searchClient: {
        parse: async () => {
          suchen += 1;
          return { output_parsed: { sites: [] } };
        },
      },
      fetchImpl: (async () =>
        new Response("weg", {
          status: 404,
          headers: { "content-type": "text/html" },
        })) as unknown as typeof fetch,
    });

    expect(suchen).toBe(1);
    expect(ergebnis.resolved).toBe(false);
  });

  it("nimmt die Seite eines Namensvetters nicht", async () => {
    // `nikolai-schankin.de` gäbe es, aber das Impressum nennt jemand anderen.
    const fremd =
      "<h1>Impressum</h1><p>Bau GmbH, Geschäftsführer: Petra Baumann</p>" +
      "<p>info@nikolai-schankin.de</p>";
    let suchen = 0;
    await resolveContactAddress({
      displayName: "Nikolai Schankin",
      role: "IT-Berater",
      searchClient: {
        parse: async () => {
          suchen += 1;
          return { output_parsed: { sites: [] } };
        },
      },
      fetchImpl: (async (url: string | URL) =>
        new Response(
          String(url).startsWith("https://nikolai-schankin.de") ? fremd : "weg",
          {
            status: String(url).startsWith("https://nikolai-schankin.de") ? 200 : 404,
            headers: { "content-type": "text/html" },
          },
        )) as unknown as typeof fetch,
    });
    // Die Domain trägt den Namen — deshalb gilt sie trotz fremdem Impressum
    // als seine. Das ist die bewusste Regel; entscheidend ist, dass ein
    // Sammelpostfach dort dann als seines zählt und nicht als fremdes.
    expect(suchen).toBe(0);
  });
});
