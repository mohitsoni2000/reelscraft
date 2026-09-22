import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

// deploy/release.sh runs on the hosting account. Its promise: a deploy removes ONLY the files the
// previous release had put in the docroot, never anything else that lives there (other sites,
// subdomain folders, hand-uploaded files). These tests run the real script against a throw-away
// $HOME. Node + bash only, no browser.
const SCRIPT = path.resolve(process.cwd(), "deploy/release.sh");

type Sandbox = { home: string; docroot: string; releases: string };

function sandbox(): Sandbox {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "reelcraft-release-"));
  const docroot = path.join(home, "domains", "example.in", "public_html");
  fs.mkdirSync(docroot, { recursive: true });
  return { home, docroot, releases: path.join(home, "releases") };
}

function writeFile(root: string, rel: string, content = rel) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** A minimal release folder: index.html + .htaccess are mandatory, the rest is what a test needs. */
function makeRelease(box: Sandbox, sha: string, files: string[]) {
  const dir = path.join(box.releases, sha);
  for (const rel of ["index.html", ".htaccess", ...files]) writeFile(dir, rel, `${sha}:${rel}`);
}

function run(box: Sandbox, args: string[], env: Record<string, string> = {}) {
  return execFileSync("bash", [SCRIPT, ...args], {
    env: { PATH: process.env.PATH ?? "", HOME: box.home, DOCROOT: box.docroot, ...env } as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const exists = (box: Sandbox, rel: string) => fs.existsSync(path.join(box.docroot, rel));

test.describe("deploy/release.sh", () => {
  test("a deploy removes only what the previous release left behind", () => {
    const box = sandbox();
    try {
      // Things that are NOT part of any release: another site, a subdomain, a hand-made file, the SSL folder.
      writeFile(box.docroot, "blog/index.php");
      writeFile(box.docroot, "shop/sub/page.html");
      writeFile(box.docroot, "notes.txt");
      writeFile(box.docroot, ".well-known/acme-challenge/token");

      makeRelease(box, "aaaaaaa", ["_next/static/old.js", "img/old.webp", "old-page.html", "old-dir/deep/file.txt"]);
      makeRelease(box, "bbbbbbb", ["_next/static/new.js", "img/new.webp"]);

      run(box, ["activate", "aaaaaaa"]);
      expect(exists(box, "_next/static/old.js")).toBe(true);
      expect(exists(box, "old-dir/deep/file.txt")).toBe(true);

      run(box, ["activate", "bbbbbbb"]);

      // New release is live, files only the old release had are gone (and their emptied directories).
      expect(exists(box, "_next/static/new.js")).toBe(true);
      expect(exists(box, "_next/static/old.js")).toBe(false);
      expect(exists(box, "img/old.webp")).toBe(false);
      expect(exists(box, "old-page.html")).toBe(false);
      expect(exists(box, "old-dir")).toBe(false);

      // Everything that was never in a release is untouched.
      expect(exists(box, "blog/index.php")).toBe(true);
      expect(exists(box, "shop/sub/page.html")).toBe(true);
      expect(exists(box, "notes.txt")).toBe(true);
      expect(exists(box, ".well-known/acme-challenge/token")).toBe(true);
    } finally {
      fs.rmSync(box.home, { recursive: true, force: true });
    }
  });

  test("the first deploy never deletes anything", () => {
    const box = sandbox();
    try {
      writeFile(box.docroot, "old-site/index.html");
      writeFile(box.docroot, "index.html", "someone else's page");
      makeRelease(box, "aaaaaaa", ["_next/static/a.js"]);
      run(box, ["activate", "aaaaaaa"]);
      expect(exists(box, "old-site/index.html")).toBe(true);
      expect(fs.readFileSync(path.join(box.docroot, "index.html"), "utf8")).toBe("aaaaaaa:index.html");
    } finally {
      fs.rmSync(box.home, { recursive: true, force: true });
    }
  });

  test("a DOCROOT pointing at the wrong (parent) folder cannot wipe other sites", () => {
    const box = sandbox();
    try {
      const parent = path.join(box.home, "domains", "example.in");
      writeFile(parent, "other-site/public_html/index.html");
      makeRelease(box, "aaaaaaa", ["_next/static/a.js"]);
      makeRelease(box, "bbbbbbb", ["_next/static/b.js"]);
      run(box, ["activate", "aaaaaaa"], { DOCROOT: parent });
      run(box, ["activate", "bbbbbbb"], { DOCROOT: parent });
      expect(fs.existsSync(path.join(parent, "other-site/public_html/index.html"))).toBe(true);
      expect(fs.existsSync(path.join(parent, "_next/static/a.js"))).toBe(false);
    } finally {
      fs.rmSync(box.home, { recursive: true, force: true });
    }
  });

  test("rollback restores the previous release and removes only the failed one's extras", () => {
    const box = sandbox();
    try {
      writeFile(box.docroot, "keep-me.txt");
      makeRelease(box, "aaaaaaa", ["_next/static/a.js", "a-only.html"]);
      makeRelease(box, "bbbbbbb", ["_next/static/b.js", "b-only.html"]);
      run(box, ["activate", "aaaaaaa"]);
      run(box, ["activate", "bbbbbbb"]);
      run(box, ["rollback"]);
      expect(exists(box, "_next/static/a.js")).toBe(true);
      expect(exists(box, "a-only.html")).toBe(true);
      expect(exists(box, "_next/static/b.js")).toBe(false);
      expect(exists(box, "b-only.html")).toBe(false);
      expect(exists(box, "keep-me.txt")).toBe(true);
      expect(fs.readFileSync(path.join(box.docroot, "index.html"), "utf8")).toBe("aaaaaaa:index.html");
    } finally {
      fs.rmSync(box.home, { recursive: true, force: true });
    }
  });

  test("TAKEOVER=1 is the explicit opt-in to mirror the release exactly", () => {
    const box = sandbox();
    try {
      writeFile(box.docroot, "junk.txt");
      writeFile(box.docroot, ".well-known/acme-challenge/token");
      makeRelease(box, "aaaaaaa", ["_next/static/a.js"]);
      run(box, ["activate", "aaaaaaa"], { TAKEOVER: "1" });
      expect(exists(box, "junk.txt")).toBe(false);
      expect(exists(box, ".well-known/acme-challenge/token")).toBe(true);
      expect(exists(box, "_next/static/a.js")).toBe(true);
    } finally {
      fs.rmSync(box.home, { recursive: true, force: true });
    }
  });

  test("refuses a docroot outside $HOME or equal to $HOME", () => {
    const box = sandbox();
    try {
      makeRelease(box, "aaaaaaa", []);
      expect(() => run(box, ["activate", "aaaaaaa"], { DOCROOT: box.home })).toThrow();
      expect(() => run(box, ["activate", "aaaaaaa"], { DOCROOT: os.tmpdir() })).toThrow();
    } finally {
      fs.rmSync(box.home, { recursive: true, force: true });
    }
  });
});
