"use client";
import { appPath } from "@/lib/app-path";
import { parseConsent } from "@/lib/consent/consent";
import { campaignSource, type ClientRecruitingEvent, type RECRUITING_OUTCOMES } from "./recruiting-events";

const SESSION_KEY = "xportal.recruiting-measurement.v1";
type Options = { entityId?: string; outcome?: typeof RECRUITING_OUTCOMES[number]; plan?: "basic" | "pro" | "business" };

/** Optional product measurement. No project, profile, contact or free-text payload. */
export function trackRecruitingEvent(event: ClientRecruitingEvent, options: Options = {}): void {
  try {
    if (parseConsent(document.cookie) !== "all") return;
    if (window.location.pathname.startsWith("/chat/admin")) return;
    let sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId || !/^[0-9a-f-]{36}$/iu.test(sessionId)) {
      sessionId = crypto.randomUUID(); sessionStorage.setItem(SESSION_KEY, sessionId);
    }
    const entityId = options.entityId ?? sessionId;
    const key = `${SESSION_KEY}:${event}:${entityId}`;
    if (sessionStorage.getItem(key)) return;
    const source = campaignSource(new URLSearchParams(window.location.search).get("utm_source"));
    void fetch(appPath("/api/recruiting-events"), {
      method: "POST", credentials: "same-origin", keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, entityId, sessionId, source, outcome: options.outcome ?? "success", plan: options.plan }),
    }).then(response => { if (response.ok) sessionStorage.setItem(key, "1"); }).catch(() => undefined);
  } catch { /* Measurement must never block work or checkout. */ }
}
