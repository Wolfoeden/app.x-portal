import Image from "next/image";

/**
 * Die Bildmarke in der Seitenleiste.
 *
 * Die Datei entsteht aus `public/brand/xportal-mark.jpg` und wird von
 * `scripts/brand/build-mark.mjs` freigestellt — im Original steht die Marke auf
 * weissem Grund, der auf der hellgrauen Leiste als Kasten sichtbar waere. Wird
 * die Vorlage getauscht, das Skript erneut laufen lassen.
 *
 * Die Icons fuer Browser-Tab und Startbildschirm entstehen im selben Lauf und
 * liegen als `app/icon.png` und `app/apple-icon.png` — Next liest sie von dort
 * als statische Metadaten, es braucht dafuer keine Komponente.
 */

/** Das Seitenverhaeltnis der freigestellten Marke (133x101). */
const MARK_WIDTH = 133;
const MARK_HEIGHT = 101;

export function BrandMark({ height = 26, className }: { height?: number; className?: string }) {
  return (
    <Image
      className={className}
      src="/brand/xportal-mark.png"
      alt=""
      width={Math.round((height * MARK_WIDTH) / MARK_HEIGHT)}
      height={height}
      // Die Datei ist 6 KB gross und liegt bereits in der Aufloesung vor, die
      // ein hochaufloesender Bildschirm braucht. Der Optimizer lieferte hier
      // eine kleinere Fassung als die Anzeige verlangt und machte die Marke
      // unscharf; ohne ihn wird die Datei unveraendert ausgeliefert.
      unoptimized
      priority
    />
  );
}
