import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Keine Werbung mehr | XPORTAL",
  description: "Werbliche E-Mail von XPORTAL abbestellen.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Result = "done" | "invalid" | "error";

function resultOf(value: string | string[] | undefined): Result | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "done" || raw === "invalid" || raw === "error" ? raw : null;
}

function tokenOf(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  // Nur die Form wird hier geprüft; ob die Signatur stimmt, entscheidet die
  // Route. Die Seite soll keine Auskunft darüber geben, welche Adressen es
  // gibt.
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(raw) && raw.length <= 512
    ? raw
    : null;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="xlegal" lang="de">
      <header className="xlegal-header">
        <Link href="/chat" className="xlegal-wordmark">
          XPORTAL
        </Link>
        <span>ABMELDUNG</span>
      </header>
      <article className="xlegal-document">{children}</article>
      <footer className="xlegal-footer">
        <Link href="/chat">Zurück zu XPORTAL</Link>
        <span>
          <Link href="/imprint">Impressum</Link>
          {" · "}
          <Link href="/privacy">Datenschutz</Link>
          {" · "}
          <Link href="/contact">Kontakt</Link>
        </span>
      </footer>
    </main>
  );
}

/**
 * Die Abmeldeseite.
 *
 * Sie meldet nichts von selbst ab. Der Link aus der E-Mail führt hierher, und
 * erst ein Klick auf die Schaltfläche schickt den Token per POST an die
 * Route. Virenscanner und Vorschaudienste, die Links in E-Mails automatisch
 * abrufen, tragen so niemanden aus, der nur seine Post geöffnet hat.
 *
 * Was die Abmeldung umfasst und was nicht, steht hier ausdrücklich: Werbung
 * hört auf, Nachrichten zum eigenen Konto nicht. Wer sich später anmeldet,
 * soll seine Bestätigung nicht vermissen und sich dann wundern.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const result = resultOf(params.result);
  const token = tokenOf(params.t);

  if (result === "done") {
    return (
      <Frame>
        <p className="xhome-label">Abmeldung</p>
        <h1>Erledigt. Sie hören nichts mehr von uns.</h1>
        <p className="xlegal-lead">
          Ihre Adresse steht auf unserer Sperrliste. Sie bekommt keine
          Akquise-Mail und keinen Newsletter mehr — dauerhaft und unabhängig
          davon, aus welchem Teil von XPORTAL eine Nachricht käme.
        </p>
        <div className="xlegal-warning">
          <strong>Eine Ausnahme, damit Sie nicht überrascht werden</strong>
          <p>
            Sollten Sie sich später einmal selbst bei XPORTAL anmelden oder
            etwas buchen, bekommen Sie weiterhin die Nachrichten, die zu Ihrem
            Konto gehören: Anmeldebestätigung, Passwortlink, Buchungs- und
            Vertragsbestätigung, Rechnung. Werbung bleibt abbestellt, bis Sie
            sie ausdrücklich wieder anfordern.
          </p>
        </div>
        <p className="contact-note">
          Zu Ihrer Adresse speichern wir dafür nur eine Prüfsumme, keine
          lesbare Adresse. Näheres in den{" "}
          <Link href="/privacy">Datenschutzhinweisen</Link>. Fragen dazu
          beantworten wir über das <Link href="/contact">Kontaktformular</Link>.
        </p>
      </Frame>
    );
  }

  if (result === "invalid") {
    return (
      <Frame>
        <p className="xhome-label">Abmeldung</p>
        <h1>Dieser Link führt nirgendwohin.</h1>
        <p className="xlegal-lead">
          Der Abmeldelink ist unvollständig. Manche Mailprogramme kürzen lange
          Adressen beim Weiterleiten — öffnen Sie den vollständigen Link aus
          der Nachricht.
        </p>
        <p className="contact-note">
          Es geht auch formlos: eine Antwort auf die Nachricht oder eine Zeile
          an{" "}
          <a href="mailto:info@x-portal.eu?subject=Keine%20Werbung">
            info@x-portal.eu
          </a>{" "}
          genügt, und wir tragen Sie von Hand aus.
        </p>
      </Frame>
    );
  }

  if (result === "error") {
    return (
      <Frame>
        <p className="xhome-label">Abmeldung</p>
        <h1>Das hat gerade nicht geklappt.</h1>
        <p className="xlegal-lead">
          Bitte versuchen Sie es in ein paar Minuten erneut. Ihre Abmeldung ist
          damit nicht verloren — sie ist nur noch nicht eingetragen.
        </p>
        <p className="contact-note">
          Wenn es weiter klemmt, schreiben Sie eine Zeile an{" "}
          <a href="mailto:info@x-portal.eu?subject=Keine%20Werbung">
            info@x-portal.eu
          </a>
          . Wir tragen Sie dann von Hand aus.
        </p>
      </Frame>
    );
  }

  if (!token) {
    return (
      <Frame>
        <p className="xhome-label">Abmeldung</p>
        <h1>Hier fehlt der Abmeldelink.</h1>
        <p className="xlegal-lead">
          Öffnen Sie den vollständigen Link aus unserer E-Mail. Ohne ihn wissen
          wir nicht, welche Adresse ausgetragen werden soll — und wir raten
          nicht.
        </p>
        <p className="contact-note">
          Eine formlose Antwort auf die Nachricht genügt ebenso.
        </p>
      </Frame>
    );
  }

  return (
    <Frame>
      <p className="xhome-label">Abmeldung</p>
      <h1>Keine Werbung mehr von XPORTAL?</h1>
      <p className="xlegal-lead">
        Ein Klick, und Ihre Adresse bekommt keine Akquise-Mail und keinen
        Newsletter mehr. Das gilt dauerhaft und für alle Nachrichten dieser
        Art, nicht nur für die eine, aus der Sie hierher gekommen sind.
      </p>

      <form className="contact-form" action="/api/unsubscribe" method="post">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="contact-submit">
          Werbung abbestellen
        </button>
      </form>

      <p className="contact-note">
        Nachrichten, die zu einem eigenen Konto gehören — Anmeldebestätigung,
        Buchung, Rechnung —, sind davon nicht betroffen. Wenn Sie sich später
        selbst anmelden, bekommen Sie diese weiterhin. Wie wir Ihre Adresse
        verarbeiten, steht in den{" "}
        <Link href="/privacy">Datenschutzhinweisen</Link>.
      </p>
    </Frame>
  );
}
