import { notFound } from "next/navigation";
import { BillingManagement } from "@/components/chat/BillingManagement";
export const metadata = {title:"Lokale Trial-Vorschau | XPORTAL",robots:{index:false,follow:false}};
export default function BillingPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main style={{maxWidth:920,margin:"48px auto",padding:24}}><h1>Trial-Verwaltung · lokale Beispieldaten</h1><p>Darstellungsprüfung: kein reales Konto, kein bestätigter Stripe-Trial.</p><BillingManagement initialStatus={{planId:"pro",selectedPlanId:"pro",subscriptionStatus:"trialing",trialEnd:"2026-10-21T15:00:00Z",periodEnd:null,cancelAtPeriodEnd:false,latestInvoiceStatus:"paid",access:{canRunAi:true,canUseRecruiting:true,source:"trial",reason:"trial_active"},credits:{total:90,used:18,reserved:0,remaining:72}}}/></main>;
}
