"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { trackRecruitingEvent } from "@/lib/analytics/recruiting-client";
import { appPath } from "@/lib/app-path";
import { rendersWithNonce } from "@/lib/security/csp";
export function RecruitingLink({ href, event, plan, className, children }: { href: string; event: "trial_cta_clicked" | "demo_viewed" | "signup_started"; plan?: "starter" | "basic" | "pro" | "business"; className?: string; children: ReactNode }) {
  const trackedEvent = event === "signup_started" ? "trial_cta_clicked" : event;
  const track = () => trackRecruitingEvent(trackedEvent, { ...(plan && plan !== "starter" ? { plan } : {}) });
  // In den Talent Index mit vollem Seitenaufruf, damit dort die eigene CSP gilt
  // (lib/security/csp.ts). Die Meldung geht mit `keepalive` trotzdem raus.
  if (rendersWithNonce(href)) return <a href={appPath(href)} className={className} onClick={track}>{children}</a>;
  return <Link href={href} prefetch={false} className={className} onClick={track}>{children}</Link>;
}
