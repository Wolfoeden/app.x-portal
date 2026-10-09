import type { Metadata } from "next";
import { checkoutPlanFrom } from "@/components/chat/checkout-intent";
import { CheckoutAccess } from "./CheckoutAccess";

export const metadata: Metadata = {
  title: "Anmelden | XPORTAL",
  robots: { index: false, follow: false },
};

export default async function CheckoutLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const plan = checkoutPlanFrom((await searchParams).checkout ?? null);
  return <CheckoutAccess plan={plan} />;
}
