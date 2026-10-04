import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";

import marketing from "@/components/marketing/marketing.module.css";
import styles from "@/components/marketing/sales-call.module.css";
import { Notice } from "@/components/ui/Primitives";
import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import { BUSINESS_ONLY_NOTICE } from "@/lib/legal/policy";
import { PLACEMENT_TERMS, PLACEMENT_TERMS_PATH } from "@/lib/placement/config";
import { SALES_CALL_MINUTES, SALES_CALL_PATH, isSalesCallEntry } from "@/lib/sales/sales-call-model";
import { readSalesCallToken, salesCallUrl } from "@/lib/sales/sales-call";
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

/**
 * „Gespräch buchen“ — der Weg zu einem Menschen statt zum Chat. Kurzes
 * Formular, danach der Kalender. Die Seite kommt ohne JavaScript aus; das
 * Formular geht an /api/sales-call und kommt mit `?status=` zurück.
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
  const profile = status ? null : await chosenProfile(first(query.profil));

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
    <main id="main-content" className={`${marketing.main} ${styles.page}`} tabIndex={-1}>
      <header className={styles.intro}>
        <p className={marketing.eyebrow}>Gespräch buchen · {SALES_CALL_MINUTES} Minuten · kostenlos</p>
        <h1 id="gespraech-title">In {SALES_CALL_MINUTES} Minuten wissen Sie, ob wir passende Leute haben.</h1>
        <p className={marketing.lead}>
          Sie suchen KI-, SAP- oder Software-Freelancer und möchten nicht erst selbst suchen? Erzählen Sie uns,
          was ansteht. Wir sagen Ihnen ehrlich, ob unser Bestand passt, und stellen die passenden Leute vor.
        </p>
      </header>

      <section className={styles.details} aria-label="So läuft das Gespräch">
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
          <li>Gespräch und Vorstellung kostenlos</li>
          <li>
            {PLACEMENT_TERMS.feePercent} % Honorar nur bei Beauftragung ·{" "}
            <Link href={PLACEMENT_TERMS_PATH}>Bedingungen</Link>
          </li>
          <li>Sie arbeiten direkt mit dem Freelancer</li>
        </ul>
      </section>

      <section className={styles.panel} aria-label={status === "sent" ? "Anfrage gesendet" : "Gesprächsanfrage"}>
        {status === "sent" ? (
          <div id="termin" className={styles.done}>
            <p className={marketing.eyebrow}>Anfrage ist da</p>
            <h2>Danke. Wählen Sie jetzt Ihren Termin.</h2>
            {calendarReady ? (
              <>
                <p>
                  Im Kalender sind Ihr Name und Ihre Adresse schon eingetragen. Eine Bestätigung mit dem Link haben
                  wir Ihnen auch per E-Mail geschickt.
                </p>
                <a
                  className={marketing.primaryLink}
                  href={`${SALES_CALL_PATH}/termin${tokenValid && token ? `?t=${encodeURIComponent(token)}` : ""}`}
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
            <form id="formular" className={styles.form} action="/api/sales-call" method="post">
              <h2>Worum geht es?</h2>
              {profile ? (
                <p className={styles.chosen}>
                  Sie interessieren sich für <strong>{profile.name}</strong>, {profile.role}. Wir klären im Gespräch,
                  ob es passt, und stellen Sie vor.
                  <input type="hidden" name="profileId" value={profile.id} />
                </p>
              ) : null}
              <div className={styles.row}>
                <label>
                  <span>Firma</span>
                  <input name="company" autoComplete="organization" minLength={2} maxLength={200} required />
                </label>
                <label>
                  <span>Ihr Name</span>
                  <input name="fullName" autoComplete="name" minLength={2} maxLength={160} required />
                </label>
              </div>
              <div className={styles.row}>
                <label>
                  <span>Geschäftliche E-Mail</span>
                  <input name="email" type="email" autoComplete="email" maxLength={160} required />
                </label>
                <label>
                  <span>Telefon <em>optional</em></span>
                  <input name="phone" type="tel" autoComplete="tel" maxLength={40} />
                </label>
              </div>
              <label>
                <span>Wen suchen Sie?</span>
                <input
                  name="role"
                  minLength={2}
                  maxLength={200}
                  required
                  defaultValue={profile?.role}
                  placeholder="z. B. KI-Entwickler für einen Agenten auf Basis unserer Dokumente"
                />
              </label>
              <div className={styles.row3}>
                <label>
                  <span>Start <em>optional</em></span>
                  <input name="start" maxLength={80} placeholder="z. B. November" />
                </label>
                <label>
                  <span>Dauer <em>optional</em></span>
                  <input name="duration" maxLength={80} placeholder="z. B. 3 Monate" />
                </label>
                <label>
                  <span>Tagessatz <em>optional</em></span>
                  <input name="rate" maxLength={80} placeholder="z. B. bis 800 €" />
                </label>
              </div>
              <label>
                <span>Noch etwas? <em>optional</em></span>
                <textarea name="note" rows={3} maxLength={2000} />
              </label>
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
              <button type="submit" className={styles.submit}>
                {calendarReady ? "Weiter zur Terminwahl" : "Gespräch anfragen"}
              </button>
              <p className={styles.small}>{BUSINESS_ONLY_NOTICE}</p>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
