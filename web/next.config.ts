import type { NextConfig } from 'next';
import { fileURLToPath } from 'url';
import path from 'path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Prevent Next from "guessing" the monorepo root incorrectly (we have a separate lockfile at repo root).
  // NOTE: On Windows, `.pathname` yields `/C:/...` which can break resolution; use fileURLToPath.
  outputFileTracingRoot: path.resolve(fileURLToPath(new URL('.', import.meta.url))),
  webpack: (config, { dev }) => {
    // Windows can get flaky with persistent webpack pack caching (file locks/partial writes).
    // Disabling cache in dev avoids “Cannot find module ./411.js” and ENOENT pack rename errors.
    if (dev) config.cache = false;
    return config;
  },
};

export default nextConfig;

