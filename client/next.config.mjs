import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'src/sw.js',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

function parseAllowedAncestors(raw) {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function buildFrameAncestorsCsp(ancestors) {
  if (ancestors.includes('*')) return 'frame-ancestors *';
  return `frame-ancestors 'self' ${ancestors.join(' ')}`;
}

const allowedAncestors = parseAllowedAncestors(process.env.ALLOWED_FRAME_ANCESTORS);

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {},

  async headers() {
    const rules = [
      // Public widget — embeddable on any parent site
      {
        source: '/widget/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
        ],
      },
    ];

    // Full app — only embeddable on configured parent origins
    if (allowedAncestors.length > 0) {
      rules.push({
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: buildFrameAncestorsCsp(allowedAncestors) },
        ],
      });
    }

    return rules;
  },
};

export default withSerwist(nextConfig);
