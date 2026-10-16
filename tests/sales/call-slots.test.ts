import { describe, expect, it } from "vitest";

import { calendarBookingUrl, calendlyEventPath, pickCallSlots, slotLabel } from "@/lib/sales/call-slots-model";

const BASE = "https://calendly.com/romandering/30min";
// Freitag, 16.10.2026, 12 Uhr in Berlin.
const NOW = new Date("2026-10-16T10:00:00Z");

const day = (date: string, times: string[], offset = "+02:00") => ({
  date,
  status: "available",
  spots: times.map((time) => ({ status: "available", start_time: `${date}T${time}:00${offset}` })),
});

describe("pickCallSlots", () => {
  it("offers three weekdays from tomorrow on, each at the time nearest to 10 o'clock", () => {
    const slots = pickCallSlots(
      [
        day("2026-10-16", ["14:00"]),
        day("2026-10-17", ["09:00", "09:30"]),
        day("2026-10-19", ["08:00", "08:30", "11:00"]),
        day("2026-10-20", ["08:00", "09:30", "10:00", "14:00"]),
        day("2026-10-21", ["15:00"]),
        day("2026-10-22", ["10:00"]),
      ],
      NOW,
    );
    expect(slots).toEqual([
      { start: "2026-10-19T11:00:00+02:00", label: "Mo, 19.10., 11:00" },
      { start: "2026-10-20T10:00:00+02:00", label: "Di, 20.10., 10:00" },
      { start: "2026-10-21T15:00:00+02:00", label: "Mi, 21.10., 15:00" },
    ]);
  });

  it("ignores booked spots, broken entries and an empty calendar", () => {
    expect(pickCallSlots([], NOW)).toEqual([]);
    expect(
      pickCallSlots(
        [
          { date: "2026-10-19", spots: [{ status: "unavailable", start_time: "2026-10-19T10:00:00+02:00" }] },
          { date: "2026-10-20", spots: [{ status: "available", start_time: "not a time" }] },
          { date: "kaputt", spots: [] },
        ],
        NOW,
      ),
    ).toEqual([]);
  });

  it("labels winter time correctly", () => {
    expect(slotLabel("2026-10-26T08:00:00+01:00")).toBe("Mo, 26.10., 08:00");
  });
});

describe("calendlyEventPath", () => {
  it("reads profile and event from a Calendly link and nothing else", () => {
    expect(calendlyEventPath(BASE)).toEqual({ profile: "romandering", event: "30min" });
    expect(calendlyEventPath("https://calendly.com/d/2k6-5kw-n5j/30-minuten")).toBeNull();
    expect(calendlyEventPath("https://evil.example/romandering/30min")).toBeNull();
    expect(calendlyEventPath("http://calendly.com/romandering/30min")).toBeNull();
    expect(calendlyEventPath(null)).toBeNull();
  });
});

describe("calendarBookingUrl", () => {
  it("opens the calendar at the chosen time with what was typed in", () => {
    const url = new URL(calendarBookingUrl(BASE, { start: "2026-10-20T10:00:00+02:00", name: " Maria Muster ", email: "m@firma.de", note: "Interesse: Anfragen" })!);
    expect(url.origin + url.pathname).toBe("https://calendly.com/romandering/30min/2026-10-20T10:00:00+02:00");
    expect(url.searchParams.get("month")).toBe("2026-10");
    expect(url.searchParams.get("date")).toBe("2026-10-20");
    expect(url.searchParams.get("name")).toBe("Maria Muster");
    expect(url.searchParams.get("email")).toBe("m@firma.de");
    expect(url.searchParams.get("a1")).toBe("Interesse: Anfragen");
    expect(url.searchParams.get("utm_source")).toBe("x-portal");
  });

  it("falls back to the calendar itself and drops what is not valid", () => {
    const url = new URL(calendarBookingUrl(BASE, { start: "2026-10-20T10:00:00+02:00/../../x", email: "keine adresse" })!);
    expect(url.pathname).toBe("/romandering/30min");
    expect(url.searchParams.has("email")).toBe(false);
    expect(calendarBookingUrl("javascript:alert(1)")).toBeNull();
    expect(calendarBookingUrl(null)).toBeNull();
  });
});
