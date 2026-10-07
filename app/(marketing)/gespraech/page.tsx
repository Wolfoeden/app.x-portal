import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";

import { ContactPerson } from "@/components/marketing/ContactPerson";
import styles from "@/components/marketing/sales-call.module.css";
import { Notice } from "@/components/ui/Primitives";
import { actionClass } from "@/components/ui/actions";
import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import { BUSINESS_ONLY_NOTICE } from "@/lib/legal/policy";
import { SALES_CALL_MINUTES, SALES_CALL_PATH, isSalesCallEntry } from "@/lib/sales/sales-call-model";
import { readSalesCallToken, salesCallUrl } from "@/lib/sales/sales-call";
import { salesContactPhotoUrl } from "@/lib/sales/sales-contact";
import { SALES_CALL_PAGE, pageMetadata } from "@/lib/seo";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata(SALES_CALL_PAGE);

type Status = "sent" | "invalid" | "limited" | "error";
type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function statusOf(value: string | undefined): Status | null {
  return value === "sent" || value === "invalid" || value === "limited" || value === "error" ? value : null;
}

const STEPS = [
  { title: "Sie erzählen", text: "Welche Rolle, ab wann, wie lange, remote oder vor Ort, welcher Tagessatz-Rahmen." },
  { title: "Wir prüfen den Bestand", text: "Noch im Gespräch sehen Sie, welche Profile in Frage kommen und was offen ist." },
  { title: "Wir stellen vor", text: "Passende Freelancer stellen wir Ihnen per E-Mail vor. Sie sprechen direkt miteinander." },
] as const;

function Required() {
  return <b className={styles.required} aria-hidden="true">*</b>;
}

function Check() {
  return (
    <svg className={styles.check} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="10" />
      <path d="m6 10.2 2.6 2.6L14.2 7.4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * „Gespräch buchen“ — der Weg zu einem Menschen statt zum Chat. Kurzes
 * Formular, danach der Kalender. Die Seite kommt ohne JavaScript aus; das
 * Formular geht an /api/sales-call und kommt mit `?status=` zurück.
 *
 * Sichtbar sind nur die vier Pflichtangaben (UX-Review Oktober 2026: vorher
 * standen neun Felder vor der Terminwahl). Telefon, Start, Dauer, Tagessatz
 * und Notiz liegen eingeklappt darunter; die Feldnamen sind dieselben, am
 * Schema, am CRM-Eintrag und an den Datenschutzhinweisen ändert sich nichts.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Das Profil, von dem die Anfrage kommt: nur aktiv und echt, nur Name und Rolle. */
async function chosenProfile(id: string | undefined): Promise<{ id: string; name: string; role: string } | null> {
  if (!id || !UUID.test(id) || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return null;
  try {
    const { data } = await createAdminSupabaseClient()
      .from("freelancer_profiles")
      .select("id,display_name,role_title")
      .eq("id", id)
      .eq("profile_status", "active")
      .eq("demo_status", "real")
      .maybeSingle();
    const row = data as { id: string; display_name: string; role_title: string } | null;
    return row ? { id: row.id, name: row.display_name, role: row.role_title } : null;
  } catch {
    return null;
  }
}

export default async function SalesCallPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const status = statusOf(first(query.status));
  const token = first(query.t);
  const calendarReady = Boolean(salesCallUrl());
  const tokenValid = status === "sent" && Boolean(readSalesCallToken(token));
  const [profile, contactPhoto] = await Promise.all([
    status ? null : chosenProfile(first(query.profil)),
    salesContactPhotoUrl(),
  ]);
  const calendarHref = `${SALES_CALL_PATH}/termin${tokenValid && token ? `?t=${encodeURIComponent(token)}` : ""}`;

  if (!status) {
    const via = first(query.von);
    const user = await getCurrentUser().catch(() => null);
    after(() =>
      writeAuditEvent({
        actorUserId: user?.id ?? null,
        action: "sales_call_viewed",
        targetType: "sales_call",
        outcome: "success",
        metadata: {
          via: isSalesCallEntry(via) ? via : "direct",
          account: !user ? "none" : user.isAnonymous ? "guest" : "registered",
        },
      }).catch(() => undefined),
    );
  }

  return (
    <main id="main-content" className={styles.page} tabIndex={-1}>
      <div className={styles.split}>
        <section className={styles.formSide} aria-labelledby="gespraech-title">
          <p className={styles.kicker}>Gespräch buchen · {SALES_CALL_MINUTES} Minuten · kostenlos</p>
          <h1 id="gespraech-title">Sprechen wir über Ihr Projekt.</h1>
          <p className={styles.intro}>
            In {SALES_CALL_MINUTES} Minuten wissen Sie, ob wir passende KI-, Software- oder Digital-Freelancer für Ihre
            Anfrage haben.
            {status === "sent"
              ? null
              : calendarReady
                ? " Vier Angaben genügen, danach wählen Sie direkt einen freien Termin."
                : " Vier Angaben genügen; wir melden uns werktags mit einem Terminvorschlag."}
          </p>

          {status === "sent" ? (
            <div id="termin" className={styles.done} aria-label="Anfrage gesendet">
              <p className={styles.doneLabel}><Check />Anfrage ist da</p>
              <h2>Danke. Wählen Sie jetzt Ihren Termin.</h2>
              {calendarReady ? (
                <>
                  <p>
                    Im Kalender sind Ihr Name und Ihre Adresse schon eingetragen. Eine Bestätigung mit dem Link haben
                    wir Ihnen auch per E-Mail geschickt.
                  </p>
                  <a
                    className={actionClass("primary")}
                    href={calendarHref}
                    rel="nofollow"
                  >
                    Termin wählen<span aria-hidden="true">↗</span>
                  </a>
                  <p className={styles.small}>
                    Der Kalender öffnet sich bei unserem Terminanbieter. Lieber gleich telefonieren? Wir melden uns
                    werktags innerhalb weniger Stunden.
                  </p>
                </>
              ) : (
                <p>Wir melden uns werktags innerhalb weniger Stunden und schlagen Ihnen einen Termin vor.</p>
              )}
              <Link className={styles.textLink} href="/chat" prefetch={false}>
                Bis dahin selbst suchen <span aria-hidden="true">→</span>
              </Link>
            </div>
          ) : (
            <>
              {status === "invalid" ? (
                <Notice title="Bitte prüfen" tone="warning" role="alert">
                  <p>
                    Firma, Name, eine gültige E-Mail-Adresse und die gesuchte Rolle brauchen wir mindestens, dazu Ihr
                    Häkchen beim Datenschutz.
                  </p>
                </Notice>
              ) : null}
              {status === "limited" ? (
                <Notice title="Schon angekommen" tone="warning" role="alert">
                  <p>
                    Für diese Adresse liegen heute schon Anfragen vor. Wir melden uns; dringend erreichen Sie uns unter{" "}
                    <a href="mailto:info@x-portal.eu">info@x-portal.eu</a>.
                  </p>
                </Notice>
              ) : null}
              {status === "error" ? (
                <Notice title="Nicht gespeichert" tone="error" role="alert">
                  <p>
                    Die Anfrage konnte gerade nicht entgegengenommen werden. Bitte versuchen Sie es gleich noch einmal
                    oder schreiben Sie an <a href="mailto:info@x-portal.eu">info@x-portal.eu</a>.
                  </p>
                </Notice>
              ) : null}
              <ol className={styles.stepsMini} aria-label="Ablauf">
                <li aria-current="step"><span aria-hidden="true">1</span>Ihre Angaben</li>
                <li><span aria-hidden="true">2</span>{calendarReady ? "Termin wählen" : "Terminvorschlag"}</li>
              </ol>
              <form id="formular" className={styles.form} action="/api/sales-call" method="post" aria-label="Gesprächsanfrage">
                {profile ? (
                  <p className={styles.chosen}>
                    Sie interessieren sich für <strong>{profile.name}</strong>, {profile.role}. Wir klären im Gespräch,
                    ob es passt, und stellen Sie vor.
                    <input type="hidden" name="profileId" value={profile.id} />
                  </p>
                ) : null}
                <div className={styles.row}>
                  <label>
                    <span>Firma<Required /></span>
                    <input name="company" autoComplete="organization" minLength={2} maxLength={200} required />
                  </label>
                  <label>
                    <span>Ihr Name<Required /></span>
                    <input name="fullName" autoComplete="name" minLength={2} maxLength={160} required />
                  </label>
                </div>
                <div className={styles.row}>
                  <label>
                    <span>Geschäftliche E-Mail<Required /></span>
                    <input name="email" type="email" autoComplete="email" maxLength={160} required />
                  </label>
                  <label>
                    <span>Wen suchen Sie?<Required /></span>
                    <input
                      name="role"
                      minLength={2}
                      maxLength={200}
                      required
                      defaultValue={profile?.role}
                      placeholder="z. B. KI-Entwickler"
                    />
                  </label>
                </div>
                <details className={styles.more}>
                  <summary>Projektdetails ergänzen <em>optional</em></summary>
                  <div className={styles.moreFields}>
                    <label>
                      <span>Telefon <em>optional</em></span>
                      <input name="phone" type="tel" autoComplete="tel" maxLength={40} />
                    </label>
                    <div className={styles.row3}>
                      <label>
                        <span>Start <em>optional</em></span>
                        <input name="start" maxLength={80} placeholder="November" />
                      </label>
                      <label>
                        <span>Dauer <em>optional</em></span>
                        <input name="duration" maxLength={80} placeholder="3 Monate" />
                      </label>
                      <label>
                        <span>Tagessatz <em>optional</em></span>
                        <input name="rate" maxLength={80} placeholder="bis 800 €" />
                      </label>
                    </div>
                    <label>
                      <span>Noch etwas? <em>optional</em></span>
                      <textarea name="note" rows={3} maxLength={2000} />
                    </label>
                  </div>
                </details>
                <div className={styles.trap} aria-hidden="true">
                  <label>
                    Website
                    <input name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>
                <label className={styles.consent}>
                  <input type="checkbox" name="consent" required />
                  <span>
                    Ich habe die <Link href="/privacy#kontakt">Datenschutzhinweise</Link> gelesen. XPORTAL verwendet
                    meine Angaben, um diese Anfrage zu bearbeiten und mich dazu zu kontaktieren.
                  </span>
                </label>
                <div>
                  <button type="submit" className={actionClass("primary")}>
                    {calendarReady ? "Weiter zur Terminwahl" : "Gespräch anfragen"}
                  </button>
                </div>
                <p className={styles.small}>{BUSINESS_ONLY_NOTICE}</p>
              </form>
            </>
          )}
        </section>

        <aside className={styles.proofSide} aria-label="So läuft das Gespräch">
          <div className={styles.proofInner}>
            <ContactPerson photoUrl={contactPhoto} className={styles.contact} />
            <h2>So läuft das Gespräch</h2>
            <ol className={styles.steps}>
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <span aria-hidden="true">{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <ul className={styles.facts}>
              <li><Check />Gespräch und Vorstellung kostenlos</li>
              <li>
                <Check />
                <span>
                  Neue Vorgänge provisionsfrei · <Link href="/preise">Software-Abonnement</Link>
                </span>
              </li>
              <li><Check />Sie arbeiten direkt mit dem Freelancer</li>
              <li><Check />Projektdaten in der EU (Irland)</li>
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
