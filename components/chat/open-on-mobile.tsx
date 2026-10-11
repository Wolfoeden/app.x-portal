"use client";

/** Blendet den Desktop-Hinweis aus (desktop-only.module.css) und zeigt den Chat. */
export function OpenOnMobileButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        document.documentElement.dataset.chatOnMobile = "true";
      }}
    >
      Trotzdem hier öffnen
    </button>
  );
}
