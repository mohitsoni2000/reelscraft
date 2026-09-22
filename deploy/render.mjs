#!/usr/bin/env node
/**
 * Renders the server configuration from deploy/headers.mjs.
 *
 *   node deploy/render.mjs htaccess [--out out] [--csp-mode report-only|enforce]
 *       with --out: writes out/.htaccess (+ _next/static, img, og) ; without: prints the root file
 *   node deploy/render.mjs nginx-headers [--csp-mode ...]
 *   node deploy/render.mjs nginx --domain example.in [--root /var/www/reelcraft/current] [--csp-mode ...] [--bootstrap]
 *       --bootstrap: HTTP-only file, so `nginx -t` passes before the first certificate exists
 *
 * Defaults: CSP mode from env CSP_MODE (else enforce); header scope from env HTACCESS_HEADER_SCOPE.
 */
import {
  renderHtaccess,
  renderNginxConf,
  renderNginxHeadersSnippet,
  writeHtaccessFiles,
} from "./headers.mjs";

const USAGE = `Usage:
  node deploy/render.mjs htaccess [--out <dir>] [--csp-mode report-only|enforce]
  node deploy/render.mjs nginx-headers [--csp-mode report-only|enforce]
  node deploy/render.mjs nginx --domain <host> [--root <path>] [--csp-mode report-only|enforce] [--bootstrap]`;

function parse(argv) {
  const [command, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument "${arg}"`);
    if (arg === "--bootstrap") {
      opts.bootstrap = true;
      continue;
    }
    const eq = arg.indexOf("=");
    const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const value = eq === -1 ? rest[++i] : arg.slice(eq + 1);
    if (value === undefined) throw new Error(`Missing value for --${key}`);
    opts[key] = value;
  }
  return { command, opts };
}

try {
  const { command, opts } = parse(process.argv.slice(2));
  const common = { cspMode: opts["csp-mode"] };
  switch (command) {
    case "htaccess": {
      if (opts.out) {
        const { written, skipped } = writeHtaccessFiles(opts.out, common);
        for (const file of written) console.log(`wrote ${opts.out}/${file}`);
        for (const dir of skipped) console.warn(`skipped ${dir}/.htaccess (directory ${opts.out}/${dir} does not exist)`);
      } else {
        process.stdout.write(renderHtaccess(common));
      }
      break;
    }
    case "nginx-headers":
      process.stdout.write(renderNginxHeadersSnippet(common));
      break;
    case "nginx":
      process.stdout.write(renderNginxConf({ ...common, domain: opts.domain, root: opts.root, bootstrap: opts.bootstrap }));
      break;
    default:
      console.error(USAGE);
      process.exitCode = command ? 2 : 0;
  }
} catch (error) {
  console.error(`render: ${error.message}\n\n${USAGE}`);
  process.exitCode = 2;
}
