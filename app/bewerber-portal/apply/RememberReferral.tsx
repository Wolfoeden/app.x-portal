"use client";

import { useEffect } from "react";

import { REFERRAL_STORAGE_KEY } from "./ApplyForm";

/**
 * Merkt sich `?quelle=` beim ersten Besuch. Vor dem Formular steht die
 * Anmeldung; kommt die Person über einen E-Mail-Link zurück, fehlt der
 * Parameter in der Adresse.
 */
export function RememberReferral({ referral }: { referral: string }) {
  useEffect(() => {
    try {
      window.localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify({ referral, at: Date.now() }));
    } catch {
      // Ohne Speicher zählt die Bewerbung eben ohne Herkunft.
    }
  }, [referral]);
  return null;
}
