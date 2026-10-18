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

// Was eine öffentliche Seite beim ersten Aufruf lädt: die Stylesheets und
// Skripte aus ihrem vorgerenderten HTML (ohne `noModule`, das moderne Browser
// überspringen). Fehlt das HTML, ist die Seite nicht mehr statisch und kommt
// nicht mehr fertig aus dem CDN — auch das soll auffallen (18.10.2026).
const staticDirectory = path.join(repositoryRoot, ".next");
async function firstLoad(page) {
  const html = await readFile(path.join(repositoryRoot, ".next", "server", "app", `${page}.html`), "utf8").catch(() => null);
  if (html === null) return null;
  const hrefs = (pattern, attribute) => [...new Set(
    [...html.matchAll(pattern)].map((match) => match[0]).filter((tag) => !/nomodule/iu.test(tag)).map((tag) => tag.match(attribute)?.[1]).filter(Boolean),
  )];
  const files = (list) => list.map((href) => path.join(staticDirectory, href.replace(/^.*?\/_next\//u, "")));
  return {
    css: await gzipMetrics(files(hrefs(/<link\b[^>]*\brel="stylesheet"[^>]*>/gu, /href="([^"]+\.css)"/u))),
    javascript: await gzipMetrics(files(hrefs(/<script\b[^>]*\bsrc="[^"]+\.js"[^>]*>/gu, /src="([^"]+\.js)"/u))),
  };
}
const pageChecks = [];
for (const page of budget.publicPages ?? []) {
  const loaded = await firstLoad(page);
  if (!loaded) {
    pageChecks.push([`Seite /${page === "index" ? "" : page}: nicht statisch vorgerendert`, 1, 0]);
    continue;
  }
  const name = `/${page === "index" ? "" : page}`;
  pageChecks.push([`Seite ${name}: CSS beim ersten Aufruf (gzip)`, loaded.css.total, budget.publicPageCssGzipBytes]);
  pageChecks.push([`Seite ${name}: JavaScript beim ersten Aufruf (gzip)`, loaded.javascript.total, budget.publicPageJavaScriptGzipBytes]);
}

const checks = [
  ...pageChecks,
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
