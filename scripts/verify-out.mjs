#!/usr/bin/env node
/**
 * verify-out.mjs - release checks for the static export. Zero npm dependencies (Node >= 20).
 *
 *   node scripts/verify-out.mjs                     check ./out (exit 1 on any failure)
 *   node scripts/verify-out.mjs --live https://x.in check a deployed site over HTTP
 *
 * Options
 *   --dir <path>          folder to check (default: out)
 *   --site-url <url>      expected site origin (default: env NEXT_PUBLIC_SITE_URL, else the canonical link)
 *   --allow-localhost     accept localhost / http / example.com URLs (local rehearsal builds only)
 *   --allow-placeholder   accept the reserved "*.invalid" host used by the CI placeholder build
 *   --deploy              also require out/.htaccess (+ per-directory ones); a warning otherwise
 *   --csp-mode <mode>     --live only: expect "enforce" or "report-only" (default: env CSP_MODE, else enforce)
 *   --quiet               only print warnings and failures
 *   -h, --help
 *
 * Exit codes: 0 = no failures (warnings allowed), 1 = at least one failure, 2 = bad usage.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { pathToFileURL } from "node:url";
import {
  CSP_MODES,
  DEFAULT_CSP_MODE,
  DIRECTORY_CACHE_RULES,
  SECURITY_HEADERS,
  cspHeaderName,
  diffCsp,
  resolveCspMode,
} from "../deploy/headers.mjs";

const KB = 1024;
const MB = 1024 * KB;

export const LIMITS = {
  descriptionMin: 70,
  descriptionMax: 170,
  maxImagePreloads: 2,
  maxFontPreloads: 4,
  imgFileMax: 250 * KB,
  imgTotalWarn: 6 * MB,
  imgTotalMax: 8 * MB,
  indexGzipMax: 40 * KB,
  ogWarn: 300 * KB, // WhatsApp/Facebook can skip previews for larger og:image files
};

const REQUIRED_FILES = [
  "index.html",
  "404.html",
  "robots.txt",
  "sitemap.xml",
  "favicon.ico",
  "icon.svg",
  "apple-touch-icon.png",
  "og/og.jpg",
];

const TEXT_EXTENSIONS = new Set([
  ".html", ".htm", ".js", ".mjs", ".css", ".txt", ".xml", ".json", ".svg", ".map", ".webmanifest", ".md",
]);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

class Report {
  constructor({ quiet = false } = {}) {
    this.quiet = quiet;
    this.items = [];
    this.currentSection = "General";
  }
  section(name) {
    this.currentSection = name;
  }
  add(level, message, hint) {
    this.items.push({ level, section: this.currentSection, message, hint });
  }
  pass(message) {
    this.add("pass", message);
  }
  info(message) {
    this.add("info", message);
  }
  warn(message, hint) {
    this.add("warn", message, hint);
  }
  fail(message, hint) {
    this.add("fail", message, hint);
  }
  count(level) {
    return this.items.filter((i) => i.level === level).length;
  }
  get failures() {
    return this.count("fail");
  }
  print(stream = process.stdout) {
    const useColor = Boolean(stream.isTTY) && !process.env.NO_COLOR;
    const paint = (code, text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);
    const tags = {
      pass: paint("32", "PASS"),
      info: paint("36", "INFO"),
      warn: paint("33", "WARN"),
      fail: paint("31;1", "FAIL"),
    };
    let lastSection = null;
    const out = [];
    for (const item of this.items) {
      if (this.quiet && (item.level === "pass" || item.level === "info")) continue;
      if (item.section !== lastSection) {
        out.push("", paint("1", `== ${item.section}`));
        lastSection = item.section;
      }
      out.push(`  ${tags[item.level]}  ${item.message}`);
      if (item.hint) for (const line of String(item.hint).split("\n")) out.push(`        -> ${line}`);
    }
    const failed = this.failures;
    const summary = `${failed} failed, ${this.count("warn")} warnings, ${this.count("pass")} passed`;
    out.push("", failed ? paint("31;1", `RESULT: FAILED (${summary})`) : paint("32;1", `RESULT: OK (${summary})`), "");
    stream.write(out.join("\n"));
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const fmt = (bytes) => (bytes >= MB ? `${(bytes / MB).toFixed(2)} MB` : `${(bytes / KB).toFixed(1)} KB`);
const preview = (list, max = 5) =>
  list.slice(0, max).join(", ") + (list.length > max ? ` ... (+${list.length - max} more)` : "");

function walk(root) {
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(abs);
      else {
        const stat = fs.statSync(abs);
        if (stat.isFile()) files.push({ rel: path.relative(root, abs).split(path.sep).join("/"), abs, size: stat.size });
      }
    }
  };
  visit(root);
  return files;
}

const isTextFile = (rel) => {
  const base = path.posix.basename(rel);
  return base === ".htaccess" || TEXT_EXTENSIONS.has(path.posix.extname(base).toLowerCase());
};

const isLocalHostname = (host) => {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h.endsWith(".localhost") || h === "::1" || h === "0.0.0.0" || /^127\./.test(h);
};
const isExampleHost = (host) => /(^|\.)example\.(com|org|net)$/i.test(host);
const isInvalidHost = (host) => host === "invalid" || /\.invalid$/i.test(host);
// Text people paste from docs ("https://your-domain"); such hosts also have no dot, which is checked separately.
const isPlaceholderHost = (host) => /your-?(domain|site|website)|change-?me|domain-here/i.test(host);
const PLACEHOLDER_TEXT_RE = /localhost|127\.0\.0\.1|0\.0\.0\.0|example\.(?:com|org|net)/i;

/** Problems with a site URL, given the allow-flags. Empty array = acceptable. (Also used by build-deploy.mjs.) */
export function siteUrlProblems(urlString, opts) {
  let u;
  try {
    u = new URL(urlString);
  } catch {
    return [`"${urlString}" is not a valid URL`];
  }
  const problems = [];
  const local = isLocalHostname(u.hostname);
  if (local && !opts.allowLocalhost) problems.push(`points at ${u.hostname}; --allow-localhost is for local rehearsal builds only`);
  if (isExampleHost(u.hostname) && !opts.allowLocalhost) problems.push(`uses the placeholder domain ${u.hostname}`);
  if (!local && isPlaceholderHost(u.hostname)) problems.push(`"${u.hostname}" looks like a placeholder: use your real domain`);
  if (!local && !u.hostname.includes(".")) problems.push(`host "${u.hostname}" has no dot, so it is not a real domain name`);
  if (isInvalidHost(u.hostname) && !opts.allowPlaceholder && !opts.allowLocalhost) {
    problems.push(`uses the reserved ".invalid" host ${u.hostname} (the CI placeholder; pass --allow-placeholder in CI only)`);
  }
  if (u.protocol !== "https:" && !(local && opts.allowLocalhost)) problems.push(`must use https:// (got ${u.protocol}//)`);
  if ((u.pathname !== "/" && u.pathname !== "") || u.search || u.hash) {
    problems.push(`must be a bare origin without a path, query or fragment (got ${u.pathname}${u.search}${u.hash})`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Minimal HTML reading (regex based; the export is machine generated)
// ---------------------------------------------------------------------------

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function parseAttrs(source) {
  const attrs = {};
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (let m; (m = re.exec(source)); ) {
    const name = m[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

function parseHtml(html) {
  const jsonLd = [];
  html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, body) => {
    if (/type\s*=\s*["']?application\/ld\+json/i.test(attrs)) jsonLd.push(body);
    return match;
  });
  const stripped = html
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, "$1$2")
    .replace(/(<style\b[^>]*>)[\s\S]*?(<\/style>)/gi, "$1$2")
    .replace(/<!--[\s\S]*?-->/g, "");
  const tags = [];
  const tagRe = /<([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
  for (let m; (m = tagRe.exec(stripped)); ) tags.push({ name: m[1].toLowerCase(), attrs: parseAttrs(m[2]) });
  const title = stripped.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return { tags, jsonLd, title: title ? decodeEntities(title[1]).trim() : null };
}

const relTokens = (tag) => (tag.attrs.rel ?? "").toLowerCase().split(/\s+/).filter(Boolean);
const findMeta = (tags, key) =>
  tags.filter((t) => t.name === "meta" && (t.attrs.name ?? t.attrs.property ?? "").toLowerCase() === key);
const splitSrcset = (value) =>
  value.split(",").map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);

const RESOURCE_RELS = new Set(["stylesheet", "preload", "modulepreload", "prefetch", "icon", "apple-touch-icon", "manifest", "shortcut"]);

/** Every URL-carrying attribute worth checking: [{ url, kind: "resource"|"link", tag }]. */
function collectRefs(tags) {
  const refs = [];
  const add = (url, kind, tag) => {
    if (typeof url === "string" && url.trim() !== "") refs.push({ url: url.trim(), kind, tag });
  };
  for (const t of tags) {
    const a = t.attrs;
    switch (t.name) {
      case "a":
      case "area":
        add(a.href, "link", t.name);
        break;
      case "form":
        add(a.action, "link", t.name);
        break;
      case "link": {
        const isResource = relTokens(t).some((r) => RESOURCE_RELS.has(r));
        add(a.href, isResource ? "resource" : "link", "link");
        if (a.imagesrcset) splitSrcset(a.imagesrcset).forEach((u) => add(u, "resource", "link"));
        break;
      }
      case "script":
      case "iframe":
      case "embed":
      case "audio":
      case "track":
        add(a.src, "resource", t.name);
        break;
      case "video":
        add(a.src, "resource", t.name);
        add(a.poster, "resource", t.name);
        break;
      case "img":
      case "source":
        add(a.src, "resource", t.name);
        if (a.srcset) splitSrcset(a.srcset).forEach((u) => add(u, "resource", t.name));
        break;
      case "object":
        add(a.data, "resource", t.name);
        break;
      case "image":
      case "use":
        if (a.href && !a.href.startsWith("#")) add(a.href, "resource", t.name);
        break;
      default:
    }
  }
  return refs;
}

// ---------------------------------------------------------------------------
// C2PA / Content Credentials detection
// ---------------------------------------------------------------------------

const C2PA_UUID = Buffer.from("d8fec3d61b0e483c92975828877ec481", "hex");

function pngHasChunk(buf, type) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return false;
  for (let pos = 8; pos + 12 <= buf.length; ) {
    const length = buf.readUInt32BE(pos);
    if (buf.toString("latin1", pos + 4, pos + 8) === type) return true;
    pos += 12 + length;
  }
  return false;
}

function riffHasChunk(buf, type) {
  if (buf.length < 12 || buf.toString("latin1", 0, 4) !== "RIFF" || buf.toString("latin1", 8, 12) !== "WEBP") return false;
  for (let pos = 12; pos + 8 <= buf.length; ) {
    if (buf.toString("latin1", pos, pos + 4) === type) return true;
    pos += 8 + buf.readUInt32LE(pos + 4) + (buf.readUInt32LE(pos + 4) % 2);
  }
  return false;
}

/**
 * Returns { confirmed: string[], suspected: string[] }.
 * "suspected" = the raw marker bytes ('c2pa', 'jumb', 'caBX') occur but no valid container
 * structure was found (4 random bytes inside compressed image data can match by chance).
 */
function c2paFindings(buf, rel) {
  if (isTextFile(rel)) return { confirmed: buf.includes("c2pa") ? ["the text 'c2pa'"] : [], suspected: [] };
  const confirmed = [];
  const suspected = [];
  // JUMBF superbox: <len:4>"jumb"<len:4>"jumd" (JPEG APP11, JPEG XL, HEIF/AVIF, MP4)
  let jumbf = false;
  for (let i = buf.indexOf("jumb"); i !== -1; i = buf.indexOf("jumb", i + 1)) {
    if (i + 12 <= buf.length && buf.toString("latin1", i + 8, i + 12) === "jumd") {
      jumbf = true;
      break;
    }
  }
  if (jumbf) confirmed.push("JUMBF box ('jumb')");
  else if (buf.includes("jumb")) suspected.push("'jumb'");
  if (pngHasChunk(buf, "caBX")) confirmed.push("PNG 'caBX' chunk");
  else if (buf.includes("caBX")) suspected.push("'caBX'");
  if (riffHasChunk(buf, "C2PA")) confirmed.push("WebP 'C2PA' chunk");
  if (buf.includes(C2PA_UUID)) confirmed.push("C2PA UUID box");
  if (!jumbf && buf.includes("c2pa")) suspected.push("'c2pa'");
  return { confirmed, suspected };
}

// ---------------------------------------------------------------------------
// Static checks
// ---------------------------------------------------------------------------

function verifyStatic(opts, report) {
  const outDir = path.resolve(opts.dir);
  report.section("Output folder");
  if (!fs.existsSync(outDir) || !fs.statSync(outDir).isDirectory()) {
    report.fail(`${opts.dir}/ does not exist`, "Run `npm run build` (or `npm run build:deploy`) first.");
    return;
  }
  const files = walk(outDir);
  const fileSet = new Set(files.map((f) => f.rel));
  const textCache = new Map();
  const read = (rel) => {
    if (!textCache.has(rel)) textCache.set(rel, fs.readFileSync(path.join(outDir, rel), "utf8"));
    return textCache.get(rel);
  };
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  report.info(`${files.length} files, ${fmt(totalBytes)} in ${opts.dir}/`);

  checkRequiredFiles({ files, fileSet, opts, report });
  const siteOrigin = checkIndexHtml({ outDir, files, fileSet, read, opts, report });
  checkSitemapAndRobots({ fileSet, read, siteOrigin, opts, report });
  checkImages({ files, fileSet, report });
  checkHygiene({ outDir, files, opts, report });
  checkHtaccess({ fileSet, read, opts, report });
}

function checkRequiredFiles({ files, fileSet, opts, report }) {
  report.section("Required files");
  for (const rel of REQUIRED_FILES) {
    const file = files.find((f) => f.rel === rel);
    if (!file) report.fail(`${rel} is missing`, rel === "og/og.jpg" ? "Run `npm run images`." : "Check the build output and public/.");
    else if (file.size === 0) report.fail(`${rel} is empty`);
    else report.pass(`${rel} (${fmt(file.size)})`);
  }
  const staticFiles = files.filter((f) => f.rel.startsWith("_next/static/"));
  if (staticFiles.length === 0) report.fail("_next/static/ is missing or empty");
  else report.pass(`_next/static/ has ${staticFiles.length} files`);
  void fileSet;
  void opts;
}

/** Returns the resolved site origin (string) or null. */
function checkIndexHtml({ outDir, files, fileSet, read, opts, report }) {
  report.section("index.html");
  if (!fileSet.has("index.html")) {
    report.fail("index.html not found, skipping content checks");
    return null;
  }
  const html = read("index.html");
  const { tags, jsonLd, title } = parseHtml(html);

  // --- document basics ---
  const h1 = tags.filter((t) => t.name === "h1").length;
  if (h1 === 1) report.pass("exactly one <h1>");
  else report.fail(`expected exactly one <h1>, found ${h1}`);

  const htmlTag = tags.find((t) => t.name === "html");
  if (htmlTag?.attrs.lang) report.pass(`<html lang="${htmlTag.attrs.lang}">`);
  else report.fail("<html> has no lang attribute");

  if (title) report.pass(`<title>: "${title}"`);
  else report.fail("missing or empty <title>");

  if (findMeta(tags, "viewport").length) report.pass("viewport meta present");
  else report.fail("missing <meta name=\"viewport\">");

  const description = findMeta(tags, "description")[0]?.attrs.content?.trim();
  if (!description) report.fail("missing meta description");
  else if (description.length < LIMITS.descriptionMin || description.length > LIMITS.descriptionMax) {
    report.fail(`meta description is ${description.length} characters, want ${LIMITS.descriptionMin}-${LIMITS.descriptionMax}`);
  } else report.pass(`meta description length ${description.length}`);

  const robots = findMeta(tags, "robots")[0]?.attrs.content ?? "";
  if (/noindex/i.test(robots) && !opts.allowLocalhost) report.fail(`<meta name="robots" content="${robots}"> would hide the site from search engines`);

  // --- canonical + site origin ---
  report.section("Site URL and social metadata");
  const canonicals = tags.filter((t) => t.name === "link" && relTokens(t).includes("canonical"));
  let canonicalOrigin = null;
  if (canonicals.length !== 1) report.fail(`expected exactly one canonical link, found ${canonicals.length}`);
  else {
    const href = canonicals[0].attrs.href ?? "";
    try {
      const u = new URL(href);
      canonicalOrigin = u.origin;
      report.pass(`canonical: ${href}`);
    } catch {
      report.fail(`canonical href is not an absolute URL: "${href}"`);
    }
  }

  const expected = opts.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? null;
  let siteOrigin = null;
  if (expected) {
    try {
      siteOrigin = new URL(expected).origin;
    } catch {
      report.fail(`expected site URL "${expected}" is not a valid URL`);
    }
    if (siteOrigin && canonicalOrigin && siteOrigin !== canonicalOrigin) {
      report.fail(`canonical origin ${canonicalOrigin} differs from the expected site URL ${siteOrigin}`, "The build is stale or was made with another NEXT_PUBLIC_SITE_URL. Rebuild.");
    }
  } else if (canonicalOrigin) {
    siteOrigin = canonicalOrigin;
    report.info(`site URL taken from the canonical link: ${siteOrigin} (pass --site-url or set NEXT_PUBLIC_SITE_URL to cross-check)`);
  } else {
    report.fail("cannot determine the site URL (no canonical link, --site-url or NEXT_PUBLIC_SITE_URL)");
  }
  if (siteOrigin) {
    const problems = siteUrlProblems(siteOrigin, opts);
    if (problems.length) report.fail(`site URL ${siteOrigin}: ${problems.join("; ")}`);
    else report.pass(`site URL ${siteOrigin} is acceptable`);
  }

  for (const key of ["og:title", "og:description"]) {
    const value = findMeta(tags, key)[0]?.attrs.content?.trim();
    if (value) report.pass(`${key} present`);
    else report.fail(`missing ${key}`);
  }
  const ogImage = findMeta(tags, "og:image")[0]?.attrs.content?.trim();
  if (!ogImage) report.fail("missing og:image");
  else if (!/^https?:\/\//i.test(ogImage)) report.fail(`og:image must be an absolute URL, got "${ogImage}"`);
  else {
    const u = new URL(ogImage);
    if (siteOrigin && u.origin !== siteOrigin) report.fail(`og:image origin ${u.origin} differs from the site URL ${siteOrigin}`);
    else if (!fileSet.has(decodeURIComponent(u.pathname).replace(/^\/+/, ""))) report.fail(`og:image points to ${u.pathname}, which does not exist in the build`);
    else report.pass(`og:image ${ogImage}`);
  }
  const twitterCard = findMeta(tags, "twitter:card")[0]?.attrs.content;
  if (!twitterCard) report.fail("missing twitter:card");
  else if (twitterCard !== "summary_large_image") report.warn(`twitter:card is "${twitterCard}", expected "summary_large_image"`);
  else report.pass("twitter:card summary_large_image");

  // --- JSON-LD ---
  if (jsonLd.length === 0) report.fail("no JSON-LD (<script type=\"application/ld+json\">) found");
  else {
    let ok = true;
    jsonLd.forEach((raw, index) => {
      try {
        const data = JSON.parse(raw);
        const ctx = JSON.stringify(data["@context"] ?? "");
        if (!/schema\.org/.test(ctx)) report.warn(`JSON-LD block ${index + 1} has no schema.org @context`);
      } catch (error) {
        ok = false;
        report.fail(`JSON-LD block ${index + 1} does not parse: ${error.message}`);
      }
    });
    if (ok) report.pass(`${jsonLd.length} JSON-LD block(s) parse`);
  }

  if (!opts.allowLocalhost && PLACEHOLDER_TEXT_RE.test(html)) {
    const hit = html.match(PLACEHOLDER_TEXT_RE)[0];
    report.fail(`index.html contains "${hit}" (dev or placeholder URL leaked into the build)`);
  }

  // --- references ---
  report.section("Links, resources and preloads");
  const refs = collectRefs(tags);
  const ids = new Set(tags.map((t) => t.attrs.id).filter(Boolean));
  const missing = new Set();
  const external = new Set();
  const insecureResources = new Set();
  const insecureLinks = new Set();
  const badHashes = new Set();
  let bareHashes = 0;
  for (const ref of refs) {
    const raw = ref.url;
    if (/^(mailto:|tel:|sms:|javascript:|data:|blob:|about:|whatsapp:)/i.test(raw)) continue;
    if (raw === "#") {
      bareHashes += 1;
      continue;
    }
    let resolved;
    if (raw.startsWith("//")) {
      external.add(raw);
      if (ref.kind === "resource") insecureResources.add(raw);
      continue;
    }
    try {
      resolved = new URL(raw, "https://self.invalid/");
    } catch {
      missing.add(raw);
      continue;
    }
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(raw);
    const isSelf = !absolute || (siteOrigin && resolved.origin === siteOrigin);
    if (!isSelf) {
      if (resolved.protocol === "http:" && !(opts.allowLocalhost && isLocalHostname(resolved.hostname))) {
        (ref.kind === "resource" ? insecureResources : insecureLinks).add(raw);
      } else if (ref.kind === "resource" && !(opts.allowLocalhost && isLocalHostname(resolved.hostname))) {
        external.add(raw);
      }
      continue;
    }
    // same-site reference: must resolve to a file, and #fragments must exist on the page
    let pathname = resolved.pathname;
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      /* keep raw */
    }
    const rel = pathname.replace(/^\/+/, "");
    const exists = rel === "" || rel.endsWith("/") ? fileSet.has(`${rel}index.html`) : fileSet.has(rel) || fileSet.has(`${rel}/index.html`) || fileSet.has(`${rel}.html`);
    if (!exists) missing.add(raw);
    else if (resolved.hash.length > 1 && (rel === "" || rel === "index.html") && !ids.has(decodeURIComponent(resolved.hash.slice(1)))) {
      badHashes.add(raw);
    }
  }
  if (missing.size) report.fail(`${missing.size} local href/src do not resolve to a file in out/: ${preview([...missing])}`);
  else report.pass(`all ${refs.length} href/src references resolve`);
  if (badHashes.size) report.fail(`in-page anchors without a matching id: ${preview([...badHashes])}`);
  if (bareHashes) report.warn(`${bareHashes} link(s) with href="#" (placeholder links are not keyboard/screen-reader friendly)`);
  if (insecureResources.size) report.fail(`http:// or protocol-relative resources: ${preview([...insecureResources])}`);
  else report.pass("no http:// resources");
  if (insecureLinks.size) report.warn(`http:// links: ${preview([...insecureLinks])}`);
  const thirdParty = [...external].filter((u) => !insecureResources.has(u));
  if (thirdParty.length) report.fail(`third-party resources (blocked by CSP default-src 'self'): ${preview(thirdParty)}`);
  else report.pass("no third-party resources");

  const preloads = tags.filter((t) => t.name === "link" && relTokens(t).includes("preload"));
  const imagePreloads = preloads.filter((t) => (t.attrs.as ?? "").toLowerCase() === "image").length;
  const fontPreloads = preloads.filter((t) => (t.attrs.as ?? "").toLowerCase() === "font").length;
  if (imagePreloads > LIMITS.maxImagePreloads) report.fail(`${imagePreloads} image preloads (max ${LIMITS.maxImagePreloads}): preloading many images delays the LCP image`);
  else report.pass(`${imagePreloads} image preload(s) (max ${LIMITS.maxImagePreloads})`);
  if (fontPreloads > LIMITS.maxFontPreloads) report.fail(`${fontPreloads} font preloads (max ${LIMITS.maxFontPreloads})`);
  else report.pass(`${fontPreloads} font preload(s) (max ${LIMITS.maxFontPreloads})`);

  // --- /_next/image, CSS url(), size ---
  const nextImageHits = files.filter((f) => /\.(html|txt|js|css)$/.test(f.rel) && fs.readFileSync(f.abs, "latin1").includes("/_next/image"));
  if (nextImageHits.length) report.fail(`/_next/image referenced (needs a server; use pre-generated images): ${preview(nextImageHits.map((f) => f.rel))}`);
  else report.pass("no /_next/image references");

  const brokenCss = [];
  for (const file of files.filter((f) => f.rel.endsWith(".css"))) {
    const css = fs.readFileSync(file.abs, "utf8");
    for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
      const target = m[2].trim();
      if (/^(data:|https?:|\/\/|#)/i.test(target)) continue;
      const clean = target.split(/[?#]/)[0];
      const rel = clean.startsWith("/") ? clean.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(file.rel), clean));
      if (!fileSet.has(decodeURIComponent(rel))) brokenCss.push(`${file.rel} -> ${target}`);
    }
  }
  if (brokenCss.length) report.fail(`CSS url() targets missing from out/: ${preview(brokenCss)}`);
  else report.pass("all CSS url() targets exist");

  const gzipSize = zlib.gzipSync(Buffer.from(html), { level: 9 }).length;
  if (gzipSize > LIMITS.indexGzipMax) report.fail(`index.html is ${fmt(gzipSize)} gzipped (max ${fmt(LIMITS.indexGzipMax)})`);
  else report.pass(`index.html ${fmt(gzipSize)} gzipped (max ${fmt(LIMITS.indexGzipMax)})`);

  void outDir;
  return siteOrigin;
}

function checkSitemapAndRobots({ fileSet, read, siteOrigin, opts, report }) {
  report.section("robots.txt and sitemap.xml");
  if (!siteOrigin) {
    report.warn("site URL unknown, skipping robots.txt/sitemap.xml URL checks");
    return;
  }
  if (fileSet.has("robots.txt")) {
    const robots = read("robots.txt");
    const sitemapLines = [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
    if (!sitemapLines.includes(`${siteOrigin}/sitemap.xml`)) {
      report.fail(`robots.txt has no "Sitemap: ${siteOrigin}/sitemap.xml" line`, sitemapLines.length ? `found: ${sitemapLines.join(", ")}` : undefined);
    } else report.pass("robots.txt references the sitemap on the site URL");
    let agents = [];
    let previousWasAgent = false;
    let blocksAll = false;
    for (const line of robots.split(/\r?\n/)) {
      const m = line.match(/^\s*([a-z-]+)\s*:\s*(.*?)\s*(?:#.*)?$/i);
      if (!m) continue;
      const [, key, value] = [null, m[1].toLowerCase(), m[2]];
      if (key === "user-agent") {
        agents = previousWasAgent ? [...agents, value] : [value];
        previousWasAgent = true;
        continue;
      }
      previousWasAgent = false;
      if (key === "disallow" && value === "/" && agents.includes("*")) blocksAll = true;
    }
    if (blocksAll && !opts.allowLocalhost) report.fail("robots.txt disallows the whole site (User-agent: * / Disallow: /)");
    if (!opts.allowLocalhost && PLACEHOLDER_TEXT_RE.test(robots)) report.fail(`robots.txt contains "${robots.match(PLACEHOLDER_TEXT_RE)[0]}"`);
  }
  if (fileSet.has("sitemap.xml")) {
    const xml = read("sitemap.xml");
    const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]));
    if (locs.length === 0) report.fail("sitemap.xml has no <loc> entries");
    else {
      const foreign = locs.filter((loc) => {
        try {
          return new URL(loc).origin !== siteOrigin;
        } catch {
          return true;
        }
      });
      if (foreign.length) report.fail(`sitemap.xml has URLs outside ${siteOrigin}: ${preview(foreign)}`);
      else report.pass(`sitemap.xml: ${locs.length} URL(s), all on ${siteOrigin}`);
      if (!locs.includes(`${siteOrigin}/`) && !locs.includes(siteOrigin)) report.warn("sitemap.xml does not list the home page");
    }
    if (!opts.allowLocalhost && PLACEHOLDER_TEXT_RE.test(xml)) report.fail(`sitemap.xml contains "${xml.match(PLACEHOLDER_TEXT_RE)[0]}"`);
  }
}

function checkImages({ files, fileSet, report }) {
  report.section("Image budgets");
  const images = files.filter((f) => f.rel.startsWith("img/") && f.rel !== "img/.htaccess");
  if (images.length === 0) {
    report.fail("out/img/ is empty or missing", "Run `npm run images` (it also runs before `npm run build`).");
  } else {
    const oversized = images.filter((f) => f.size > LIMITS.imgFileMax);
    if (oversized.length) {
      report.fail(`${oversized.length} file(s) in out/img exceed ${fmt(LIMITS.imgFileMax)}: ${preview(oversized.map((f) => `${f.rel} (${fmt(f.size)})`))}`);
    } else report.pass(`every file in out/img is <= ${fmt(LIMITS.imgFileMax)}`);

    const unhashed = images.filter((f) => !/\.[0-9a-f]{8}\.(avif|webp|jpe?g|png)$/.test(f.rel));
    if (unhashed.length) {
      report.fail(`out/img files without an 8-character content hash in the name: ${preview(unhashed.map((f) => f.rel))}`, "img/ is cached as immutable for a year, so every file name must change when its content changes.");
    } else report.pass("all out/img file names carry a content hash");

    const total = images.reduce((sum, f) => sum + f.size, 0);
    if (total > LIMITS.imgTotalMax) report.fail(`out/img totals ${fmt(total)} (max ${fmt(LIMITS.imgTotalMax)})`);
    else if (total > LIMITS.imgTotalWarn) report.warn(`out/img totals ${fmt(total)} (warning above ${fmt(LIMITS.imgTotalWarn)}, failure above ${fmt(LIMITS.imgTotalMax)})`);
    else report.pass(`out/img totals ${fmt(total)} across ${images.length} files (warn > ${fmt(LIMITS.imgTotalWarn)}, fail > ${fmt(LIMITS.imgTotalMax)})`);

    const hasAvif = images.some((f) => f.rel.endsWith(".avif"));
    const hasWebp = images.some((f) => f.rel.endsWith(".webp"));
    if (!hasAvif || !hasWebp) report.fail(`out/img is missing ${[!hasAvif && "AVIF", !hasWebp && "WebP"].filter(Boolean).join(" and ")} variants`);
  }
  const og = files.find((f) => f.rel === "og/og.jpg");
  if (og && og.size > LIMITS.ogWarn) report.warn(`og/og.jpg is ${fmt(og.size)}; keep it under ${fmt(LIMITS.ogWarn)} so WhatsApp/Facebook show the preview`);
  void fileSet;
}

function checkHygiene({ outDir, files, opts, report }) {
  report.section("Hygiene");
  const maps = files.filter((f) => f.rel.endsWith(".map"));
  const mapRefs = files.filter((f) => /\.(js|css|mjs)$/.test(f.rel) && fs.readFileSync(f.abs, "latin1").includes("sourceMappingURL="));
  if (maps.length || mapRefs.length) report.fail(`source maps in the build: ${preview([...maps, ...mapRefs].map((f) => f.rel))}`, "Do not set productionBrowserSourceMaps in next.config.ts.");
  else report.pass("no source maps");

  const secrets = files.filter((f) => {
    const base = path.posix.basename(f.rel);
    return /^\.env/.test(base) || /\.(pem|key|p12|pfx)$/i.test(base) || /^id_(rsa|ed25519|ecdsa)/.test(base) || f.rel.split("/").includes(".git");
  });
  if (secrets.length) report.fail(`secret-looking files in the web root: ${preview(secrets.map((f) => f.rel))}`);
  else report.pass("no env/key/.git files");

  const junk = files.filter((f) => /(^|\/)(\.DS_Store|Thumbs\.db)$/.test(f.rel));
  if (junk.length) report.warn(`junk files in the build: ${preview(junk.map((f) => f.rel))}`);

  // C2PA / Content Credentials
  const confirmed = [];
  const suspected = [];
  for (const file of files) {
    const findings = c2paFindings(fs.readFileSync(file.abs), file.rel);
    if (findings.confirmed.length) confirmed.push(`${file.rel} [${findings.confirmed.join(", ")}]`);
    else if (findings.suspected.length) suspected.push(`${file.rel} [${findings.suspected.join(", ")}]`);
  }
  if (confirmed.length) report.fail(`C2PA / Content Credentials metadata found: ${preview(confirmed)}`, "Re-export the source image without metadata (npm run images strips it; do not copy raw AI-generated files into public/).");
  else report.pass("no C2PA / Content Credentials bytes");
  if (suspected.length) report.warn(`marker bytes without a valid C2PA structure (probably coincidence inside compressed data): ${preview(suspected)}`, "Confirm with `c2patool <file>` or `exiftool -a -G1 <file>` if in doubt.");

  // absolute local paths
  const leakRes = [
    { re: /\/Users\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]/, label: "/Users/<name>/" },
    { re: /\/home\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]/, label: "/home/<name>/" },
    { re: /[A-Za-z]:\\{1,2}Users\\{1,2}[A-Za-z0-9._-]+/, label: "C:\\Users\\<name>" },
  ];
  const literals = [process.cwd(), os.homedir()].filter((p) => p && p.length >= 8);
  const leaks = [];
  for (const file of files.filter((f) => isTextFile(f.rel))) {
    const text = fs.readFileSync(file.abs, "utf8");
    const hit = leakRes.find((l) => l.re.test(text))?.label ?? literals.find((p) => text.includes(p));
    if (hit) leaks.push(`${file.rel} (${hit})`);
  }
  if (leaks.length) report.fail(`absolute local paths leaked into the build: ${preview(leaks)}`);
  else report.pass("no absolute local paths in text files");

  void outDir;
  void opts;
}

function checkHtaccess({ fileSet, read, opts, report }) {
  report.section("Server config (.htaccess)");
  const level = opts.deploy ? "fail" : "warn";
  if (!fileSet.has(".htaccess")) {
    report[level](".htaccess is missing: no security headers, caching or 404 page on Hostinger/Apache/LiteSpeed", "Run `node deploy/render.mjs htaccess --out out` (`npm run build:deploy` does this).");
    return;
  }
  const text = read(".htaccess");
  const required = [
    "DirectoryIndex index.html",
    "ErrorDocument 404 /404.html",
    "Options -Indexes",
    ...SECURITY_HEADERS.map((h) => h.name),
  ];
  const absent = required.filter((needle) => !text.includes(needle));
  if (!/Content-Security-Policy(-Report-Only)?\s/.test(text)) absent.push("Content-Security-Policy[-Report-Only]");
  if (absent.length) report.fail(`.htaccess is missing: ${absent.join(", ")}`);
  else report.pass(".htaccess has the security headers, DirectoryIndex, ErrorDocument and Options -Indexes");
  const mode = /Content-Security-Policy-Report-Only\s/.test(text) ? "report-only" : "enforce";
  report.info(`CSP in .htaccess is in ${mode} mode`);
  for (const rule of DIRECTORY_CACHE_RULES) {
    const rel = `${rule.dir}/.htaccess`;
    const dirHasFiles = [...fileSet].some((f) => f.startsWith(`${rule.dir}/`) && f !== rel);
    if (!dirHasFiles) continue;
    if (!fileSet.has(rel)) report[level](`${rel} is missing (${rule.cacheControl})`);
    else if (!read(rel).includes(rule.cacheControl)) report.fail(`${rel} does not contain "${rule.cacheControl}"`);
    else report.pass(`${rel} sets ${rule.cacheControl}`);
  }
}

// ---------------------------------------------------------------------------
// Live checks (HTTP against a deployed site)
// ---------------------------------------------------------------------------

async function request(url, { method = "GET", redirect = "follow", timeoutMs = 20000 } = {}) {
  try {
    const res = await fetch(url, {
      method,
      redirect,
      headers: { "accept-encoding": "gzip, br", "user-agent": "reelcraft-verify/1.0" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = Buffer.from(await res.arrayBuffer());
    return { ok: true, url, status: res.status, headers: res.headers, body, text: body.toString("utf8") };
  } catch (error) {
    const cause = error?.cause?.code ?? error?.cause?.message ?? error?.name;
    return { ok: false, url, error: `${error.message}${cause && cause !== error.message ? ` (${cause})` : ""}` };
  }
}

const normalise = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const titleOf = (html) => html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;

async function verifyLive(opts, report) {
  report.section("Reachability");
  let base;
  try {
    base = new URL(opts.live);
  } catch {
    report.fail(`--live "${opts.live}" is not a valid URL`);
    return;
  }
  const origin = base.origin;
  const local = isLocalHostname(base.hostname);
  if (base.protocol !== "https:" && !(local && opts.allowLocalhost)) {
    report.fail(`${origin} is not https://`, "Live checks are meant for the deployed https site (use --allow-localhost for a local rehearsal).");
    return;
  }
  const get = (p, o) => request(new URL(p, origin).href, o);

  const home = await get("/");
  if (!home.ok) {
    report.fail(`GET ${origin}/ failed: ${home.error}`, "Check DNS, the SSL certificate and that the site is published.");
    return;
  }
  if (home.status === 200) report.pass(`GET / -> 200`);
  else report.fail(`GET / -> ${home.status} (expected 200)`, home.status >= 500 ? "A 500 right after upload is usually a bad .htaccess: see docs/DEPLOY.md, section Rollback." : undefined);
  const homeType = home.headers.get("content-type") ?? "";
  if (/text\/html/i.test(homeType)) report.pass(`HTML content-type: ${homeType}`);
  else report.fail(`/ content-type is "${homeType}", expected text/html`);
  const h1Count = (home.text.match(/<h1[\s>]/gi) ?? []).length;
  if (h1Count === 1) report.pass("exactly one <h1> in the served HTML");
  else report.fail(`served HTML has ${h1Count} <h1> elements`);

  const encoding = (home.headers.get("content-encoding") ?? "").toLowerCase();
  if (["gzip", "br", "zstd"].includes(encoding)) report.pass(`HTML is compressed (content-encoding: ${encoding})`);
  else report.fail(`HTML is not compressed (content-encoding: "${encoding}")`, "Ask Hostinger support/hPanel to enable gzip/brotli, or check the CDN setting.");

  // ---- security headers on the HTML document ----
  report.section("Security headers on /");
  const expectedMode = opts.cspMode ?? process.env.CSP_MODE ?? DEFAULT_CSP_MODE;
  for (const { name, value } of SECURITY_HEADERS) {
    const actual = home.headers.get(name);
    if (actual === null) {
      report.fail(`${name} is missing`);
    } else if (name === "Strict-Transport-Security") {
      const maxAge = Number(actual.match(/max-age=(\d+)/i)?.[1] ?? 0);
      const expectedAge = Number(value.match(/max-age=(\d+)/)[1]);
      if (maxAge < expectedAge) report.fail(`${name}: max-age ${maxAge} is below ${expectedAge} (${actual})`);
      else if (/preload/i.test(actual)) report.warn(`${name} includes "preload": that is hard to undo (${actual})`);
      else report.pass(`${name}: ${actual}`);
    } else if (normalise(actual) !== normalise(value)) {
      report.fail(`${name} is "${actual}", expected "${value}"`);
    } else report.pass(`${name}: ${actual}`);
  }
  const cspEnforce = home.headers.get("content-security-policy");
  const cspReport = home.headers.get("content-security-policy-report-only");
  const wanted = resolveCspMode(expectedMode);
  const active = cspHeaderName(wanted).toLowerCase();
  const cspValue = home.headers.get(active);
  if (cspValue === null) {
    const hint = wanted === "enforce" && cspReport !== null ? " (only the report-only header is present: rebuild without CSP_MODE=report-only, or pass --csp-mode report-only)" : "";
    report.fail(`${cspHeaderName(wanted)} is missing${hint}`);
  } else {
    const problems = diffCsp(cspValue);
    if (problems.length) report.fail(`CSP differs from the policy in deploy/headers.mjs: ${problems.slice(0, 4).join("; ")}`);
    else report.pass(`${active} matches deploy/headers.mjs`);
    report.info(`CSP is in ${active.endsWith("report-only") ? "report-only" : "enforce"} mode`);
  }
  if (wanted === "report-only" && cspEnforce !== null) report.warn("an enforcing Content-Security-Policy is present although report-only was expected");
  if (wanted === "enforce" && cspReport !== null && cspEnforce !== null) report.warn("both enforcing and report-only CSP headers are sent");

  // ---- caching ----
  report.section("Caching");
  const cc = (res) => normalise(res.headers.get("cache-control"));
  if (/no-cache|no-store|max-age=0/.test(cc(home))) report.pass(`/ Cache-Control: ${home.headers.get("cache-control")}`);
  else report.fail(`/ Cache-Control is "${home.headers.get("cache-control") ?? ""}", expected no-cache`, "HTML must revalidate, otherwise visitors keep seeing the old site after a release.");

  const cssTexts = [];
  const stylesheet = home.text.match(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"/i)?.[1] ?? home.text.match(/href="([^"]+\.css)"/i)?.[1];
  const findAsset = (re, texts) => {
    for (const text of texts) {
      const found = text.match(re);
      if (found) return found[1];
    }
    return null;
  };
  const nextAssetRe = /["'(]((?:https?:\/\/[^"'\s)]+)?\/_next\/static\/[^"'\s)<>]+\.(?:js|css))/;
  const imgRe = /["'(\s,]((?:https?:\/\/[^"'\s,)]+)?\/img\/[A-Za-z0-9._-]+\.(?:avif|webp|jpe?g|png))/;
  let imgAsset = findAsset(imgRe, [home.text]);
  if (!imgAsset && stylesheet) {
    const css = await get(stylesheet);
    if (css.ok) cssTexts.push(css.text);
    imgAsset = findAsset(imgRe, cssTexts);
  }
  const staticAsset = findAsset(nextAssetRe, [home.text]);

  const checkImmutable = async (label, assetUrl, expectedTypes) => {
    if (!assetUrl) {
      report.warn(`could not find a ${label} URL in the home page to test`);
      return;
    }
    const res = await get(assetUrl);
    const shown = new URL(assetUrl, origin).pathname;
    if (!res.ok) return report.fail(`GET ${shown} failed: ${res.error}`);
    if (res.status !== 200) return report.fail(`GET ${shown} -> ${res.status}`);
    const value = res.headers.get("cache-control") ?? "";
    if (/max-age=31536000/.test(value) && /immutable/.test(value)) report.pass(`${shown} Cache-Control: ${value}`);
    else report.fail(`${shown} Cache-Control is "${value}", expected "public, max-age=31536000, immutable"`, "The per-directory .htaccess (out/_next/static, out/img) was not uploaded or is ignored.");
    if (expectedTypes) {
      const type = (res.headers.get("content-type") ?? "").toLowerCase();
      if (expectedTypes.some((t) => type.startsWith(t))) report.pass(`${shown} content-type: ${type}`);
      else report.fail(`${shown} content-type is "${type}", expected ${expectedTypes.join(" or ")}`);
    }
    if (res.headers.get("x-content-type-options") === null) report.warn(`${shown} has no X-Content-Type-Options header`);
  };
  await checkImmutable("/_next/static asset", staticAsset, null);
  const imgTypes = { avif: ["image/avif"], webp: ["image/webp"], jpg: ["image/jpeg"], jpeg: ["image/jpeg"], png: ["image/png"] };
  await checkImmutable("/img asset", imgAsset, imgAsset ? imgTypes[imgAsset.split(".").pop().toLowerCase()] : null);

  const favicon = await get("/favicon.ico");
  if (favicon.ok && favicon.status === 200) {
    const value = favicon.headers.get("cache-control") ?? "";
    if (/max-age=86400/.test(value) || /max-age=(?!0)\d+/.test(value)) report.pass(`/favicon.ico Cache-Control: ${value}`);
    else report.warn(`/favicon.ico Cache-Control is "${value}", expected public, max-age=86400`);
  } else report.fail(`GET /favicon.ico -> ${favicon.ok ? favicon.status : favicon.error}`);

  // ---- robots + sitemap ----
  report.section("robots.txt and sitemap.xml");
  const robots = await get("/robots.txt");
  if (robots.ok && robots.status === 200) {
    report.pass("GET /robots.txt -> 200");
    if (!/^\s*sitemap:\s*https?:\/\//im.test(robots.text)) report.fail("robots.txt has no Sitemap: line");
    if (/^\s*disallow:\s*\/\s*$/im.test(robots.text) && /user-agent:\s*\*/i.test(robots.text)) report.fail("robots.txt disallows the whole site");
    if (!opts.allowLocalhost && PLACEHOLDER_TEXT_RE.test(robots.text)) report.fail("robots.txt contains a placeholder or localhost URL");
  } else report.fail(`GET /robots.txt -> ${robots.ok ? robots.status : robots.error}`);
  const sitemap = await get("/sitemap.xml");
  if (sitemap.ok && sitemap.status === 200) {
    report.pass("GET /sitemap.xml -> 200");
    const locs = [...sitemap.text.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1]);
    if (locs.length === 0) report.fail("sitemap.xml has no <loc> entries");
    else if (!opts.allowLocalhost && locs.some((l) => PLACEHOLDER_TEXT_RE.test(l))) report.fail("sitemap.xml contains a placeholder or localhost URL");
    else report.pass(`sitemap.xml lists ${locs.length} URL(s)`);
  } else report.fail(`GET /sitemap.xml -> ${sitemap.ok ? sitemap.status : sitemap.error}`);

  // ---- 404 ----
  report.section("Custom 404 page");
  const random = `/__verify-${Math.random().toString(36).slice(2, 10)}/`;
  const missing = await get(random);
  const page404 = await get("/404.html");
  if (!missing.ok) report.fail(`GET ${random} failed: ${missing.error}`);
  else if (missing.status !== 404) report.fail(`unknown path ${random} -> ${missing.status}, expected 404 (soft-404s hurt SEO)`, "Check ErrorDocument 404 /404.html and that no catch-all rewrite exists.");
  else {
    report.pass(`unknown path -> 404`);
    const missingTitle = titleOf(missing.text);
    const homeTitle = titleOf(home.text);
    const customTitle = page404.ok && (page404.status === 200 || page404.status === 404) ? titleOf(page404.text) : null;
    if (customTitle && missingTitle === customTitle) report.pass(`404 response is the custom page ("${missingTitle}")`);
    else if (customTitle) report.fail(`404 response title "${missingTitle}" differs from /404.html title "${customTitle}": the server default 404 page is being served`, "Check that 404.html was uploaded and ErrorDocument 404 /404.html is in .htaccess.");
    else if (missingTitle && missingTitle !== homeTitle) report.warn(`could not fetch /404.html to compare; 404 body title is "${missingTitle}"`);
    else report.fail("404 response does not look like the custom 404 page");
    if (missing.headers.get("x-content-type-options") === null || (missing.headers.get("content-security-policy") ?? missing.headers.get("content-security-policy-report-only")) === null) {
      report.warn("security headers are missing on the 404 response (\"Header always set\" not honoured?)", "Set HTACCESS_HEADER_SCOPE=success only if the host rejects `always`; 404 pages then lose the headers.");
    } else report.pass("security headers are also sent on the 404 response");
  }

  // ---- hardening ----
  report.section("Hardening");
  for (const p of ["/.htaccess", "/.env", "/.git/config"]) {
    const res = await get(p);
    if (!res.ok) report.warn(`GET ${p} failed: ${res.error}`);
    else if (res.status === 200) report.fail(`GET ${p} -> 200 (dotfiles must not be served)`);
    else report.pass(`GET ${p} -> ${res.status}`);
  }
  const listing = await get("/img/");
  if (listing.ok && listing.status === 200 && /index of/i.test(listing.text)) report.fail("/img/ shows a directory listing (Options -Indexes not applied)");
  else report.pass("no directory listing on /img/");

  // ---- http -> https ----
  report.section("HTTPS redirect");
  if (base.protocol !== "https:") report.info("skipped (live URL is not https)");
  else if (base.port) report.info(`skipped (custom port ${base.port})`);
  else {
    const plain = await request(`http://${base.hostname}/`, { redirect: "manual", timeoutMs: 15000 });
    if (!plain.ok) report.warn(`http://${base.hostname}/ is unreachable: ${plain.error}`, "Visitors typing http:// get an error. Enable hPanel > SSL > Force HTTPS.");
    else {
      const location = plain.headers.get("location") ?? "";
      if ([301, 302, 307, 308].includes(plain.status) && /^https:\/\//i.test(location)) {
        if (plain.status === 302 || plain.status === 307) report.warn(`http:// redirects with a temporary ${plain.status} to ${location} (301/308 is better for SEO)`);
        else report.pass(`http:// -> ${plain.status} ${location}`);
      } else report.fail(`http://${base.hostname}/ -> ${plain.status}${location ? ` ${location}` : ""}, expected a redirect to https://`, "Turn on hPanel > Websites > Dashboard > SSL > Force HTTPS (do not add a second redirect in .htaccess).");
    }
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP = `Usage:
  node scripts/verify-out.mjs [--dir out] [--site-url <url>] [--allow-localhost] [--allow-placeholder] [--deploy] [--quiet]
  node scripts/verify-out.mjs --live <https://your-domain> [--csp-mode enforce|report-only] [--allow-localhost]

Exit code 0 = no failures, 1 = failures, 2 = bad usage.`;

function parseArgs(argv) {
  const opts = {
    dir: "out",
    live: null,
    siteUrl: null,
    allowLocalhost: false,
    allowPlaceholder: false,
    deploy: false,
    cspMode: null,
    quiet: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.startsWith("--") ? arg.indexOf("=") : -1;
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const value = () => {
      const v = eq === -1 ? argv[++i] : arg.slice(eq + 1);
      if (v === undefined || v.startsWith("--")) throw new Error(`${flag} needs a value`);
      return v;
    };
    switch (flag) {
      case "--dir": opts.dir = value(); break;
      case "--live": opts.live = value(); break;
      case "--site-url": opts.siteUrl = value(); break;
      case "--csp-mode": opts.cspMode = value(); break;
      case "--allow-localhost": opts.allowLocalhost = true; break;
      case "--allow-placeholder": opts.allowPlaceholder = true; break;
      case "--deploy": opts.deploy = true; break;
      case "--quiet": opts.quiet = true; break;
      case "-h":
      case "--help": opts.help = true; break;
      default: throw new Error(`Unknown argument "${arg}"`);
    }
  }
  if (opts.cspMode && !CSP_MODES.includes(opts.cspMode)) throw new Error(`--csp-mode must be one of ${CSP_MODES.join(", ")}`);
  return opts;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`verify-out: ${error.message}\n\n${HELP}`);
    process.exitCode = 2;
    return;
  }
  if (opts.help) {
    console.log(HELP);
    return;
  }
  const report = new Report({ quiet: opts.quiet });
  try {
    if (opts.live) await verifyLive(opts, report);
    else verifyStatic(opts, report);
  } catch (error) {
    report.section("Internal error");
    report.fail(`verify-out crashed: ${error.stack ?? error.message}`);
  }
  report.print();
  process.exitCode = report.failures > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
