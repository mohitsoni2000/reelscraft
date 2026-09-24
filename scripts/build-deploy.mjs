#!/usr/bin/env node
/**
 * build-deploy.mjs - one command from source to an uploadable release zip.
 *
 *   NEXT_PUBLIC_SITE_URL=https://your-domain npm run build:deploy
 *
 * Steps (fails fast, each step's output is shown):
 *   preflight -> images (if not covered by npm hooks) -> typecheck -> lint -> next build
 *   -> out/.htaccess (+ _next/static, img, og) -> verify-out -> zip
 *
 * Flags
 *   --allow-localhost   rehearsal build: accepts http://localhost (default http://localhost:3000).
 *                       The zip is named reelcraft-rehearsal-*.zip and must NOT be uploaded.
 *   --csp-mode <mode>   enforce (default) or report-only (debugging: blocks nothing); env CSP_MODE works too
 *   --dry-run           run the preflight checks and print the plan, change nothing
 *   -h, --help
 *
 * Env: NEXT_PUBLIC_SITE_URL (required), CSP_MODE, HTACCESS_HEADER_SCOPE (always|success)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CSP_MODES, resolveCspMode, resolveHeaderScope, writeHtaccessFiles } from "../deploy/headers.mjs";
import { siteUrlProblems } from "./verify-out.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const OUT_DIR = path.join(ROOT, "out");
const RELEASES_DIR = path.join(ROOT, "releases");

const HELP = `Usage: NEXT_PUBLIC_SITE_URL=https://your-domain npm run build:deploy [-- --csp-mode enforce]
       node scripts/build-deploy.mjs --allow-localhost      (local rehearsal, do not upload the zip)
       node scripts/build-deploy.mjs --dry-run              (preflight only)`;

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code, text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);

function die(message, hint) {
  console.error(`\n${paint("31;1", "BUILD-DEPLOY FAILED")}: ${message}`);
  if (hint) console.error(hint.split("\n").map((l) => `  -> ${l}`).join("\n"));
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { allowLocalhost: false, cspMode: null, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--allow-localhost") opts.allowLocalhost = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "-h" || arg === "--help") opts.help = true;
    else if (arg === "--csp-mode" || arg.startsWith("--csp-mode=")) {
      const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[++i];
      if (!CSP_MODES.includes(value)) die(`--csp-mode must be one of ${CSP_MODES.join(", ")} (got "${value}")`);
      opts.cspMode = value;
    } else die(`Unknown argument "${arg}"`, HELP);
  }
  return opts;
}

const fmtBytes = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`);

function timestamp(withSeconds = false) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const base = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  return withSeconds ? `${base}${p(d.getSeconds())}` : base;
}

function run(label, command, args, env, cwd = ROOT) {
  console.log(paint("2", `$ ${[command, ...args].join(" ")}${cwd === ROOT ? "" : `   (in ${path.relative(ROOT, cwd) || "."}/)`}`));
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) die(`${label}: could not start "${command}" (${result.error.message})`);
  if (result.status !== 0) {
    die(`${label} failed (exit code ${result.status ?? `signal ${result.signal}`}).`, "Fix the errors printed above, then run the command again. Nothing was uploaded or changed on the server.");
  }
}

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  console.log(HELP);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Preflight (everything here runs before any file is touched)
// ---------------------------------------------------------------------------

console.log(paint("1", "Preflight"));

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 20) die(`Node ${process.versions.node} is too old (package.json needs >= 20.9).`, "Use Node 22: `nvm use` (reads .nvmrc).");
const wanted = fs.existsSync(".nvmrc") ? fs.readFileSync(".nvmrc", "utf8").trim().replace(/^v/, "") : null;
if (wanted && String(nodeMajor) !== wanted.split(".")[0]) {
  console.warn(paint("33", `  warning: running Node ${process.versions.node}, the project targets ${wanted} (.nvmrc).`));
}

if (!fs.existsSync(path.join(ROOT, "node_modules", ".bin", "next"))) die("Dependencies are not installed.", "Run `npm ci` first.");

const zipProbe = spawnSync("zip", ["-v"], { stdio: "ignore" });
if (zipProbe.error || zipProbe.status !== 0) die("The `zip` command is not available.", "macOS/Linux have it built in; on Windows use WSL. (Debian/Ubuntu: `sudo apt install zip`.)");

const rawSiteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() || (opts.allowLocalhost ? "http://localhost:3000" : "");
if (!rawSiteUrl) {
  die("NEXT_PUBLIC_SITE_URL is not set.", "Set it to the live site, for example:\n  NEXT_PUBLIC_SITE_URL=https://your-domain.in npm run build:deploy");
}
const problems = siteUrlProblems(rawSiteUrl, { allowLocalhost: opts.allowLocalhost, allowPlaceholder: false });
if (problems.length) {
  die(`NEXT_PUBLIC_SITE_URL="${rawSiteUrl}" is not usable for a production build: ${problems.join("; ")}.`, "It must be the final public address, e.g. https://your-domain.in (https, no localhost/example.com, no path).");
}
const siteOrigin = new URL(rawSiteUrl).origin;

let cspMode;
let headerScope;
try {
  cspMode = resolveCspMode(opts.cspMode ?? process.env.CSP_MODE);
  headerScope = resolveHeaderScope();
} catch (error) {
  die(error.message);
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const scripts = pkg.scripts ?? {};
for (const name of ["typecheck", "lint", "build"]) {
  if (!scripts[name]) die(`package.json has no "${name}" script.`);
}
const hasImages = fs.existsSync(path.join(ROOT, "scripts", "images.mjs")) && Boolean(scripts.images);
// `npm run typecheck` triggers `pretypecheck` (which should run `npm run images`) when present.
const imagesViaHook = Boolean(scripts.pretypecheck);
const runImagesExplicitly = hasImages && !imagesViaHook;

const buildEnv = { ...process.env, NEXT_PUBLIC_SITE_URL: siteOrigin, NEXT_TELEMETRY_DISABLED: "1" };

console.log(`  site URL  : ${siteOrigin}${rawSiteUrl.replace(/\/+$/, "") !== siteOrigin ? "  (normalised to the bare origin)" : ""}`);
console.log(`  CSP mode  : ${cspMode}${cspMode === "report-only" ? "  (debugging mode: nothing is blocked; production should use enforce)" : ""}`);
console.log(`  headers   : Header ${headerScope === "always" ? "always set" : "set"}`);
console.log(`  images    : ${runImagesExplicitly ? "npm run images (no pretypecheck hook found)" : hasImages ? "via npm pre-hooks" : "no scripts/images.mjs, skipped"}`);
if (opts.allowLocalhost) console.log(paint("33;1", "  REHEARSAL BUILD: localhost URL. The zip is for local testing only, never upload it."));

const steps = [
  ...(runImagesExplicitly ? ["Generate images"] : []),
  "Typecheck",
  "Lint",
  "Build (next build -> out/)",
  "Write .htaccess files",
  "Verify out/",
  "Create zip",
];
if (opts.dryRun) {
  console.log(paint("1", "\nDry run: preflight passed. Steps that would run:"));
  steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

let stepNumber = 0;
const step = (title) => console.log(paint("1", `\n[${++stepNumber}/${steps.length}] ${title}`));

if (runImagesExplicitly) {
  step("Generate images");
  run("Image generation", "npm", ["run", "images"], buildEnv);
}

step("Typecheck");
run("Typecheck", "npm", ["run", "typecheck"], buildEnv);

step("Lint");
run("Lint", "npm", ["run", "lint"], buildEnv);

step("Build (next build -> out/)");
// A clean out/ guarantees no stale pages, images or .htaccess files end up in the zip.
fs.rmSync(OUT_DIR, { recursive: true, force: true });
run("Next.js build", "npm", ["run", "build"], buildEnv);
if (!fs.existsSync(path.join(OUT_DIR, "index.html"))) {
  die("The build finished but out/index.html does not exist.", "Check that next.config.ts still has output: \"export\".");
}

step("Write .htaccess files");
{
  const { written, skipped } = writeHtaccessFiles(OUT_DIR, { cspMode, headerScope });
  written.forEach((f) => console.log(`  wrote out/${f}`));
  skipped.forEach((d) => console.warn(paint("33", `  skipped ${d}/.htaccess: out/${d} does not exist`)));
}

step("Verify out/");
{
  const verifyArgs = ["scripts/verify-out.mjs", "--deploy", "--site-url", siteOrigin];
  if (opts.allowLocalhost) verifyArgs.push("--allow-localhost");
  run("Verification of out/", process.execPath, verifyArgs, buildEnv);
}

step("Create zip");
fs.mkdirSync(RELEASES_DIR, { recursive: true });
const prefix = opts.allowLocalhost ? "reelcraft-rehearsal" : "reelcraft";
let zipPath = path.join(RELEASES_DIR, `${prefix}-${timestamp()}.zip`);
if (fs.existsSync(zipPath)) zipPath = path.join(RELEASES_DIR, `${prefix}-${timestamp(true)}.zip`);
// -r recurse (dotfiles included because we zip "."), -X drop extra file attributes, -q quiet.
run("zip", "zip", ["-r", "-X", "-q", zipPath, ".", "-x", "*.DS_Store"], buildEnv, OUT_DIR);

// The archive must contain the dotfiles (a zip made with a file manager often drops them).
const listing = spawnSync("zip", ["-sf", zipPath], { encoding: "utf8" });
const entries = listing.status === 0 ? listing.stdout.split("\n").map((l) => l.trim()).filter((l) => l && !l.endsWith("/") && !/^(Archive contains:|Total )/.test(l)) : [];
const mustContain = ["index.html", "404.html", ".htaccess", "_next/static/.htaccess", "img/.htaccess", "video/.htaccess"];
const absent = mustContain.filter((name) => !entries.includes(name));
if (entries.length === 0) die("Could not read the zip listing (`zip -sf`).", `Inspect ${path.relative(ROOT, zipPath)} manually.`);
if (absent.length) die(`The zip is missing: ${absent.join(", ")}`, "Do not upload it. Re-run the build; if it persists, check the .htaccess step above.");
if (entries.some((name) => name.endsWith(".DS_Store"))) die("The zip contains .DS_Store files.");
console.log(`  ok: ${entries.length} files, dotfiles included`);

// ---------------------------------------------------------------------------
// Hand-off
// ---------------------------------------------------------------------------

const zipRel = path.relative(ROOT, zipPath);
const size = fmtBytes(fs.statSync(zipPath).size);
const domain = new URL(siteOrigin).hostname;

if (opts.allowLocalhost) {
  console.log(`\n${paint("33;1", "REHEARSAL BUILD COMPLETE")}: ${zipRel} (${size})`);
  console.log("This build points at localhost. Do NOT upload it. Rebuild with the real NEXT_PUBLIC_SITE_URL.");
  process.exit(0);
}

console.log(`
${paint("32;1", "RELEASE READY")}
  file : ${zipRel}   (${size})
  site : ${siteOrigin}    CSP: ${cspMode}

Upload to Hostinger (hPanel labels can differ slightly between plans):
  1. hPanel > Websites > your site > Dashboard > Files > File Manager, open  public_html
     (an add-on domain lives in  domains/${domain}/public_html).
  2. First release, or if the site already has a .htaccess: download a copy of it as a backup.
  3. Upload ${path.basename(zipPath)} into public_html.
  4. Right-click the zip > Extract, target = public_html itself (not a new folder). Allow overwrite.
     Do NOT delete the old _next folder first: visitors who still have the previous page open keep
     requesting its old files for a while.
  5. Delete the zip from public_html.
  6. Purge caches: hPanel cache manager / CDN, if you use them.
  7. Check the live site:
       node scripts/verify-out.mjs --live ${siteOrigin}

Rollback: extract the previous zip from releases/ over public_html the same way (steps 3-6).
If the site shows a 500 error after upload: rename .htaccess to .htaccess.off in File Manager
(the site loads again, without headers/caching), then follow docs/DEPLOY.md, section Rollback.
${cspMode === "report-only" ? "\nCSP is in report-only mode: nothing is blocked and nothing is reported. Rebuild without CSP_MODE for production.\n" : ""}`);
