"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AuthDialog } from "@/components/chat/dialogs";
import { checkoutDialogCopy } from "@/components/chat/checkout-intent";
import type { CheckoutPlanId } from "@/lib/billing/payment-links";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

import styles from "./checkout-access.module.css";

type VoucherStatus =
  | "redeemed"
  | "already_redeemed"
  | "invalid"
  | "exhausted"
  | "account_ineligible"
  | "unavailable";

type VoucherResponse = { accepted?: boolean; status?: VoucherStatus };

const voucherMessages: Record<VoucherStatus, string> = {
  redeemed: "Der Gutschein wurde aktiviert.",
  already_redeemed: "Dieser Gutschein wurde mit diesem Konto bereits verwendet.",
  invalid: "Der Gutscheincode ist ungültig.",
  exhausted: "Dieser Gutscheincode wurde bereits 50-mal eingelöst.",
  account_ineligible: "Für dieses Konto kann der Gutschein nicht mehr eingelöst werden.",
  unavailable: "Der Gutschein konnte gerade nicht geprüft werden. Bitte versuchen Sie es erneut.",
};

function voucherMessage(status: unknown) {
  return typeof status === "string" && status in voucherMessages
    ? voucherMessages[status as VoucherStatus]
    : voucherMessages.unavailable;
}

export function CheckoutAccess({
  plan,
  initialVoucher = "",
}: {
  plan: CheckoutPlanId | null;
  initialVoucher?: string;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [voucherCode, setVoucherCode] = useState(initialVoucher);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);

  const redeemOrContinue = useCallback(async (code: string) => {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      window.location.replace(plan ? `/api/billing/checkout?plan=${plan}` : "/chat");
      return;
    }

    setRedeeming(true);
    setVoucherError(null);
    try {
      const response = await fetch("/api/billing/voucher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalizedCode, plan: plan ?? "basic" }),
      });
      const payload = await response.json().catch(() => null) as VoucherResponse | null;
      if (response.ok && payload?.accepted) {
        window.location.replace("/chat");
        return;
      }
      setVoucherError(voucherMessage(payload?.status));
    } catch {
      setVoucherError(voucherMessages.unavailable);
    } finally {
      setRedeeming(false);
      setReady(true);
    }
  }, [plan]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await getBrowserSupabaseClient().auth.getClaims();
        if (!active) return;
        const claims = result.data?.claims as { sub?: string; is_anonymous?: boolean } | undefined;
        if (claims?.sub && claims.is_anonymous !== true) {
          await redeemOrContinue(initialVoucher);
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
  }, [initialVoucher, redeemOrContinue]);

  const continueAfterLogin = () => {
    void redeemOrContinue(voucherCode);
  };

  const loginPath = plan ? `/anmelden?checkout=${plan}` : "/anmelden";
  const destination = voucherCode.trim()
    ? `${loginPath}${plan ? "&" : "?"}voucher=${encodeURIComponent(voucherCode.trim())}`
    : loginPath;

  return (
    <main className={styles.shell} aria-busy={!ready}>
      <Link className={styles.brand} href="/freelancer-finden">XPORTAL</Link>
      {!ready ? (
        <section className={styles.loading} aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <h1>Anmeldung wird vorbereitet.</h1>
          <p>Einen Moment bitte.</p>
        </section>
      ) : voucherError ? (
        <section className={styles.loading} aria-live="polite">
          <h1>Gutscheincode prüfen</h1>
          <p>{voucherError}</p>
          <label className={styles.voucherRetry}>
            <span>Gutscheincode</span>
            <input value={voucherCode} onChange={(event) => setVoucherCode(event.target.value.toUpperCase())} maxLength={64} autoComplete="off" />
          </label>
          <button className={styles.primaryAction} type="button" disabled={redeeming || !voucherCode.trim()} onClick={() => void redeemOrContinue(voucherCode)}>
            {redeeming ? "Wird geprüft …" : "Gutschein erneut prüfen"}
          </button>
          {plan ? <a className={styles.secondaryAction} href={`/api/billing/checkout?plan=${plan}`}>Ohne Gutschein zu Stripe</a> : null}
        </section>
      ) : (
        <AuthDialog
          initialMode={plan ? "register" : "login"}
          checkout={plan ? checkoutDialogCopy(plan) : undefined}
          destination={destination}
          voucher={{ value: voucherCode, onChange: setVoucherCode }}
          onClose={() => router.push(plan ? "/preise#tarife" : "/freelancer-finden")}
          onAuthenticated={continueAfterLogin}
          showToast={(message) => setNotice(message)}
        />
      )}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    </main>
  );
}
