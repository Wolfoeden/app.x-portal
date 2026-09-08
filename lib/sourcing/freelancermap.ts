/**
 * freelancermap als Quelle für die Beschaffung.
 *
 * Die bezahlte Websuche in `lib/openai/external-freelancer-search.ts` ist der
 * Kundenweg: Ein Auftraggeber hat ein Projekt, der Katalog gibt nichts her,
 * also wird für ihn das offene Netz durchsucht. Für die Beschaffung eigener
 * Profile ist dieser Weg schlecht — er kostet Geld, liefert höchstens drei
 * Treffer je Lauf und hat in acht Läufen dreizehn Menschen gefunden, von
 * denen keiner eine Adresse hatte.
 *
 * freelancermap veröffentlicht dieselben Menschen strukturiert: Name und
 * Rolle als `schema.org/Person`, Ort als `PostalAddress`, Stundensatz als
 * `Offer`, dazu Skills, Sprachen mit Niveau und Projekthistorie im Text. Die
 * Seiten sind serverseitig gerendert, `robots.txt` erlaubt sie ausdrücklich
 * (`Disallow:` leer, Sitemap verweist auf `profiles.xml`), und je Skill gibt
 * es eine eigene Liste — genau die Achse, auf der unsere Nachfrageprofile
 * liegen.
 *
 * Was hier NICHT entsteht, ist eine E-Mail-Adresse: freelancermap
 * veröffentlicht keine, der Kontakt läuft über deren eigenes Formular. Die
 * Adresse ist ein eigener Schritt und bleibt der Websuche überlassen
 * (`acceptableContactEmail()`), damit an genau einer Stelle entschieden wird,
 * welche Adresse zu einer Person gehört.
 *
 * Umgang mit der Quelle: ein Abruf nach dem anderen, mit Pause dazwischen.
 * Ein Beschaffungslauf hat es nicht eilig, und ein Portal, das uns seine
 * Profile zeigt, muss das nicht in Schüben aushalten.
 */

import { htmlToLines } from "./html-text";

const BASIS = "https://www.freelancermap.de";

/**
 * Ein gewöhnlicher Browser-Kennstring. Nicht Tarnung, sondern das Gegenteil
 * eines leeren Feldes: Ohne ihn antworten viele Seiten anders als dem
 * Menschen, der dieselbe Seite gerade geprüft hat.
 */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/140.0 Safari/537.36";

/** Pause zwischen zwei Abrufen. */
export const ABRUF_PAUSE_MS = 1_200;

/** Wie viele Profile ein Lauf höchstens öffnet. */
export const MAX_PROFILE_JE_LAUF = 12;

/**
 * Unterhalb dieses Stundensatzes gilt die Angabe als Platzhalter, nicht als
 * Preis. Gemessen an einem Profil, das 1 €/h auswies.
 */
export const MIN_PLAUSIBLER_SATZ = 10;

export type FreelancermapProfile = {
  /** Die öffentliche Profiladresse. Zugleich der Schlüssel gegen Doppel. */
  profileUrl: string;
  /** Der bürgerliche Name, wenn die Person ihn selbst zeigt. Sonst null. */
  displayName: string | null;
  role: string | null;
  /** Ort und Land, so wie sie in `PostalAddress` stehen. */
  location: string | null;
  countryCode: string | null;
  hourlyRate: { amount: number; currency: string } | null;
  skills: string[];
  /** Sprache samt Niveau, etwa „Deutsch (Muttersprache)". */
  languages: string[];
  /** Der Selbstbeschreibungstext, ungekürzt so wie er dasteht. */
  about: string | null;
};

/**
 * Der Sitzname eines Skills bei freelancermap, aus unserem Label gebildet.
 *
 * Das Pluszeichen wird zu einem eigenen Wort: „C++" heißt dort
 * `c-plus-plus`. Gemessen, nicht geraten — `cplusplus` und `cpp` liefern
 * beide eine Seite mit HTTP 200, aber es ist die allgemeine Freelancerliste
 * und nicht die zum Skill. Siehe `isSkillPage()`.
 */
export function skillSlug(skill: string): string {
  return skill
    .trim()
    .toLocaleLowerCase("de-DE")
    .replace(/ß/gu, "ss")
    .replace(/[äÄ]/gu, "ae")
    .replace(/[öÖ]/gu, "oe")
    .replace(/[üÜ]/gu, "ue")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\+/gu, "-plus")
    .replace(/#/gu, "-sharp")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

/** Die Adresse der öffentlichen Liste zu einem Sitznamen. */
export function skillListUrl(skillOrSlug: string): string {
  return `${BASIS}/freelancer/${skillSlug(skillOrSlug)}`;
}

/**
 * Schreibweisen, unter denen derselbe Skill dort stehen könnte.
 *
 * Nötig, weil unsere Labels aus Ausschreibungen stammen und ihre aus einem
 * eigenen Katalog: Wir sagen „React", die Seite heißt `reactjs`; wir sagen
 * „PostgreSQL", die Seite heißt ebenso — aber `postgres` führt zur
 * allgemeinen Liste. Geraten wird trotzdem nichts: Was hier herauskommt,
 * muss erst im Verzeichnis stehen oder die Titelprüfung bestehen.
 */
export function slugCandidates(skill: string): string[] {
  const basis = skillSlug(skill);
  if (!basis) return [];
  const kandidaten = [
    basis,
    `${basis}js`,
    `${basis}-js`,
    basis.replace(/-/gu, ""),
    basis.replace(/js$/u, ""),
  ];
  return [...new Set(kandidaten.filter(Boolean))];
}

/**
 * Die Profiladressen einer Listenseite.
 *
 * Die Liste verlinkt absolut, die Seitenzahl-Navigation relativ; beides wird
 * akzeptiert, damit ein Umbau der einen Form nicht die Ausbeute halbiert.
 */
export function parseProfileList(html: string): string[] {
  const muster =
    /href="(?:https:\/\/www\.freelancermap\.de)?(\/profil\/[a-z0-9-]+)"/gu;
  const gesehen = new Set<string>();
  for (const treffer of html.matchAll(muster)) gesehen.add(BASIS + treffer[1]!);
  return [...gesehen];
}

/**
 * Trägt die Seite wirklich den angefragten Skill?
 *
 * Ein unbekannter Slug liefert **HTTP 200 und eine gefüllte Liste** — nur eben
 * die allgemeine statt der gesuchten. Das ist der gefährlichste Fall dieser
 * Quelle: Der Lauf sähe erfolgreich aus und brächte achtzehn Menschen, die
 * mit dem Bedarf nichts zu tun haben. Der Titel unterscheidet die beiden
 * Seiten zuverlässig — die Skill-Seite nennt den Skill, die allgemeine heißt
 * „Freelancer und Freiberufler auf www.freelancermap.de".
 */
export function isSkillPage(html: string): boolean {
  const titel = html.match(/<title>([^<]*)<\/title>/u)?.[1]?.trim();
  if (!titel) return false;
  return !/^Freelancer und Freiberufler\b/iu.test(titel);
}

/**
 * Die Spanne der Stundensätze, die der Seitentitel für diesen Skill nennt
 * („Top Experten von 54 - 120 € / h"). Marktsignal für die Nachfrageseite.
 *
 * Eine Gesamtzahl der Profile wird bewusst **nicht** gelesen: Der einzige
 * Ort, an dem eine solche Zahl im Quelltext steht, ist ein Werbetext
 * („Bereits über 13.000 Freelancer nutzen Premium"). Er steht auf jeder Seite
 * gleich und hat mit dem Suchergebnis nichts zu tun.
 */
export function parseRateRange(
  html: string,
): { min: number; max: number; currency: "EUR" } | null {
  const titel = html.match(/<title>([^<]*)<\/title>/u)?.[1] ?? "";
  const treffer = titel.match(/(\d+)\s*-\s*(\d+)\s*€/u);
  if (!treffer) return null;
  const min = Number(treffer[1]);
  const max = Number(treffer[2]);
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
    return null;
  }
  return { min, max, currency: "EUR" };
}

function jsonLdBlocks(html: string): Record<string, unknown>[] {
  // `i`, weil `<SCRIPT TYPE="application/ld+json">` sonst übersehen würde und
  // das Profil dann ohne Namen und Ort dastünde.
  const muster = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script\s*>/giu;
  const bloecke: Record<string, unknown>[] = [];
  for (const treffer of html.matchAll(muster)) {
    try {
      const wert: unknown = JSON.parse(treffer[1]!);
      if (wert && typeof wert === "object" && !Array.isArray(wert)) {
        bloecke.push(wert as Record<string, unknown>);
      }
    } catch {
      // Ein kaputter Block wird übergangen. Aus einem halben JSON zu raten
      // wäre schlimmer als die eine fehlende Angabe.
    }
  }
  return bloecke;
}

/**
 * Der sichtbare Text als Zeilen.
 *
 * Die eigene Fassung hier war fehlerhaft — `<SCRIPT>` in Großbuchstaben blieb
 * stehen, und die Entities wurden nacheinander statt in einem Durchgang
 * aufgelöst. Beides steht jetzt genau einmal in `html-text.ts`.
 */
function textLines(html: string): string[] {
  return htmlToLines(html);
}

/** Die Zeilen zwischen einer Überschrift und der nächsten bekannten. */
function section(
  lines: readonly string[],
  heading: RegExp,
  stop: RegExp,
  limit: number,
): string[] {
  const start = lines.findIndex((zeile) => heading.test(zeile));
  if (start === -1) return [];
  const raus: string[] = [];
  for (let i = start + 1; i < lines.length && raus.length < limit; i += 1) {
    if (stop.test(lines[i]!)) break;
    raus.push(lines[i]!);
  }
  return raus;
}

const SKILL_STOP = /^(Sprachen|Zertifikate|Projekthistorie|Mehr anzeigen)$/u;
const SPRACH_STOP = /^(Projekthistorie|Zertifikate|Kontaktanfrage|Skills)$/u;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Ein Profil aus seinem HTML.
 *
 * Alles, was fehlt, bleibt null. Ein Profil ohne Namen ist trotzdem ein
 * Ergebnis — es zeigt Nachfrage und Marktpreis —, taugt aber nicht zur
 * Ansprache. Diese Entscheidung fällt weiter oben, nicht hier.
 */
export function parseProfile(
  html: string,
  profileUrl: string,
): FreelancermapProfile {
  const bloecke = jsonLdBlocks(html);
  const person = bloecke.find((block) => block["@type"] === "Person");
  const adresse = bloecke.find((block) => block["@type"] === "PostalAddress");
  const angebot = bloecke.find((block) => block["@type"] === "Offer");
  const lines = textLines(html);

  const skills = section(lines, /^Skills$/u, SKILL_STOP, 80).filter(
    (wert) => wert.length > 1 && wert.length <= 60,
  );

  // Sprache und Niveau stehen als zwei aufeinanderfolgende Zeilen.
  const sprachRoh = section(lines, /^Sprachen$/u, SPRACH_STOP, 16);
  const languages: string[] = [];
  for (let i = 0; i + 1 < sprachRoh.length; i += 2) {
    languages.push(`${sprachRoh[i]} (${sprachRoh[i + 1]})`);
  }

  const about = section(lines, /^Über mich$/u, /^(Skills|Sprachen)$/u, 40)
    .join(" ")
    .trim();

  const preis = angebot?.["price"];
  const waehrung = text(angebot?.["priceCurrency"]);
  // Ein Satz von 1 € ist kein Preis, sondern ein Pflichtfeld, das jemand
  // ausgefüllt hat, um weiterzukommen. Er als Marktwert weitergereicht wäre
  // eine Falschangabe über eine Person.
  const preisPlausibel =
    typeof preis === "number" && Number.isFinite(preis) && preis >= MIN_PLAUSIBLER_SATZ;

  return {
    profileUrl,
    displayName: text(person?.["name"]),
    role: text(person?.["jobTitle"]),
    location: text(adresse?.["addressLocality"]),
    countryCode: text(adresse?.["addressCountry"]),
    hourlyRate:
      preisPlausibel && waehrung
        ? { amount: preis as number, currency: waehrung }
        : null,
    skills: [...new Set(skills)],
    languages,
    about: about.length > 0 ? about : null,
  };
}

/**
 * Taugt das Profil zur Ansprache?
 *
 * Ohne bürgerlichen Namen gibt es keine Anrede und keine Identitätsbindung —
 * dieselbe Grenze, die die Websuche zieht. Ohne Skills wäre der Datensatz
 * für den Katalog wertlos.
 */
export function isAddressable(profile: FreelancermapProfile): boolean {
  if (!profile.displayName) return false;
  // Zwei Wortbestandteile aus Buchstaben: Vor- und Nachname. "Informatiker
  // Team" fällt damit ebenso durch wie eine Rollenbezeichnung.
  const teile = profile.displayName.split(/\s+/u).filter((wert) => /^\p{L}/u.test(wert));
  return teile.length >= 2 && profile.skills.length > 0;
}

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

async function holeSeite(url: string, fetchImpl: FetchLike): Promise<string> {
  const antwort = await fetchImpl(url);
  if (!antwort.ok) throw new Error(`freelancermap antwortete ${antwort.status} auf ${url}`);
  return antwort.text();
}

const standardFetch: FetchLike = (url) =>
  fetch(url, {
    headers: { "user-agent": USER_AGENT, "accept-language": "de-DE,de;q=0.9" },
    // Kein Cookie, keine Sitzung: Wir lesen, was jeder Besucher sieht.
    redirect: "follow",
  });

function pause(ms: number): Promise<void> {
  return new Promise((fertig) => setTimeout(fertig, ms));
}

/**
 * Ein Beschaffungslauf gegen freelancermap.
 *
 * Nacheinander und mit Pause — nicht aus Vorsicht vor einer Sperre, sondern
 * weil es keinen Grund gibt, eine fremde Seite zu belasten, deren Daten man
 * geschenkt bekommt.
 */
/**
 * Das Verzeichnis der Skill-Seiten, aus der Sitemap.
 *
 * `robots.txt` verweist auf `sitemap.xml`, dort steht `categories-profile.xml`,
 * und dahinter liegen fünfzig Teillisten mit zusammen rund 5.800 Skill-Seiten.
 * Einmal geholt beantwortet das die Frage „gibt es zu diesem Skill überhaupt
 * eine Liste?" ohne einen einzigen Fehlversuch — und ohne dass wir raten, wie
 * die Seite bei ihnen heißt.
 *
 * Das Verzeichnis ist nicht vollständig: `c-plus-plus` fehlt darin, obwohl es
 * die Seite gibt. Ein fehlender Eintrag schließt einen Skill deshalb nicht
 * aus, er kostet nur einen Probeabruf.
 */
const SITEMAP_INDEX = `${BASIS}/sitemaps/categories-profile.xml`;

let skillIndexCache: Set<string> | null = null;

export async function loadSkillIndex(
  fetchImpl: FetchLike = standardFetch,
  pauseMs = 0,
): Promise<Set<string>> {
  if (skillIndexCache) return skillIndexCache;

  const index = await holeSeite(SITEMAP_INDEX, fetchImpl);
  const teillisten = [
    ...index.matchAll(/<loc>\s*([^<\s]+categories-profile-\d+\.xml)\s*<\/loc>/gu),
  ].map((treffer) => treffer[1]!);

  const slugs = new Set<string>();
  for (const teil of teillisten) {
    if (pauseMs > 0) await pause(pauseMs);
    try {
      const xml = await holeSeite(teil, fetchImpl);
      for (const treffer of xml.matchAll(/\/freelancer\/([a-z0-9-]+)</gu)) {
        slugs.add(treffer[1]!);
      }
    } catch {
      // Eine fehlende Teilliste macht das Verzeichnis unvollständig, nicht
      // unbrauchbar — der Probeabruf fängt den Rest ab.
    }
  }

  skillIndexCache = slugs;
  return slugs;
}

/** Nur für Tests: den zwischengespeicherten Index verwerfen. */
export function resetSkillIndexCache(): void {
  skillIndexCache = null;
}

/**
 * Der Sitzname, unter dem dieser Skill dort wirklich zu finden ist — oder
 * null, wenn es keine Liste zu ihm gibt.
 *
 * Zwei Stufen: erst das Verzeichnis, das nichts kostet; dann ein einzelner
 * Probeabruf für den naheliegendsten Namen, weil das Verzeichnis Lücken hat.
 */
export async function resolveSkillSlug(
  skill: string,
  options: { fetchImpl?: FetchLike; index?: ReadonlySet<string> } = {},
): Promise<string | null> {
  const kandidaten = slugCandidates(skill);
  if (kandidaten.length === 0) return null;

  const index = options.index ?? (await loadSkillIndex(options.fetchImpl));
  for (const kandidat of kandidaten) {
    if (index.has(kandidat)) return kandidat;
  }

  // Nicht im Verzeichnis: einmal nachsehen, ob es die Seite trotzdem gibt.
  const fetchImpl = options.fetchImpl ?? standardFetch;
  try {
    const html = await holeSeite(skillListUrl(kandidaten[0]!), fetchImpl);
    return isSkillPage(html) ? kandidaten[0]! : null;
  } catch {
    return null;
  }
}

export type SourcingRunResult = {
  skill: string;
  listUrl: string;
  /**
   * Falsch, wenn freelancermap statt der Skill-Liste die allgemeine Liste
   * ausgeliefert hat. Dann ist `profiles` leer — achtzehn beliebige Menschen
   * sind ein schlechteres Ergebnis als keines.
   */
  skillPageFound: boolean;
  /** Die Satzspanne, die die Seite für diesen Skill nennt. */
  rateRange: { min: number; max: number; currency: "EUR" } | null;
  profiles: FreelancermapProfile[];
  failed: { url: string; reason: string }[];
};

export async function sourceFromFreelancermap(input: {
  skill: string;
  limit?: number;
  fetchImpl?: FetchLike;
  pauseMs?: number;
  /** Einmal geladen, für alle Skills eines Laufs wiederverwendet. */
  skillIndex?: ReadonlySet<string>;
}): Promise<SourcingRunResult> {
  const fetchImpl = input.fetchImpl ?? standardFetch;
  const pauseMs = input.pauseMs ?? ABRUF_PAUSE_MS;
  const limit = Math.min(Math.max(input.limit ?? 6, 1), MAX_PROFILE_JE_LAUF);

  const slug = await resolveSkillSlug(input.skill, {
    fetchImpl,
    index: input.skillIndex,
  });
  if (!slug) {
    return {
      skill: input.skill,
      listUrl: skillListUrl(input.skill),
      skillPageFound: false,
      rateRange: null,
      profiles: [],
      failed: [],
    };
  }

  const listUrl = skillListUrl(slug);
  const listHtml = await holeSeite(listUrl, fetchImpl);
  if (!isSkillPage(listHtml)) {
    return {
      skill: input.skill,
      listUrl,
      skillPageFound: false,
      rateRange: null,
      profiles: [],
      failed: [],
    };
  }

  const adressen = parseProfileList(listHtml).slice(0, limit);
  const profiles: FreelancermapProfile[] = [];
  const failed: { url: string; reason: string }[] = [];

  for (const adresse of adressen) {
    await pause(pauseMs);
    try {
      profiles.push(parseProfile(await holeSeite(adresse, fetchImpl), adresse));
    } catch (fehler) {
      failed.push({
        url: adresse,
        reason: fehler instanceof Error ? fehler.message : "unbekannter Fehler",
      });
    }
  }

  return {
    skill: input.skill,
    listUrl,
    skillPageFound: true,
    rateRange: parseRateRange(listHtml),
    profiles,
    failed,
  };
}
