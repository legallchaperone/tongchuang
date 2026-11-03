import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
// a fresh id for every deploy: Vercel's commit sha, or the build time locally
const build = (process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now().toString(36)}`).slice(0, 12);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version, NEXT_PUBLIC_BUILD_ID: build },
};
export default nextConfig;
