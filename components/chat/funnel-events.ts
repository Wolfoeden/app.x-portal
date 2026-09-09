"use client";

import { appPath } from "@/lib/app-path";

export type FunnelEvent =
  | "search_started"
  | "result_seen"
  | "registration_started"
  | "signup_confirmed"
  | "continuation_completed";

const FUNNEL_KEY = "xportal.signup-funnel.v1";
const ENTRY_KEY = "xportal.signup-funnel-entry.v1";
const ENTRY_MAX_AGE_MS = 60 * 60 * 1_000;

export function rememberFunnelEntry(entry: "direct" | "recruiter") {
  try {
    localStorage.setItem(
      ENTRY_KEY,
      JSON.stringify({ entry, createdAt: Date.now() }),
    );
  } catch {
    // Attribution is optional and must never interrupt the entry flow.
  }
}

function rememberedEntry(): "direct" | "recruiter" | null {
  try {
    const raw = localStorage.getItem(ENTRY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { entry?: unknown; createdAt?: unknown };
    if (
      (parsed.entry === "direct" || parsed.entry === "recruiter") &&
      typeof parsed.createdAt === "number" &&
      Date.now() - parsed.createdAt <= ENTRY_MAX_AGE_MS
    ) {
      return parsed.entry;
    }
  } catch {
    return null;
  }
  return null;
}

function funnelId(): string {
  const created = crypto.randomUUID();
  try {
    const stored = localStorage.getItem(FUNNEL_KEY);
    if (stored && /^[a-f0-9-]{36}$/iu.test(stored)) return stored;
    localStorage.setItem(FUNNEL_KEY, created);
  } catch {
    // Measurement is optional and must never interrupt the product flow.
  }
  return created;
}

export function trackFunnelEvent(
  event: FunnelEvent,
  outcome: string | null = null,
) {
  try {
    const params = new URLSearchParams(window.location.search);
    const entry =
      params.get("entry") === "recruiter" || params.has("q")
        ? "recruiter"
        : rememberedEntry() ?? "direct";
    void fetch(appPath("/api/funnel-events"), {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventKey: crypto.randomUUID(),
        funnelId: funnelId(),
        event,
        entry,
        device: window.matchMedia("(max-width: 760px)").matches
          ? "mobile"
          : "desktop",
        outcome,
      }),
    }).catch(() => undefined);
  } catch {
    // Analytics cannot be allowed to block a search, sign-in or continuation.
  }
}
