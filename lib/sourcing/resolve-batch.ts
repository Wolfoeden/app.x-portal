import "server-only";

import {
  assessAddress,
  domainCarriesName,
  extractEmails,
  personRunsSite,
  usableAddresses,
  type AddressAssessment,
} from "./address";
import { derivedDomains } from "./derived-domains";
import { htmlToText } from "./html-text";
import { fetchImprint } from "./imprint";
import {
  MAX_BATCH_SIZE,
  searchPersonalSitesBatch,
  type BatchPerson,
} from "./site-search-batch";
import type { SiteCandidate, SiteSearchClient } from "./site-search";

/**
 * Adressen für viele Menschen, mit möglichst wenigen bezahlten Aufrufen.
 *
 * Der gemessene Anlass: Ein Lauf mit einer Suche je Person verursachte zwölf
 * Anbieteranfragen, kostete fünf Cent, brach die Verbindung ab und lieferte
 * **kein Ergebnis**. Drei Dinge daran waren falsch, und alle drei sind hier
 * behoben.
 *
 *   1. **Der Zuschnitt.** Ein Werkzeugaufruf kostet einen Cent, ganz gleich
 *      wonach er sucht. Sechs Menschen in einem Lauf kosten dasselbe wie
 *      einer.
 *   2. **Die Reihenfolge.** Erst der kostenlose Weg über abgeleitete Domains;
 *      wer dort gefunden wird, kommt gar nicht erst ins Bündel.
 *   3. **Der Wiederholungsversuch.** Ein Abbruch kostete Geld für nichts und
 *      wurde auch noch wiederholt. Jetzt einmal, dann Schluss.
 *
 * Rechnung für sechs Menschen: vorher bis zu achtzehn Cent und achtzehn
 * Anfragen, jetzt höchstens vier Cent und vier Anfragen — abzüglich derer,
 * die der kostenlose Weg schon gefunden hat.
 */

export type BatchResolveInput = BatchPerson & {
  /** Freie Kennung des Aufrufers, um die Antwort zuzuordnen. */
  ref: string;
};

export type BatchResolveResult = {
  ref: string;
  displayName: string;
  address: AddressAssessment | null;
  /** Woher die Adresse kam, oder warum keine da ist. */
  via: "derived_domain" | "search" | null;
  reason: string | null;
  imprintUrl: string | null;
  considered: AddressAssessment[];
};

export type BatchResolveOutcome = {
  results: BatchResolveResult[];
  /** Wie viele bezahlte Suchläufe tatsächlich stattfanden. */
  searchCalls: number;
  /** Wie viele Adressen der kostenlose Weg gefunden hat. */
  freeHits: number;
};

/** Prüft die Adressen eines Impressums gegen eine Person. */
function beurteile(input: {
  displayName: string;
  imprintUrl: string;
  imprintText: string;
}): { brauchbar: AddressAssessment | null; geprueft: AddressAssessment[] } {
  const geprueft = extractEmails(input.imprintText)
    .slice(0, 8)
    .map((adresse) =>
      assessAddress({
        email: adresse,
        displayName: input.displayName,
        pageUrl: input.imprintUrl,
        imprintText: input.imprintText,
      }),
    );
  return { brauchbar: usableAddresses(geprueft)[0] ?? null, geprueft };
}

/** Gehört die Seite dieser Person? Sonst ist es ein Namensvetter. */
function gehoertIhr(input: {
  host: string;
  displayName: string;
  imprintText: string;
}): boolean {
  return (
    domainCarriesName({ domain: input.host, displayName: input.displayName }) ||
    personRunsSite({
      imprintText: input.imprintText,
      displayName: input.displayName,
    })
  );
}

export async function resolveAddressesBatch(input: {
  people: readonly BatchResolveInput[];
  fetchImpl?: typeof fetch;
  searchClient?: SiteSearchClient;
  safetyIdentifier?: string;
  /** Aus für den kostenlosen Vorlauf. Nur für Tests der bezahlten Spur. */
  skipDerivedDomains?: boolean;
}): Promise<BatchResolveOutcome> {
  const ergebnisse = new Map<string, BatchResolveResult>();
  for (const person of input.people) {
    ergebnisse.set(person.ref, {
      ref: person.ref,
      displayName: person.displayName,
      address: null,
      via: null,
      reason: null,
      imprintUrl: null,
      considered: [],
    });
  }

  let freeHits = 0;
  const offen: BatchResolveInput[] = [];

  // Stufe 0 — kostenlos.
  for (const person of input.people) {
    const eintrag = ergebnisse.get(person.ref)!;
    if (input.skipDerivedDomains) {
      offen.push(person);
      continue;
    }

    let gefunden = false;
    for (const host of derivedDomains(person.displayName)) {
      const impressum = await fetchImprint(`https://${host}/`, input.fetchImpl);
      if (!impressum) continue;
      const text = htmlToText(impressum.text);
      if (!gehoertIhr({ host, displayName: person.displayName, imprintText: text })) {
        continue;
      }
      const { brauchbar, geprueft } = beurteile({
        displayName: person.displayName,
        imprintUrl: impressum.url,
        imprintText: text,
      });
      eintrag.considered = geprueft;
      if (!brauchbar) continue;
      eintrag.address = brauchbar;
      eintrag.via = "derived_domain";
      eintrag.imprintUrl = impressum.url;
      freeHits += 1;
      gefunden = true;
      break;
    }
    if (!gefunden) offen.push(person);
  }

  // Stufe 1 — ein bezahlter Lauf je Bündel, nicht je Person.
  let searchCalls = 0;
  for (let start = 0; start < offen.length; start += MAX_BATCH_SIZE) {
    const buendel = offen.slice(start, start + MAX_BATCH_SIZE);
    const suche = await searchPersonalSitesBatch(buendel, {
      client: input.searchClient,
      safetyIdentifier: input.safetyIdentifier,
    });
    if (suche.providerAvailable) searchCalls += 1;

    for (const [index, person] of buendel.entries()) {
      const eintrag = ergebnisse.get(person.ref)!;
      const seiten = suche.sitesByPerson[index] ?? [];
      if (seiten.length === 0) {
        eintrag.reason = suche.providerAvailable
          ? "no_site_found"
          : "provider_unavailable";
        continue;
      }

      // Die eigene Firma vor dem vermuteten Arbeitgeber — dort ist die
      // Ausbeute nach der Postfachregel ohnehin meist ein fremdes Postfach.
      const rang: Record<SiteCandidate["kind"], number> = {
        own_site: 0,
        own_company: 1,
        unclear: 2,
        employer: 3,
      };
      const sortiert = [...seiten].sort(
        (links, rechts) => rang[links.kind] - rang[rechts.kind],
      );

      let grund = "no_imprint";
      for (const seite of sortiert.slice(0, 2)) {
        const impressum = await fetchImprint(seite.url, input.fetchImpl);
        if (!impressum) continue;
        const text = htmlToText(impressum.text);
        const { brauchbar, geprueft } = beurteile({
          displayName: person.displayName,
          imprintUrl: impressum.url,
          imprintText: text,
        });
        eintrag.considered = [...eintrag.considered, ...geprueft];
        if (geprueft.length === 0) {
          grund = "no_address";
          continue;
        }
        if (!brauchbar) {
          grund = "no_usable_address";
          continue;
        }
        eintrag.address = brauchbar;
        eintrag.via = "search";
        eintrag.imprintUrl = impressum.url;
        grund = "";
        break;
      }
      if (grund) eintrag.reason = grund;
    }
  }

  return {
    results: input.people.map((person) => ergebnisse.get(person.ref)!),
    searchCalls,
    freeHits,
  };
}
