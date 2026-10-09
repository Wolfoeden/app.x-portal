import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { checkoutPlanFrom } from "@/components/chat/checkout-intent";
import { CheckoutAccess } from "./CheckoutAccess";

export const metadata: Metadata = {
  title: "Anmelden und kostenlos testen | XPORTAL",
  robots: { index: false, follow: false },
};

export default async function CheckoutLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const plan = checkoutPlanFrom((await searchParams).checkout ?? null);
  if (!plan) redirect("/preise#tarife");
  return <CheckoutAccess plan={plan} />;
}
