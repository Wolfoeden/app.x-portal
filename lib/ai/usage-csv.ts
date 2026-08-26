/**
 * Tabellen als CSV für Excel.
 *
 * Zwei Eigenheiten, ohne die Excel die Datei falsch öffnet:
 *
 *   - Semikolon als Trenner. Excel im deutschen Gebietsschema erwartet das;
 *     mit Komma landet jede Zeile in einer einzigen Spalte.
 *   - BOM am Anfang. Ohne ihn liest Excel die Datei als Windows-1252, und
 *     jeder Umlaut wird zu Buchstabensalat.
 */

export const CSV_DELIMITER = ";";
export const CSV_BOM = "﻿";

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? String(value) : String(value);
  // Ein Zellwert, der mit =, +, - oder @ beginnt, wird von Excel als Formel
  // ausgeführt. Das ist ein bekannter Angriffsweg, wenn Daten aus dem Netz
  // stammen — und genau das tun Freelancer-Namen aus der Websuche.
  const guarded = /^[=+\-@\t\r]/u.test(text) ? `'${text}` : text;
  return /[";\n\r]/u.test(guarded) ? `"${guarded.replace(/"/gu, '""')}"` : guarded;
}

export function toCsv(
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const lines = [
    columns.map(escapeCell).join(CSV_DELIMITER),
    ...rows.map((row) => row.map(escapeCell).join(CSV_DELIMITER)),
  ];
  return CSV_BOM + lines.join("\r\n") + "\r\n";
}

/** Deutsches Zahlenformat, damit Excel die Spalte als Zahl erkennt. */
export function csvNumber(value: number, fractionDigits = 0): string {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: false,
  });
}

export function csvFilename(table: string, generatedAt: string): string {
  const stamp = generatedAt.slice(0, 19).replace(/[:T]/gu, "-");
  return `xportal-${table}-${stamp}.csv`;
}
