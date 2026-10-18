import { appPath } from "@/lib/app-path";
import { BillingManagement } from "@/components/chat/BillingManagement";
import { PublicHeader, PublicFooter } from "@/components/public/PublicChrome";
import "@/app/styles/legal.css";
export const metadata = { title: "Abrechnung und Testphase | XPORTAL", robots: { index: false, follow: false } };
export default function AccountPage() { return <div className="xlegal"><PublicHeader context="Ihr Konto" /><main className="xlegal-document"><BillingManagement /><p><a href={appPath("/chat")}>Zu Ihren Projekten und dem gespeicherten Entwurf →</a></p><p>Nach einem Checkout kann die Bestätigung einige Augenblicke dauern. Der verifizierte Kontostatus entscheidet über den Zugang.</p></main><PublicFooter /></div>; }
