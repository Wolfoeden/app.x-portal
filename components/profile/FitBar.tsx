/**
 * Die Belegleiste einer Profilkarte: ein Segment je Anforderung, auf einen
 * Blick lesbar. Voll = von XPORTAL geprüft, hell = im Profil angegeben, leer =
 * nicht aufgeführt. Keine Prozentzahl und kein „passt“: Die Leiste zählt
 * Belege, sie bewertet keine Eignung.
 */
export type FitSegment = { label: string; state: "verified" | "stated" | "missing" };

export function fitCaption(segments: readonly FitSegment[], noun: string): string {
  const covered = segments.filter((segment) => segment.state !== "missing").length;
  const verified = segments.filter((segment) => segment.state === "verified").length;
  const head =
    covered === segments.length
      ? `${covered} ${noun} belegt`
      : `${covered} von ${segments.length} ${noun} belegt`;
  return verified ? `${head} · ${verified} geprüft` : head;
}

const STATE_TITLE: Readonly<Record<FitSegment["state"], string>> = {
  verified: "von XPORTAL geprüft",
  stated: "im Profil angegeben",
  missing: "nicht aufgeführt",
};

export function FitBar({ segments, noun }: { segments: readonly FitSegment[]; noun: string }) {
  if (!segments.length) return null;
  const caption = fitCaption(segments, noun);
  return (
    <span className="fit-bar">
      <span className="fit-bar-track" aria-hidden="true">
        {segments.map((segment, index) => (
          <span key={`${segment.label}-${index}`} data-state={segment.state} title={`${segment.label}: ${STATE_TITLE[segment.state]}`} />
        ))}
      </span>
      <span className="fit-bar-caption">{caption}</span>
    </span>
  );
}
