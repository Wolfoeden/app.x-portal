import type { Metadata } from "next";
import Link from "next/link";

import { CookieConsent } from "@/components/CookieConsent";

export const metadata: Metadata = {
  title: "Privacy | XPORTAL",
  description: "Privacy information for the XPORTAL founding whitelist and website.",
};

export default function PrivacyPage() {
  return (
    <main className="xlegal" lang="en">
      <header className="xlegal-header">
        <Link href="/home" className="xlegal-wordmark">XPORTAL</Link>
        <span>PRIVACY / 01</span>
      </header>

      <article className="xlegal-document">
        <p className="xhome-label">Privacy notice</p>
        <h1>Your data stays tied to a clear purpose.</h1>
        <p className="xlegal-lead">
          This notice describes how the XPORTAL website processes information
          submitted for founding-whitelist access.
        </p>

        <section>
          <h2>1. Who is responsible</h2>
          <p>
            XPORTAL is responsible for the processing described here. The legal
            operator, postal address and direct privacy contact must be completed
            in the <Link href="/imprint">imprint</Link> before public launch.
          </p>
        </section>

        <section>
          <h2>2. Information we collect</h2>
          <p>
            The founding-whitelist form collects your full name, email address,
            country of residence and the time at which you gave consent. Basic
            technical request data may be processed temporarily to protect the
            form and website from abuse.
          </p>
        </section>

        <section>
          <h2>3. Why we use it</h2>
          <p>
            We use whitelist information only to manage early-access requests,
            send launch and onboarding updates you agreed to receive and maintain
            the security of the service. Your consent is the basis for those
            communications and can be withdrawn for the future.
          </p>
        </section>

        <section>
          <h2>4. Storage and recipients</h2>
          <p>
            Access is restricted to authorised XPORTAL operators and contracted
            infrastructure providers needed to run the website and store the
            whitelist. Data is kept only as long as required for the early-access
            programme, consent management and applicable legal obligations.
          </p>
        </section>

        <section>
          <h2>5. Cookies</h2>
          <p>
            Essential cookies support security, sessions and storage of your
            consent choice. Optional cookies remain disabled unless you accept
            them. No third-party analytics are currently loaded on the landing page.
          </p>
          <CookieConsent />
        </section>

        <section>
          <h2>6. Your choices</h2>
          <p>
            Depending on applicable law, you may request access, correction,
            deletion, restriction, portability or withdrawal of consent. The
            verified privacy contact will be published with the final operator
            details before the public launch.
          </p>
        </section>

        <p className="xlegal-updated">Draft status · Last updated 9 August 2026</p>
      </article>

      <footer className="xlegal-footer">
        <Link href="/home">Back to XPORTAL</Link>
        <Link href="/imprint">Imprint</Link>
      </footer>
    </main>
  );
}
