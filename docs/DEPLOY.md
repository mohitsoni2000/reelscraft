# Reel Craft: Deployment Guide

For the business owner. No coding needed. Every step says what to click or type.

**How the site works.** The site is a folder of plain files (HTML, CSS, images). There is no server program and no database. You build the folder on your computer, upload it to Hostinger, and it is live.

**Where it goes.** Production = your Hostinger Business/Cloud hosting, files in `public_html`. Do **not** use hPanel's "Node.js app" feature. It starts a server and writes its own `.htaccess`, which would fight ours. Two optional extras: GitHub auto-deploy (section 8) and the VPS (section 9).

**How to read this guide**
- Commands go in the Terminal (Mac: Cmd+Space, type `Terminal`, Enter). Start in the project folder: `cd ~/Desktop/Workspace/reelscarft/nextjs`
- Replace `your-domain.in` with your real domain. Replace `u123456789` and `1.2.3.4` with the SSH user name and IP that hPanel shows you.
- A *dotfile* is a file whose name starts with a dot, like `.htaccess`. Some programs hide them.
- Section 11 lists what was checked in Hostinger's docs and what was not.

**The short version (after the one-time setup)**

```
nvm use
NEXT_PUBLIC_SITE_URL=https://your-domain.in npm run build:deploy
#  -> upload releases/reelcraft-<date>.zip to public_html, Extract, delete the zip (section 3)
node scripts/verify-out.mjs --live https://your-domain.in
```

---

## 0) What you need

1. **Node 22.** The file `.nvmrc` says `22`. Check with `node -v`. If it is not v22, run `nvm use` (nvm is a small tool that switches Node versions; if you do not have it, install Node 22 from nodejs.org or ask a developer).
2. **Packages installed.** First time only, in the project folder: `npm ci`
3. **The `zip` command.** Built into Mac and Linux. On Windows use WSL (a Linux window inside Windows). The `NEXT_PUBLIC_SITE_URL=... npm ...` style also needs Mac, Linux or WSL.
4. **Your domain**, already on Hostinger. Decide one final address, with or without `www`, and always use that same one, for example `https://your-domain.in`. It is baked into the pages, sitemap and WhatsApp/Google previews, so a change later means a rebuild.
5. **hPanel login** (Hostinger's control panel).
6. *Optional:* an SSH key (sections 1.8 and 3B), a GitHub account (section 8), the VPS root login (section 9).

---

## 1) One-time hPanel setup

Do this once, before the first upload.

1. Log in to hPanel. Open **Websites**, then click **Dashboard** next to your domain.
2. **No Node.js app on this domain.** Hostinger's Node.js app creates and regenerates its own `.htaccess` in `public_html` and can run a server. If you ever added this domain as a "Node.js web app", remove that app in hPanel first. Then look in `public_html` for leftovers (for example a `nodejs` folder). Do not delete files you do not recognise: ask Hostinger support or a developer.
3. **SSL certificate.** Sidebar: **Security > SSL**. Your domain must show *Active*. If not, click **Install SSL** and wait a few minutes.
4. **Force HTTPS.** Same page: click the three dots next to your domain, choose **Force HTTPS**. Turn it on only when the certificate is Active.
   - Do not add another https redirect anywhere (for example inside `.htaccess`). Two redirects can loop forever. Our `.htaccess` deliberately has none.
   - The site tells browsers "always use https" for one year (HSTS). So never switch HTTPS off later.
5. **Find `public_html`.** Sidebar: **File Manager**. The site folder is `public_html`. On some accounts the real path is `domains/your-domain.in/public_html` (full path `/home/u123456789/domains/your-domain.in/public_html`). Write down which one you have. Section 8 needs it.
6. **Hidden files.** Hostinger's docs say File Manager shows dotfiles by default. If you cannot see `.htaccess` after an upload, open the File Manager settings and switch on the "show hidden files" option.
7. **Back up an existing `.htaccess`.** If `public_html` already has one, right-click it and download a copy. Our upload replaces it.
8. **Optional: SSH and a deploy key** (only for sections 3B and 8). SSH is a secure remote command line.
   1. Sidebar: **SSH Access** (older layouts: Advanced > SSH Access). Click **Enable**. Write down the IP, the port and the user name (looks like `u123456789`). Hostinger's shared/cloud docs say port 65002, but one newer docs page says 22. **Use the port hPanel shows.**
   2. On your computer make a key pair. It makes a private file (never share) and a `.pub` file (goes to Hostinger). No passphrase, so GitHub can use it later:
      ```
      ssh-keygen -t ed25519 -C "reelcraft-deploy" -f ~/.ssh/reelcraft_deploy -N ""
      cat ~/.ssh/reelcraft_deploy.pub
      ```
   3. In **SSH Access**: **Add SSH key**, type any name, paste the `.pub` text, click **Add record**.
   4. Test (port from step 1): `ssh -p 65002 -i ~/.ssh/reelcraft_deploy u123456789@1.2.3.4 "pwd; ls -d public_html domains/*/public_html"`. The first time it asks "Are you sure you want to continue connecting?": type `yes`. It should list your `public_html` path.

---

## 2) Make a release

A *release* is one zip file with the whole site inside.

1. `cd ~/Desktop/Workspace/reelscarft/nextjs` and `nvm use`
2. **Optional rehearsal** (safe, uploads nothing):
   ```
   npm run build:deploy -- --allow-localhost
   npm run preview
   ```
   The first command builds for `http://localhost:3000` and makes `releases/reelcraft-rehearsal-<date>.zip`. **Never upload a rehearsal zip.** The second command shows the site at http://localhost:3000. It does not apply `.htaccess`, so headers and 404 handling are not tested. Press Ctrl+C to stop it.
   Preflight only, no build: `npm run build:deploy -- --dry-run`. Help text: `node scripts/build-deploy.mjs --help`
3. **The real release:**
   ```
   NEXT_PUBLIC_SITE_URL=https://your-domain.in npm run build:deploy
   ```
   - The address must be `https://`, with no `/path`, and not localhost, `example.com` or `*.invalid`. Otherwise it stops with a clear message.
   - Do not use plain `npm run build` for production. Without the address it builds for `http://localhost:3000` (`content/site.ts`), and your sitemap and previews would point at localhost.
4. It runs for a while (typecheck, build, checks). At the end you see **RELEASE READY**, the file name and size. The zip is `releases/reelcraft-YYYYMMDD-HHMM.zip`. The unzipped site is about 8.5 MB, so the zip is around that size.
5. **Keep the last few zips.** `releases/` is not stored in git. Old zips are your rollback (section 5).

### What each step means

| Step in the log | What it checks | If it fails |
|---|---|---|
| Preflight | Node version, packages installed, `zip` exists, site address is a real https address | Fix what the message says. Nothing was changed. |
| Typecheck | TypeScript finds no code mistakes. Also generates the optimised photos. | Code problem: send the message to a developer |
| Lint | ESLint finds no code or style problems | same |
| Build | `next build` writes the site into `out/` (old `out/` is deleted first) | same |
| Write .htaccess | Makes `out/.htaccess` plus small ones in `_next/static`, `img`, `og` | same |
| Verify out/ | Many automatic checks, listed below | Read the FAIL lines. WARN lines do not stop anything. |
| Create zip | Zips `out/`, then checks the zip really contains `.htaccess`, `_next/static/.htaccess`, `img/.htaccess`, `index.html`, `404.html` and no `.DS_Store` | Do not upload. Run it again. |

If any step fails, it prints **BUILD-DEPLOY FAILED** and nothing has been uploaded or changed on the server.

**What "Verify out/" checks**
- Required files exist: `index.html`, `404.html`, `robots.txt`, `sitemap.xml`, icons, `og/og.jpg`.
- SEO and sharing: exactly one `<h1>`, title, description of 70-170 characters, one canonical link, Open Graph and Twitter tags, valid JSON-LD. The canonical link, sitemap and robots.txt must all use your domain. Any localhost or `example.com` text is a FAIL.
- Every local link and file exists. No `http://` resources. No third-party resources (the CSP would block them).
- Images: each file 250 KB or less, all together 8 MB or less (warning above 6 MB), every name has a content hash, AVIF and WebP versions exist.
- Hygiene: no source maps, no `.env`/key/`.git` files, no Content Credentials (C2PA) metadata in photos, no file paths from your computer.
- `.htaccess` exists and has the headers, `DirectoryIndex`, `ErrorDocument` and `Options -Indexes`.

**What the zip contains.** The contents of `out/` at the top level, no wrapper folder:
`index.html`, `404.html`, `robots.txt`, `sitemap.xml`, icons, `og/`, `img/`, `_next/`, `404/`, `_not-found/`, some `.txt` files, and four hidden files: `.htaccess`, `_next/static/.htaccess`, `img/.htaccess`, `og/.htaccess`.

**What `.htaccess` does** (a rules file that Hostinger's LiteSpeed server reads):
- Opens `index.html` for folders, hides folder listings, shows our `404.html` for missing pages.
- Blocks every dotfile (`.env`, `.git`, ...). `.well-known` stays open because SSL checks need it.
- Adds security headers: HSTS (1 year), `nosniff`, referrer policy, permissions policy, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy`, and the CSP (see below).
- Caching: HTML, `.txt`, `.xml` always re-check (`no-cache`). `_next/static` and `img` are cached 1 year (their file names change when content changes). `og` and the icons are cached 1 day.
- It does no https redirect. That is Force HTTPS in hPanel (section 1.4).

### CSP mode: `enforce` (default) or `report-only`

CSP (Content-Security-Policy) is a list of places the page may load things from. Here: only your own site (`default-src 'self'`, plus inline scripts and styles that Next.js needs). The site loads nothing from other websites, so the policy fits it. The browser test `tests/e2e/csp.spec.ts` loads the whole site (menu, FAQ, gallery, animations) under exactly this policy and fails on any violation.
- **enforce** (default): the browser blocks anything outside the rules.
- **report-only** (debugging only): the browser only writes a warning in its console. Nothing is blocked and nothing is sent to any server.

If something ever looks broken after a release, build once in report-only mode to see what the policy blocks (section 7). To pick a mode:
```
NEXT_PUBLIC_SITE_URL=https://your-domain.in CSP_MODE=report-only npm run build:deploy
npm run build:deploy -- --csp-mode report-only
```

---

## 3) Upload

### 3A) File Manager (recommended for the first release)

1. hPanel > **Websites > Dashboard > File Manager**. Open `public_html` (or `domains/your-domain.in/public_html`).
2. Click **Upload** and choose `releases/reelcraft-<date>.zip`.
3. Right-click the zip and choose **Extract**. In the box:
   - Destination: `public_html` itself. Not a new folder.
   - Tick **Overwrite existing files**.
4. **Do not delete the old `_next` folder first.** Visitors who still have the old page open keep asking for old files for a while. New files have new names, so old and new sit side by side. Old files stay behind. They are small and harmless.
5. **Delete the zip** from `public_html`. If you leave it, anyone can download it at `https://your-domain.in/<zip name>`.
6. Check that `.htaccess` is in `public_html` and that `_next/static`, `img` and `og` each have one (section 1.6 if you cannot see them).
7. If you use a Hostinger cache or CDN, purge it.
8. Go to section 4.

### 3B) Alternative: rsync over SSH (from your computer)

rsync copies only what changed. This is exactly what `deploy/release.sh` and `.github/workflows/deploy.yml` do. Needs section 1.8 done. Commit your changes first (`git add -A && git commit -m "release"`), so every release has its own id.

```
npm run build:deploy      # (with NEXT_PUBLIC_SITE_URL, as in section 2)
SHA=$(git rev-parse HEAD)
ssh -p 65002 -i ~/.ssh/reelcraft_deploy u123456789@1.2.3.4 'mkdir -p ~/releases'
rsync -az --delete -e "ssh -p 65002 -i $HOME/.ssh/reelcraft_deploy" out/ u123456789@1.2.3.4:releases/$SHA/
ssh -p 65002 -i ~/.ssh/reelcraft_deploy u123456789@1.2.3.4 "DOCROOT='domains/your-domain.in/public_html' KEEP=5 bash -s -- activate $SHA" < deploy/release.sh
```

What it does: the `rsync` line uploads the site to `~/releases/<id>/` on the server. The last line runs `release.sh`, which copies the new `_next`, `img` and `og` first, then everything else, into `DOCROOT`. It remembers the current and previous release and keeps the newest 5. `DOCROOT` is relative to your home folder (use `public_html` if that is your path).

**Read before using 3B**
- `release.sh` only ever deletes files that **the previous release itself put there** and the new release no longer has (old hashed files, removed pages). Anything else in `public_html` (a subdomain folder, another app, files you uploaded by hand, `.well-known/`) is never touched, even if `DOCROOT` is set to the wrong folder. This is covered by `tests/unit/release-sh.spec.ts`.
- The **first** run only adds files.
- Do not set `TAKEOVER=1` unless `public_html` holds nothing you want to keep. It is the explicit opt-in to mirror the release exactly: it deletes everything else (up to 500 files, `.well-known/` excepted).
- Your root `.htaccess` is replaced (back it up, section 1.7).

---

## 4) Check it worked

1. **Automatic check** (nothing to install; needs the site to be on `https://`):
   ```
   node scripts/verify-out.mjs --live https://your-domain.in
   ```
   Add `--csp-mode report-only` only if you deliberately deployed in report-only mode; without it the check expects the enforcing header. Read the last line: `RESULT: OK` = good. Each line is PASS, INFO, WARN (look at it, the release still works) or FAIL (fix it). Exit code 0 = no FAIL. It tests:
   - The home page answers 200, is HTML, has exactly one `<h1>`, and is compressed.
   - All security headers, and that the CSP matches `deploy/headers.mjs`.
   - Caching on `/`, one `_next/static` file, one `img` file, `favicon.ico`.
   - `robots.txt` and `sitemap.xml`.
   - A made-up address returns **404** and shows our custom 404 page, with headers.
   - `/.htaccess`, `/.env`, `/.git/config` are **not** served, and `/img/` has no folder listing.
   - `http://your-domain.in` jumps to `https://`.
2. **Three checks with your own eyes**
   1. **Padlock.** Open `https://your-domain.in` in a normal browser. The address bar shows a closed padlock. Also try `http://your-domain.in` (must jump to https) and the `www.` version.
   2. **Phone.** On a real phone, on mobile data (not your Wi-Fi), open the site. Scroll to the end. Tap the phone number, the e-mail and the Instagram link. Open the menu and an FAQ.
   3. **Wrong address.** Open `https://your-domain.in/this-page-does-not-exist/`. You must see the Reel Craft "not found" page, not a plain Hostinger or server page.
3. **Lighthouse** (Google's speed and quality score). In Chrome: open the live site in an Incognito window, press F12, open the **Lighthouse** tab, choose **Mobile** and **Navigation**, click **Analyze**. Targets from `lighthouserc.json`: Performance 90+, Accessibility 98+, Best practices 95+, SEO 95+; largest paint 2.5 s or less, layout shift 0.05 or less, total download 2.5 MB or less. Performance and the timing numbers are warnings only; the other scores are hard targets in CI. CI runs this on the built files, not on the live site.

---

## 5) Roll back (Rollback)

**A) The new version has a mistake, but the site loads.** Upload an older zip from `releases/` exactly like section 3A (Extract, Overwrite, delete the zip). The old pages use the old `_next` and `img` files, which are still there because we never deleted them. Then run the live check (section 4). If you use GitHub (section 8), old zips are also downloadable from the Actions run page for 30 days.

**B) After an upload the site shows a 500 error (server error).** Most likely `.htaccess` is the cause.
1. File Manager > `public_html`. Right-click `.htaccess` > **Rename** > `.htaccess.off`. Reload the site. It should load again, without headers, caching and the custom 404 page.
2. Still 500? Do the same for `_next/static/.htaccess`, `img/.htaccess` and `og/.htaccess`.
3. Site is back. Now decide: rebuild with `HTACCESS_HEADER_SCOPE=success` in front of the build command (uses plain `Header set` instead of `Header always set`) and upload again; or upload the previous zip (5A). If it still fails, send Hostinger support the exact time of the error and ask for the server error log.
4. Do not leave `.htaccess.off` in place for long. Without `.htaccess` the site works but is less safe, and the check in section 4 will FAIL.

**C) Deployed with SSH or GitHub (3B or 8).** Go back one release:
```
ssh -p 65002 -i ~/.ssh/reelcraft_deploy u123456789@1.2.3.4 "DOCROOT='domains/your-domain.in/public_html' bash -s -- rollback" < deploy/release.sh
ssh -p 65002 -i ~/.ssh/reelcraft_deploy u123456789@1.2.3.4 "bash -s -- status" < deploy/release.sh
```
The second command shows which release is current, which is previous, and which are stored. Only one step back is possible (it swaps current and previous). To go further back, run the Deploy workflow by hand with an older `ref` (section 8).

---

## 6) Content changes

1. **Text, prices, contact details:** edit the files in `content/`.
   - `content/site.ts`: name, title, description, phone, e-mail, Instagram, menu links. The phone number is in **two** places: `phone` (shown) and `phoneHref` (used when tapped). Change both. Same for Instagram: `instagram` and `instagramUrl`.
   - `content/copy.ts`: about text, FAQ, plans, add-ons, booking steps. Prices are plain numbers (`18999`). The site shows them as `18,999`.
   - `content/images.ts`: which photo goes where, and its alt text (the text screen readers and Google read).
2. **Replace a photo:** put the new file in `assets-src/images/` with the **same file name** (for example `pre3.jpg`), or add a new file and register it in `scripts/images.config.mjs`. Run `npm run images` (it also runs by itself before `dev` and `build`). It makes the small AVIF/WebP/JPEG versions in `public/img/`, removes all hidden photo information (GPS, camera, Content Credentials) and rewrites `lib/generated/images.ts`. Then update the alt text in `content/images.ts`. The original photos in `assets-src/` are never uploaded.
3. **Hero slides:** `heroSlides` in `content/images.ts`. One slide = no arrows. Two or more = arrows appear.
4. **Look at it first:** `npm run dev`, then open http://localhost:3000. Press Ctrl+C to stop.
5. **Release it:** sections 2, 3, 4.
6. **Do not add things from other websites** (Instagram embeds, YouTube, Google Analytics or Fonts, chat widgets). The security policy blocks them, and the build check fails with "third-party resources". A developer must first change `CSP_DIRECTIVES` in `deploy/headers.mjs`.

---

## 7) If the CSP blocks something (debugging)

The release is built with an **enforced** CSP by default. Normally you never touch this section. Use it only if something (a photo, the menu, an animation) works on your computer but not on the live site.

**Know this first:** the CSP has no reporting address, so **nothing is sent to any server**. Blocked things show only in the console of the browser that opens the page.

1. Open the live site in Chrome on your computer. Press F12 (Mac: Cmd+Option+I), click the **Console** tab, reload the page.
2. Look for a red line that contains `Content Security Policy` or `Refused to load ...`. It names the blocked address and the rule (for example `img-src`).
   - **None:** the CSP is not the cause. Look at the troubleshooting table (section 10).
   - **Some:** copy the lines and send them to a developer. To bring the site back at once, do step 3.
3. Rebuild without blocking and upload it (section 3):
   ```
   NEXT_PUBLIC_SITE_URL=https://your-domain.in CSP_MODE=report-only npm run build:deploy
   node scripts/verify-out.mjs --live https://your-domain.in --csp-mode report-only
   ```
   Nothing is blocked now; the console shows messages that start with `[Report Only]`.
4. With GitHub (section 8): set the repository variable `CSP_MODE` to `report-only` temporarily. The next deploy uses it and the live check expects it. Delete the variable again once a developer has fixed the rule.

---

## 8) Optional: GitHub Actions auto-deploy

**What it does.** When you start it by hand (GitHub > Actions > Deploy > Run workflow, branch `main`), it builds the site, uploads it to Hostinger, checks the live site and, if that check fails, puts the previous release back.

**Warnings**
- **Deploys are manual on purpose.** Nothing goes live when you merge or push (including Dependabot pull requests, which open every Monday for npm packages and GitHub Actions, see `.github/dependabot.yml`). Wait until `ci.yml` (typecheck, lint, build, verify, npm audit, browser tests, Lighthouse) is green on `main`, then press Run workflow. Only the `main` branch can be deployed; other branches are refused.
- Deploy runs its own typecheck, lint, build and verify, but not the browser tests or Lighthouse. That is why CI must be green first.
- The SSH key can reach your whole hosting account. Use a private repository and a key made only for this.

**Everything the workflows use**

| Name | Kind | Needed? | Used by | Value |
|---|---|---|---|---|
| `SITE_URL` | Variable | Deploy: yes. CI: optional (falls back to a placeholder that CI accepts) | `ci.yml`, `deploy.yml` (build, smoke) | `https://your-domain.in` |
| `HOSTINGER_DOCROOT` | Variable | Yes | `deploy.yml` (cloud, rollback) | `domains/your-domain.in/public_html`, relative to your home folder (or `public_html`) |
| `CSP_MODE` | Variable | No (default `enforce`) | `deploy.yml` (build, smoke) | `enforce` or `report-only` (debugging) |
| `DEPLOY_VPS` | Variable | No. The VPS job runs only if this is exactly `true` | `deploy.yml` (vps) | `true` |
| `VPS_SSH_PORT` | Variable | No (default 22) | `deploy.yml` (vps) | `22` |
| `HOSTINGER_SSH_HOST` | Secret | Yes | cloud, rollback | IP from hPanel SSH Access |
| `HOSTINGER_SSH_USER` | Secret | Yes | cloud, rollback | `u123456789` |
| `HOSTINGER_SSH_KEY` | Secret | Yes | cloud, rollback | the whole private key file, including the BEGIN and END lines |
| `HOSTINGER_KNOWN_HOSTS` | Secret | Yes | cloud, rollback | output of `ssh-keyscan` (step 5 below) |
| `VPS_SSH_HOST`, `VPS_SSH_USER`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS` | Secrets | Only with `DEPLOY_VPS=true` | vps | as above, for the VPS |

Fixed inside `deploy.yml` (not variables): SSH port `65002` (line 32) and the VPS folder `/var/www/reelcraft`. If hPanel shows another port, ask a developer to change line 32. The comments in `deploy.yml` call this part "section 6" and the VPS part "section 7". They mean sections 8 and 9 of this guide.

**One-time setup**
1. Create a **private**, empty repository on GitHub. Do not push yet. (`git remote -v` in the project folder printing nothing means the project is not on GitHub yet.)
2. Repository > **Settings > Secrets and variables > Actions > Variables tab**: add `SITE_URL`, `HOSTINGER_DOCROOT` (and `CSP_MODE` if you want).
3. **Settings > Environments > New environment**, name it exactly `production`. Add the four `HOSTINGER_*` secrets there. If your GitHub plan has no Environments for private repositories, add them under **Secrets** at repository level instead.
4. Make the key pair and add the public key in hPanel (section 1.8). Copy the private key into `HOSTINGER_SSH_KEY`: `pbcopy < ~/.ssh/reelcraft_deploy` (Mac), then paste.
5. Known hosts (lets GitHub be sure it talks to the real Hostinger server). Use the **same** host text as in `HOSTINGER_SSH_HOST`, and your port. Paste the whole output into `HOSTINGER_KNOWN_HOSTS`:
   ```
   ssh-keyscan -p 65002 1.2.3.4
   ```
6. Connect and push: `git remote add origin <your repository address>`, then `git push -u origin main`. This first push starts CI and Deploy.
7. Watch **Actions > Deploy**. Later, to deploy by hand or to deploy an old version: **Actions > Deploy > Run workflow**, and type a branch, tag or commit in `ref`.

**What the jobs do**
1. **Build release:** stops at once if `SITE_URL` is missing. Runs `npm ci` and `npm run build:deploy`. Keeps the built site (14 days) and the zip (30 days) as downloads on the run page. That zip can be uploaded by hand (section 3A).
2. **Publish to Hostinger:** uploads to `~/releases/<commit>` and runs `release.sh activate`. Keeps the 5 newest releases.
3. **Check the live site:** runs `node scripts/verify-out.mjs --live` up to 3 times, 30 seconds apart.
4. **Roll back:** runs only if the check fails. Runs `release.sh rollback`. The run stays red on purpose. On the very first deploy there is no previous release, so this job fails and the new release stays live.
5. **Publish to VPS:** only when `DEPLOY_VPS` is `true` (section 9). No live check, no automatic rollback.

The first deploy through GitHub only adds files. Later deploys remove only the files the previous release added and the new one no longer has (section 3B).

---

## 9) Optional: VPS/Nginx

The VPS is a second copy or a later move. A domain points to one server at a time. The VPS only serves the domain after you change the domain's DNS A record to the VPS IP. Nothing here is needed for the Hostinger hosting to work. Commands run on the VPS as `root` unless it says "on your computer".

1. **Install Nginx.** `apt install nginx`. Any version from 1.9.5 works (Ubuntu 24.04's 1.24 is fine). Newer versions print a harmless `listen ... http2 is deprecated` warning in `nginx -t`.
2. **Make the config files on your computer** (Node is on your computer; the VPS does not need it), then copy them up. There are two versions of the site file because Nginx will not start with a certificate file that does not exist yet: a small HTTP-only one to get the certificate, and the full one for afterwards.
   ```
   node deploy/render.mjs nginx-headers > reelcraft-headers.conf
   node deploy/render.mjs nginx --domain your-domain.in --bootstrap > reelcraft-bootstrap.conf
   node deploy/render.mjs nginx --domain your-domain.in > reelcraft.conf
   scp reelcraft-headers.conf reelcraft-bootstrap.conf reelcraft.conf root@1.2.3.4:/root/
   ```
   The default CSP is enforce; add `--csp-mode report-only` to each command only for debugging (section 7). The VPS CSP mode is fixed in these files, not by the GitHub variable.
3. **Start with the HTTP-only file and get the certificate.** Both `your-domain.in` and `www.your-domain.in` must already point to the VPS.
   ```
   apt install certbot rsync          # rsync is needed later, by the deploy
   mkdir -p /etc/nginx/snippets /var/www/letsencrypt
   mv /root/reelcraft-headers.conf /etc/nginx/snippets/reelcraft-headers.conf
   mv /root/reelcraft-bootstrap.conf /etc/nginx/sites-available/reelcraft
   ln -s /etc/nginx/sites-available/reelcraft /etc/nginx/sites-enabled/reelcraft
   nginx -t && systemctl reload nginx
   certbot certonly --webroot -w /var/www/letsencrypt -d your-domain.in -d www.your-domain.in
   ```
   If your Nginx came from nginx.org there is no `sites-available`. Put the file at `/etc/nginx/conf.d/reelcraft.conf` instead (and skip the `ln`). Renewals work while Nginx runs; make Nginx pick up the new certificate, then test:
   ```
   mkdir -p /etc/letsencrypt/renewal-hooks/deploy
   printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
   chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
   certbot renew --dry-run
   ```
4. **Switch to the full file.**
   ```
   mv /root/reelcraft.conf /etc/nginx/sites-available/reelcraft      # (or /etc/nginx/conf.d/reelcraft.conf)
   nginx -t && systemctl reload nginx
   ```
5. **A deploy user and folders.** The deploy user may run only two commands as root.
   ```
   adduser --disabled-password --gecos "" deploy
   mkdir -p /var/www/reelcraft/releases /home/deploy/.ssh
   chown -R deploy:deploy /var/www/reelcraft
   # paste the .pub text of the VPS key into this file:
   nano /home/deploy/.ssh/authorized_keys
   chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
   command -v nginx systemctl        # note the two paths
   visudo -f /etc/sudoers.d/reelcraft-deploy
   ```
   Put this one line in the sudoers file (use the paths printed above):
   `deploy ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /usr/bin/systemctl reload nginx`
   Do **not** create `/var/www/reelcraft/current` yourself. The deploy makes it as a link to the newest release.
6. **First deploy by hand** (on your computer, after `npm run build:deploy`). This is what the workflow's vps job does. If the deploy key is not your default SSH key, add `-i <key file>` to `ssh` and `-e "ssh -i <key file>"` to `rsync`:
   ```
   SHA=$(git rev-parse HEAD)
   ssh deploy@1.2.3.4 "mkdir -p /var/www/reelcraft/releases/$SHA"
   rsync -az --delete out/ deploy@1.2.3.4:/var/www/reelcraft/releases/$SHA/
   ssh deploy@1.2.3.4 "cd /var/www/reelcraft && ln -sfn releases/$SHA current.new && mv -Tf current.new current && sudo -n nginx -t && sudo -n systemctl reload nginx"
   ```
7. **Automatic:** add the variable `DEPLOY_VPS` = `true` and the secrets `VPS_SSH_HOST`, `VPS_SSH_USER` (`deploy`), `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS` (`ssh-keyscan 1.2.3.4`). Add `VPS_SSH_PORT` only if SSH is not on 22.
8. **Test before you change DNS:** `curl -I --resolve your-domain.in:443:1.2.3.4 https://your-domain.in/` should show `200` and the security headers.
9. **Roll back on the VPS:** `ssh deploy@1.2.3.4`, then `cd /var/www/reelcraft && ls -1t releases`. Pick an older folder: `ln -sfn releases/<older> current.new && mv -Tf current.new current && sudo -n systemctl reload nginx`. The workflow keeps the newest 5 releases.

---

## 10) Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL is not set` | Address missing in front of the command | `NEXT_PUBLIC_SITE_URL=https://your-domain.in npm run build:deploy` |
| `is not usable for a production build` | localhost, `example.com`, `http://`, or a `/path` in the address | Use `https://your-domain.in`, nothing after the domain |
| `Dependencies are not installed` | `npm ci` never ran | `npm ci` |
| `The zip command is not available` | Windows without WSL | Use WSL (Linux inside Windows) |
| `warning: running Node 24 ... targets 22` | Wrong Node version | `nvm use`. Below Node 20 it stops. |
| Typecheck, Lint or Build failed | A code mistake | Send the printed error to a developer. Nothing was uploaded. |
| Verify FAIL: `third-party resources` | A link, script or font from another site was added | Remove it (section 6.6) |
| Verify FAIL: `out/img ... exceed 250 KB` or total too big | Photo files too large | Use smaller or fewer photos, run `npm run images` again |
| Verify FAIL: `C2PA / Content Credentials` | A photo carries hidden AI/edit credentials | Re-export the original without metadata, put it in `assets-src/images/` |
| Verify FAIL: `canonical origin differs` | Old build or wrong address | Build again with the right `NEXT_PUBLIC_SITE_URL` |
| Site shows a 500 error after upload | A bad `.htaccess` (or `Header always` not accepted) | Section 5B |
| Old version still shows | Browser cache, CDN, or the zip was not extracted with Overwrite in the right folder | Hard refresh (Cmd+Shift+R). Check the file time of `public_html/index.html`. Purge the CDN. Extract again. |
| Hostinger placeholder page, or a folder named like the zip | The files went into the wrong folder | Extract into `public_html` itself. Move the files up. |
| Page loads without styles or photos | `_next` or `img` missing or not extracted | Extract the zip again. Check that `_next/static` and `img` exist. |
| Cannot see `.htaccess` | Hidden files are off | Section 1.6 |
| Live check FAIL: `/.htaccess -> 200` | `.htaccess` is not active on this server | Check it is in the right `public_html`. Then ask Hostinger support. |
| Live check: security headers missing on the 404 page | Server ignores `Header always set` | Rebuild with `HTACCESS_HEADER_SCOPE=success` (the 404 page then has no headers) |
| Live check FAIL: HTML is not compressed | Compression is off on the host or CDN | Ask Hostinger support to enable gzip/brotli |
| Live check: `http://` does not jump to `https://` | Force HTTPS is off, or our upload replaced a rule that Force HTTPS wrote into `.htaccess` | hPanel: switch **Force HTTPS** off and on. Do not add redirect rules to `.htaccess`. |
| Browser says "too many redirects" | A second https or www redirect exists | Remove the extra rule. Keep only hPanel's **Force HTTPS**. |
| Actions: `Repository variable SITE_URL is not set` | Variable missing | Section 8, step 2 |
| Actions: `Host key verification failed` | `HOSTINGER_KNOWN_HOSTS` does not match the host or port | Run `ssh-keyscan -p <port> <same host as HOSTINGER_SSH_HOST>` again and paste the whole output |
| Actions: `Permission denied (publickey)` | Public key not in hPanel, SSH not enabled, or the secret is incomplete | Section 1.8. The secret needs the full private key with BEGIN and END lines. |
| Actions: `DOCROOT ... is not a directory` | Wrong `HOSTINGER_DOCROOT` | Use the path from section 1.5, relative to your home folder |
| Actions: check failed and "Roll back" ran | The new release failed the live check; the old one is back | Read the "Check the live site" log, fix, push again. The run stays red on purpose. |
| Actions: rollback says `no previous release recorded` | This was the very first deploy | Fix the problem and deploy again |
| Actions: files or subdomain folders vanished | Should not happen: only the previous release's own files are removed | Set `HOSTINGER_DOCROOT` correctly, restore from a Hostinger backup, and tell a developer (`tests/unit/release-sh.spec.ts` covers this). |
| Nginx: `cannot load certificate` | The full site file was installed before the certificate exists | Install the HTTP-only file first and get the certificate (section 9, steps 2 and 3), then the full file (step 4) |

---

## 11) Verified vs assumed vs untested

How the labels are used: **VERIFIED FROM DOCS** = I opened that page during this task. **ASSUMED** = believed true, not checked. **UNTESTED** = a real server or workflow run is needed. Nothing below was tried on a real Hostinger account or on GitHub. What the scripts and workflows do was read from the files in this repository.

| Claim | Status | Source or note |
|---|---|---|
| Hostinger uses LiteSpeed as its web server, a drop-in Apache replacement that reads `.htaccess` | VERIFIED FROM DOCS | https://www.hostinger.com/blog/introducing-litespeed/ |
| A file named `.htaccess` in `public_html` is used; File Manager shows dotfiles by default | VERIFIED FROM DOCS | https://www.hostinger.com/support/1583307-how-to-create-an-htaccess-file/ (the exact name of a "show hidden files" setting: ASSUMED) |
| SSL: **Security > SSL > Install SSL**, status Active, Force HTTPS toggle | VERIFIED FROM DOCS | https://docs.hostinger.com/websites/ssl |
| Force HTTPS: three-dots menu next to the domain > **Force HTTPS** | VERIFIED FROM DOCS | https://www.hostinger.com/support/1583201-how-to-enable-or-disable-https-for-your-website-at-hostinger/ |
| Force HTTPS works at server level and survives replacing `.htaccess` | UNTESTED | The page does not say. The live check tests the redirect (section 4). |
| SSH is on Premium/Business/Cloud, not on Single plans | VERIFIED FROM DOCS | https://www.hostinger.com/support/1583645-how-to-enable-ssh-access-in-hostinger/ |
| SSH port is 65002 on shared/cloud | VERIFIED FROM DOCS, but conflicting | https://www.hostinger.com/support/how-to-use-rsync-to-sync-files-and-directories-at-hostinger/ says 65002 and "verify the port in hPanel". https://docs.hostinger.com/websites/ftp-ssh says 22. `deploy.yml` hard-codes 65002. |
| Add a public key in hPanel: SSH Access > Add SSH key | VERIFIED FROM DOCS | https://www.hostinger.com/support/5634532-how-to-generate-ssh-keys-and-add-them-to-hostinger-hpanel/ |
| rsync works over SSH on shared/cloud; path like `/home/u123456789/domains/domain.com/public_html/` | VERIFIED FROM DOCS | rsync page above |
| Docroot is `public_html` or `domains/<domain>/public_html` | VERIFIED FROM DOCS | https://www.hostinger.com/support/1583494-what-is-the-path-to-your-website-s-root-home-directory-and-how-to-change-it-in-hostinger/ |
| File Manager: right-click zip > Extract, choose destination, "Overwrite existing files" box | VERIFIED FROM DOCS | https://www.hostinger.com/support/1583613-how-to-extract-archives-using-the-file-manager-in-hostinger/ |
| Extract keeps dotfiles from the zip (`.htaccess`) | UNTESTED | Docs are silent. Section 3A step 6 and the live check catch it. |
| Node.js web app creates and regenerates its own `.htaccess` in `public_html` (Business/Cloud) | VERIFIED FROM DOCS | https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/ |
| Subdomain folders sit inside `public_html` by default | ASSUMED | https://www.hostinger.com/support/1583405-how-to-create-and-delete-subdomains-in-hostinger/ says "a subfolder inside the website's main directory", not "public_html" exactly. Not a risk for our deploys: `release.sh` never deletes files it did not put there. |
| LiteSpeed accepts `Header set` in `.htaccess` | VERIFIED FROM DOCS | https://docs.litespeedtech.com/lsws/security-headers/ |
| LiteSpeed accepts `Header always set` (our default) | UNTESTED | That page shows only `Header set`. Fallback: `HTACCESS_HEADER_SCOPE=success`. The live check looks at the 404 page headers. |
| Dotfile-block `RewriteRule` (with a lookahead), `ErrorDocument 404 /404.html`, per-folder `.htaccess` cache files behave on Hostinger | UNTESTED | The live check tests each result. |
| Server-level gzip/brotli on Hostinger | ASSUMED | The live check FAILs if HTML is not compressed. |
| Hostinger cache/CDN can be purged in hPanel | ASSUMED | Menu names not checked. |
| `www` and non-`www` both work and one redirects to the other | UNTESTED | The site's `.htaccess` has no such rule. Check both by hand (section 4). |
| `http2 on;` needs Nginx 1.25.1 or newer, so the template uses `listen 443 ssl http2;`, which works on old and new versions (newer ones only warn it is deprecated) | VERIFIED FROM DOCS | https://nginx.org/en/docs/http/ngx_http_v2_module.html |
| Ubuntu 24.04 ships Nginx 1.24.0 | VERIFIED FROM DOCS | https://packages.ubuntu.com/noble/nginx |
| nginx.org has its own apt repository for Ubuntu/Debian | VERIFIED FROM DOCS | https://nginx.org/en/linux_packages.html |
| nginx.org packages use `conf.d/` and have no `sites-available` | ASSUMED | Typical layout, not checked here |
| Certbot `--webroot` renewals run while Nginx is up; hook scripts in `renewal-hooks/deploy/` persist; most installs renew automatically | VERIFIED FROM DOCS | https://eff-certbot.readthedocs.io/en/stable/using.html (that renewal is scheduled on your VPS, and the bootstrap-then-full flow of section 9: UNTESTED on a real VPS) |
| The whole VPS flow (deploy user, sudoers line, symlink swap, certbot hooks) | UNTESTED | Written from `deploy.yml` and the template. Never run. |
| `ci.yml` and `deploy.yml` run green end to end | UNTESTED | Never run. Only read. `release.sh` passes `bash -n`. The two `--help` outputs were run. |
| GitHub Environments work for a private repo on your plan; repository-level secrets are also visible to jobs that name an environment | ASSUMED | Not checked |
| Chrome shows CSP report-only messages in the console starting with `[Report Only]` | ASSUMED | From memory, not fetched |
