import type { Page } from "@playwright/test";

export const KB = 1024;
export const MB = 1024 * KB;

export const formatBytes = (bytes: number): string =>
  bytes >= MB ? `${(bytes / MB).toFixed(2)} MB` : `${(bytes / KB).toFixed(1)} KB`;

/** The static server the tests talk to. Anything else is a third-party request. */
export const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export interface PageProbe {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  badResponses: string[];
  requestedUrls: string[];
}

/** Starts collecting problems on a page. Call before page.goto(). */
export function probePage(page: Page): PageProbe {
  const probe: PageProbe = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    badResponses: [],
    requestedUrls: [],
  };
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const { url } = message.location();
    probe.consoleErrors.push(url ? `${message.text()} (${url})` : message.text());
  });
  page.on("pageerror", (error) => probe.pageErrors.push(error.message));
  page.on("request", (request) => probe.requestedUrls.push(request.url()));
  page.on("requestfailed", (request) => {
    const reason = request.failure()?.errorText ?? "unknown error";
    // The browser cancelling a request (navigation, lazy image scrolled away) is not a failure.
    if (reason === "net::ERR_ABORTED") return;
    probe.failedRequests.push(`${request.method()} ${request.url()} - ${reason}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) probe.badResponses.push(`${response.status()} ${response.url()}`);
  });
  return probe;
}

/** Host names in `urls` that are not the local test server (data:/blob: URLs are ignored). */
export function foreignHosts(urls: string[]): string[] {
  const hosts = new Set<string>();
  for (const raw of urls) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (["data:", "blob:", "about:"].includes(url.protocol)) continue;
    if (!LOCAL_HOSTS.has(url.hostname)) hosts.add(url.hostname || url.protocol);
  }
  return [...hosts];
}

/** Scrolls top to bottom in viewport-sized steps so lazy images and scroll-driven code run. */
export async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const step = Math.max(240, Math.round(window.innerHeight * 0.75));
    let y = 0;
    for (let i = 0; i < 300; i++) {
      window.scrollTo({ top: y, behavior: "instant" });
      await sleep(140);
      // Re-read the height each time: pinned sections and accordions change it while scrolling.
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (y >= max) break;
      y = Math.min(y + step, max);
    }
  });
}

export async function scrollToTop(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
}

/** Waits until the page has stopped loading things (fine for a static site). */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await page.waitForLoadState("networkidle", { timeout: 20_000 });
}

/** Sums the bytes of every image response (network transfer, not decoded size). */
export function trackImageBytes(page: Page) {
  const pending: Promise<void>[] = [];
  const sizes = new Map<string, number>();

  page.on("response", (response) => {
    const type = response.request().resourceType();
    const contentType = response.headers()["content-type"] ?? "";
    if (type !== "image" && !contentType.startsWith("image/")) return;
    pending.push(
      (async () => {
        let bytes = 0;
        try {
          await response.finished();
          bytes = (await response.request().sizes()).responseBodySize;
        } catch {
          // fall through to Content-Length
        }
        if (!bytes) bytes = Number(response.headers()["content-length"] ?? 0) || 0;
        sizes.set(response.url(), Math.max(sizes.get(response.url()) ?? 0, bytes));
      })(),
    );
  });

  return {
    /** Total bytes of all image responses seen so far. */
    async total(): Promise<number> {
      await Promise.all(pending);
      return [...sizes.values()].reduce((sum, n) => sum + n, 0);
    },
    /** Human-readable list of the heaviest images, for failure messages and attachments. */
    async report(limit = 12): Promise<string> {
      await Promise.all(pending);
      return [...sizes.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([url, bytes]) => `${formatBytes(bytes).padStart(9)}  ${new URL(url).pathname}`)
        .join("\n");
    },
    get count(): number {
      return sizes.size;
    },
  };
}
