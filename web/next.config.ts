import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Prevent Next from "guessing" the monorepo root incorrectly (we have a separate lockfile at repo root).
  outputFileTracingRoot: new URL('.', import.meta.url).pathname,
};

export default nextConfig;

