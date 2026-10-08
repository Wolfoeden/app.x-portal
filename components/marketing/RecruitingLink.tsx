"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { trackRecruitingEvent } from "@/lib/analytics/recruiting-client";
export function RecruitingLink({ href, event, plan, className, children }: { href: string; event: "trial_cta_clicked" | "demo_viewed"; plan?: "basic" | "pro" | "business"; className?: string; children: ReactNode }) {
  return <Link href={href} prefetch={false} className={className} onClick={() => trackRecruitingEvent(event, { ...(plan ? { plan } : {}) })}>{children}</Link>;
}
