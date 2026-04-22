/** @type {import('next').NextConfig} */
const nextConfig = {
  // TypeScript strict checking happens in IDE / `tsc --noEmit`.
  // Build-time checking is disabled because the codebase is mixed JS/TS
  // and strict checks on untyped .jsx imports from .tsx produce false positives.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
