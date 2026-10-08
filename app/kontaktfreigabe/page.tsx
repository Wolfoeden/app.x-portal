import { PublicHeader, PublicFooter } from "@/components/public/PublicChrome";
import { ConsentForm } from "./ConsentForm";
import "@/app/styles/legal.css";
export const metadata = { title: "Kontaktfreigabe | XPORTAL", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default function ContactConsentPage() { return <div className="xlegal"><PublicHeader context="Kontaktfreigabe" /><main className="xlegal-document"><ConsentForm /></main><PublicFooter /></div>; }
