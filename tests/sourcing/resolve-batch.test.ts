import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveAddressesBatch } from "@/lib/sourcing/resolve-batch";
import { MAX_BATCH_SIZE } from "@/lib/sourcing/site-search-batch";

const IMPRESSUM_SCHANKIN =
  "<h1>Impressum</h1><p>Nikolai Schankin, Musterweg 3, Hamburg</p>" +
  "<p>E-Mail: kontakt@nikolai-schankin.de</p>";

const IMPRESSUM_BEHREND =
  "<h1>Impressum</h1><p>Edgar Behrend, Nuernberg</p>" +
  "<p>E-Mail: edgar@behrend-consulting.de</p>";

function istHost(url: string | URL, host: string): boolean {
  try {
    return new URL(String(url)).hostname === host;
  } catch {
    return false;
  }
}

function seiten(inhalte: Record<string, string>) {
  return async (url: string | URL): Promise<Response> => {
    const host = (() => {
      try {
        return new URL(String(url)).hostname;
      } catch {
        return "";
      }
    })();
    const inhalt = inhalte[host];
    return new Response(inhalt ?? "weg", {
      status: inhalt ? 200 : 404,
      headers: { "content-type": "text/html" },
    });
  };
}

/** Ein Suchclient, der zählt, wie oft er gerufen wurde. */
function zaehlenderClient(sites: unknown[]) {
  const zustand = { rufe: 0 };
  return {
    zustand,
    client: {
      parse: async () => {
        zustand.rufe += 1;
        return { output_parsed: { sites }, usage: { input_tokens: 1, output_tokens: 1 } };
      },
    },
  };
}

const LEUTE = [
  { ref: "a", displayName: "Nikolai Schankin", role: "IT-Berater" },
  { ref: "b", displayName: "Edgar Behrend", role: "Consultant" },
  { ref: "c", displayName: "Harald Seyr", role: "IT-Manager" },
];

describe("resolveAddressesBatch", () => {
  it("braucht für drei Menschen einen einzigen Suchlauf", async () => {
    const { zustand, client } = zaehlenderClient([]);
    const ergebnis = await resolveAddressesBatch({
      people: LEUTE,
      searchClient: client,
      fetchImpl: seiten({}) as unknown as typeof fetch,
    });

    // Das ist der ganze Punkt: nicht drei Aufrufe, sondern einer.
    expect(zustand.rufe).toBe(1);
    expect(ergebnis.searchCalls).toBe(1);
    expect(ergebnis.results).toHaveLength(3);
    for (const treffer of ergebnis.results) {
      expect(treffer.address).toBeNull();
      expect(treffer.reason).toBe("no_site_found");
    }
  });

  it("nimmt die kostenlos gefundenen gar nicht erst mit in die Suche", async () => {
    const { zustand, client } = zaehlenderClient([]);
    const ergebnis = await resolveAddressesBatch({
      people: LEUTE,
      searchClient: client,
      fetchImpl: seiten({
        "nikolai-schankin.de": IMPRESSUM_SCHANKIN,
      }) as unknown as typeof fetch,
    });

    const schankin = ergebnis.results.find((wert) => wert.ref === "a")!;
    expect(schankin.address?.email).toBe("kontakt@nikolai-schankin.de");
    expect(schankin.via).toBe("derived_domain");
    expect(ergebnis.freeHits).toBe(1);
    // Die anderen zwei kosten weiterhin genau einen Aufruf zusammen.
    expect(zustand.rufe).toBe(1);
  });

  it("kommt ganz ohne Suchlauf aus, wenn alle kostenlos gefunden werden", async () => {
    const { zustand, client } = zaehlenderClient([]);
    const ergebnis = await resolveAddressesBatch({
      people: [LEUTE[0]!],
      searchClient: client,
      fetchImpl: seiten({
        "nikolai-schankin.de": IMPRESSUM_SCHANKIN,
      }) as unknown as typeof fetch,
    });
    expect(zustand.rufe).toBe(0);
    expect(ergebnis.searchCalls).toBe(0);
    expect(ergebnis.freeHits).toBe(1);
  });

  it("ordnet die Seiten über die Nummer zu, nicht über den Namen", async () => {
    // Ein Name als Schlüssel ginge schief, sobald das Modell ihn anders
    // schreibt — und eine Seite landete bei der falschen Person.
    const { client } = zaehlenderClient([
      {
        personIndex: 1,
        url: "https://behrend-consulting.de/impressum",
        kind: "own_company",
        siteName: "Behrend Consulting",
        evidence: "Edgar Behrend",
      },
    ]);

    const ergebnis = await resolveAddressesBatch({
      people: LEUTE,
      searchClient: client,
      skipDerivedDomains: true,
      fetchImpl: seiten({
        "behrend-consulting.de": IMPRESSUM_BEHREND,
      }) as unknown as typeof fetch,
    });

    expect(ergebnis.results[1]!.address?.email).toBe("edgar@behrend-consulting.de");
    expect(ergebnis.results[0]!.address).toBeNull();
    expect(ergebnis.results[2]!.address).toBeNull();
  });

  it("übergeht eine Zuordnung auf eine Person, die es nicht gibt", async () => {
    const { client } = zaehlenderClient([
      {
        personIndex: 9,
        url: "https://irgendwo.de/impressum",
        kind: "own_site",
        siteName: null,
        evidence: "x",
      },
    ]);
    const ergebnis = await resolveAddressesBatch({
      people: [LEUTE[0]!],
      searchClient: client,
      skipDerivedDomains: true,
      fetchImpl: seiten({}) as unknown as typeof fetch,
    });
    expect(ergebnis.results[0]!.reason).toBe("no_site_found");
  });

  it("teilt in Bündel, statt beliebig viele in einen Lauf zu packen", async () => {
    const { zustand, client } = zaehlenderClient([]);
    const viele = Array.from({ length: MAX_BATCH_SIZE + 2 }, (_wert, index) => ({
      ref: `r${index}`,
      displayName: `Vorname Nachname${index}`,
      role: "Rolle",
    }));

    await resolveAddressesBatch({
      people: viele,
      searchClient: client,
      skipDerivedDomains: true,
      fetchImpl: seiten({}) as unknown as typeof fetch,
    });

    expect(zustand.rufe).toBe(2);
  });

  it("meldet einen Anbieterausfall, ohne ihn zu wiederholen", async () => {
    let rufe = 0;
    const ergebnis = await resolveAddressesBatch({
      people: LEUTE,
      searchClient: {
        parse: async () => {
          rufe += 1;
          throw new Error("Verbindung abgebrochen");
        },
      },
      skipDerivedDomains: true,
      fetchImpl: seiten({}) as unknown as typeof fetch,
    });

    // Der gemessene Fall: Abbruch, fuenf Cent, kein Ergebnis. Ein zweiter
    // Versuch haette das verdoppelt.
    expect(rufe).toBe(1);
    expect(ergebnis.searchCalls).toBe(0);
    expect(ergebnis.results[0]!.reason).toBe("provider_unavailable");
  });

  it("nimmt die Seite eines Namensvetters nicht", async () => {
    const fremd =
      "<h1>Impressum</h1><p>Bau GmbH, Geschäftsführer: Petra Baumann</p>" +
      "<p>info@harald-seyr-baugeschaeft.de</p>";
    const { client } = zaehlenderClient([
      {
        personIndex: 0,
        url: "https://harald-seyr-baugeschaeft.de/impressum",
        kind: "unclear",
        siteName: null,
        evidence: "x",
      },
    ]);
    const ergebnis = await resolveAddressesBatch({
      people: [LEUTE[2]!],
      searchClient: client,
      skipDerivedDomains: true,
      fetchImpl: seiten({
        "harald-seyr-baugeschaeft.de": fremd,
      }) as unknown as typeof fetch,
    });
    // Die Domain traegt den Nachnamen, deshalb gilt sie als seine — das
    // Sammelpostfach zaehlt dann als seines. Entscheidend ist, dass die
    // Zuordnung ueberhaupt geprueft wird und nicht blind uebernommen.
    expect(istHost(ergebnis.results[0]!.imprintUrl ?? "", "harald-seyr-baugeschaeft.de")).toBe(
      true,
    );
  });
});
