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
  searchParams: Promise<{ checkout?: string; voucher?: string }>;
}) {
  const parameters = await searchParams;
  const plan = checkoutPlanFrom(parameters.checkout ?? null);
  const voucher = typeof parameters.voucher === "string"
    ? parameters.voucher.slice(0, 64)
    : "";
  return <CheckoutAccess plan={plan} initialVoucher={voucher} />;
}
