"use client";

/**
 * Modal shell and the workspace dialogs.
 *
 * Moved out of ChatWorkspace unchanged. They were always self-contained —
 * every one takes its data through props and reports back through
 * callbacks — so they were the first 380 lines that could leave without
 * touching behaviour.
 */

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  registerEmailAccount,
  requestPasswordRecovery,
  setAccountPassword,
  signInExistingAccount,
  startOauthUpgrade,
} from "@/lib/auth/browser";
import { appPath } from "@/lib/app-path";

import type {
  FreelancerProfileResult,
  ProjectCollectionItem,
  ProjectListItem,
} from "../chat-contract";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCalendar,
  IconCheck,
  IconClose,
  IconPlus,
} from "../icons";
import {
  GOOGLE_AUTH_ENABLED,
  initials,
  MICROSOFT_AUTH_ENABLED,
  type AuthDialogMode,
  type ToastState,
} from "./shared";

export function Modal({ titleId, onClose, children, size = "default" }: { titleId: string; onClose: () => void; children: ReactNode; size?: "default" | "large" }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && cardRef.current) {
        const focusable = Array.from(
          cardRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={cardRef} className={`modal-card ${size === "large" ? "is-large" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button ref={closeRef} className="modal-close" type="button" onClick={onClose} aria-label="Dialog schließen"><IconClose size={17} /></button>
        {children}
      </section>
    </div>
  );
}

export function AuthDialog({
  initialMode,
  onClose,
  onAuthenticated,
  showToast,
}: {
  initialMode: AuthDialogMode;
  onClose: () => void;
  onAuthenticated: () => void;
  showToast: (message: string, tone?: ToastState["tone"]) => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingEmails, setMarketingEmails] = useState(false);
  const [busy, setBusy] = useState<"google" | "microsoft" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const consentMissing = mode === "register" && !termsAccepted;

  const connectProvider = async (provider: "google" | "microsoft") => {
    setBusy(provider);
    setError(null);
    try {
      await startOauthUpgrade(provider);
    } catch (providerError) {
      setError(providerError instanceof Error ? providerError.message : "Anmeldung konnte nicht gestartet werden.");
      setBusy(null);
    }
  };

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("email");
    setError(null);
    if ((mode === "register" || mode === "set-password") && password !== passwordRepeat) {
      setError("Die beiden Passwörter stimmen nicht überein.");
      setBusy(null);
      return;
    }
    try {
      if (mode === "login") {
        await signInExistingAccount(email, password);
        showToast("Anmeldung erfolgreich. Ihre Auswahl wird fortgesetzt.");
        onAuthenticated();
      } else if (mode === "register") {
        const result = await registerEmailAccount(email, password, {
          termsAcceptedAt: new Date().toISOString(),
          marketingEmails,
        });
        if (result.confirmationRequired) {
          setConfirmationSent(true);
          setBusy(null);
        } else {
          showToast("Konto erstellt. Ihre Auswahl wird fortgesetzt.");
          onAuthenticated();
        }
      } else if (mode === "recover") {
        await requestPasswordRecovery(email);
        setConfirmationSent(true);
        setBusy(null);
      } else {
        await setAccountPassword(password);
        const cleanUrl = `${window.location.pathname}${window.location.hash}`;
        window.history.replaceState({}, "", cleanUrl);
        showToast("Ihr Konto ist eingerichtet. Ihre Auswahl wird fortgesetzt.");
        onAuthenticated();
      }
    } catch (emailError) {
      const fallback = mode === "login"
        ? "E-Mail oder Passwort ist nicht korrekt. Nutzen Sie bei Bedarf ‚Passwort vergessen?‘."
        : mode === "recover"
          ? "Der Wiederherstellungslink konnte gerade nicht versendet werden."
          : mode === "register"
            ? "Das Konto konnte gerade nicht erstellt werden. Prüfen Sie E-Mail und Passwort."
            : "Das neue Passwort konnte gerade nicht gespeichert werden.";
      const message = emailError instanceof Error ? emailError.message.toLowerCase() : "";
      setError(
        mode === "login" && (message.includes("invalid login") || message.includes("invalid credentials"))
          ? "E-Mail oder Passwort ist nicht korrekt. Nutzen Sie bei Bedarf ‚Passwort vergessen?‘."
          : fallback,
      );
      setBusy(null);
    }
  };

  return (
    <Modal titleId="auth-title" onClose={onClose}>
      <div className="auth-dialog">
        <span className="dialog-eyebrow">Auswahl sichern</span>
        <h2 id="auth-title">
          {mode === "set-password"
            ? "Neues Passwort festlegen"
            : mode === "recover"
              ? "Zugang wiederherstellen"
              : mode === "register"
                ? "Konto erstellen"
                : "Anmelden und direkt fortfahren"}
        </h2>
        <p>
          {mode === "set-password"
            ? "Legen Sie jetzt ein neues Passwort für Ihr bestätigtes Konto fest."
            : mode === "recover"
              ? "Wir senden einen sicheren Link an Ihre E-Mail-Adresse. Ihre aktuelle Anfrage bleibt dabei erhalten."
              : "Ihre Anfrage bleibt erhalten. Nach der Anmeldung kehren Sie genau zu Ihrem ausgewählten Profil zurück."}
        </p>

        {mode !== "set-password" && mode !== "recover" ? (
          <>
            {GOOGLE_AUTH_ENABLED || MICROSOFT_AUTH_ENABLED ? (
              <>
                <div className="provider-buttons">
                  {GOOGLE_AUTH_ENABLED ? (
                    <button type="button" onClick={() => void connectProvider("google")} disabled={Boolean(busy)}><span className="provider-letter" aria-hidden="true">G</span>{busy === "google" ? "Google wird geöffnet …" : "Mit Google fortfahren"}</button>
                  ) : null}
                  {MICROSOFT_AUTH_ENABLED ? (
                    <button type="button" onClick={() => void connectProvider("microsoft")} disabled={Boolean(busy)}><span className="provider-letter microsoft" aria-hidden="true">M</span>{busy === "microsoft" ? "Microsoft wird geöffnet …" : "Mit Microsoft fortfahren"}</button>
                  ) : null}
                </div>
                <div className="or-divider"><span>oder</span></div>
              </>
            ) : null}
            <div className="auth-mode-tabs" role="tablist" aria-label="E-Mail-Zugang">
              <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(null); }}>Bestehendes Konto</button>
              <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(null); }}>Neues Konto</button>
            </div>
          </>
        ) : null}

        {confirmationSent ? (
          <div className="confirmation-state" role="status">
            <span aria-hidden="true"><IconCheck size={16} /></span>
            <h3>{mode === "recover" ? "Wiederherstellungslink versendet" : "Bestätigungslink versendet"}</h3>
            <p>
              {mode === "recover" ? (
                <>Öffnen Sie den Link in der E-Mail an <strong>{email}</strong> und legen Sie anschließend ein neues Passwort fest.</>
              ) : (
                <>Öffnen Sie den Link in der E-Mail an <strong>{email}</strong>, um Ihr Konto mit dem gewählten Passwort zu aktivieren.</>
              )}
            </p>
            <button type="button" onClick={onClose}>Verstanden</button>
          </div>
        ) : (
          <form className="email-login" onSubmit={submitEmail}>
            {mode !== "set-password" ? (
              <>
                <label htmlFor="login-email">E-Mail-Adresse</label>
                <input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
              </>
            ) : null}
            {mode === "login" || mode === "register" || mode === "set-password" ? (
              <>
                <label htmlFor="login-password">{mode === "set-password" ? "Neues Passwort" : "Passwort"}</label>
                <input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required />
              </>
            ) : null}
            {mode === "register" || mode === "set-password" ? (
              <>
                <label htmlFor="login-password-repeat">Passwort wiederholen</label>
                <input id="login-password-repeat" type="password" value={passwordRepeat} onChange={(event) => setPasswordRepeat(event.target.value)} autoComplete="new-password" minLength={8} required />
              </>
            ) : null}
            {mode === "login" ? (
              <button className="forgot-password" type="button" onClick={() => { setMode("recover"); setError(null); setPassword(""); }}>
                Passwort vergessen?
              </button>
            ) : null}
            {mode === "recover" ? (
              <button className="back-to-login" type="button" onClick={() => { setMode("login"); setError(null); }}>
                Zurück zur Anmeldung
              </button>
            ) : null}
            {mode === "register" ? (
              <div className="auth-consent">
                <label>
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(event) => setTermsAccepted(event.target.checked)}
                    required
                  />
                  <span>
                    Ich handle als Unternehmer im Sinne des § 14 BGB und
                    akzeptiere die{" "}
                    <a href="/terms">Allgemeinen Geschäftsbedingungen</a> sowie
                    die <a href="/privacy">Datenschutzhinweise</a>.
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={marketingEmails}
                    onChange={(event) => setMarketingEmails(event.target.checked)}
                  />
                  <span>
                    Optional: XPORTAL darf mir E-Mails zu neuen Funktionen und
                    passenden Freelancern senden. Sie können dem jederzeit
                    widersprechen.
                  </span>
                </label>
              </div>
            ) : null}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="auth-submit" type="submit" disabled={Boolean(busy) || consentMissing}>
              {busy === "email"
                ? "Bitte warten …"
                : mode === "login"
                  ? "Mit E-Mail anmelden"
                  : mode === "register"
                    ? "Konto erstellen"
                    : mode === "recover"
                      ? "Wiederherstellungslink senden"
                      : "Passwort speichern & fortfahren"}
            </button>
          </form>
        )}
        <p className="auth-privacy">
          Die Anmeldung dient dazu, Projekte geräteübergreifend zuzuordnen und
          eine Profilwahl sicher fortzusetzen.
          {GOOGLE_AUTH_ENABLED ? " Google wird erst nach Ihrem Klick geöffnet; alternativ steht die E-Mail-Anmeldung zur Verfügung." : ""}
          {" "}<a href="/privacy">Datenschutzhinweise</a>
        </p>
        {/* Beim Anlegen eines Kontos per E-Mail steht die Zustimmung als
            Häkchen im Formular. Über einen Anbieter kann aber ebenfalls ein
            Konto entstehen, ohne dass dieses Formular je sichtbar war —
            deshalb bleibt der Hinweis für alle anderen Wege stehen. */}
        {mode !== "register" ? (
          <p className="auth-privacy">
            Mit dem Anlegen eines Kontos bestätigen Sie, dass Sie als Unternehmer
            im Sinne des § 14 BGB handeln, und akzeptieren die{" "}
            <a href="/terms">Allgemeinen Geschäftsbedingungen</a>.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}


export function CreateProjectDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string) => Promise<ProjectCollectionItem>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(name.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Projekt konnte nicht erstellt werden.");
      setBusy(false);
    }
  };
  return (
    <Modal titleId="create-project-title" onClose={onClose}>
      <form className="project-dialog" onSubmit={submit}>
        <span className="dialog-eyebrow">Mehrere Chats organisieren</span>
        <h2 id="create-project-title">Neues Projekt</h2>
        <p>Ein Projekt ist ein Ordner, in dem Sie mehrere zusammengehörige Chats speichern können.</p>
        <label htmlFor="project-name">Projektname</label>
        <input id="project-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus placeholder="z. B. SAP-Rollout 2026" />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <button className="secondary-action" type="button" onClick={onClose} disabled={busy}>Abbrechen</button>
          <button className="primary-action" type="submit" disabled={busy || !name.trim()}>{busy ? "Wird erstellt …" : "Projekt erstellen"}</button>
        </div>
      </form>
    </Modal>
  );
}

export function ManageChatDialog({
  chat,
  collections,
  onClose,
  onMove,
  onDelete,
}: {
  chat: ProjectListItem;
  collections: ProjectCollectionItem[];
  onClose: () => void;
  onMove: (collectionId: string | null) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Aktion fehlgeschlagen.");
      setBusy(false);
    }
  };
  return (
    <Modal titleId="manage-chat-title" onClose={onClose}>
      <div className="project-dialog manage-chat-dialog">
        <span className="dialog-eyebrow">Chat verwalten</span>
        <h2 id="manage-chat-title">{chat.title}</h2>
        <p>Speichern Sie den Chat in einem Projekt oder löschen Sie ihn dauerhaft.</p>
        <div className="project-destination-list">
          <button type="button" className={!chat.collectionId ? "active" : ""} disabled={busy} onClick={() => void run(() => onMove(null))}>Ohne Projekt</button>
          {collections.map((collection) => (
            <button key={collection.id} type="button" className={chat.collectionId === collection.id ? "active" : ""} disabled={busy} onClick={() => void run(() => onMove(collection.id))}>{collection.name}</button>
          ))}
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions split-actions">
          {confirmDelete ? (
            <button className="danger-action" type="button" disabled={busy} onClick={() => void run(onDelete)}>{busy ? "Wird gelöscht …" : "Löschen bestätigen"}</button>
          ) : (
            <button className="danger-text-action" type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>Chat löschen</button>
          )}
          <button className="secondary-action" type="button" onClick={onClose} disabled={busy}>Schließen</button>
        </div>
      </div>
    </Modal>
  );
}

export function ContactDialog({ profile, onClose }: { profile: FreelancerProfileResult; onClose: () => void }) {
  return (
    <Modal titleId="contact-title" onClose={onClose} size="large">
      <div className="contact-dialog">
        <div className="contact-dialog-header">
          <div
            className={`contact-profile-avatar ${profile.avatarUrl ? "has-image" : ""}`}
            style={profile.avatarUrl ? { backgroundImage: `url(${JSON.stringify(profile.avatarUrl)})` } : undefined}
            aria-hidden="true"
          >
            {profile.avatarUrl ? null : initials(profile.displayName)}
          </div>
          <div><span className="dialog-eyebrow">Reales Profil ausgewählt</span><h2 id="contact-title">Termin mit {profile.displayName}</h2><p>{profile.role}</p></div>
        </div>
        <div className="contact-layout">
          <div className="contact-copy">
            <div className="continue-note"><span aria-hidden="true"><IconPlus size={17} /></span><p><strong>Noch etwas ergänzen?</strong>Schließen Sie dieses Fenster und schreiben Sie frei im Chat weiter. Die Terminoption bleibt sichtbar.</p></div>
          </div>
          <div className="calendar-area">
            <div className="calendar-consent">
              <div className="calendar-symbol" aria-hidden="true"><span><IconCalendar size={26} /></span><small>BOOKING</small></div>
              <h3>{profile.bookingUrl ? "Direkt Termin wählen" : "Aktuell nicht buchbar"}</h3>
              <p>{profile.bookingUrl ? `Die Buchungsseite von ${profile.displayName} wird erst nach Ihrem Klick in einem neuen Tab geöffnet.` : "Der frühere Treffer bleibt zur Nachvollziehbarkeit sichtbar, aber es ist kein aktueller Booking-Link freigegeben."}</p>
              {profile.bookingUrl ? (
                <a
                  className="booking-link-action"
                  href={appPath(`/api/freelancers/${profile.id}/book`)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Meeting buchen <IconArrowRight size={13} />
                </a>
              ) : (
                <span className="booking-unavailable">Aktuell kein direkter Booking-Link</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Muss zum Wert passen, den `app/api/account/delete/route.ts` erwartet. */
export const GUEST_DELETE_PHRASE = "LÖSCHEN";

export function ConfirmDeleteDialog({
  busy,
  accountEmail,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  accountEmail: string | null;
  onClose: () => void;
  onConfirm: (confirmation: string) => void;
}) {
  const expected = accountEmail?.trim() || GUEST_DELETE_PHRASE;
  const [typed, setTyped] = useState("");
  // Die eigentliche Prüfung macht der Server. Hier geht es nur darum, dass ein
  // unumkehrbarer Schritt einen bewussten Moment kostet.
  const matches =
    typed.trim().toLocaleLowerCase("en-US") ===
    expected.toLocaleLowerCase("en-US");

  return (
    <Modal titleId="delete-title" onClose={onClose}>
      <div className="delete-dialog">
        <span className="danger-symbol" aria-hidden="true"><IconAlertTriangle size={19} /></span>
        <h2 id="delete-title">Anwendungsdaten löschen?</h2>
        <p>Ihre Projekte, Nachrichten und gespeicherten Ergebnisse werden entsprechend der geltenden Aufbewahrungsregeln gelöscht oder anonymisiert. Dieser Schritt kann nicht rückgängig gemacht werden.</p>
        <label className="delete-confirm">
          <span>
            {accountEmail
              ? "Tippen Sie zur Bestätigung Ihre E-Mail-Adresse ein"
              : `Tippen Sie zur Bestätigung ${GUEST_DELETE_PHRASE} ein`}
          </span>
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={expected}
            disabled={busy}
          />
        </label>
        <div className="dialog-actions">
          <button className="secondary-action" type="button" onClick={onClose} disabled={busy}>Abbrechen</button>
          <button
            className="danger-action"
            type="button"
            onClick={() => onConfirm(typed.trim())}
            disabled={busy || !matches}
          >
            {busy ? "Wird gelöscht …" : "Daten endgültig löschen"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
