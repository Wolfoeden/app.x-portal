"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { trackRecruitingEvent } from "@/lib/analytics/recruiting-client";
export function RecruitingLink({ href, event, plan, className, children }: { href: string; event: "trial_cta_clicked" | "demo_viewed" | "signup_started"; plan?: "starter" | "basic" | "pro" | "business"; className?: string; children: ReactNode }) {
  const trackedEvent = event === "signup_started" ? "trial_cta_clicked" : event;
  return <Link href={href} prefetch={false} className={className} onClick={() => trackRecruitingEvent(trackedEvent, { ...(plan && plan !== "starter" ? { plan } : {}) })}>{children}</Link>;
}
