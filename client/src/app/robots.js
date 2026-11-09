import { getSiteOrigin } from '@/lib/seo/site-config';

/** @returns {import('next').MetadataRoute.Robots} */
export default function robots() {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: `${getSiteOrigin()}/sitemap.xml`,
  };
}
