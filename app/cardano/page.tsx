import Link from "next/link";

import { CookieSettingsButton } from "@/components/CookieConsent";

type HomeProps = {
  searchParams?: Promise<{ joined?: string; error?: string }>;
};

const networkSteps = [
  "You",
  "XPORTAL Chat",
  "Insights & intelligence",
  "Specialized spaces",
  "Connected ecosystem",
];

export default async function XPortalHome({ searchParams }: HomeProps) {
  const params = (await searchParams) ?? {};
  const joined = params.joined === "1";
  const hasError = params.error === "1";

  return (
    <main className="xhome" lang="en">
      <section className="xhome-hero" aria-labelledby="xhome-title">
        <div className="xhome-hero-copy">
          <div className="xhome-protocol">
            <span className="xhome-status-dot" aria-hidden="true" />
            <span>XPORTAL / CARDANO DEFI</span>
            <span>PRIVATE ACCESS</span>
          </div>

          <p className="xhome-kicker">The private gateway to a new digital ecosystem.</p>
          <h1 id="xhome-title">Move before<br />the market does.</h1>
          <p className="xhome-intro">
            XPORTAL is building a network of specialized digital spaces,
            connected through one intelligent conversational interface. The
            first gateway begins with Cardano DeFi.
          </p>

          <div className="xhome-signals" aria-label="XPORTAL principles">
            <span>Cardano-native</span>
            <span>Chat-first</span>
            <span>Signal-first</span>
            <span>Early access</span>
          </div>
        </div>

        <aside className="xhome-access-card" id="access" aria-labelledby="access-title">
          <div className="xhome-card-topline">
            <span>Founding whitelist</span>
            <span>01 / ACCESS</span>
          </div>

          {joined ? (
            <div className="xhome-success" role="status">
              <span className="xhome-success-mark" aria-hidden="true">X</span>
              <p className="xhome-eyebrow">Request received</p>
              <h2 id="access-title">You are on the list.</h2>
              <p>We will contact you when the next XPORTAL access window opens.</p>
              <Link href="/cardano" className="xhome-text-link">Return to XPORTAL</Link>
            </div>
          ) : (
            <>
              <p className="xhome-eyebrow">Private access</p>
              <h2 id="access-title">Enter the portal.</h2>
              <p className="xhome-form-copy">
                Join the founding group for early intelligence, product access
                and priority onboarding as the first gateway comes online.
              </p>

              {hasError ? (
                <p className="xhome-form-error" role="alert">
                  We could not save your request. Please check your details and try again.
                </p>
              ) : null}

              <form action="/api/whitelist" method="post" className="xhome-form">
                <label>
                  Full name
                  <input name="fullName" autoComplete="name" minLength={2} maxLength={100} placeholder="Your full name" required />
                </label>
                <label>
                  Email address
                  <input name="email" type="email" autoComplete="email" maxLength={160} placeholder="you@example.com" required />
                </label>
                <label>
                  Country of residence
                  <input name="country" autoComplete="country-name" minLength={2} maxLength={80} placeholder="Your country" required />
                </label>
                <div className="xhome-honeypot" aria-hidden="true">
                  <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
                </div>
                <label className="xhome-consent">
                  <input name="consent" type="checkbox" value="yes" required />
                  <span>
                    I agree to receive XPORTAL launch and whitelist updates by email.
                    See the <Link href="/privacy">privacy notice</Link>.
                  </span>
                </label>
                <button type="submit" className="xhome-submit">
                  <span>Request early access</span><span aria-hidden="true">→</span>
                </button>
              </form>
              <p className="xhome-privacy-note">Used only for XPORTAL access updates. No spam.</p>
            </>
          )}
        </aside>
      </section>

      <section className="xhome-principles" aria-label="How XPORTAL works">
        <article><span>01</span><h2>One intelligent entry point.</h2><p>Move through insights, products and specialized capabilities without switching between fragmented systems.</p></article>
        <article><span>02</span><h2>Chat is the core interface.</h2><p>Ask in familiar language. The conversational layer connects intent with the right intelligence and space.</p></article>
        <article><span>03</span><h2>Specialized spaces, connected.</h2><p>Each space can develop its own data and capabilities while remaining accessible through the same XPORTAL network.</p></article>
        <article><span>04</span><h2>Cardano is the first gateway.</h2><p>The first focused experience begins with Cardano DeFi, its protocols, signals and communities.</p></article>
      </section>

      <section className="xhome-thesis">
        <div>
          <p className="xhome-label">The thesis</p>
          <h2>Digital ecosystems deserve a better front door.</h2>
        </div>
        <div className="xhome-thesis-copy">
          <p>
            Information lives in one place, community in another and products
            somewhere else again. Users are expected to connect the pieces.
            XPORTAL is built around a different model: express what you want to
            understand or accomplish, then let one interface guide you through
            the complexity underneath.
          </p>
          <p>Cardano DeFi is where we begin. The connected network is what comes next.</p>
        </div>
      </section>

      <section className="xhome-product" aria-labelledby="product-title">
        <div className="xhome-product-heading">
          <p className="xhome-label">The product</p>
          <h2 id="product-title">Chat at the center.<br />A network behind it.</h2>
          <p>
            Insights appear inside the conversation. Specialized spaces provide
            the data and capabilities. The user does not need to understand the
            infrastructure connecting them.
          </p>
        </div>

        <ol className="xhome-flow" aria-label="XPORTAL product flow">
          {networkSteps.map((step, index) => (
            <li key={step} className={step === "XPORTAL Chat" ? "is-core" : ""}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
              {index < networkSteps.length - 1 ? <i aria-hidden="true">→</i> : null}
            </li>
          ))}
        </ol>

        <div className="xhome-explainers">
          <article><span>CHAT</span><h3>The common interaction layer.</h3><p>One continuous conversation becomes the way users reach intelligence, products and future spaces.</p></article>
          <article><span>INSIGHTS</span><h3>Context instead of raw information.</h3><p>Signals become useful when they are explained around the user’s question and current objective.</p></article>
          <article><span>SPACES</span><h3>Autonomous, not isolated.</h3><p>Think of each space as a focused digital environment with its own purpose, connected to a wider ecosystem.</p></article>
        </div>
      </section>

      <section className="xhome-final-access">
        <div>
          <p className="xhome-label">Private access</p>
          <h2>The network starts small.</h2>
        </div>
        <div>
          <p>
            XPORTAL is opening gradually to a founding group who want to explore
            the first Cardano-focused gateway and help shape what the wider
            ecosystem becomes.
          </p>
          <a href="#access" className="xhome-final-cta">Request early access <span aria-hidden="true">→</span></a>
        </div>
      </section>

      <section className="xhome-risk" aria-label="Digital asset risk notice">
        <strong>Digital assets involve risk.</strong>
        <p>
          Information provided through XPORTAL is for informational purposes only
          and does not constitute financial, investment or other professional
          advice. Whitelist access is not an investment offer and does not
          guarantee allocation, returns or access to future products.
        </p>
      </section>

      <footer className="xhome-footer">
        <div className="xhome-wordmark">XPORTAL</div>
        <div className="xhome-footer-meta">
          <span>Cardano DeFi / First gateway</span>
          <span>© 2026 XPORTAL</span>
        </div>
        <nav aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/imprint">Imprint</Link>
          <CookieSettingsButton />
        </nav>
      </footer>
    </main>
  );
}
