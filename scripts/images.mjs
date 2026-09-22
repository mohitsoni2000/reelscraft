#!/usr/bin/env node
/**
 * Image pipeline: assets-src/images -> public/img (+ manifest, css, og, icons).
 *
 *   node scripts/images.mjs            build (skips everything that is up to date)
 *   node scripts/images.mjs --force    ignore caches and re-encode everything
 *
 * - Idempotent and content-hash cached: output file names embed a hash of
 *   source bytes + config + encoder versions, so "all planned files exist"
 *   is the cache check. Fixed-name outputs (og, icons) use a stamp file.
 * - Strips ALL metadata (sharp drops it unless withMetadata()/keepMetadata()
 *   is called, which this script never does) and then asserts on the bytes
 *   that no output carries C2PA / JUMBF content credentials.
 * - Writes: public/img/*, public/og/og.jpg, public/apple-touch-icon.png,
 *   public/favicon.ico, lib/generated/images.ts, app/generated-images.css.
 *
 * Requires Node >= 20.9 and sharp (devDependency).
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import * as config from "./images.config.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = {
  src: path.join(ROOT, "assets-src", "images"),
  out: path.join(ROOT, "public", "img"),
  og: path.join(ROOT, "public", "og", "og.jpg"),
  appleTouch: path.join(ROOT, "public", "apple-touch-icon.png"),
  favicon: path.join(ROOT, "public", "favicon.ico"),
  iconSvg: path.join(ROOT, config.icons.svg),
  manifest: path.join(ROOT, "lib", "generated", "images.ts"),
  css: path.join(ROOT, "app", "generated-images.css"),
  stamp: path.join(ROOT, "lib", "generated", ".images-cache.json"),
};

const FORCE = process.argv.includes("--force");
const URL_PREFIX = "/img/";
const EXT = { avif: "avif", webp: "webp", jpeg: "jpg", png: "png" };
const FALLBACK_FORMATS = ["jpeg", "png"];
/** Byte markers of embedded content credentials (matched case-insensitively, like the repo-wide grep check). */
const FORBIDDEN = ["c2pa", "jumb", "cabx", "claude provided"];
const GENERATED_NAME = /^[a-z0-9][a-z0-9-]*\.[0-9a-f]{8}\.(avif|webp|jpg|png)(\.tmp-\d+)?$/i;

// --------------------------------------------------------------------------
// small helpers
// --------------------------------------------------------------------------

const sha = (...parts) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest("hex");
};

/** JSON.stringify with sorted keys so config key order never changes a hash. */
const stable = (v) =>
  JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : val,
  );

const fileSize = async (file) => {
  try {
    return (await stat(file)).size;
  } catch {
    return null;
  }
};

async function writeAtomic(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

/** Write text only when it changed, so no-op runs never touch mtimes (no needless Next rebuilds). */
async function writeTextIfChanged(file, text) {
  let prev = null;
  try {
    prev = await readFile(file, "utf8");
  } catch {}
  if (prev === text) return false;
  await writeAtomic(file, text);
  return true;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}

/** Fail loudly when content-credential markers are present in an output. */
function assertClean(buf, label) {
  const hay = buf.toString("latin1").toLowerCase();
  for (const needle of FORBIDDEN) {
    if (hay.includes(needle)) {
      throw new Error(`content-credential marker "${needle}" found in ${label}; refusing to ship it`);
    }
  }
}

const isClean = (buf) => {
  try {
    assertClean(buf, "");
    return true;
  } catch {
    return false;
  }
};

/**
 * Encode via `encode(quality)` and assert the result is clean. A marker that
 * shows up in freshly *entropy-coded* data is a random 1-in-2^30 coincidence,
 * not metadata (sharp never emits any), so retry with a neighbouring quality
 * before failing. Real credentials would survive the retries and fail loudly.
 */
async function encodeClean(encode, quality, label) {
  const tries = quality === undefined ? [undefined] : [quality, quality - 1, quality + 1];
  let last;
  for (const q of tries) {
    last = await encode(q);
    if (isClean(last)) return last;
  }
  assertClean(last, label); // throws with the offending marker
  return last;
}

const kb = (n) => (n / 1024).toFixed(1);
const mb = (n) => (n / 1024 / 1024).toFixed(2);

const versions = () => {
  const v = sharp.versions;
  return { sharp: v.sharp, vips: v.vips, heif: v.heif, aom: v.aom, webp: v.webp, mozjpeg: v.mozjpeg, png: v.png, rsvg: v.rsvg };
};

const camel = (id) => id.replace(/-([a-z0-9])/g, (_m, c) => c.toUpperCase());

// --------------------------------------------------------------------------
// config validation
// --------------------------------------------------------------------------

function validateConfig() {
  const seen = new Set();
  for (const e of config.images) {
    const where = `images.config.mjs: "${e.id}"`;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(e.id)) throw new Error(`${where}: id must be lowercase [a-z0-9-]`);
    if (seen.has(e.id)) throw new Error(`${where}: duplicate id`);
    seen.add(e.id);
    if (!["photo", "alpha", "lossless"].includes(e.kind)) throw new Error(`${where}: bad kind "${e.kind}"`);
    if (!Array.isArray(e.widths) || !e.widths.length) throw new Error(`${where}: widths required`);
    const fallbacks = e.formats.filter((f) => FALLBACK_FORMATS.includes(f));
    if (e.single) {
      if (e.formats.length !== 1 || fallbacks.length || e.widths.length !== 1) {
        throw new Error(`${where}: single assets need exactly one width and one non-fallback format`);
      }
    } else if (fallbacks.length !== 1) {
      throw new Error(`${where}: formats must include exactly one fallback (jpeg or png)`);
    }
    for (const f of e.formats) {
      if (!EXT[f]) throw new Error(`${where}: unknown format "${f}"`);
      if (!config.encoders[f]?.[e.kind]) throw new Error(`${where}: no encoder settings for ${f}/${e.kind}`);
      if (e.kind !== "lossless" && typeof e.quality?.[f] !== "number") throw new Error(`${where}: quality.${f} required`);
    }
  }
}

// --------------------------------------------------------------------------
// per-image planning + encoding
// --------------------------------------------------------------------------

/** Intrinsic size after EXIF auto-orientation. */
function intrinsicSize(meta) {
  const { width, height } = meta.autoOrient ?? meta;
  return { width, height };
}

function encoderFor(entry, format, quality) {
  const base = { ...config.encoders[format][entry.kind], ...(entry.options?.[format] ?? {}) };
  if (entry.kind !== "lossless" && quality !== undefined) base.quality = quality;
  return base;
}

/** Build the list of output files for one image (no IO). */
function plan(entry, intrinsic, hash8) {
  const widths = [...new Set(entry.widths.map((w) => Math.min(w, intrinsic.width)))].sort((a, b) => a - b);
  const heightOf = (w) => (w === intrinsic.width ? intrinsic.height : Math.round((w * intrinsic.height) / intrinsic.width));
  const files = [];
  const rung = (format, w, role, name) =>
    files.push({ format, width: w, height: heightOf(w), role, name, rel: URL_PREFIX + name });

  if (entry.single) {
    const [w] = widths;
    rung(entry.formats[0], w, "single", `${entry.id}.${hash8}.${EXT[entry.formats[0]]}`);
    return { widths, files, fallbackWidth: w };
  }
  const fallbackFormat = entry.formats.find((f) => FALLBACK_FORMATS.includes(f));
  const fallbackWidth = widths[Math.floor(widths.length / 2)]; // middle rung (upper-middle for even counts)
  for (const w of widths) {
    for (const f of entry.formats) {
      if (f === "avif" || f === "webp") rung(f, w, "variant", `${entry.id}-${w}.${hash8}.${EXT[f]}`);
    }
  }
  rung(fallbackFormat, fallbackWidth, "fallback", `${entry.id}.${hash8}.${EXT[fallbackFormat]}`);
  return { widths, files, fallbackWidth };
}

async function processImage(entry) {
  const srcFile = path.join(P.src, entry.source);
  const srcBuf = await readFile(srcFile);
  const meta = await sharp(srcBuf).metadata();
  const intrinsic = intrinsicSize(meta);

  if (entry.kind !== "alpha" && meta.hasAlpha) {
    // A "photo" that is really transparent must not silently lose its alpha.
    const stats = await sharp(srcBuf).stats();
    const a = stats.channels[stats.channels.length - 1];
    if (a.min !== 255) throw new Error(`${entry.id}: kind "${entry.kind}" but ${entry.source} has transparent pixels; use kind "alpha"`);
  }

  // `display` (report hint) and `budget` do not influence the encoded bytes, so they stay out of the hash.
  const hashable = { ...entry };
  delete hashable.display;
  delete hashable.budget;
  const clamped = [...new Set(entry.widths.map((w) => Math.min(w, intrinsic.width)))].sort((a, b) => a - b);
  const hash8 = sha(
    srcBuf,
    stable({
      pipeline: config.PIPELINE_VERSION,
      versions: versions(),
      entry: { ...hashable, widths: clamped },
      encoders: Object.fromEntries(entry.formats.map((f) => [f, config.encoders[f][entry.kind]])),
    }),
  ).slice(0, 8);

  const { widths, files, fallbackWidth } = plan(entry, intrinsic, hash8);
  const limit = entry.budget ?? config.DEFAULT_BUDGET;

  // Cache check: every planned file present, non-empty, and the fallback has the planned size.
  let cached = !FORCE;
  if (cached) {
    for (const f of files) {
      const size = await fileSize(path.join(P.out, f.name));
      if (!size) {
        cached = false;
        break;
      }
      f.bytes = size;
    }
  }
  if (cached) {
    const fb = files.find((f) => f.role !== "variant");
    const m = await sharp(path.join(P.out, fb.name)).metadata();
    if (m.width !== fb.width || m.height !== fb.height) cached = false;
  }

  if (!cached) {
    const keepAlpha = entry.kind === "alpha";
    for (const w of widths) {
      const todo = files.filter((f) => f.width === w);
      const h = todo[0].height;
      let pipe = sharp(srcBuf).autoOrient();
      if (!keepAlpha) pipe = pipe.removeAlpha();
      if (w !== intrinsic.width || h !== intrinsic.height) {
        pipe = pipe.resize({ width: w, height: h, fit: "fill", kernel: entry.kernel ?? "lanczos3", withoutEnlargement: true });
      }
      // Decode + resize once, encode every format from identical pixels.
      const { data, info } = await pipe.toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
      if (info.width !== w || info.height !== h) throw new Error(`${entry.id}@${w}: expected ${w}x${h}, got ${info.width}x${info.height}`);
      const raw = { raw: { width: info.width, height: info.height, channels: info.channels } };
      for (const f of todo) {
        const label = `${entry.id} ${f.name}`;
        const encode = (q) => sharp(data, raw)[f.format](encoderFor(entry, f.format, q)).toBuffer();
        const buf = await encodeClean(encode, entry.kind === "lossless" ? undefined : entry.quality[f.format], label);
        f.bytes = buf.length;
        await writeAtomic(path.join(P.out, f.name), buf);
      }
    }
  }

  // Verify what is actually on disk (fresh or cached) and enforce budgets.
  for (const f of files) {
    const buf = await readFile(path.join(P.out, f.name));
    assertClean(buf, f.name);
    f.bytes = buf.length;
    if (f.bytes > limit) throw new Error(`${f.name} is ${kb(f.bytes)} KB, over its ${kb(limit)} KB budget`);
  }

  return { entry, hash8, intrinsic, srcBytes: srcBuf.length, widths, files, fallbackWidth, generated: !cached };
}

// --------------------------------------------------------------------------
// manifest + css
// --------------------------------------------------------------------------

function renderManifest(results) {
  const multi = results.filter((r) => !r.entry.single);
  const singles = results.filter((r) => r.entry.single);
  const srcset = (r, format) => {
    const parts = r.files.filter((f) => f.role === "variant" && f.format === format).map((f) => `${f.rel} ${f.width}w`);
    return parts.length ? parts.join(", ") : null;
  };
  const out = [];
  out.push("// GENERATED by scripts/images.mjs from assets-src/images. Do not edit.");
  out.push("// Regenerate with `npm run images`.");
  out.push("");
  out.push("export type ImageId =");
  out.push(multi.map((r) => `  | ${JSON.stringify(r.entry.id)}`).join("\n") + ";");
  out.push("");
  out.push("export interface ImageAsset {");
  out.push("  /** Intrinsic width in px of the fallback file `src`. */");
  out.push("  width: number;");
  out.push("  /** Intrinsic height in px of the fallback file `src`. */");
  out.push("  height: number;");
  out.push("  /** Fallback URL (jpeg or png, middle rung). */");
  out.push("  src: string;");
  out.push("  /** Complete `srcset` string, e.g. \"/img/x-480.ab12cd34.avif 480w, ...\". */");
  out.push("  avif?: string;");
  out.push("  webp?: string;");
  out.push("}");
  out.push("");
  out.push("export const images: Record<ImageId, ImageAsset> = {");
  for (const r of multi) {
    const fb = r.files.find((f) => f.role === "fallback");
    out.push(`  ${JSON.stringify(r.entry.id)}: {`);
    out.push(`    width: ${fb.width},`);
    out.push(`    height: ${fb.height},`);
    out.push(`    src: ${JSON.stringify(fb.rel)},`);
    for (const format of ["avif", "webp"]) {
      const s = srcset(r, format);
      if (s) out.push(`    ${format}: ${JSON.stringify(s)},`);
    }
    out.push("  },");
  }
  out.push("};");
  for (const r of singles) {
    out.push("");
    out.push(`/** Single-file asset for CSS backgrounds (see --img-${r.entry.id} in app/generated-images.css). */`);
    out.push(`export const ${camel(r.entry.id)}Url: string = ${JSON.stringify(r.files[0].rel)};`);
  }
  out.push("");
  return out.join("\n");
}

function renderCss(results) {
  // One custom property per single-file (CSS background) image: --img-<id>.
  const singles = results.filter((r) => r.entry.single);
  if (!singles.some((r) => r.entry.id === "pattern")) throw new Error('images.config.mjs must define the "pattern" image');
  const vars = singles.map((r) => `  --img-${r.entry.id}: url(${r.files[0].rel});`).join("\n");
  return `:root {\n${vars}\n}\n`;
}

// --------------------------------------------------------------------------
// og image, apple-touch-icon, favicon
// --------------------------------------------------------------------------

function icoFromPng(png, size) {
  // ICONDIR (6 bytes) + one ICONDIRENTRY (16 bytes) + PNG payload.
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count
  header.writeUInt8(size >= 256 ? 0 : size, 6); // width
  header.writeUInt8(size >= 256 ? 0 : size, 7); // height
  header.writeUInt8(0, 8); // palette colours
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14); // payload size
  header.writeUInt32LE(22, 18); // payload offset
  return Buffer.concat([header, png]);
}

async function rasteriseIcon(svg, size, hasBackground) {
  const meta = await sharp(svg).metadata();
  let pipe = sharp(svg, { density: (72 * size) / meta.width }).resize(size, size, { fit: "fill" });
  pipe = hasBackground ? pipe.flatten({ background: hasBackground }) : pipe.ensureAlpha();
  return pipe.png({ compressionLevel: 9 }).toBuffer();
}

async function buildAux(stamp) {
  const rows = [];
  const next = { ...stamp };
  const versionStr = stable({ pipeline: config.PIPELINE_VERSION, versions: versions() });

  // og.jpg
  {
    const cfg = config.og;
    const srcBuf = await readFile(path.join(P.src, cfg.source));
    const key = sha(srcBuf, stable(cfg), versionStr);
    if (FORCE || stamp.og !== key || !(await fileSize(P.og))) {
      const size = intrinsicSize(await sharp(srcBuf).metadata());
      const scaledH = Math.max(cfg.height, Math.round((cfg.width * size.height) / size.width));
      const top = Math.round((scaledH - cfg.height) * cfg.focusY);
      const { data, info } = await sharp(srcBuf)
        .autoOrient()
        .removeAlpha()
        .resize({ width: cfg.width, height: scaledH, fit: "fill", kernel: "lanczos3" })
        .extract({ left: 0, top, width: cfg.width, height: cfg.height })
        .toColourspace("srgb")
        .raw()
        .toBuffer({ resolveWithObject: true });
      const raw = { raw: { width: info.width, height: info.height, channels: info.channels } };
      let buf;
      for (let q = cfg.quality; q >= 40; q -= 4) {
        buf = await encodeClean((qq) => sharp(data, raw).jpeg({ quality: qq, mozjpeg: true }).toBuffer(), q, "og.jpg");
        if (buf.length <= cfg.budget) break;
      }
      if (buf.length > cfg.budget) throw new Error(`og.jpg is ${kb(buf.length)} KB, over its ${kb(cfg.budget)} KB budget`);
      await writeAtomic(P.og, buf);
    }
    next.og = key;
  }

  // apple-touch-icon.png + favicon.ico
  const svg = await readFile(P.iconSvg);
  {
    const cfg = config.icons.appleTouch;
    const key = sha(svg, stable(cfg), versionStr);
    if (FORCE || stamp.appleTouch !== key || !(await fileSize(P.appleTouch))) {
      const buf = await rasteriseIcon(svg, cfg.size, cfg.background);
      assertClean(buf, "apple-touch-icon.png");
      await writeAtomic(P.appleTouch, buf);
    }
    next.appleTouch = key;
  }
  {
    const cfg = config.icons.favicon;
    const key = sha(svg, stable(cfg), versionStr, "ico-v1");
    if (FORCE || stamp.favicon !== key || !(await fileSize(P.favicon))) {
      const ico = icoFromPng(await rasteriseIcon(svg, cfg.size, null), cfg.size);
      assertClean(ico, "favicon.ico");
      await writeAtomic(P.favicon, ico);
    }
    next.favicon = key;
  }

  for (const [label, file] of [["og/og.jpg", P.og], ["apple-touch-icon.png", P.appleTouch], ["favicon.ico", P.favicon]]) {
    const buf = await readFile(file);
    assertClean(buf, label);
    rows.push({ label, bytes: buf.length });
  }
  return { rows, stamp: next };
}

// --------------------------------------------------------------------------
// stale output removal
// --------------------------------------------------------------------------

async function removeStale(results) {
  const expected = new Set(results.flatMap((r) => r.files.map((f) => f.name)));
  let removed = 0;
  const unknown = [];
  let entries = [];
  try {
    entries = await readdir(P.out);
  } catch {}
  for (const name of entries) {
    if (expected.has(name)) continue;
    if (GENERATED_NAME.test(name)) {
      await rm(path.join(P.out, name), { force: true });
      removed++;
    } else {
      unknown.push(name);
    }
  }
  return { removed, unknown };
}

// --------------------------------------------------------------------------
// report
// --------------------------------------------------------------------------

/** Smallest rung that covers `needed` px, else the largest. */
const pickRung = (rungs, needed) => rungs.find((r) => r.width >= needed) ?? rungs[rungs.length - 1];

function visitorBytes(results, format, dpr) {
  const urls = new Map();
  for (const r of results) {
    if (r.entry.single) {
      urls.set(r.files[0].name, r.files[0].bytes);
      continue;
    }
    const rungs = r.files.filter((f) => f.role === "variant" && f.format === format);
    const usable = rungs.length ? rungs : [r.files.find((f) => f.role === "fallback")];
    for (const cssW of r.entry.display ?? []) {
      const f = pickRung(usable, Math.ceil(cssW * dpr));
      urls.set(f.name, f.bytes); // same URL twice = one download
    }
  }
  return [...urls.values()].reduce((a, b) => a + b, 0);
}

function printReport(results, aux, extra, ms) {
  const rows = results.map((r) => {
    const list = (format) => {
      const fs = r.files.filter((f) => (f.role === "single" ? true : f.role === "variant") && f.format === format);
      return fs.length ? fs.map((f) => kb(f.bytes)).join("/") : "-";
    };
    const fb = r.files.find((f) => f.role === "fallback");
    return {
      id: r.entry.id,
      src: `${r.intrinsic.width}x${r.intrinsic.height}`,
      srcKb: kb(r.srcBytes),
      widths: r.widths.join("/"),
      avif: list("avif"),
      webp: list("webp"),
      fb: fb ? `${fb.format === "jpeg" ? "jpg" : fb.format}@${fb.width} ${kb(fb.bytes)}` : "-",
      total: kb(r.files.reduce((a, f) => a + f.bytes, 0)),
    };
  });
  const cols = [
    ["id", "id"],
    ["src", "source"],
    ["srcKb", "src KB"],
    ["widths", "ladder (px)"],
    ["avif", "avif KB per rung"],
    ["webp", "webp KB per rung"],
    ["fb", "fallback KB"],
    ["total", "all KB"],
  ];
  const w = cols.map(([k, h]) => Math.max(h.length, ...rows.map((r) => String(r[k]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join("  ");
  console.log("");
  console.log(line(cols.map(([, h]) => h)));
  console.log(w.map((n) => "-".repeat(n)).join("  "));
  for (const r of rows) console.log(line(cols.map(([k]) => r[k])));

  const allFiles = results.flatMap((r) => r.files);
  const onDisk = allFiles.reduce((a, f) => a + f.bytes, 0);
  const originals = results.reduce((a, r) => a + r.srcBytes, 0);
  const s = (n) => `${kb(n).padStart(8)} KB (${mb(n)} MB)`;
  console.log("");
  console.log(`processed sources     ${s(originals)}  (${results.length} images)`);
  console.log(`all variants on disk  ${s(onDisk)}  (${allFiles.length} files)`);
  console.log(`desktop 1x avif       ${s(visitorBytes(results, "avif", 1))}  single rung per image, avif`);
  console.log(`desktop 2x avif       ${s(visitorBytes(results, "avif", 2))}`);
  console.log(`desktop 1x webp       ${s(visitorBytes(results, "webp", 1))}  single rung per image, webp`);
  console.log(`desktop 2x webp       ${s(visitorBytes(results, "webp", 2))}`);
  console.log(`extras                ${aux.rows.map((r) => `${r.label} ${kb(r.bytes)} KB`).join(", ")}`);
  const generated = results.filter((r) => r.generated).length;
  console.log(
    `\n${generated ? `encoded ${generated} image(s)` : "all images up to date"}, ${results.length - generated} cached` +
      `${extra.removed ? `, removed ${extra.removed} stale file(s)` : ""}` +
      `${extra.manifestChanged ? ", manifest updated" : ""} in ${(ms / 1000).toFixed(2)}s`,
  );
  if (extra.unknown.length) console.warn(`warning: unrecognised files left in public/img: ${extra.unknown.join(", ")}`);
}

// --------------------------------------------------------------------------
// main
// --------------------------------------------------------------------------

async function main() {
  const t0 = performance.now();
  validateConfig();
  sharp.cache(false);
  await mkdir(P.out, { recursive: true });

  let stamp = {};
  try {
    stamp = JSON.parse(await readFile(P.stamp, "utf8"));
  } catch {}

  const concurrency = Math.max(1, Math.min(4, os.availableParallelism?.() ?? os.cpus().length));
  const results = await mapLimit(config.images, concurrency, processImage);

  const { removed, unknown } = await removeStale(results);
  const aux = await buildAux(stamp);

  const manifestChanged = await writeTextIfChanged(P.manifest, renderManifest(results));
  const cssChanged = await writeTextIfChanged(P.css, renderCss(results));
  await writeTextIfChanged(P.stamp, JSON.stringify(aux.stamp, null, 2) + "\n");

  printReport(results, aux, { removed, unknown, manifestChanged: manifestChanged || cssChanged }, performance.now() - t0);
}

main().catch((err) => {
  console.error(`\nimages: FAILED - ${err?.stack ?? err}`);
  process.exit(1);
});
