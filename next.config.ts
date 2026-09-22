import type { NextConfig } from "next";

/**
 * Fully static site: `next build` writes the deployable folder to `out/`.
 * `images` is intentionally not configured, so an accidental `next/image`
 * (which needs a server) fails the build instead of breaking in production.
 * HTTP headers cannot be set here under `output: "export"`; they live in
 * `deploy/` and are emitted into `out/.htaccess` by `npm run build:deploy`.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
};

export default nextConfig;
