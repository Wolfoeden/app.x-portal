import type { Metadata } from "next";
import Link from "next/link";
import "@/app/styles/legal.css";

import { CaptchaField } from "@/components/CaptchaField";
import {
  PublicDocumentIntro,
  PublicFooter,
  PublicHeader,
} from "@/components/public/PublicChrome";
import { ActionButton, FormField, Notice } from "@/components/ui/Primitives";
import { CONTACT_RESPONSE_PROMISE } from "@/lib/legal/policy";

export const metadata: Metadata = {
  title: "Kontakt | XPORTAL",
  description:
    "Direkter Kontaktweg zu XPORTAL mit zugesagter Reaktionszeit von einem Werktag.",
};

type Status = "sent" | "error" | "invalid";

function statusOf(value: string | string[] | undefined): Status | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "sent" || raw === "error" || raw === "invalid" ? raw : null;
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const status = statusOf((await searchParams).status);

  return (
    <div className="xlegal" lang="de">
      <PublicHeader context="Kontakt" />

      <main className="xlegal-document">
        <PublicDocumentIntro
          eyebrow="Kontakt"
          title="Schreiben Sie uns."
          signal={{ label: "Antwort", value: "In der Regel ein Werktag" }}
        >
          <p>
            Für Fragen zum Produkt, zu einem Vertrag, zu Ihren Daten oder zu einem
            Profil im Portal. {CONTACT_RESPONSE_PROMISE}
          </p>
        </PublicDocumentIntro>

        {status === "sent" ? (
          <Notice title="Eingegangen" tone="success" role="status">
            <p>
              Ihre Nachricht ist angekommen. {CONTACT_RESPONSE_PROMISE} Eine
              Kopie versenden wir nicht — notieren Sie sich Ihr Anliegen bei
              Bedarf selbst.
            </p>
          </Notice>
        ) : null}

        {status === "invalid" ? (
          <Notice title="Bitte prüfen" tone="warning" role="alert">
            <p>
              Eine Angabe fehlt oder ist zu kurz. Name ab 2 Zeichen, Betreff ab
              3 Zeichen, Nachricht ab 20 Zeichen, dazu eine gültige
              E-Mail-Adresse.
            </p>
          </Notice>
        ) : null}

        {status === "error" ? (
          <Notice title="Nicht gespeichert" tone="error" role="alert">
            <p>
              Die Nachricht konnte gerade nicht entgegengenommen werden. Bitte
              versuchen Sie es später erneut oder schreiben Sie direkt an{" "}
              <a href="mailto:info@x-portal.eu">info@x-portal.eu</a>.
            </p>
          </Notice>
        ) : null}

        <form
          id="formular"
          className="contact-form"
          action="/api/contact"
          method="post"
        >
          <FormField label="Name">
            <input
              name="fullName"
              autoComplete="name"
              minLength={2}
              maxLength={100}
              required
            />
          </FormField>
          <FormField label="E-Mail-Adresse">
            <input
              name="email"
              type="email"
              autoComplete="email"
              maxLength={160}
              required
            />
          </FormField>
          <FormField label="Betreff">
            <input name="subject" minLength={3} maxLength={150} required />
          </FormField>
          <FormField label="Nachricht">
            <textarea name="message" rows={8} minLength={20} maxLength={5000} required />
          </FormField>

          <div className="contact-honeypot" aria-hidden="true">
            <label>
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          <CaptchaField />
          <ActionButton type="submit" className="contact-submit">
            Nachricht senden
          </ActionButton>
        </form>

        <p className="contact-note">
          Wir verarbeiten Ihre Angaben ausschließlich, um dieses Anliegen zu
          bearbeiten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO bei einem
          vertraglichen Anliegen, sonst Art. 6 Abs. 1 lit. f DSGVO. Einzelheiten
          in Abschnitt 8 der{" "}
          <Link href="/privacy">Datenschutzhinweise</Link>. Bitte senden Sie
          über dieses Formular keine besonderen Kategorien personenbezogener
          Daten.
        </p>
      </main>

      <PublicFooter />
    </div>
  );
}
