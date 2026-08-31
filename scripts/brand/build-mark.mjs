/**
 * Leitet die Marken-Dateien aus dem Original ab.
 *
 * Die Vorlage `public/brand/xportal-mark.jpg` ist ein 400x400-JPEG mit der
 * Marke in der Mitte und viel Weiss darum. Ein JPEG kennt keine Transparenz,
 * deshalb saesse die Marke in der Seitenleiste sonst in einem weissen Kasten
 * auf hellgrauem Grund. Dieses Skript schneidet sie frei, ersetzt das Weiss
 * durch Transparenz und legt daneben die beiden Icon-Dateien an, die Next.js
 * als statische Metadaten erwartet.
 *
 * Erneut ausfuehren, wenn das Original getauscht wird:
 *   node scripts/brand/build-mark.mjs
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// sharp steht nicht in package.json, sondern kommt als Abhaengigkeit von Next
// mit. Unter pnpm liegt es deshalb nicht im obersten node_modules und ist unter
// seinem blossen Namen nicht auffindbar — der Umweg ueber Next findet es.
const sharp = createRequire(require.resolve("next/package.json"))("sharp");

const SOURCE = path.join(repoRoot, "public/brand/xportal-mark.jpg");
/** Der Grund der Icon-Kacheln — derselbe Ton wie bisher in den Icon-Routen. */
const ICON_BACKGROUND = { r: 9, g: 9, b: 9, alpha: 1 };
/** Der gemessene Ton der Marke im Original. */
const INK = [28, 29, 31];
/** Auf der dunklen Kachel braucht die Marke den hellen Ton, sonst verschwindet sie. */
const PAPER = [241, 241, 236];
/** Ab diesem Grauwert gilt ein Pixel als Hintergrund und wird durchsichtig. */
const WHITE_POINT = 246;

/**
 * Liest die Vorlage und gewinnt daraus eine Deckkraft-Maske samt Zuschnitt.
 *
 * Die Deckkraft entsteht aus der Helligkeit, nicht aus einem harten
 * Schwellwert: die Kanten der Vorlage sind weichgezeichnet, und ein harter
 * Schnitt liesse sie bei 26 px ausgefranst aussehen.
 */
async function readMask() {
  const { data, info } = await sharp(SOURCE).greyscale().raw().toBuffer({ resolveWithObject: true });

  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;

  const alpha = Buffer.alloc(info.width * info.height);
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = y * info.width + x;
      const opacity = Math.max(0, Math.min(255, Math.round(((WHITE_POINT - data[index]) / WHITE_POINT) * 255)));
      alpha[index] = opacity;
      if (opacity > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  return { alpha, width: info.width, height: info.height, box: { left, top, width: right - left + 1, height: bottom - top + 1 } };
}

/**
 * Faerbt die Maske in einem einheitlichen Ton ein und schneidet sie zu.
 *
 * Die Farbe kommt bewusst nicht aus der Vorlage: die JPEG-Kompression hat um
 * die Marke einen leichten Schleier hinterlassen, der als Farbrauschen sichtbar
 * bliebe. Die Form steckt vollstaendig in der Deckkraft.
 */
function tint(mask, [r, g, b]) {
  const rgba = Buffer.alloc(mask.width * mask.height * 4);
  for (let i = 0; i < mask.width * mask.height; i += 1) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = mask.alpha[i];
  }
  return sharp(rgba, { raw: { width: mask.width, height: mask.height, channels: 4 } })
    .extract(mask.box)
    .png();
}

/** Legt die Marke mittig auf eine quadratische Kachel mit dunklem Grund. */
async function iconTile(mark, size, inset) {
  const box = Math.round(size * inset);
  const scaled = await sharp(mark).resize({ width: box, height: box, fit: "inside" }).toBuffer();

  return sharp({ create: { width: size, height: size, channels: 4, background: ICON_BACKGROUND } })
    .composite([{ input: scaled, gravity: "centre" }])
    .png()
    .toBuffer();
}

const mask = await readMask();
console.log(`Marke freigestellt: ${mask.box.width}x${mask.box.height} bei ${mask.box.left},${mask.box.top}`);

// Die Seitenleiste zeigt die Marke rund 26 px hoch. Das Dreifache davon bleibt
// auch auf einem hochaufloesenden Bildschirm scharf.
await tint(mask, INK)
  .resize({ height: 78 })
  .toFile(path.join(repoRoot, "public/brand/xportal-mark.png"));

const light = await tint(mask, PAPER).toBuffer();
await sharp(await iconTile(light, 64, 0.68)).toFile(path.join(repoRoot, "app/icon.png"));
await sharp(await iconTile(light, 180, 0.64)).toFile(path.join(repoRoot, "app/apple-icon.png"));

console.log("Geschrieben: public/brand/xportal-mark.png, app/icon.png, app/apple-icon.png");
