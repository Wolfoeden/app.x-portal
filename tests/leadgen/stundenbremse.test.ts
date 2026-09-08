import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  LEAD_HOURLY_SEND_LIMIT,
  LEAD_SEND_SPACING_MS,
  PROVIDER_HOURLY_CEILING,
  sendHourStart,
} from "@/lib/leadgen/limits";

describe("Stundenbremse", () => {
  it("bleibt unter der Grenze des Anbieters", () => {
    // Fünfzig verkraftet IONOS gemessen; vierzig ist der Zielwert. Der
    // Abstand ist der Sinn der Sache und darf nicht wegoptimiert werden.
    expect(LEAD_HOURLY_SEND_LIMIT).toBeLessThan(PROVIDER_HOURLY_CEILING);
    expect(LEAD_HOURLY_SEND_LIMIT).toBe(40);
    expect(PROVIDER_HOURLY_CEILING).toBe(50);
  });

  it("schneidet die Stunde an der vollen Stunde ab", () => {
    const beginn = sendHourStart(new Date("2026-09-08T09:54:46.123Z"));
    expect(beginn.toISOString()).toBe("2026-09-08T09:00:00.000Z");
  });

  it("liegt nie in der Zukunft und höchstens eine Stunde zurück", () => {
    for (const zeitpunkt of [
      "2026-09-08T00:00:00.000Z",
      "2026-09-08T00:00:00.001Z",
      "2026-09-08T23:59:59.999Z",
    ]) {
      const jetzt = new Date(zeitpunkt);
      const beginn = sendHourStart(jetzt);
      expect(beginn.getTime()).toBeLessThanOrEqual(jetzt.getTime());
      expect(jetzt.getTime() - beginn.getTime()).toBeLessThan(3_600_000);
    }
  });

  it("rechnet in UTC und wandert deshalb nicht mit der Zeitumstellung", () => {
    // Die Grenze schuetzt den Mailserver, nicht den Empfaenger. Ihn
    // interessiert die Wanduhrzeit nicht, und eine Stunde, die zweimal
    // stattfindet, wuerde die Bremse verdoppeln.
    const vorUmstellung = sendHourStart(new Date("2026-10-25T00:30:00.000Z"));
    const nachUmstellung = sendHourStart(new Date("2026-10-25T01:30:00.000Z"));
    expect(vorUmstellung.toISOString()).toBe("2026-10-25T00:00:00.000Z");
    expect(nachUmstellung.toISOString()).toBe("2026-10-25T01:00:00.000Z");
  });
});

describe("Abstand zwischen zwei Nachrichten", () => {
  it("wartet fuenf Sekunden", () => {
    expect(LEAD_SEND_SPACING_MS).toBe(5_000);
  });

  it("passt zur Stundenmenge, statt ihr zu widersprechen", () => {
    // Bei fuenf Sekunden Abstand sind zwoelf Nachrichten je Minute moeglich.
    // Die Stundenmenge bleibt darueber die eigentliche Obergrenze — der
    // Abstand glaettet die Spitze, er ersetzt die Grenze nicht.
    const proMinute = 60_000 / LEAD_SEND_SPACING_MS;
    expect(proMinute).toBe(12);
    expect(proMinute * 60).toBeGreaterThan(LEAD_HOURLY_SEND_LIMIT);
  });

  it("laesst einen Durchgang nicht laenger dauern als sein Zeitbudget", () => {
    // Ein Aufruf arbeitet zwanzig Sekunden. Mit fuenf Sekunden Abstand sind
    // das drei bis vier Nachrichten je Aufruf — der Rest bleibt liegen und
    // wird vom naechsten geholt. Das ist gewollt und keine Bremse zu viel.
    const proDurchgang = Math.floor(20_000 / LEAD_SEND_SPACING_MS);
    expect(proDurchgang).toBe(4);
  });
});
