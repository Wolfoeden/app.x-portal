import Link from "next/link";
import { BillingManagement } from "@/components/chat/BillingManagement";
import { PublicHeader, PublicFooter } from "@/components/public/PublicChrome";
import "@/app/styles/legal.css";
export const metadata = { title: "Abrechnung und Testphase | XPORTAL", robots: { index: false, follow: false } };
export default function AccountPage() { return <div className="xlegal"><PublicHeader context="Ihr Konto" /><main className="xlegal-document"><BillingManagement /><p><Link href="/chat">Zu Ihren Projekten und dem gespeicherten Entwurf →</Link></p><p>Nach einem Checkout kann die Bestätigung einige Augenblicke dauern. Der verifizierte Kontostatus entscheidet über den Zugang.</p></main><PublicFooter /></div>; }
