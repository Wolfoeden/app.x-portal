/**
 * Die gemeinsamen Konstanten der Lead-Arbeitsfläche: Datenbankvertrag,
 * Serverrouten und Oberfläche lesen dieselben Werte. Ohne zod, damit die
 * Client-Komponente keine Prüfbibliothek mitschleppt, die sie nie ausführt.
 */

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "replied",
  "dismissed",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Readonly<Record<LeadStatus, string>> = {
  new: "Offen",
  contacted: "Angeschrieben",
  replied: "Antwort da",
  dismissed: "Verworfen",
};

/**
 * Was die Liste zeigt. `open` ist die Standardansicht — bearbeitete Leads
 * sind archiviert und stehen dem laufenden Betrieb nicht im Weg.
 */
export const LEAD_SCOPES = ["open", "archived", "all"] as const;
export type LeadScope = (typeof LEAD_SCOPES)[number];

export const LEAD_SCOPE_LABELS: Readonly<Record<LeadScope, string>> = {
  open: "Offen",
  archived: "Archiv",
  all: "Alle",
};

/**
 * Was der Abgleich aus einem Lead gemacht hat.
 *
 * `open` ist nicht `no_hit`: Ein Lead, der noch nie abgeglichen wurde,
 * sagt nichts über den Katalog aus. Die beiden zusammenzuwerfen hieße, eine
 * unbearbeitete Warteschlange als Beleg für fehlende Profile zu lesen.
 */
export const LEAD_MATCH_FILTERS = ["hit", "no_hit", "open"] as const;
export type LeadMatchFilter = (typeof LEAD_MATCH_FILTERS)[number];

export const LEAD_MATCH_FILTER_LABELS: Readonly<
  Record<LeadMatchFilter, string>
> = {
  hit: "Treffer",
  no_hit: "Kein Treffer",
  open: "Nicht abgeglichen",
};

export function isLeadMatchFilter(value: unknown): value is LeadMatchFilter {
  return (
    typeof value === "string" &&
    (LEAD_MATCH_FILTERS as readonly string[]).includes(value)
  );
}

export const LEAD_CATEGORY_MAX_LENGTH = 40;
export const LEAD_NOTES_MAX_LENGTH = 2_000;

/** Genau die Breite der Spalte `leadgen_outreach.subject`. */
export const LEAD_SUBJECT_MAX_LENGTH = 200;

/**
 * Was der Betreiber selbst eintippen darf.
 *
 * Bewusst kleiner als die Spalte `leadgen_outreach.body` (16.000): dort
 * landet die abgeschickte Fassung mitsamt Anrede und rechtlichem Fuss, und
 * der Fuss allein misst rund 1.000 Zeichen. Waeren beide Grenzen gleich,
 * schluege das Protokollieren fehl, nachdem die Mail schon raus ist.
 */
export const LEAD_BODY_MAX_LENGTH = 8_000;

export const LEAD_PAGE_SIZE = 50;

/**
 * Wie viele Leads ein Stapelversand höchstens anfasst.
 *
 * Die Zahl ist keine technische Grenze, sondern die Tagesmenge, die ein
 * Postfach bei IONOS unauffällig verschickt — dieselbe Grenze, die der
 * Akquise-Bot außerhalb dieser Anwendung einhält. Wer mehr verschickt,
 * landet im Spamfilter, und zwar dauerhaft.
 */
export const LEAD_BULK_SEND_LIMIT = 20;

export function isLeadStatus(value: unknown): value is LeadStatus {
  return (
    typeof value === "string" &&
    (LEAD_STATUSES as readonly string[]).includes(value)
  );
}

export function isLeadScope(value: unknown): value is LeadScope {
  return (
    typeof value === "string" &&
    (LEAD_SCOPES as readonly string[]).includes(value)
  );
}

/**
 * Wie lang eine Überschrift werden darf, bevor sie gekürzt wird.
 *
 * Sie steht in der Betreffzeile, in der Anrede-Zeile der Treffer-Mail und als
 * Suchbegriff im Portal-Link. Achtzig Zeichen sind das, was in einer
 * Postfachliste noch vollständig ankommt.
 */
const HEADLINE_MAX_LENGTH = 80;

/**
 * Der Trenner, den das Importwerkzeug setzt: `Titel — Kurzbeschreibung — URL`.
 */
const PRIMARY_SEPARATOR = " — ";

/**
 * Trenner, die in freien Ausschreibungstiteln vorkommen und mal Struktur,
 * mal Bestandteil des Titels sind. „Senior AI Engineer – LLM / Agents" ist
 * ein Titel; „SAP CRM Lead – 6+ Monate, Remote" ist ein Titel plus Anhang.
 * Auseinanderhalten lässt sich das nicht zuverlässig, deshalb greifen diese
 * Trenner erst, wenn die Überschrift ohnehin zu lang ist — bei einem kurzen
 * Titel richten sie mehr Schaden an, als sie nützen.
 */
const SECONDARY_SEPARATORS = [" | ", " – ", " - ", ": ", ". "];

/**
 * Die Geschlechterkennzeichnung. Sie gehört zur Stellenausschreibung, nicht
 * zur Rolle — im Betreff ist sie Füllsel und als Suchbegriff im Portal ist
 * sie schädlich, weil kein Profil sie trägt.
 */
const GENDER_MARKER =
  /\s*[(\[]?\s*[mwfdx]\s*[\/|]\s*[mwfdx]\s*(?:[\/|]\s*[mwfdx]\s*)?[)\]]?/giu;

/** Reste eines Trenners am Ende, nachdem etwas abgeschnitten wurde. */
const TRAILING_JUNK = /[\s—–\-|:;,.]+$/u;

/**
 * Die Überschrift der Ausschreibung: der Teil, den der Auftraggeber selbst
 * als Rolle formuliert hat.
 *
 * Sie wird an drei Stellen sichtbar — Arbeitsliste, Betreffzeile und
 * Portal-Link —, und an allen dreien war der ungekürzte Text unbrauchbar:
 * Ein Lead ohne den Trenner des Importwerkzeugs lieferte die komplette Zeile
 * mitsamt Adresse als Betreff, 280 Zeichen lang.
 */
export function leadHeadline(stellenanzeige: string): string {
  const ohneAdresse = stellenanzeige.replace(/https?:\/\/\S+/giu, " ");
  const [erster] = ohneAdresse.split(PRIMARY_SEPARATOR);
  let headline = saeubern(erster ?? ohneAdresse);

  if (headline.length > HEADLINE_MAX_LENGTH) {
    headline = saeubern(kuerzesteTeilung(headline));
  }
  if (headline.length > HEADLINE_MAX_LENGTH) {
    headline = saeubern(amWortEndeKuerzen(headline));
  }

  return headline || saeubern(stellenanzeige) || stellenanzeige.trim();
}

function saeubern(wert: string): string {
  return wert
    .replace(GENDER_MARKER, " ")
    .replace(/\s+/gu, " ")
    .replace(TRAILING_JUNK, "")
    .trim();
}

/**
 * Der früheste Schnitt, der noch etwas Aussagekräftiges stehen lässt. Zu
 * kurze Bruchstücke („SAP", „Senior") werden verworfen: Sie entstehen, wenn
 * ein Trenner mitten in einer Aufzählung steht.
 */
function kuerzesteTeilung(headline: string): string {
  let bester = headline;
  for (const trenner of SECONDARY_SEPARATORS) {
    const index = headline.indexOf(trenner);
    if (index < 12) continue;
    const kandidat = headline.slice(0, index);
    if (kandidat.length < bester.length) bester = kandidat;
  }
  return bester;
}

/** Letzte Stufe: harte Grenze, aber nicht mitten im Wort. */
function amWortEndeKuerzen(headline: string): string {
  const schnitt = headline.slice(0, HEADLINE_MAX_LENGTH);
  const letztesLeerzeichen = schnitt.lastIndexOf(" ");
  return letztesLeerzeichen > 20 ? schnitt.slice(0, letztesLeerzeichen) : schnitt;
}

export function leadSourceUrl(stellenanzeige: string): string | null {
  const match = stellenanzeige.match(/https?:\/\/\S+/u);
  if (!match) return null;
  // Ein Satzzeichen am Ende gehört nicht zur Adresse.
  return match[0].replace(/[),.;]+$/u, "");
}

/**
 * Die Ortszeit, in der der Betrieb stattfindet. Alles, was mit Uhrzeiten zu
 * tun hat — Tagesgrenze, Versandfenster —, rechnet hierin und nicht in UTC.
 */
export const LEAD_TIME_ZONE = "Europe/Berlin";

/**
 * Wann der Tageslauf verschicken darf: 8 bis 12 Uhr Ortszeit, Montag bis
 * Freitag.
 *
 * Die Grenze steht hier und nicht im Zeitplan der Datenbank. `pg_cron` plant
 * in UTC — `cron.timezone` steht auf GMT —, und ein fester UTC-Ausdruck
 * verschiebt sich mit der Zeitumstellung um eine Stunde: aus 8 Uhr im Sommer
 * würde 7 Uhr im Winter. Der Zeitgeber weckt die Route deshalb großzügiger,
 * als das Fenster ist, und die Entscheidung fällt hier, wo die Zeitzone
 * bekannt ist.
 *
 * `endHour` ist ausschließend: um 11:59 wird noch verschickt, um 12:00 nicht
 * mehr.
 */
export const LEAD_SEND_WINDOW = {
  startHour: 8,
  endHour: 12,
  /** Montag bis Freitag. Sonntag ist 0, wie in `Date.getDay()`. */
  weekdays: [1, 2, 3, 4, 5] as readonly number[],
} as const;

/**
 * Die Bestandteile der Ortszeit zu einem Zeitpunkt.
 *
 * Ueber Intl statt ueber toLocaleString() und new Date(): Der Umweg
 * ueber den String liest die Berliner Wanduhrzeit anschliessend wieder als
 * Serverzeit, und auf einem Server in UTC liegt das Ergebnis zwei Stunden
 * daneben.
 */
function ortszeitteile(now: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
} {
  const teile = new Intl.DateTimeFormat('en-US', {
    timeZone: LEAD_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now);

  const zahl = (type: string): number =>
    Number.parseInt(teile.find((teil) => teil.type === type)?.value ?? '', 10);

  const kuerzel = teile.find((teil) => teil.type === 'weekday')?.value ?? '';
  const stunde = zahl('hour');

  return {
    year: zahl('year'),
    month: zahl('month'),
    day: zahl('day'),
    // 24 statt 0 kommt bei hour12: false vor. Beides meint Mitternacht.
    hour: stunde === 24 ? 0 : stunde,
    minute: zahl('minute'),
    second: zahl('second'),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(kuerzel),
  };
}

/**
 * Mitternacht des laufenden Ortstags, als echter Zeitpunkt.
 *
 * Der Tag gehoert der Ortszeit: Das Tageslimit soll um Mitternacht in
 * Kaufbeuren umspringen und nicht um zwei Uhr morgens, wenn UTC einen neuen
 * Tag beginnt.
 *
 * Gerechnet wird ueber den Abstand zwischen Wanduhrzeit und Zeitpunkt. In
 * der Nacht der Zeitumstellung kann das Ergebnis um eine Stunde abweichen;
 * um drei Uhr morgens wird nichts verschickt, und die Zaehlung eines Tages
 * verschiebt sich dadurch nicht.
 */
export function leadDayStart(now: Date): Date {
  const teile = ortszeitteile(now);
  const alsWaereEsUtc = Date.UTC(
    teile.year,
    teile.month - 1,
    teile.day,
    teile.hour,
    teile.minute,
    teile.second,
  );
  const versatz = alsWaereEsUtc - now.getTime();
  const tagesbeginnAlsWaereEsUtc = Date.UTC(
    teile.year,
    teile.month - 1,
    teile.day,
  );
  return new Date(tagesbeginnAlsWaereEsUtc - versatz);
}

export function isWithinLeadSendWindow(now: Date): boolean {
  const { hour, weekday } = ortszeitteile(now);
  if (!Number.isFinite(hour) || weekday < 0) return false;
  if (!LEAD_SEND_WINDOW.weekdays.includes(weekday)) return false;
  return hour >= LEAD_SEND_WINDOW.startHour && hour < LEAD_SEND_WINDOW.endHour;
}
