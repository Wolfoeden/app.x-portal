import type { ReactNode } from "react";

/**
 * Interface icons.
 *
 * These replace the Unicode glyphs the chat UI used to render (＋ ✦ ⌁ ⌕ ▥ ▿ ○
 * and friends). Several of those code points have poor font coverage: the
 * fullwidth plus fell back to a CJK face, and ⌁/⌕/▥/▿ fell back to a symbol
 * font with a different stroke weight and baseline, so icons never matched the
 * text around them and could render as tofu on some Android devices.
 *
 * Every icon draws on a 24x24 grid with a 1.75 stroke, inherits `currentColor`
 * and is decorative: the surrounding button carries the accessible name.
 */

type IconProps = {
  /** Rendered box in px. Defaults to 16, which sits well against 13-15px text. */
  size?: number;
  className?: string;
};

function Glyph({ size = 16, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 5v14M5 12h14" />
    </Glyph>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Glyph>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Glyph>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M4.5 12.5l5 5L19.5 7" />
    </Glyph>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M6 9.5l6 6 6-6" />
    </Glyph>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M9.5 6l6 6-6 6" />
    </Glyph>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M14.5 6l-6 6 6 6" />
    </Glyph>
  );
}

/** Vier Ecken, die nach aussen zeigen: die Ansicht macht sich breit. */
export function IconMaximize(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5" />
    </Glyph>
  );
}

/** Dieselben Ecken nach innen: die Ansicht gibt den Platz wieder her. */
export function IconMinimize(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 9h5V4M20 9h-5V4M20 15h-5v5M4 15h5v5" />
    </Glyph>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </Glyph>
  );
}

export function IconArrowUp(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 19.5V5M6 11l6-6 6 6" />
    </Glyph>
  );
}

export function IconArrowUpRight(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M7 17L17 7M8.5 7H17v8.5" />
    </Glyph>
  );
}

/** Assistant mark. Used for the welcome emblem, avatars and the trace header. */
export function IconSpark(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 3.5c.6 3.9 1.6 4.9 5.5 5.5-3.9.6-4.9 1.6-5.5 5.5-.6-3.9-1.6-4.9-5.5-5.5 3.9-.6 4.9-1.6 5.5-5.5Z" />
      <path d="M17.5 15.5c.3 1.9.8 2.4 2.7 2.7-1.9.3-2.4.8-2.7 2.7-.3-1.9-.8-2.4-2.7-2.7 1.9-.3 2.4-.8 2.7-2.7Z" />
    </Glyph>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M15.8 15.8L20 20" />
    </Glyph>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11.5v5M12 7.75h.01" />
    </Glyph>
  );
}

export function IconAlertCircle(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5M12 16.5h.01" />
    </Glyph>
  );
}

export function IconAlertTriangle(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 4.5L21 19.5H3L12 4.5Z" />
      <path d="M12 10v4M12 17h.01" />
    </Glyph>
  );
}

/** Toggles the project overview panel. */
export function IconPanelRight(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M14.5 4.5v15" />
    </Glyph>
  );
}


export function IconChat(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M20.5 11.5a8 8 0 0 1-11.6 7.2L4 20l1.3-4.4A8 8 0 1 1 20.5 11.5Z" />
    </Glyph>
  );
}

/** Empty project overview: nothing extracted from the conversation yet. */
export function IconDocument(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M13.5 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V8L13.5 3Z" />
      <path d="M13.5 3v5h5M9 13h6M9 16.5h4" />
    </Glyph>
  );
}

/** "No questionnaire" — write freely instead of filling in fields. */
export function IconPen(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 20l4.5-1.2 9.8-9.8a2 2 0 0 0 0-2.8l-.5-.5a2 2 0 0 0-2.8 0L5.2 15.5 4 20Z" />
      <path d="M14.5 6.5l3 3" />
    </Glyph>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-11Z" />
    </Glyph>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </Glyph>
  );
}
