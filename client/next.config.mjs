import { execSync } from 'node:child_process';

// TODO: PWA cleanup complete. Remove these unused deps from package.json:
//   - "@serwist/next" (dependencies)
//   - "serwist" (dependencies)
// Also remove cleanupDevelopmentServiceWorkers() from app-providers.jsx
// once all users have cleared their cached service workers.

const EMBED_PARENT_ORIGINS = [
  'https://appnity.ch',
  'https://www.appnity.ch',
];

function parseAllowedAncestors(raw) {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function buildFrameAncestorsCsp(ancestors) {
  if (ancestors.includes('*')) return 'frame-ancestors *';
  return `frame-ancestors 'self' ${ancestors.join(' ')}`;
}

const envAncestors = parseAllowedAncestors(process.env.ALLOWED_FRAME_ANCESTORS);
const allowedAncestors = [...new Set([...EMBED_PARENT_ORIGINS, ...envAncestors])];

const apiProxyTarget = (process.env.API_PROXY_TARGET || 'http://127.0.0.1:9097').replace(/\/$/, '');

/**
 * Which version of the code this bundle is.
 *
 * Read from git when the bundle is built, and baked in — so the badge in the
 * sidebar names the commit the running application was built from, wherever it
 * runs. A build is what makes a version, which is why the timestamp is the
 * build's and not the commit's: two deployments of the same commit are two
 * different things on a server, and the commit date could not tell them apart.
 *
 * Every step falls back rather than failing. A build machine without git, or a
 * directory copied without its .git, must produce an application — not a build
 * error over a line of small grey text. An environment variable wins over git,
 * so a build pipeline that knows the commit can say so directly.
 */
function readGit(command, fallback = '') {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
}

const gitCommit = process.env.NEXT_PUBLIC_GIT_COMMIT
  || readGit('git rev-parse --short=7 HEAD', 'unknown');
const gitBranch = process.env.NEXT_PUBLIC_GIT_BRANCH
  || readGit('git rev-parse --abbrev-ref HEAD', '');
const gitCommittedAt = process.env.NEXT_PUBLIC_GIT_COMMITTED_AT
  || readGit('git log -1 --format=%cI', '');
// A working tree with uncommitted changes is not the commit it says it is.
const gitDirty = process.env.NEXT_PUBLIC_GIT_DIRTY || (readGit('git status --porcelain') ? '1' : '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow isolated QA builds without touching a running development server.
  distDir: process.env.UPDATA_NEXT_DIST_DIR || '.next',
  // Inlined into the client bundle at build time. Nothing secret: a commit
  // hash of a private repository identifies a version, it does not open one.
  env: {
    NEXT_PUBLIC_GIT_COMMIT: gitCommit,
    NEXT_PUBLIC_GIT_BRANCH: gitBranch,
    NEXT_PUBLIC_GIT_COMMITTED_AT: gitCommittedAt,
    NEXT_PUBLIC_GIT_DIRTY: gitDirty,
    NEXT_PUBLIC_BUILT_AT: new Date().toISOString(),
  },

  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {},

  async redirects() {
    return [
      {
        source: '/field-ops',
        destination: '/field-ops/orders',
        permanent: false,
      },
    ];
  },

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyTarget}/api/:path*`,
      },
      {
        source: '/socket.io/:path*',
        destination: `${apiProxyTarget}/socket.io/:path*`,
      },
    ];
  },

  async headers() {
    const rules = [
      // Public widget — embeddable on any parent site
      {
        source: '/widget/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
        ],
      },
      // Full app — embeddable on appnity.ch (+ optional extra origins from env)
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: buildFrameAncestorsCsp(allowedAncestors) },
        ],
      },
    ];

    return rules;
  },
};

export default nextConfig;
