import helmet from 'helmet';

/**
 * Security headers via Helmet.
 * Cross-origin settings relaxed for API consumption by web + mobile clients.
 */
export const securityHeaders = helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: false, // API-only server, no HTML to protect
});

export default securityHeaders;
