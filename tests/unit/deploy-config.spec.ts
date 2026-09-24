import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

// Node-only tests for deploy/headers.mjs (no browser). Loaded with a dynamic import so it works
// whether Playwright runs this file as CommonJS or ESM.
const loadHeaders = () => import("../../deploy/headers.mjs");

const EXPECTED_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

const SNIPPET_PATH = "/etc/nginx/snippets/reelcraft-headers.conf";

/** Bodies of all `location ... { }` blocks (comments removed first). */
function locationBlocks(conf: string): { name: string; body: string }[] {
  const source = conf.replace(/^\s*#.*$/gm, "");
  const blocks: { name: string; body: string }[] = [];
  const re = /^\s*location\s+([^{]+)\{/gm;
  for (let match = re.exec(source); match; match = re.exec(source)) {
    let depth = 1;
    let i = re.lastIndex;
    while (depth > 0 && i < source.length) {
      const char = source[i++];
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
    }
    blocks.push({ name: match[1].trim(), body: source.slice(re.lastIndex, i - 1) });
  }
  return blocks;
}

test.describe("deploy/headers.mjs", () => {
  test("the CSP is exactly the agreed policy", async () => {
    const { buildCsp } = await loadHeaders();
    expect(buildCsp()).toBe(EXPECTED_CSP);
  });

  test("CSP mode: enforce by default, report-only on request, garbage rejected", async () => {
    const { resolveCspMode, cspHeaderName } = await loadHeaders();
    expect(resolveCspMode("")).toBe("enforce");
    expect(resolveCspMode("Report-Only")).toBe("report-only");
    expect(cspHeaderName("report-only")).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName("enforce")).toBe("Content-Security-Policy");
    expect(() => resolveCspMode("strict")).toThrow(/CSP_MODE/);
  });

  test("diffCsp ignores order and reports real differences", async () => {
    const { diffCsp } = await loadHeaders();
    const reordered = EXPECTED_CSP.split("; ").reverse().join("; ");
    expect(diffCsp(reordered)).toEqual([]);
    expect(diffCsp(EXPECTED_CSP.replace("script-src 'self' 'unsafe-inline'", "script-src 'self' https://cdn.example.net")).join(" ")).toContain("script-src");
    expect(diffCsp(EXPECTED_CSP.replace("; object-src 'none'", "")).join(" ")).toContain("object-src");
  });

  test(".htaccess contains every required header once, plus the server hints", async () => {
    const { renderHtaccess, SECURITY_HEADERS } = await loadHeaders();
    const text = renderHtaccess({ cspMode: "report-only", headerScope: "always" });

    for (const { name, value } of SECURITY_HEADERS) {
      const lines = text.split("\n").filter((line) => line.startsWith(`Header always set ${name} `));
      expect(lines, name).toEqual([`Header always set ${name} "${value}"`]);
    }
    expect(text).toContain(`Header always set Content-Security-Policy-Report-Only "${EXPECTED_CSP}"`);
    expect(text).not.toMatch(/^Header always set Content-Security-Policy "/m);
    expect(text).toContain("max-age=31536000\"");
    expect(text).not.toMatch(/preload/i);

    for (const line of ["DirectoryIndex index.html", "ErrorDocument 404 /404.html", "Options -Indexes"]) expect(text).toContain(line);
    expect(text).toContain("<IfModule mod_deflate.c>");
    expect(text).toContain("<IfModule mod_brotli.c>");
    expect(text).toContain("RewriteRule (^|/)\\.(?!well-known(/|$)) - [F,L]");
    expect(text, "no HTTPS redirect in .htaccess").not.toMatch(/RewriteCond .*HTTPS|R=301/i);
    // Every <IfModule> is closed.
    expect((text.match(/<IfModule /g) ?? []).length).toBe((text.match(/<\/IfModule>/g) ?? []).length);
    expect((text.match(/<FilesMatch /g) ?? []).length).toBe((text.match(/<\/FilesMatch>/g) ?? []).length);
  });

  test(".htaccess in enforce mode and with success-only header scope", async () => {
    const { renderHtaccess } = await loadHeaders();
    const enforce = renderHtaccess({ cspMode: "enforce", headerScope: "always" });
    expect(enforce).toContain(`Header always set Content-Security-Policy "${EXPECTED_CSP}"`);
    expect(enforce).not.toContain("Report-Only");

    const success = renderHtaccess({ cspMode: "report-only", headerScope: "success" });
    expect(success).toContain('Header set X-Frame-Options "DENY"');
    expect(success).not.toContain("Header always set");
  });

  test("caching rules: html/txt/xml revalidate, icons 1 day, hashed directories immutable", async () => {
    const { renderHtaccess, renderDirectoryHtaccess, DIRECTORY_CACHE_RULES } = await loadHeaders();
    const text = renderHtaccess({ cspMode: "report-only", headerScope: "always" });
    expect(text).toMatch(/<FilesMatch "\\\.\(html\|txt\|xml\)\$">\s+Header always set Cache-Control "no-cache"/);
    expect(text).toMatch(/<FilesMatch "\^\(favicon\\\.ico\|[^"]*apple-touch-icon\\\.png[^"]*\)\$">\s+Header set Cache-Control "public, max-age=86400"/);

    const byDir = Object.fromEntries(DIRECTORY_CACHE_RULES.map((rule: { dir: string; cacheControl: string; why: string }) => [rule.dir, rule]));
    expect(Object.keys(byDir).sort()).toEqual(["_next/static", "img", "og", "video"]);
    expect(renderDirectoryHtaccess(byDir["_next/static"])).toContain('Header set Cache-Control "public, max-age=31536000, immutable"');
    expect(renderDirectoryHtaccess(byDir.img)).toContain("immutable");
    expect(renderDirectoryHtaccess(byDir.og)).toContain('"public, max-age=86400"');
    expect(renderDirectoryHtaccess(byDir.video)).toContain("immutable");
    const imgRules = renderDirectoryHtaccess(byDir.img).replace(/^#.*$/gm, "");
    expect(imgRules, "immutable rules must not use 'always' (a 404 must not be cached for a year)").not.toContain("always");
  });

  test("writeHtaccessFiles writes the root file and one per existing directory", async ({}, testInfo) => {
    const { writeHtaccessFiles } = await loadHeaders();
    const out = testInfo.outputPath("out");
    fs.mkdirSync(path.join(out, "_next", "static"), { recursive: true });
    fs.mkdirSync(path.join(out, "img"), { recursive: true });

    const result = writeHtaccessFiles(out, { cspMode: "report-only" });
    expect(result.written.sort()).toEqual([".htaccess", "_next/static/.htaccess", "img/.htaccess"]);
    expect(result.skipped.sort()).toEqual(["og", "video"]);
    expect(fs.readFileSync(path.join(out, "img", ".htaccess"), "utf8")).toContain("immutable");
    expect(() => writeHtaccessFiles(path.join(out, "missing"))).toThrow(/not found/);
  });

  test("nginx: every location that sets add_header includes the shared headers snippet", async () => {
    const { renderNginxConf, renderNginxHeadersSnippet, SECURITY_HEADERS } = await loadHeaders();
    const conf = renderNginxConf({ domain: "reelcraft.in", cspMode: "report-only" });
    const blocks = locationBlocks(conf);
    expect(blocks.length).toBeGreaterThanOrEqual(8);

    const withAddHeader = blocks.filter((b) => b.body.includes("add_header"));
    expect(withAddHeader.length).toBeGreaterThanOrEqual(7);
    for (const block of withAddHeader) {
      expect(block.body, `location ${block.name} must include the snippet`).toContain(`include ${SNIPPET_PATH};`);
    }

    const immutable = blocks.find((b) => b.name === "^~ /_next/static/");
    expect(immutable?.body).toContain('add_header Cache-Control "public, max-age=31536000, immutable";');
    expect(immutable?.body, "no `always` on the immutable header").not.toMatch(/immutable"\s+always/);
    expect(blocks.find((b) => b.name === "^~ /img/")?.body).toContain("immutable");
    expect(blocks.find((b) => b.name === "^~ /video/")?.body).toContain("immutable");
    // Two `location /` blocks exist: the port-80 redirect and the site itself.
    expect(blocks.filter((b) => b.name === "/").some((b) => b.body.includes("try_files $uri $uri.html $uri/ =404;"))).toBe(true);

    expect(conf).toContain("error_page 404 /404.html;");
    expect(conf).toContain("server_name reelcraft.in;");
    expect(conf).toContain("return 301 https://reelcraft.in$request_uri;");
    expect(conf).not.toMatch(/\{\{|\}\}/);

    const snippet = renderNginxHeadersSnippet({ cspMode: "report-only" });
    for (const { name, value } of SECURITY_HEADERS) expect(snippet).toContain(`add_header ${name} "${value}" always;`);
    expect(snippet).toContain(`add_header Content-Security-Policy-Report-Only "${EXPECTED_CSP}" always;`);
  });

  test("nginx: http2 works on old and new nginx, and the bootstrap file needs no certificate", async () => {
    const { renderNginxConf } = await loadHeaders();
    const full: string = renderNginxConf({ domain: "reelcraft.in" });
    expect(full).toContain("listen 443 ssl http2;");
    expect(full, "`http2 on;` only exists in nginx >= 1.25.1").not.toContain("http2 on;");
    expect(full).toContain("ssl_certificate ");

    const bootstrap: string = renderNginxConf({ domain: "reelcraft.in", bootstrap: true });
    expect(bootstrap, "no certificate files are referenced before certbot has run").not.toMatch(/ssl_certificate|listen 443/);
    expect(bootstrap).toContain("location ^~ /.well-known/acme-challenge/");
    expect(bootstrap).toContain("server_name reelcraft.in www.reelcraft.in;");
    expect(bootstrap).not.toMatch(/\{\{|\}\}/);
  });

  test("nginx: bad input is rejected", async () => {
    const { renderNginxConf } = await loadHeaders();
    expect(() => renderNginxConf({ domain: "not a domain" })).toThrow(/--domain/);
    expect(() => renderNginxConf({ domain: "reelcraft.in", root: "/var/www/with space" })).toThrow(/absolute path/);
    expect(() => renderNginxConf({ domain: "reelcraft.in;\nreturn 200" })).toThrow(/--domain/);
  });
});
