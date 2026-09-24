import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import zlib from "node:zlib";
import { expect, test, type TestInfo } from "@playwright/test";

// Tests for scripts/verify-out.mjs: a synthetic "good" out/ folder, then one deliberate defect at a
// time, and a mock HTTP server for the --live mode. Node only; no browser is launched.

const execFileAsync = promisify(execFile);
const SITE = "https://reelcraft.in";
const loadHeaders = () => import("../../deploy/headers.mjs");

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

interface RunResult {
  code: number;
  stdout: string;
}

/** Repo root, derived from this project's testDir (<root>/tests/unit). */
const repoRoot = (testInfo: TestInfo): string => path.resolve(testInfo.project.testDir, "..", "..");

async function runVerify(testInfo: TestInfo, args: string[]): Promise<RunResult> {
  const root = repoRoot(testInfo);
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1" };
  delete env.NEXT_PUBLIC_SITE_URL;
  delete env.CSP_MODE;
  try {
    const { stdout } = await execFileAsync(process.execPath, [path.join(root, "scripts", "verify-out.mjs"), ...args], {
      cwd: root,
      env,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { code: 0, stdout };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof failure.code === "number" ? failure.code : -1, stdout: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
}

// ---------------------------------------------------------------------------
// synthetic out/ folder
// ---------------------------------------------------------------------------

const DESCRIPTION = "Wedding reel management by Reel Craft: shoot-day coordination, cinematic edits and Instagram-ready reels delivered in 48-72 hours.";

const INDEX_HTML = `<!DOCTYPE html><html lang="en-IN"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Reel Craft - Wedding Reels</title>
<meta name="description" content="${DESCRIPTION}"/>
<link rel="canonical" href="${SITE}/"/>
<meta property="og:title" content="Reel Craft"/><meta property="og:description" content="${DESCRIPTION}"/>
<meta property="og:image" content="${SITE}/og/og.jpg"/><meta name="twitter:card" content="summary_large_image"/>
<link rel="stylesheet" href="/_next/static/chunks/app.css"/>
<link rel="preload" as="image" href="/img/hero-640.aaaaaaaa.webp"/>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Reel Craft","url":"${SITE}"}</script>
<script src="/_next/static/chunks/app.js" async=""></script></head>
<body><a class="skip-link" href="#main">Skip to content</a>
<header><nav id="site-menu" aria-label="Primary"><a href="#about">About</a></nav></header>
<main id="main"><h1>Wedding reels</h1><section id="about"><img src="/img/hero.aaaaaaaa.jpg" srcSet="/img/hero-640.aaaaaaaa.webp 640w, /img/hero-640.aaaaaaaa.avif 640w" alt=""/></section></main>
<footer><a href="https://instagram.com/reelcraft">Instagram</a></footer></body></html>`;

function pngWithChunks(types: string[]): Buffer {
  const chunk = (type: string) => Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from(type, "latin1"), Buffer.from([0, 0, 0, 0])]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...types.map(chunk)]);
}

class Site {
  constructor(readonly dir: string) {}
  write(rel: string, content: string | Buffer) {
    const file = path.join(this.dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  edit(rel: string, change: (text: string) => string) {
    const file = path.join(this.dir, rel);
    fs.writeFileSync(file, change(fs.readFileSync(file, "utf8")));
  }
  remove(rel: string) {
    fs.rmSync(path.join(this.dir, rel), { force: true });
  }
}

async function makeSite(testInfo: TestInfo): Promise<Site> {
  const dir = testInfo.outputPath("out");
  fs.rmSync(dir, { recursive: true, force: true });
  const site = new Site(dir);
  const filler = (bytes: number) => Buffer.alloc(bytes, 0x41);
  site.write("index.html", INDEX_HTML);
  site.write("404.html", "<!DOCTYPE html><html lang=\"en\"><head><title>Page not found</title></head><body><h1>Page not found</h1></body></html>");
  site.write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
  site.write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}/</loc></url></urlset>`);
  site.write("favicon.ico", filler(200));
  site.write("icon.svg", '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
  site.write("apple-touch-icon.png", pngWithChunks(["IHDR", "IEND"]));
  site.write("og/og.jpg", filler(50_000));
  site.write("_next/static/chunks/app.js", "console.log('hello')");
  site.write("_next/static/chunks/app.css", "body{margin:0}");
  site.write("img/hero.aaaaaaaa.jpg", filler(20_000));
  site.write("img/hero-640.aaaaaaaa.webp", filler(15_000));
  site.write("img/hero-640.aaaaaaaa.avif", filler(9_000));
  const { writeHtaccessFiles } = await loadHeaders();
  writeHtaccessFiles(dir, { cspMode: "report-only" });
  return site;
}

const BASE_ARGS = (site: Site) => ["--dir", site.dir, "--site-url", SITE, "--deploy"];

// ---------------------------------------------------------------------------
// static mode
// ---------------------------------------------------------------------------

test.describe("verify-out (static)", () => {
  test("a healthy build passes with exit code 0", async ({}, testInfo) => {
    const site = await makeSite(testInfo);
    const { code, stdout } = await runVerify(testInfo, BASE_ARGS(site));
    expect(stdout).toContain("RESULT: OK");
    expect(stdout).not.toContain("FAIL");
    expect(code).toBe(0);
  });

  const defects: { name: string; expected: string; mutate: (site: Site) => void }[] = [
    { name: "two <h1> elements", expected: "expected exactly one <h1>, found 2", mutate: (s) => s.edit("index.html", (t) => t.replace("</main>", "<h1>Again</h1></main>")) },
    { name: "missing <html lang>", expected: "<html> has no lang attribute", mutate: (s) => s.edit("index.html", (t) => t.replace(' lang="en-IN"', "")) },
    { name: "meta description too short", expected: "meta description is", mutate: (s) => s.edit("index.html", (t) => t.replace(`name="description" content="${DESCRIPTION}"`, 'name="description" content="Too short"')) },
    { name: "no canonical link", expected: "expected exactly one canonical link, found 0", mutate: (s) => s.edit("index.html", (t) => t.replace(/<link rel="canonical"[^>]*>/, "")) },
    { name: "relative og:image", expected: "og:image must be an absolute URL", mutate: (s) => s.edit("index.html", (t) => t.replace(`${SITE}/og/og.jpg`, "/og/og.jpg")) },
    { name: "no twitter:card", expected: "missing twitter:card", mutate: (s) => s.edit("index.html", (t) => t.replace(/<meta name="twitter:card"[^>]*>/, "")) },
    { name: "invalid JSON-LD", expected: "does not parse", mutate: (s) => s.edit("index.html", (t) => t.replace('"@type":"Organization",', '"@type":"Organization",,')) },
    { name: "http:// script", expected: "http:// or protocol-relative resources", mutate: (s) => s.edit("index.html", (t) => t.replace("</body>", '<script src="http://cdn.other.net/x.js"></script></body>')) },
    { name: "third-party https script", expected: "third-party resources", mutate: (s) => s.edit("index.html", (t) => t.replace("</body>", '<script src="https://cdn.other.net/x.js"></script></body>')) },
    { name: "link to a file that does not exist", expected: "do not resolve to a file", mutate: (s) => s.edit("index.html", (t) => t.replace("</main>", '<img src="/img/nope.bbbbbbbb.webp" alt=""/></main>')) },
    { name: "in-page anchor without a target", expected: "in-page anchors without a matching id", mutate: (s) => s.edit("index.html", (t) => t.replace("</main>", '<a href="#nowhere">x</a></main>')) },
    { name: "reference to /_next/image", expected: "/_next/image referenced", mutate: (s) => s.edit("index.html", (t) => t.replace("</main>", '<img src="/_next/image?url=%2Fa.png&w=64&q=75" alt=""/></main>')) },
    { name: "three image preloads", expected: "3 image preloads", mutate: (s) => s.edit("index.html", (t) => t.replace("</head>", '<link rel="preload" as="image" href="/img/hero.aaaaaaaa.jpg"/><link rel="preload" as="image" href="/img/hero-640.aaaaaaaa.avif"/></head>')) },
    { name: "five font preloads", expected: "5 font preloads", mutate: (s) => s.edit("index.html", (t) => t.replace("</head>", Array.from({ length: 5 }, () => '<link rel="preload" as="font" href="/_next/static/chunks/app.css"/>').join("") + "</head>")) },
    { name: "CSS url() to a missing file", expected: "CSS url() targets missing", mutate: (s) => s.write("_next/static/chunks/app.css", "body{background:url(/img/gone.cccccccc.webp)}") },
    { name: "localhost leaked into the HTML", expected: "contains \"localhost\"", mutate: (s) => s.edit("index.html", (t) => t.replace("</body>", "<!-- --><p>http://localhost:3000</p></body>")) },
    { name: "noindex", expected: "would hide the site from search engines", mutate: (s) => s.edit("index.html", (t) => t.replace("</head>", '<meta name="robots" content="noindex"/></head>')) },
    { name: "sitemap with another host", expected: "sitemap.xml has URLs outside", mutate: (s) => s.write("sitemap.xml", '<urlset><url><loc>https://other.in/</loc></url></urlset>') },
    { name: "robots.txt without Sitemap line", expected: "has no \"Sitemap:", mutate: (s) => s.write("robots.txt", "User-agent: *\nAllow: /\n") },
    { name: "robots.txt blocks everything", expected: "disallows the whole site", mutate: (s) => s.write("robots.txt", `User-agent: *\nDisallow: /\nSitemap: ${SITE}/sitemap.xml\n`) },
    { name: "image over 250 KB", expected: "exceed 250.0 KB", mutate: (s) => s.write("img/big.dddddddd.webp", Buffer.alloc(260 * 1024, 0x41)) },
    { name: "image name without a content hash", expected: "without an 8-character content hash", mutate: (s) => s.write("img/plain.webp", Buffer.alloc(100, 0x41)) },
    { name: "video over 10 MB", expected: "exceed 10.00 MB", mutate: (s) => s.write("video/big.dddddddd.mp4", Buffer.alloc(11 * 1024 * 1024, 0x41)) },
    { name: "video name without a content hash", expected: "not <name>.<hash8>.mp4", mutate: (s) => s.write("video/plain.mp4", Buffer.alloc(100, 0x41)) },
    { name: "out/img over 8 MB", expected: "out/img totals", mutate: (s) => { for (let i = 0; i < 40; i++) s.write(`img/bulk${i}.${String(i).padStart(8, "e")}.webp`, Buffer.alloc(240 * 1024, 0x41)); } },
    { name: "missing og image file", expected: "og/og.jpg is missing", mutate: (s) => s.remove("og/og.jpg") },
    { name: "source map", expected: "source maps in the build", mutate: (s) => s.write("_next/static/chunks/app.js.map", "{}") },
    { name: "env file in the web root", expected: "secret-looking files", mutate: (s) => s.write(".env.production", "TOKEN=1") },
    { name: "absolute local path in JS", expected: "absolute local paths leaked", mutate: (s) => s.write("_next/static/chunks/app.js", 'console.log("/Users/someone/project/src/x.ts")') },
    { name: "C2PA PNG chunk (caBX)", expected: "C2PA / Content Credentials metadata found", mutate: (s) => s.write("img/ai.ffffffff.png", pngWithChunks(["IHDR", "caBX", "IEND"])) },
    { name: "C2PA JUMBF box in a JPEG", expected: "JUMBF box", mutate: (s) => s.write("img/ai.99999999.jpg", Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xeb]), Buffer.from([0, 0, 0, 0x20]), Buffer.from("jumb"), Buffer.from([0, 0, 0, 0x18]), Buffer.from("jumdc2pa"), Buffer.alloc(40, 0)])) },
    { name: "missing .htaccess (with --deploy)", expected: ".htaccess is missing", mutate: (s) => s.remove(".htaccess") },
    { name: "img/.htaccess missing (with --deploy)", expected: "img/.htaccess is missing", mutate: (s) => s.remove("img/.htaccess") },
    { name: "index.html over 40 KB gzipped", expected: "gzipped (max 40.0 KB)", mutate: (s) => s.edit("index.html", (t) => t.replace("</body>", `<p>${Array.from({ length: 30_000 }, (_, i) => Math.random().toString(36).slice(2, 8) + i).join(" ")}</p></body>`)) },
  ];

  for (const defect of defects) {
    test(`fails on: ${defect.name}`, async ({}, testInfo) => {
      const site = await makeSite(testInfo);
      defect.mutate(site);
      const { code, stdout } = await runVerify(testInfo, BASE_ARGS(site));
      expect(stdout).toContain(defect.expected);
      expect(stdout).toContain("RESULT: FAILED");
      expect(code).toBe(1);
    });
  }

  test("random bytes that look like C2PA markers only warn (no valid structure)", async ({}, testInfo) => {
    const site = await makeSite(testInfo);
    site.write("img/noise.12345678.webp", Buffer.concat([Buffer.alloc(50, 0x41), Buffer.from("jumb"), Buffer.alloc(50, 0x41), Buffer.from("caBX")]));
    const { code, stdout } = await runVerify(testInfo, BASE_ARGS(site));
    expect(stdout).toContain("marker bytes without a valid C2PA structure");
    expect(code).toBe(0);
  });

  test("localhost / example.com / .invalid site URLs are rejected unless allowed", async ({}, testInfo) => {
    const site = await makeSite(testInfo);
    const local = "http://localhost:3000";
    site.edit("index.html", (t) => t.split(SITE).join(local));
    site.write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${local}/sitemap.xml\n`);
    site.write("sitemap.xml", `<urlset><url><loc>${local}/</loc></url></urlset>`);

    const rejected = await runVerify(testInfo, ["--dir", site.dir, "--deploy"]);
    expect(rejected.code).toBe(1);
    expect(rejected.stdout).toContain("--allow-localhost is for local rehearsal builds only");
    expect(rejected.stdout).toContain('robots.txt contains "localhost"');
    expect(rejected.stdout).toContain('sitemap.xml contains "localhost"');

    const allowed = await runVerify(testInfo, ["--dir", site.dir, "--deploy", "--allow-localhost"]);
    expect(allowed.stdout).toContain("RESULT: OK");
    expect(allowed.code).toBe(0);

    const example = await runVerify(testInfo, ["--dir", (await makeSite(testInfo)).dir, "--site-url", "https://www.example.com"]);
    expect(example.stdout).toContain("placeholder domain www.example.com");
    expect(example.code).toBe(1);

    const invalid = await runVerify(testInfo, ["--dir", (await makeSite(testInfo)).dir, "--site-url", "https://ci.invalid"]);
    expect(invalid.stdout).toContain(".invalid");
    expect(invalid.code).toBe(1);
  });

  test("a stale build (canonical differs from --site-url) fails", async ({}, testInfo) => {
    const site = await makeSite(testInfo);
    const { code, stdout } = await runVerify(testInfo, ["--dir", site.dir, "--site-url", "https://another-domain.in"]);
    expect(stdout).toContain("differs from the expected site URL");
    expect(code).toBe(1);
  });

  test("without --deploy a missing .htaccess is only a warning", async ({}, testInfo) => {
    const site = await makeSite(testInfo);
    site.remove(".htaccess");
    site.remove("img/.htaccess");
    site.remove("_next/static/.htaccess");
    site.remove("og/.htaccess");
    const { code, stdout } = await runVerify(testInfo, ["--dir", site.dir, "--site-url", SITE]);
    expect(stdout).toContain("WARN  .htaccess is missing");
    expect(code).toBe(0);
  });

  test("a missing out/ folder and bad flags are reported cleanly", async ({}, testInfo) => {
    const missing = await runVerify(testInfo, ["--dir", testInfo.outputPath("nope")]);
    expect(missing.code).toBe(1);
    expect(missing.stdout).toContain("does not exist");
    const usage = await runVerify(testInfo, ["--bogus"]);
    expect(usage.code).toBe(2);
    expect(usage.stdout).toContain("Unknown argument");
  });
});

// ---------------------------------------------------------------------------
// --live mode against a mock server
// ---------------------------------------------------------------------------

interface MockOptions {
  omitHeader?: string;
  soft404?: boolean;
  gzip?: boolean;
  imgCache?: string;
  serveDotfiles?: boolean;
  reportOnlyCsp?: boolean;
}

async function startMockSite(options: MockOptions = {}) {
  const { getHeaders } = await loadHeaders();
  const secure: Record<string, string> = Object.fromEntries(
    getHeaders({ cspMode: options.reportOnlyCsp ? "report-only" : "enforce" }).map((h: { name: string; value: string }) => [h.name.toLowerCase(), h.value]),
  );
  if (options.omitHeader) delete secure[options.omitHeader.toLowerCase()];

  const notFound = "<!doctype html><html lang=en><head><title>Page not found</title></head><body><h1>Page not found</h1></body></html>";
  const home =
    '<!doctype html><html lang=en><head><title>Home</title><link rel="stylesheet" href="/_next/static/chunks/app.css"/><script src="/_next/static/chunks/app.js"></script></head><body><h1>Home</h1><img src="/img/hero-640.aaaaaaaa.avif" alt=""></body></html>';

  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url ?? "/", "http://mock");
    const send = (status: number, type: string, body: string, extra: Record<string, string> = {}, compress = false) => {
      let payload = Buffer.from(body);
      const headers: Record<string, string> = { "content-type": type, ...secure, ...extra };
      if (compress && (options.gzip ?? true)) {
        payload = zlib.gzipSync(payload);
        headers["content-encoding"] = "gzip";
      }
      res.writeHead(status, headers);
      res.end(payload);
    };
    const immutable = "public, max-age=31536000, immutable";
    switch (pathname) {
      case "/": return send(200, "text/html; charset=utf-8", home, { "cache-control": "no-cache" }, true);
      case "/404.html": return send(200, "text/html; charset=utf-8", notFound, { "cache-control": "no-cache" });
      case "/robots.txt": return send(200, "text/plain; charset=utf-8", "User-agent: *\nAllow: /\nSitemap: https://reelcraft.in/sitemap.xml\n", { "cache-control": "no-cache" });
      case "/sitemap.xml": return send(200, "application/xml", '<urlset><url><loc>https://reelcraft.in/</loc></url></urlset>', { "cache-control": "no-cache" });
      case "/favicon.ico": return send(200, "image/x-icon", "ico", { "cache-control": "public, max-age=86400" });
      case "/_next/static/chunks/app.js": return send(200, "application/javascript", "1", { "cache-control": immutable });
      case "/_next/static/chunks/app.css": return send(200, "text/css", "body{}", { "cache-control": immutable });
      case "/img/hero-640.aaaaaaaa.avif": return send(200, "image/avif", "avif", { "cache-control": options.imgCache ?? immutable });
      case "/.htaccess":
      case "/.env":
      case "/.git/config":
        return options.serveDotfiles ? send(200, "text/plain", "secret") : send(403, "text/plain", "Forbidden");
      case "/img/": return send(403, "text/plain", "Forbidden");
      default: return send(options.soft404 ? 200 : 404, "text/html; charset=utf-8", notFound, { "cache-control": "no-cache" });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

test.describe("verify-out --live", () => {
  async function live(testInfo: TestInfo, options: MockOptions, extraArgs: string[] = []) {
    const mock = await startMockSite(options);
    try {
      return await runVerify(testInfo, ["--live", mock.url, "--allow-localhost", ...extraArgs]);
    } finally {
      await mock.close();
    }
  }

  test("a correctly configured host passes", async ({}, testInfo) => {
    const { code, stdout } = await live(testInfo, {});
    expect(stdout).toContain("RESULT: OK");
    expect(stdout).toContain("HTML is compressed (content-encoding: gzip)");
    expect(stdout).toContain("CSP is in enforce mode");
    expect(stdout).toContain("/img/hero-640.aaaaaaaa.avif Cache-Control: public, max-age=31536000, immutable");
    expect(stdout).toContain("404 response is the custom page");
    expect(code).toBe(0);
  });

  test("the enforcing CSP header is expected by default; report-only has to be asked for", async ({}, testInfo) => {
    const wrong = await live(testInfo, { reportOnlyCsp: true });
    expect(wrong.stdout).toContain("Content-Security-Policy is missing");
    expect(wrong.stdout).toContain("--csp-mode report-only");
    expect(wrong.code).toBe(1);
    const allowed = await live(testInfo, { reportOnlyCsp: true }, ["--csp-mode", "report-only"]);
    expect(allowed.stdout).toContain("CSP is in report-only mode");
    expect(allowed.code).toBe(0);
  });

  const cases: { name: string; options: MockOptions; expected: string }[] = [
    { name: "missing HSTS", options: { omitHeader: "Strict-Transport-Security" }, expected: "Strict-Transport-Security is missing" },
    { name: "missing X-Frame-Options", options: { omitHeader: "X-Frame-Options" }, expected: "X-Frame-Options is missing" },
    { name: "missing CSP", options: { omitHeader: "Content-Security-Policy" }, expected: "is missing" },
    { name: "soft 404 (status 200 for unknown paths)", options: { soft404: true }, expected: "expected 404" },
    { name: "uncompressed HTML", options: { gzip: false }, expected: "HTML is not compressed" },
    { name: "short cache lifetime on /img", options: { imgCache: "public, max-age=3600" }, expected: "expected \"public, max-age=31536000, immutable\"" },
    { name: "dotfiles served", options: { serveDotfiles: true }, expected: "dotfiles must not be served" },
  ];
  for (const item of cases) {
    test(`fails on: ${item.name}`, async ({}, testInfo) => {
      const { code, stdout } = await live(testInfo, item.options);
      expect(stdout).toContain(item.expected);
      expect(stdout).toContain("RESULT: FAILED");
      expect(code).toBe(1);
    });
  }

  test("refuses a non-https live URL without --allow-localhost", async ({}, testInfo) => {
    const mock = await startMockSite();
    try {
      const { code, stdout } = await runVerify(testInfo, ["--live", mock.url]);
      expect(stdout).toContain("is not https://");
      expect(code).toBe(1);
    } finally {
      await mock.close();
    }
  });

  test("an unreachable host fails with a readable message, not a crash", async ({}, testInfo) => {
    const { code, stdout } = await runVerify(testInfo, ["--live", "http://127.0.0.1:9", "--allow-localhost"]);
    expect(stdout).toContain("failed:");
    expect(stdout).not.toContain("verify-out crashed");
    expect(code).toBe(1);
  });
});
