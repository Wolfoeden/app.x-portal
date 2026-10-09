"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthDialog } from "@/components/chat/dialogs";
import { checkoutDialogCopy } from "@/components/chat/checkout-intent";
import type { CheckoutPlanId } from "@/lib/billing/payment-links";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

import styles from "./checkout-access.module.css";

export function CheckoutAccess({ plan }: { plan: CheckoutPlanId | null }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await getBrowserSupabaseClient().auth.getClaims();
        if (!active) return;
        const claims = result.data?.claims as { sub?: string; is_anonymous?: boolean } | undefined;
        if (claims?.sub && claims.is_anonymous !== true) {
          window.location.replace(plan ? `/api/billing/checkout?plan=${plan}` : "/chat");
          return;
        }
      } catch {
        // The card still renders in a local preview without Supabase config.
      }
      if (active) setReady(true);
    })();

    return () => {
      active = false;
    };
  }, [plan]);

  const continueAfterLogin = () => {
    window.location.replace(plan ? `/api/billing/checkout?plan=${plan}` : "/chat");
  };

  return (
    <main className={styles.shell} aria-busy={!ready}>
      <Link className={styles.brand} href="/freelancer-finden">XPORTAL</Link>
      {!ready ? (
        <section className={styles.loading} aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <h1>Anmeldung wird vorbereitet.</h1>
          <p>Einen Moment bitte.</p>
        </section>
      ) : (
        <AuthDialog
          initialMode={plan ? "register" : "login"}
          checkout={plan ? checkoutDialogCopy(plan) : undefined}
          destination={plan ? `/anmelden?checkout=${plan}` : "/chat"}
          onClose={() => router.push(plan ? "/preise#tarife" : "/freelancer-finden")}
          onAuthenticated={continueAfterLogin}
          showToast={(message) => setNotice(message)}
        />
      )}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    </main>
  );
}
