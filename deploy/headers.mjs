/**
 * Single source of truth for HTTP headers, caching rules and server hints.
 *
 * Rendered into
 *   - out/.htaccess (+ out/_next/static/.htaccess, out/img/.htaccess, out/og/.htaccess)  -> Hostinger / LiteSpeed / Apache
 *   - an Nginx headers snippet and server block (deploy/nginx.conf.tmpl)                  -> optional VPS
 * and imported by scripts/verify-out.mjs so `--live` checks the same values.
 *
 * Nothing here talks to the network. Pure functions, plus writeHtaccessFiles().
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Content-Security-Policy
// ---------------------------------------------------------------------------

export const CSP_MODES = ["report-only", "enforce"];
export const DEFAULT_CSP_MODE = "enforce";

/**
 * 'unsafe-inline' for scripts/styles is required by the Next.js static export
 * (inline RSC payload scripts, inline style attributes). A static host cannot
 * add a per-request nonce. The inline scripts are known at build time, so
 * hashing them (and dropping 'unsafe-inline' from script-src) would be a
 * possible hardening; style attributes would still need 'unsafe-inline'.
 * tests/e2e/csp.spec.ts loads the whole site under exactly this policy.
 */
export const CSP_DIRECTIVES = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:"],
  "font-src": ["'self'"],
  "connect-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
};

export function buildCsp() {
  return Object.entries(CSP_DIRECTIVES)
    .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
    .join("; ");
}

/** Parse a CSP string into Map<directive, Set<source>> (order-insensitive compare). */
export function parseCsp(value) {
  const map = new Map();
  for (const part of String(value).split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const [name, ...sources] = tokens;
    if (!map.has(name.toLowerCase())) map.set(name.toLowerCase(), new Set(sources));
  }
  return map;
}

/** Returns a list of human-readable differences (empty array = equal). */
export function diffCsp(actual, expected = buildCsp()) {
  const a = parseCsp(actual);
  const e = parseCsp(expected);
  const problems = [];
  for (const [directive, sources] of e) {
    const got = a.get(directive);
    if (!got) {
      problems.push(`missing directive "${directive}"`);
      continue;
    }
    const missing = [...sources].filter((s) => !got.has(s));
    const extra = [...got].filter((s) => !sources.has(s));
    if (missing.length) problems.push(`"${directive}" is missing ${missing.join(" ")}`);
    if (extra.length) problems.push(`"${directive}" has extra ${extra.join(" ")}`);
  }
  for (const directive of a.keys()) {
    if (!e.has(directive)) problems.push(`unexpected directive "${directive}"`);
  }
  return problems;
}

export function resolveCspMode(value = process.env.CSP_MODE) {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "") return DEFAULT_CSP_MODE;
  if (!CSP_MODES.includes(v)) {
    throw new Error(`CSP_MODE must be "report-only" or "enforce" (got "${value}")`);
  }
  return v;
}

export function cspHeaderName(mode) {
  return resolveCspMode(mode) === "enforce"
    ? "Content-Security-Policy"
    : "Content-Security-Policy-Report-Only";
}

// ---------------------------------------------------------------------------
// Other security headers
// ---------------------------------------------------------------------------

export const SECURITY_HEADERS = [
  // No includeSubDomains / preload: this is a one-site host and preload is hard to undo.
  { name: "Strict-Transport-Security", value: "max-age=31536000" },
  { name: "X-Content-Type-Options", value: "nosniff" },
  { name: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { name: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { name: "X-Frame-Options", value: "DENY" },
  { name: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

/** All response headers for HTML documents, CSP included (in the chosen mode). */
export function getHeaders({ cspMode } = {}) {
  const mode = resolveCspMode(cspMode);
  return [...SECURITY_HEADERS, { name: cspHeaderName(mode), value: buildCsp() }];
}

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------

export const CACHE = {
  /** Content-hashed files only (see verify-out.mjs: img/ and video/ names must contain a hash). */
  immutable: "public, max-age=31536000, immutable",
  /** HTML, robots.txt, sitemap.xml, RSC .txt payloads: always revalidate. */
  revalidate: "no-cache",
  /** Icons and the OG image: not content-hashed, so keep the TTL short. */
  oneDay: "public, max-age=86400",
};

/** Extensions that must always revalidate (matched by file name, any directory). */
export const REVALIDATE_EXTENSIONS = ["html", "txt", "xml"];

/** Un-hashed files that live in the web root. */
export const ROOT_STATIC_FILES = [
  "favicon.ico",
  "icon.svg",
  "apple-touch-icon.png",
  "manifest.webmanifest",
  "site.webmanifest",
];

/**
 * Directories that get their own .htaccess. Root rules only match by file name,
 * so directory-scoped caching is done with per-directory files. The name-based
 * root rules and these directory rules never match the same file, so the result
 * does not depend on how a server orders/merges nested .htaccess files.
 */
export const DIRECTORY_CACHE_RULES = [
  { dir: "_next/static", cacheControl: CACHE.immutable, why: "hashed by Next.js" },
  { dir: "img", cacheControl: CACHE.immutable, why: "file names contain an 8-char content hash (npm run images)" },
  { dir: "video", cacheControl: CACHE.immutable, why: "file names contain an 8-char content hash (scripts/encode-reels.swift)" },
  { dir: "og", cacheControl: CACHE.oneDay, why: "social preview image, not content-hashed" },
];

// ---------------------------------------------------------------------------
// Option handling
// ---------------------------------------------------------------------------

/**
 * headerScope "always" (default) -> `Header always set`: also on 403/404/500 pages.
 * headerScope "success"          -> plain `Header set`: 2xx/3xx only. Use this only
 *                                   if a host rejects `always` (verify with --live).
 */
export function resolveHeaderScope(value = process.env.HTACCESS_HEADER_SCOPE) {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "" || v === "always") return "always";
  if (v === "success") return "success";
  throw new Error(`HTACCESS_HEADER_SCOPE must be "always" or "success" (got "${value}")`);
}

function assertSafeValue(name, value) {
  if (/["\r\n\\]/.test(value)) {
    throw new Error(`Header ${name} contains a character that is unsafe to emit (quote, backslash or newline)`);
  }
}

function escapeRegexLiteral(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Apache / LiteSpeed (.htaccess)
// ---------------------------------------------------------------------------

const GENERATED_BANNER = "# GENERATED by deploy/headers.mjs (npm run build:deploy). Do not edit by hand:";

export function renderHtaccess(options = {}) {
  const cspMode = resolveCspMode(options.cspMode);
  const scope = resolveHeaderScope(options.headerScope);
  const setHeader = scope === "always" ? "Header always set" : "Header set";
  const headers = getHeaders({ cspMode });
  headers.forEach((h) => assertSafeValue(h.name, h.value));

  const revalidateRegex = `\\.(${REVALIDATE_EXTENSIONS.join("|")})$`;
  const rootStaticRegex = `^(${ROOT_STATIC_FILES.map(escapeRegexLiteral).join("|")})$`;

  const lines = [
    GENERATED_BANNER,
    "# edits are overwritten by the next build.",
    `# CSP mode: ${cspMode}  |  header scope: ${scope}`,
    "#",
    "# HTTPS redirect is deliberately NOT done here: turn on hPanel > SSL > Force HTTPS.",
    "# A second redirect in .htaccess can create a redirect loop behind the host's proxy.",
    "",
    "DirectoryIndex index.html",
    "Options -Indexes",
    "ErrorDocument 404 /404.html",
    "AddDefaultCharset UTF-8",
    "",
    "# Never serve dotfiles (.env, .git, .DS_Store, ...). .well-known stays reachable (SSL validation).",
    "<IfModule mod_rewrite.c>",
    "RewriteEngine On",
    "RewriteRule (^|/)\\.(?!well-known(/|$)) - [F,L]",
    "</IfModule>",
    "",
    "# MIME types that older server mime tables may not know.",
    "<IfModule mod_mime.c>",
    "AddType image/avif .avif",
    "AddType image/webp .webp",
    "AddType video/mp4 .mp4",
    "AddType font/woff2 .woff2",
    "AddType application/manifest+json .webmanifest",
    "</IfModule>",
    "",
    "# Compression hints. LiteSpeed usually compresses at server level; these only help on plain Apache.",
    "<IfModule mod_deflate.c>",
    "AddOutputFilterByType DEFLATE text/html text/plain text/css text/xml application/xml application/javascript text/javascript application/json application/manifest+json image/svg+xml image/x-icon",
    "</IfModule>",
    "<IfModule mod_brotli.c>",
    "AddOutputFilterByType BROTLI_COMPRESS text/html text/plain text/css text/xml application/xml application/javascript text/javascript application/json application/manifest+json image/svg+xml image/x-icon",
    "</IfModule>",
    "",
    "<IfModule mod_headers.c>",
    "# --- Security headers (values: deploy/headers.mjs) ---",
    ...headers.map((h) => `${setHeader} ${h.name} "${h.value}"`),
    "",
    "# --- Caching by file name. Directory-scoped rules live in _next/static, img and og. ---",
    `<FilesMatch "${revalidateRegex}">`,
    `${setHeader} Cache-Control "${CACHE.revalidate}"`,
    "</FilesMatch>",
    `<FilesMatch "${rootStaticRegex}">`,
    `Header set Cache-Control "${CACHE.oneDay}"`,
    "</FilesMatch>",
    "</IfModule>",
    "",
  ];
  return lines.join("\n");
}

/** Body of a per-directory .htaccess that only sets Cache-Control (success responses only). */
export function renderDirectoryHtaccess({ cacheControl, why }) {
  assertSafeValue("Cache-Control", cacheControl);
  return [
    GENERATED_BANNER,
    `# Cache rule for this directory (${why}).`,
    "# Plain `Header set` (no \"always\"): error responses such as a 404 for a file that was not",
    "# uploaded yet are never cached with this long lifetime.",
    "<IfModule mod_headers.c>",
    `Header set Cache-Control "${cacheControl}"`,
    "</IfModule>",
    "",
  ].join("\n");
}

/**
 * Writes out/.htaccess plus one small .htaccess per DIRECTORY_CACHE_RULES entry
 * whose directory exists. Returns { written: string[], skipped: string[] } (paths relative to outDir).
 */
export function writeHtaccessFiles(outDir, options = {}) {
  if (!existsSync(outDir)) throw new Error(`Output directory not found: ${outDir}`);
  const written = [];
  const skipped = [];
  writeFileSync(path.join(outDir, ".htaccess"), renderHtaccess(options));
  written.push(".htaccess");
  for (const rule of DIRECTORY_CACHE_RULES) {
    const dir = path.join(outDir, rule.dir);
    if (!existsSync(dir)) {
      skipped.push(rule.dir);
      continue;
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, ".htaccess"), renderDirectoryHtaccess(rule));
    written.push(`${rule.dir}/.htaccess`);
  }
  return { written, skipped };
}

// ---------------------------------------------------------------------------
// Nginx (optional VPS)
// ---------------------------------------------------------------------------

/** Snippet to include inside EVERY location that uses add_header (nginx drops inherited add_header otherwise). */
export function renderNginxHeadersSnippet(options = {}) {
  const cspMode = resolveCspMode(options.cspMode);
  const headers = getHeaders({ cspMode });
  headers.forEach((h) => assertSafeValue(h.name, h.value));
  return [
    "# GENERATED by deploy/render.mjs from deploy/headers.mjs. Do not edit by hand.",
    `# CSP mode: ${cspMode}`,
    "# Include this file in every location block that has its own add_header: nginx only",
    "# inherits add_header from an outer level when the inner level defines none.",
    ...headers.map((h) => `add_header ${h.name} "${h.value}" always;`),
    "",
  ].join("\n");
}

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
const ABS_PATH_RE = /^\/[A-Za-z0-9_./-]+$/;

export function renderNginxConf(options = {}) {
  const domain = String(options.domain ?? "").trim().toLowerCase();
  if (!DOMAIN_RE.test(domain)) throw new Error(`--domain must be a host name like example.in (got "${options.domain ?? ""}")`);
  const root = options.root ?? "/var/www/reelcraft/current";
  const headersSnippet = options.headersSnippet ?? "/etc/nginx/snippets/reelcraft-headers.conf";
  const acmeRoot = options.acmeRoot ?? "/var/www/letsencrypt";
  for (const [label, value] of [["root", root], ["headers snippet", headersSnippet], ["ACME root", acmeRoot]]) {
    if (!ABS_PATH_RE.test(value)) throw new Error(`${label} must be an absolute path without spaces (got "${value}")`);
  }
  const cspMode = resolveCspMode(options.cspMode);
  const bootstrap = Boolean(options.bootstrap);
  const altHost = domain.startsWith("www.") ? domain.slice(4) : `www.${domain}`;

  const vars = {
    DOMAIN: domain,
    ALT_HOST: altHost,
    ROOT: root,
    HEADERS_SNIPPET: headersSnippet,
    ACME_ROOT: acmeRoot,
    CSP_MODE: cspMode,
    CACHE_IMMUTABLE: CACHE.immutable,
    CACHE_REVALIDATE: CACHE.revalidate,
    CACHE_ONE_DAY: CACHE.oneDay,
  };
  let template = readFileSync(new URL("./nginx.conf.tmpl", import.meta.url), "utf8");
  // Bootstrap = the port-80 block only: valid before a certificate exists (needed to obtain the first one).
  if (bootstrap) template = template.replace(/#--BEGIN-TLS--[\s\S]*?#--END-TLS--\n?/, "");
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in vars)) throw new Error(`Unknown template variable ${match} in nginx.conf.tmpl`);
    return vars[key];
  });
}
