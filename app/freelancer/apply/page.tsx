import type { Metadata } from "next";
import Link from "next/link";

import { ApplyForm } from "./ApplyForm";
import styles from "./apply.module.css";

export const metadata: Metadata = {
  title: "Als Freelancer bewerben | XPORTAL",
  description:
    "Reichen Sie Ihr Freelancer-Profil bei XPORTAL ein. Nach der Prüfung durch unser Team wird Ihr Profil für passende Projekte sichtbar.",
  robots: { index: true, follow: true },
};

const steps = [
  "Profil ausfüllen",
  "Prüfung durch XPORTAL",
  "Freischaltung und Matching",
];

export default function FreelancerApplyPage() {
  return (
    <main className={styles.shell} lang="de">
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>XPORTAL / Freelancer</p>
          <h1>Werde Teil des geprüften Netzwerks.</h1>
          <p>
            Wir schlagen Kundinnen und Kunden nur Profile vor, die wir vorher
            selbst gesichtet haben. Trage deine Angaben ein — wir prüfen sie und
            melden uns. Erst nach unserer Freigabe wird dein Profil im Portal
            sichtbar.
          </p>
          <p>
            Halte einen <strong>Terminlink</strong> bereit (Calendly, Cal.com,
            TidyCal oder ähnlich). Kunden buchen darüber das Erstgespräch — ohne
            ihn können wir dich nicht aufnehmen.
          </p>
        </header>

        <ol className={styles.steps}>
          {steps.map((step, index) => (
            <li key={step}>
              <span>{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>

        <ApplyForm />

        <p className={styles.footer}>
          Fragen? Schreib uns über den <Link href="/cardano">XPORTAL-Zugang</Link>.
          Deine Daten verarbeiten wir nach dem{" "}
          <Link href="/privacy">Datenschutzhinweis</Link>.
        </p>
      </div>
    </main>
  );
}
