import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { assessAddress, extractEmails, findImprintUrl } from "@/lib/sourcing/address";
import { decodeEntities, htmlToLines, htmlToText } from "@/lib/sourcing/html-text";

describe("htmlToText", () => {
  it("entfernt Skripte unabhängig von der Schreibweise", () => {
    // Der Kern des Befunds: Ein Skript in Grossbuchstaben blieb stehen, und
    // sein Quelltext landete in dem Text, in dem wir nach Adressen suchen.
    for (const tag of ["script", "SCRIPT", "ScRiPt"]) {
      const html = `<p>Impressum</p><${tag}>var a="chef@fremd.de";</${tag}>`;
      const text = htmlToText(html);
      expect(text).toContain("Impressum");
      expect(text).not.toContain("chef@fremd.de");
    }
  });

  it("entfernt auch Stil, Vorlagen und Kommentare", () => {
    const html =
      '<STYLE>a{content:"x@y.de"}</STYLE><!-- versteckt@y.de --><template>t@y.de</template><p>sichtbar</p>';
    const text = htmlToText(html);
    expect(text).toBe("sichtbar");
  });

  it("übersteht ein verschachteltes Skript-Element", () => {
    const html = "<p>a</p><scr<script>ipt>b</script>";
    expect(htmlToText(html)).not.toContain("<script");
  });

  it("löst Entities in einem Durchgang auf, nicht zweimal", () => {
    // `&amp;lt;` ist wörtlich der Text "&lt;" — nicht "<".
    expect(decodeEntities("&amp;lt;")).toBe("&lt;");
    expect(decodeEntities("Müller &amp; Sohn")).toBe("Müller & Sohn");
  });

  it("liest verschleierte Adressen aus ihren Zeichenkodierungen", () => {
    // Genau so verstecken Seiten ihre Adresse vor Sammlern.
    const html = "<p>kontakt&commat;firma.de und info&#64;firma.de</p>";
    const text = htmlToText(html);
    expect(extractEmails(text)).toEqual([
      "kontakt@firma.de",
      "info@firma.de",
    ]);
  });

  it("gliedert in Zeilen, wo die Gliederung gebraucht wird", () => {
    expect(htmlToLines("<h2>Skills</h2><span>Java</span><span>Go</span>")).toEqual(
      ["Skills", "Java", "Go"],
    );
  });
});

describe("Auswirkung auf die Adressentscheidung", () => {
  it("lässt sich eine fremde Adresse nicht per Skript unterschieben", () => {
    // Der Angriff, den der Befund beschreibt: Auf der eigenen Seite steht in
    // einem Skript eine fremde Adresse. Bliebe sie im Text, würde sie geprüft
    // und womöglich benutzt.
    const html = `
      <h1>Impressum</h1>
      <SCRIPT>var kontakt = "fremder@ganz-woanders.de";</SCRIPT>
      <p>Nikolai Schankin, Musterweg 3</p>
      <p>E-Mail: kontakt@nikolai-schankin.de</p>`;
    const text = htmlToText(html);
    expect(extractEmails(text)).toEqual(["kontakt@nikolai-schankin.de"]);

    const urteil = assessAddress({
      email: "kontakt@nikolai-schankin.de",
      displayName: "Nikolai Schankin",
      pageUrl: "https://www.nikolai-schankin.de/impressum",
      imprintText: text,
    });
    expect(urteil.verdict).toBe("usable_team");
  });

  it("findet den Impressumslink auch mit Entity in der Beschriftung", () => {
    expect(
      findImprintUrl(
        '<a href="/legal">Impressum &amp; Datenschutz</a>',
        "https://x.de/",
      ),
    ).toBe("https://x.de/legal");
  });
});
