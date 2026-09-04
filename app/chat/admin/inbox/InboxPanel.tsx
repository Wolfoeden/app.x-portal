"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  buildInboxQueue,
  buildIntroductionUpdate,
  inboxItemTimestamp,
  introductionActionLabel,
  INTRODUCTION_STATUS_LABELS,
  isOpenInboxItem,
  primaryIntroductionAction,
  summarizeInbox,
  type AdminInboxDetail,
  type AdminInboxItem,
  type AdminInboxSnapshot,
  type AdminInboxUpdate,
  type ContactInboxItem,
  type IntroductionAction,
  type IntroductionInboxItem,
} from "@/lib/admin/inbox";
import { appPath } from "@/lib/app-path";

import styles from "./inbox.module.css";

type InboxFilter = "open" | "contact" | "introduction" | "archive";

type Props = {
  initialSnapshot: AdminInboxSnapshot;
  previewMode?: boolean;
};

const dateTimeFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

const FILTER_LABELS: Record<InboxFilter, string> = {
  open: "Offen",
  contact: "Kontakte",
  introduction: "Introductions",
  archive: "Archiv",
};

function itemKey(item: AdminInboxItem): string {
  return `${item.kind}:${item.id}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "–";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "–" : dateTimeFormat.format(date);
}

function relativeAge(value: string | null, reference: string): string {
  if (!value) return "–";
  const then = new Date(value).getTime();
  const now = new Date(reference).getTime();
  if (Number.isNaN(then) || Number.isNaN(now)) return "–";
  const minutes = Math.max(0, Math.floor((now - then) / 60_000));
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "vor 1 Tag" : `vor ${days} Tagen`;
}

function searchText(item: AdminInboxItem): string {
  return item.kind === "contact"
    ? [item.fullName, item.email, item.subject, item.message]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("de-DE")
    : [
        item.customerName,
        item.customerEmail,
        item.projectTitle,
        item.freelancerName,
        item.freelancerRole,
        INTRODUCTION_STATUS_LABELS[item.status],
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("de-DE");
}

function matchesFilter(item: AdminInboxItem, filter: InboxFilter): boolean {
  switch (filter) {
    case "open":
      return isOpenInboxItem(item);
    case "contact":
      return item.kind === "contact";
    case "introduction":
      return item.kind === "introduction";
    case "archive":
      return !isOpenInboxItem(item);
  }
}

function statusLabel(item: AdminInboxItem): string {
  if (item.kind === "contact") {
    return item.handledAt ? "Beantwortet" : "Antwort offen";
  }
  return INTRODUCTION_STATUS_LABELS[item.status];
}

function statusClass(item: AdminInboxItem): string {
  if (!isOpenInboxItem(item)) return styles.statusDone;
  if (
    item.kind === "contact" ||
    item.status === "requested" ||
    item.status === "manual_review"
  ) {
    return styles.statusDecision;
  }
  return styles.statusActive;
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || `Fehler ${response.status}.`;
  } catch {
    return `Fehler ${response.status}.`;
  }
}

function applyDetail(
  snapshot: AdminInboxSnapshot,
  detail: AdminInboxDetail,
): AdminInboxSnapshot {
  if (detail.kind === "contact") {
    return {
      ...snapshot,
      contacts: snapshot.contacts.map((item) =>
        item.id === detail.id
          ? {
              ...item,
              email: detail.email,
              message: detail.message,
              source: detail.source,
              detailsLoaded: true,
            }
          : item,
      ),
    };
  }
  return {
    ...snapshot,
    introductions: snapshot.introductions.map((item) =>
      item.id === detail.id
        ? {
            ...item,
            customerName: detail.customerName,
            customerEmail: detail.customerEmail,
            detailsLoaded: true,
          }
        : item,
    ),
  };
}

function applyUpdate(
  snapshot: AdminInboxSnapshot,
  update: AdminInboxUpdate,
): AdminInboxSnapshot {
  if (update.kind === "contact") {
    return {
      ...snapshot,
      contacts: snapshot.contacts.map((item) =>
        item.id === update.id
          ? {
              ...item,
              handledAt: update.handledAt,
              updatedAt: update.updatedAt,
            }
          : item,
      ),
    };
  }
  return {
    ...snapshot,
    introductions: snapshot.introductions.map((item) =>
      item.id === update.id
        ? {
            ...item,
            status: update.status,
            bookingProvider: update.bookingProvider,
            bookingUrl: update.bookingUrl,
            confirmedAt: update.confirmedAt,
            cancelledAt: update.cancelledAt,
            updatedAt: update.updatedAt,
          }
        : item,
    ),
  };
}

function nextBookingDrafts(snapshot: AdminInboxSnapshot): Record<string, string> {
  return Object.fromEntries(
    snapshot.introductions.map((item) => [
      itemKey(item),
      item.bookingUrl ?? item.suggestedBookingUrl ?? "",
    ]),
  );
}

export function InboxPanel({ initialSnapshot, previewMode = false }: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [filter, setFilter] = useState<InboxFilter>("open");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [bookingDrafts, setBookingDrafts] = useState(() =>
    nextBookingDrafts(initialSnapshot),
  );

  const queue = useMemo(() => buildInboxQueue(snapshot), [snapshot]);
  const summary = useMemo(() => summarizeInbox(snapshot), [snapshot]);
  const counts = useMemo(
    () => ({
      open: queue.filter((item) => matchesFilter(item, "open")).length,
      contact: snapshot.contacts.length,
      introduction: snapshot.introductions.length,
      archive: queue.filter((item) => matchesFilter(item, "archive")).length,
    }),
    [queue, snapshot.contacts.length, snapshot.introductions.length],
  );
  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("de-DE");
    return queue.filter(
      (item) =>
        matchesFilter(item, filter) &&
        (!needle || searchText(item).includes(needle)),
    );
  }, [filter, queue, search]);

  function setItemError(item: AdminInboxItem, message: string | null) {
    setErrors((current) => ({ ...current, [itemKey(item)]: message }));
  }

  async function loadDetails(item: AdminInboxItem) {
    const key = itemKey(item);
    setExpanded(key);
    if (item.detailsLoaded || previewMode) return;

    setBusy(`${key}:detail`);
    setItemError(item, null);
    try {
      const response = await fetch(
        appPath(`/api/admin/inbox/${item.kind}/${item.id}`),
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!response.ok) throw new Error(await responseError(response));
      const body = (await response.json()) as { detail: AdminInboxDetail };
      setSnapshot((current) => applyDetail(current, body.detail));
    } catch (error) {
      setItemError(
        item,
        error instanceof Error
          ? error.message
          : "Die Details konnten nicht geladen werden.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function updateContact(
    item: ContactInboxItem,
    action: "mark_handled" | "reopen",
  ) {
    const key = itemKey(item);
    setBusy(`${key}:action`);
    setItemError(item, null);
    setNotice(null);
    try {
      let update: AdminInboxUpdate;
      if (previewMode) {
        await new Promise((resolve) => window.setTimeout(resolve, 180));
        const now = new Date().toISOString();
        update = {
          kind: "contact",
          id: item.id,
          handledAt: action === "mark_handled" ? now : null,
          updatedAt: now,
        };
      } else {
        const response = await fetch(
          appPath(`/api/admin/inbox/contact/${item.id}`),
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              action,
              expectedUpdatedAt: item.updatedAt,
            }),
          },
        );
        if (!response.ok) throw new Error(await responseError(response));
        const body = (await response.json()) as { update: AdminInboxUpdate };
        update = body.update;
      }
      setSnapshot((current) => applyUpdate(current, update));
      setNotice(
        action === "mark_handled"
          ? "Kontaktanfrage als beantwortet ins Archiv verschoben."
          : "Kontaktanfrage wieder in die offene Arbeitsliste gelegt.",
      );
    } catch (error) {
      setItemError(
        item,
        error instanceof Error
          ? error.message
          : "Die Änderung konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function updateIntroduction(
    item: IntroductionInboxItem,
    action: IntroductionAction,
  ) {
    const key = itemKey(item);
    if (
      action === "cancel" &&
      !window.confirm("Diese Introduction wirklich absagen?")
    ) {
      return;
    }

    const bookingUrl = bookingDrafts[key]?.trim();
    if (action === "approve" && !bookingUrl) {
      setExpanded(key);
      setItemError(
        item,
        "Bitte zuerst einen HTTPS-Buchungslink für den Kunden eintragen.",
      );
      return;
    }

    setBusy(`${key}:action`);
    setItemError(item, null);
    setNotice(null);
    try {
      let update: AdminInboxUpdate;
      if (previewMode) {
        await new Promise((resolve) => window.setTimeout(resolve, 180));
        update = buildIntroductionUpdate(
          item,
          action,
          new Date().toISOString(),
          bookingUrl,
        );
      } else {
        const response = await fetch(
          appPath(`/api/admin/inbox/introduction/${item.id}`),
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              action,
              expectedStatus: item.status,
              expectedUpdatedAt: item.updatedAt,
              ...(action === "approve" ? { bookingUrl } : {}),
            }),
          },
        );
        if (!response.ok) throw new Error(await responseError(response));
        const body = (await response.json()) as { update: AdminInboxUpdate };
        update = body.update;
      }
      setSnapshot((current) => applyUpdate(current, update));
      setNotice(`${introductionActionLabel(action)}: Status wurde aktualisiert.`);
    } catch (error) {
      setItemError(
        item,
        error instanceof Error
          ? error.message
          : "Die Änderung konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy(null);
    }
  }

  function resetPreview() {
    setSnapshot(initialSnapshot);
    setFilter("open");
    setSearch("");
    setExpanded(null);
    setBusy(null);
    setErrors({});
    setNotice("Testdaten wurden zurückgesetzt.");
    setBookingDrafts(nextBookingDrafts(initialSnapshot));
  }

  return (
    <main
      className={styles.shell}
      aria-labelledby="inbox-title"
      data-preview-mode={previewMode ? "true" : "false"}
    >
      <div className={styles.inner}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Admin / Arbeitskorb</p>
            <h1 id="inbox-title">Inbox</h1>
            <p>
              Kontaktanfragen und Introductions in einer priorisierten
              Arbeitsliste — mit genau dem nächsten notwendigen Schritt.
            </p>
          </div>
          <Link href="/chat" className={styles.backLink}>
            Zurück zum Chat
          </Link>
        </header>

        {previewMode ? (
          <div className={styles.previewBanner} role="status">
            <div>
              <strong>Lokale Testdaten</strong>
              <span>Nichts wird gespeichert, versendet oder an Supabase übertragen.</span>
            </div>
            <button type="button" onClick={resetPreview}>
              Testdaten zurücksetzen
            </button>
          </div>
        ) : null}

        {snapshot.truncated.contacts || snapshot.truncated.introductions ? (
          <p className={styles.warning}>
            Die Inbox begrenzt aktive und archivierte Vorgänge getrennt.
            Mindestens eine Statusgruppe enthält weitere Einträge; alle Fälle
            bleiben in Supabase erhalten.
          </p>
        ) : null}

        <dl className={styles.workloadLine} aria-label="Arbeitslast">
          <div>
            <dt>Offen</dt>
            <dd>{summary.open}</dd>
          </div>
          <div>
            <dt>Entscheidungen</dt>
            <dd>{summary.decisions}</dd>
          </div>
          <div>
            <dt>Ältester Fall</dt>
            <dd>{relativeAge(summary.oldestOpenAt, snapshot.generatedAt)}</dd>
          </div>
        </dl>

        <div className={styles.toolbar}>
          <nav className={styles.tabs} aria-label="Inbox-Filter">
            {(Object.keys(FILTER_LABELS) as InboxFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                className={`${styles.tab} ${filter === value ? styles.tabActive : ""}`}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {FILTER_LABELS[value]} <b>{counts[value]}</b>
              </button>
            ))}
          </nav>
          <label className={styles.searchField}>
            <span className={styles.srOnly}>Inbox durchsuchen</span>
            <input
              type="search"
              value={search}
              placeholder="Name, Betreff, Projekt oder Freelancer"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>

        <div className={styles.notice} aria-live="polite">
          {notice}
        </div>

        {visible.length ? (
          <section className={styles.queue} aria-label="Vorgänge">
            {visible.map((item) => {
              const key = itemKey(item);
              const isExpanded = expanded === key;
              const isBusy = busy?.startsWith(`${key}:`) ?? false;
              const primaryAction =
                item.kind === "introduction"
                  ? primaryIntroductionAction(item.status)
                  : null;
              const bookingDraft =
                item.kind === "introduction" ? bookingDrafts[key] ?? "" : "";

              return (
                <article
                  key={key}
                  className={styles.item}
                  data-kind={item.kind}
                  data-status={
                    item.kind === "contact"
                      ? item.handledAt
                        ? "handled"
                        : "open"
                      : item.status
                  }
                >
                  <div className={styles.timeRail}>
                    <time dateTime={inboxItemTimestamp(item)}>
                      {relativeAge(
                        inboxItemTimestamp(item),
                        snapshot.generatedAt,
                      )}
                    </time>
                    <span className={styles.railDot} aria-hidden="true" />
                  </div>

                  <div className={styles.itemMain}>
                    <div className={styles.badgeRow}>
                      <span className={styles.kindBadge}>
                        {item.kind === "contact" ? "Kontakt" : "Introduction"}
                      </span>
                      {item.kind === "introduction" ? (
                        <span className={styles.policyBadge}>
                          {item.introPolicy === "manual_approval"
                            ? "Freigabe nötig"
                            : "Direktbuchung"}
                        </span>
                      ) : null}
                    </div>
                    <h2>
                      {item.kind === "contact"
                        ? item.subject
                        : item.projectTitle}
                    </h2>
                    {item.kind === "contact" ? (
                      <p className={styles.contextLine}>
                        {item.fullName}
                        {item.email ? ` · ${item.email}` : ""}
                      </p>
                    ) : (
                      <p className={styles.contextLine}>
                        {item.customerName} <span aria-hidden="true">→</span>{" "}
                        <strong>{item.freelancerName}</strong> · {item.freelancerRole}
                      </p>
                    )}
                    {item.kind === "introduction" &&
                    item.status === "ready_to_book" &&
                    !item.bookingUrl ? (
                      <p className={styles.blocker}>
                        Buchungslink fehlt — der Kunde kann noch nicht selbst buchen.
                      </p>
                    ) : null}
                  </div>

                  <div className={styles.statusCell}>
                    <span className={`${styles.statusBadge} ${statusClass(item)}`}>
                      {statusLabel(item)}
                    </span>
                    <small>Aktualisiert {formatDateTime(item.updatedAt)}</small>
                  </div>

                  <div className={styles.actionRail}>
                    {item.kind === "contact" ? (
                      <button
                        type="button"
                        className={
                          item.handledAt
                            ? styles.secondaryAction
                            : styles.primaryAction
                        }
                        disabled={isBusy}
                        onClick={() =>
                          void updateContact(
                            item,
                            item.handledAt ? "reopen" : "mark_handled",
                          )
                        }
                      >
                        {isBusy
                          ? "Wird geändert …"
                          : item.handledAt
                            ? "Wieder öffnen"
                            : "Als beantwortet markieren"}
                      </button>
                    ) : primaryAction ? (
                      <button
                        type="button"
                        className={styles.primaryAction}
                        disabled={isBusy}
                        onClick={() =>
                          void updateIntroduction(item, primaryAction)
                        }
                      >
                        {isBusy
                          ? "Wird geändert …"
                          : introductionActionLabel(primaryAction)}
                      </button>
                    ) : (
                      <span className={styles.terminalNote}>Kein Schritt offen</span>
                    )}
                    <button
                      type="button"
                      className={styles.detailAction}
                      aria-expanded={isExpanded}
                      onClick={() =>
                        isExpanded ? setExpanded(null) : void loadDetails(item)
                      }
                    >
                      {isExpanded ? "Details schließen" : "Details öffnen"}
                    </button>
                    {item.kind === "introduction" &&
                    isOpenInboxItem(item) &&
                    item.status !== "cancelled" ? (
                      <button
                        type="button"
                        className={styles.cancelAction}
                        disabled={isBusy}
                        onClick={() => void updateIntroduction(item, "cancel")}
                      >
                        Absagen
                      </button>
                    ) : null}
                  </div>

                  {isExpanded ? (
                    <div className={styles.expandedDetail}>
                      {busy === `${key}:detail` ? (
                        <p className={styles.loading}>Details werden geladen …</p>
                      ) : item.kind === "contact" ? (
                        <div className={styles.detailGrid}>
                          <div>
                            <p className={styles.detailLabel}>Nachricht</p>
                            {item.message ? (
                              <p className={styles.messageText}>{item.message}</p>
                            ) : (
                              <p className={styles.muted}>Keine Nachricht geladen.</p>
                            )}
                          </div>
                          <div className={styles.factList}>
                            <div>
                              <span>Absender</span>
                              <strong>{item.fullName}</strong>
                            </div>
                            <div>
                              <span>E-Mail</span>
                              {item.email ? (
                                <a href={`mailto:${item.email}`}>{item.email}</a>
                              ) : (
                                <strong>nicht geladen</strong>
                              )}
                            </div>
                            <div>
                              <span>Eingang</span>
                              <strong>{formatDateTime(item.createdAt)}</strong>
                            </div>
                            <div>
                              <span>Quelle</span>
                              <strong>
                                {item.source === "contact_form"
                                  ? "Kontaktformular"
                                  : "Impressum"}
                              </strong>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.detailGrid}>
                          <div className={styles.factList}>
                            <div>
                              <span>Kunde</span>
                              <strong>{item.customerName}</strong>
                            </div>
                            <div>
                              <span>Kunden-E-Mail</span>
                              {item.customerEmail ? (
                                <a href={`mailto:${item.customerEmail}`}>
                                  {item.customerEmail}
                                </a>
                              ) : (
                                <strong>nicht verfügbar</strong>
                              )}
                            </div>
                            <div>
                              <span>Freelancer</span>
                              <strong>{item.freelancerName}</strong>
                            </div>
                            <div>
                              <span>Angefragt</span>
                              <strong>{formatDateTime(item.requestedAt)}</strong>
                            </div>
                          </div>
                          <div>
                            {item.status === "manual_review" ? (
                              <label className={styles.bookingField}>
                                <span>Buchungslink für die Freigabe</span>
                                <input
                                  type="url"
                                  inputMode="url"
                                  placeholder="https://calendly.com/…"
                                  value={bookingDraft}
                                  onChange={(event) =>
                                    setBookingDrafts((current) => ({
                                      ...current,
                                      [key]: event.target.value,
                                    }))
                                  }
                                />
                                <small>
                                  Der Link wird erst mit „Zur Buchung freigeben“
                                  am Vorgang gespeichert.
                                </small>
                              </label>
                            ) : null}
                            {item.bookingUrl ? (
                              <p className={styles.bookingLink}>
                                <span>Aktueller Buchungslink</span>
                                <a
                                  href={item.bookingUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {item.bookingUrl}
                                </a>
                              </p>
                            ) : null}
                            <div className={styles.ids}>
                              <span>Projekt {item.projectId}</span>
                              <span>Profil {item.freelancerProfileId}</span>
                            </div>
                          </div>
                        </div>
                      )}
                      {errors[key] ? (
                        <p className={styles.rowError} role="alert">
                          {errors[key]}
                        </p>
                      ) : null}
                    </div>
                  ) : errors[key] ? (
                    <p className={styles.inlineError} role="alert">
                      {errors[key]}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </section>
        ) : (
          <div className={styles.empty}>
            <strong>Keine Vorgänge in dieser Ansicht.</strong>
            <span>
              {search
                ? "Suchbegriff ändern oder Filter zurücksetzen."
                : "Sobald ein neuer Vorgang eingeht, erscheint er hier."}
            </span>
          </div>
        )}

        <p className={styles.footNote}>
          Stand {formatDateTime(snapshot.generatedAt)} · offene Arbeit wird nach
          Dringlichkeit und dann nach Alter sortiert.
        </p>
      </div>
    </main>
  );
}
