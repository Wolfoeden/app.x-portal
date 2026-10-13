import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  loadProfilePresentation,
  presentationInputHash,
  refreshProfilePresentation,
} from "@/lib/freelancer/profile-presentation";

const PROFILE = "4e906e6e-5ec1-403f-8625-244c270f1574";
const input = { role: "Analyst", summary: "Works on SAP.", skills: ["SAP FI/CO"], industries: [], qualifications: [] };
const presentation = { headline: "SAP.", summaryDe: "Arbeitet an SAP.", focusAreas: [], industries: [], educationShort: null };

function db(row: Record<string, unknown> | null, error: { code?: string; message?: string } | null = null) {
  const upserts: Array<Record<string, unknown>> = [];
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: row, error }),
    upsert: async (value: Record<string, unknown>) => {
      upserts.push(value);
      return { error: null };
    },
  };
  return { client: { from: () => builder } as never, upserts };
}

// Oktober 2026: Die Aufbereitung der Profilseite liegt je Inhaltsstand im
// Zwischenspeicher; die Seite wartet nie auf das Modell.
describe("profile presentation cache", () => {
  it("uses the stored presentation for the same content", async () => {
    const { client } = db({ input_hash: presentationInputHash(input), presentation, status: "ok", created_at: "2026-10-13T08:00:00Z" });
    expect(await loadProfilePresentation(client, PROFILE, input)).toEqual({ presentation, stale: false });
  });

  it("asks again once the profile content changed", async () => {
    const { client } = db({ input_hash: presentationInputHash(input), presentation, status: "ok", created_at: "2026-10-13T08:00:00Z" });
    expect(await loadProfilePresentation(client, PROFILE, { ...input, role: "Projektleiter" })).toEqual({ presentation: null, stale: true });
  });

  it("waits a day after a failed attempt", async () => {
    const failed = { input_hash: presentationInputHash(input), presentation: null, status: "failed", created_at: "2026-10-13T08:00:00Z" };
    expect(await loadProfilePresentation(db(failed).client, PROFILE, input, new Date("2026-10-13T12:00:00Z"))).toEqual({ presentation: null, stale: false });
    expect(await loadProfilePresentation(db(failed).client, PROFILE, input, new Date("2026-10-14T09:00:00Z"))).toEqual({ presentation: null, stale: true });
  });

  it("stays quiet before the migration", async () => {
    const { client } = db(null, { code: "42P01", message: 'relation "public.freelancer_profile_presentations" does not exist' });
    expect(await loadProfilePresentation(client, PROFILE, input)).toEqual({ presentation: null, stale: false });
  });

  it("stores a result, and nothing when no model is configured", async () => {
    const stored = db(null);
    await refreshProfilePresentation(stored.client, PROFILE, input, async () => ({ status: "ok", presentation, model: "gpt-test" }));
    expect(stored.upserts[0]).toMatchObject({ profile_id: PROFILE, input_hash: presentationInputHash(input), status: "ok", presentation });

    const none = db(null);
    await refreshProfilePresentation(none.client, PROFILE, input, async () => ({ status: "unavailable" }));
    expect(none.upserts).toHaveLength(0);
  });
});
