import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  LEAD_HOURLY_SEND_LIMIT,
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
