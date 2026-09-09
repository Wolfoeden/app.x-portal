import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  herkunftsHinweis,
  naechsterSchritt,
  versandDetail,
} from "@/lib/leadgen/dashboard";
import { parseMatchCounts } from "@/lib/leadgen/leads-data";

describe("Zusatz unter „Heute verschickt“", () => {
  it("nennt die Tagesmenge, solange sie nicht erreicht ist", () => {
    expect(versandDetail(3, 20)).toEqual({
      detail: "von 20 am Tag",
      tone: "default",
    });
  });

  it("sagt Bescheid, wenn sie erreicht ist", () => {
    expect(versandDetail(20, 20).detail).toBe("Tagesmenge von 20 erreicht");
  });

  it("schreibt „25 von 20“ nicht mehr hin, sondern was los ist", () => {
    // Der Fall, der am 8. September auf der Seite stand.
    const { detail, tone } = versandDetail(25, 20);
    expect(detail).toBe("5 über der Tagesmenge von 20");
    expect(tone).toBe("warning");
  });
});

describe("Nächster Schritt", () => {
  const basis = {
    abzugleichen: 0,
    vorbereitet: 0,
    verschicktHeute: 0,
    tagesmenge: 20,
    mailReady: true,
  };

  it("stellt den fehlenden Mailversand vor alles andere", () => {
    expect(
      naechsterSchritt({ ...basis, abzugleichen: 9, mailReady: false }),
    ).toContain("nicht eingerichtet");
  });

  it("schickt zuerst zum Abgleich", () => {
    expect(naechsterSchritt({ ...basis, abzugleichen: 9, vorbereitet: 4 })).toBe(
      "9 Leads warten auf den Abgleich.",
    );
  });

  it("beugt die Einzahl", () => {
    expect(naechsterSchritt({ ...basis, abzugleichen: 1 })).toBe(
      "1 Lead wartet auf den Abgleich.",
    );
  });

  it("nennt beim Versand den Rest des Tages", () => {
    expect(
      naechsterSchritt({ ...basis, vorbereitet: 3, verschicktHeute: 18 }),
    ).toBe("3 Entwürfe warten auf den Versand, heute sind noch 2 möglich.");
  });

  it("sagt bei erschöpfter Tagesmenge, dass es morgen weitergeht", () => {
    const satz = naechsterSchritt({
      ...basis,
      vorbereitet: 1,
      verschicktHeute: 25,
    });
    expect(satz).toContain("Tagesmenge von 20 ist ausgeschöpft");
    expect(satz).toContain("morgen");
    // Kein „noch -5 möglich“.
    expect(satz).not.toMatch(/-\d/);
  });

  it("sagt auch, wenn nichts zu tun ist", () => {
    expect(naechsterSchritt(basis)).toContain("Nichts zu tun");
  });
});

describe("Herkunft der Ergebniszahlen", () => {
  it("schweigt, solange es nichts gibt", () => {
    expect(herkunftsHinweis(0, 0)).toBe("noch nichts");
  });

  it("nennt den Anteil ohne Lead", () => {
    expect(herkunftsHinweis(291, 299)).toBe("291 davon zu gelöschten Leads");
  });

  it("sagt es kurz, wenn alle betroffen sind", () => {
    expect(herkunftsHinweis(25, 25)).toBe("sämtlich zu gelöschten Leads");
  });

  it("meldet den heilen Zustand", () => {
    expect(herkunftsHinweis(0, 12)).toBe("alle noch in der Liste");
  });
});

describe("Filterzahlen aus der Übersicht", () => {
  const vollstaendig = {
    open: { hit: 1, no_hit: 0, open: 0 },
    archived: { hit: 0, no_hit: 7, open: 0 },
    all: { hit: 1, no_hit: 7, open: 0 },
  };

  it("liest die drei Ansichten", () => {
    expect(parseMatchCounts(vollstaendig)).toEqual(vollstaendig);
  });

  it("nimmt Zahlen als Text an, wie PostgREST sie liefern kann", () => {
    const geparst = parseMatchCounts({
      ...vollstaendig,
      all: { hit: "1", no_hit: "7", open: "0" },
    });
    expect(geparst?.all.no_hit).toBe(7);
  });

  it("gibt null zurück, statt eine fehlende Ansicht mit Nullen zu füllen", () => {
    const { archived, ...ohneArchiv } = vollstaendig;
    void archived;
    expect(parseMatchCounts(ohneArchiv)).toBeNull();
  });

  it("gibt null zurück, wenn ein Filter fehlt", () => {
    expect(
      parseMatchCounts({
        ...vollstaendig,
        open: { hit: 1, no_hit: 0 },
      }),
    ).toBeNull();
  });

  it("nimmt weder alte Datenbanken noch Unsinn hin", () => {
    // Die Funktion gab es vor dem 8. September nicht; bis die Migration
    // läuft, fehlt der Schlüssel. Dann steht am Filter keine Zahl — eine
    // erfundene Null wäre eine Aussage über die Warteschlange.
    expect(parseMatchCounts(undefined)).toBeNull();
    expect(parseMatchCounts(null)).toBeNull();
    expect(parseMatchCounts([])).toBeNull();
    expect(parseMatchCounts("viele")).toBeNull();
    expect(
      parseMatchCounts({ ...vollstaendig, all: { hit: -1, no_hit: 7, open: 0 } }),
    ).toBeNull();
  });
});
