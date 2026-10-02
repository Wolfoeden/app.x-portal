/**
 * Der Anfang eines Kurzprofils für eine Karte: der erste Satz, höchstens
 * `max` Zeichen, an einer Wortgrenze gekürzt. Leer bleibt leer.
 */
export function summaryExcerpt(text: string | null | undefined, max = 160): string | null {
  const clean = (text ?? "").replace(/\s+/gu, " ").trim();
  if (!clean) return null;
  const sentence = clean.match(/^.+?[.!?](?=\s|$)/u)?.[0] ?? clean;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:–-]+$/u, "")}…`;
}
