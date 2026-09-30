import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const budget = JSON.parse(
  await readFile(path.join(repositoryRoot, "config", "performance-budget.json"), "utf8"),
);

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

async function gzipMetrics(files) {
  const sizes = await Promise.all(
    files.map(async (file) => gzipSync(await readFile(file)).byteLength),
  );
  return {
    count: sizes.length,
    total: sizes.reduce((sum, size) => sum + size, 0),
    largest: sizes.length ? Math.max(...sizes) : 0,
  };
}

async function rawMetrics(files) {
  const sizes = await Promise.all(files.map(async (file) => (await stat(file)).size));
  return {
    count: sizes.length,
    total: sizes.reduce((sum, size) => sum + size, 0),
    largest: sizes.length ? Math.max(...sizes) : 0,
  };
}

const chunksDirectory = path.join(repositoryRoot, ".next", "static", "chunks");
const chunkFiles = await filesBelow(chunksDirectory).catch(() => {
  throw new Error("Kein Production-Build gefunden. Fuehren Sie zuerst `pnpm build` aus.");
});
const javascript = await gzipMetrics(chunkFiles.filter((file) => file.endsWith(".js")));
const css = await gzipMetrics(chunkFiles.filter((file) => file.endsWith(".css")));
// Videos laden erst, wenn ihr Abschnitt ins Bild kommt (`preload="none"`), und
// gehören deshalb nicht in das Budget des ersten Seitenaufbaus. Sie bekommen
// ein eigenes, damit eine unkomprimierte Datei trotzdem auffällt.
const videosDirectory = path.join(repositoryRoot, "public", "videos");
const publicFiles = await filesBelow(path.join(repositoryRoot, "public"));
const publicAssets = await rawMetrics(publicFiles.filter((file) => !file.startsWith(videosDirectory + path.sep)));
const publicVideos = await rawMetrics(publicFiles.filter((file) => file.startsWith(videosDirectory + path.sep)));

const checks = [
  ["Client-JavaScript gesamt (gzip)", javascript.total, budget.clientJavaScriptGzipTotalBytes],
  ["Groesstes Client-JavaScript (gzip)", javascript.largest, budget.clientJavaScriptGzipLargestBytes],
  ["Client-CSS gesamt (gzip)", css.total, budget.clientCssGzipTotalBytes],
  ["Groesstes Client-CSS (gzip)", css.largest, budget.clientCssGzipLargestBytes],
  ["Public Assets gesamt", publicAssets.total, budget.publicAssetsTotalBytes],
  ["Groesstes Public Asset", publicAssets.largest, budget.publicAssetLargestBytes],
  ["Videos gesamt", publicVideos.total, budget.publicVideoTotalBytes],
  ["Groesstes Video", publicVideos.largest, budget.publicVideoLargestBytes],
];

let failed = false;
for (const [label, actual, limit] of checks) {
  const state = actual <= limit ? "OK" : "ZU GROSS";
  console.log(`${state.padEnd(9)} ${label}: ${actual} / ${limit} Bytes`);
  failed ||= actual > limit;
}

if (failed) process.exitCode = 1;
