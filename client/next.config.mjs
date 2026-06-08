import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'src/sw.js',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

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

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {},

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

export default withSerwist(nextConfig);
