import { describe, expect, it } from "vitest";

import {
  CSV_BOM,
  csvFilename,
  csvNumber,
  toCsv,
} from "@/lib/ai/usage-csv";

describe("CSV für Excel", () => {
  it("beginnt mit einem BOM, damit Umlaute ankommen", () => {
    expect(toCsv(["Name"], [["Jörg Müller"]]).startsWith(CSV_BOM)).toBe(true);
  });

  it("trennt mit Semikolon", () => {
    const csv = toCsv(["a", "b"], [[1, 2]]);
    expect(csv).toContain("a;b");
    expect(csv).toContain("1;2");
  });

  it("schützt Zellen mit Trennzeichen oder Umbruch", () => {
    expect(toCsv(["a"], [['x;y']])).toContain('"x;y"');
    expect(toCsv(["a"], [["Zeile1\nZeile2"]])).toContain('"Zeile1\nZeile2"');
  });

  it("verdoppelt Anführungszeichen im Wert", () => {
    expect(toCsv(["a"], [['sagte "hallo"']])).toContain('"sagte ""hallo"""');
  });

  it("entschärft eine Zelle, die Excel als Formel ausführen würde", () => {
    // Ein Name aus der Websuche ist Fremdtext; =HYPERLINK(...) darf nicht laufen.
    expect(toCsv(["a"], [["=1+1"]])).toContain("'=1+1");
    expect(toCsv(["a"], [["+49 170"]])).toContain("'+49 170");
    expect(toCsv(["a"], [["@sonst"]])).toContain("'@sonst");
  });

  it("lässt harmlose Werte unangetastet", () => {
    expect(toCsv(["a"], [["Anna Beispiel"]])).toContain("Anna Beispiel");
  });

  it("schreibt leere Werte als leere Zelle", () => {
    expect(toCsv(["a", "b"], [[null, undefined]])).toContain(";");
  });

  it("formatiert Zahlen deutsch und ohne Tausenderpunkt", () => {
    expect(csvNumber(1234.5, 1)).toBe("1234,5");
    expect(csvNumber(42)).toBe("42");
  });

  it("baut einen Dateinamen mit Zeitstempel", () => {
    expect(csvFilename("nutzer", "2026-08-26T09:15:30.000Z")).toBe(
      "xportal-nutzer-2026-08-26-09-15-30.csv",
    );
  });

  it("beendet jede Zeile mit CRLF", () => {
    expect(toCsv(["a"], [["x"]]).endsWith("\r\n")).toBe(true);
  });
});
