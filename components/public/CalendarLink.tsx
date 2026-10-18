"use client";

import type { ReactNode } from "react";

import { appPath } from "@/lib/app-path";
import { SALES_CALENDAR_CLICK_PATH, SALES_CALENDAR_HREF, type SalesCallEntry } from "@/lib/sales/sales-call-model";

function countClick(entry: SalesCallEntry) {
  void fetch(appPath(SALES_CALENDAR_CLICK_PATH), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify({ von: entry }),
  }).catch(() => undefined);
}

/**
 * „Erstgespräch buchen“: ein gewöhnlicher Link auf den Kalender, der sofort
 * in einem neuen Tab öffnet, auch ohne JavaScript. Mit JavaScript zählt der
 * Klick nebenher (`keepalive`, damit er das Öffnen des Tabs übersteht) im
 * Umsatzweg als „Kalender geöffnet“, mit `entry` als Herkunft.
 */
export function CalendarLink({ entry, className, children }: {
  entry: SalesCallEntry;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={SALES_CALENDAR_HREF}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={className}
      onClick={() => countClick(entry)}
    >
      {children}
    </a>
  );
}
