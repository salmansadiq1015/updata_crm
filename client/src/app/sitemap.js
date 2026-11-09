import { getCanonicalUrl, PUBLIC_PAGE_PATHS } from '@/lib/seo/site-config';

/** @returns {import('next').MetadataRoute.Sitemap} */
export default function sitemap() {
  // No build-time lastmod: only add it when genuine content revision dates exist.
  return PUBLIC_PAGE_PATHS.map(path => ({ url: getCanonicalUrl(path) }));
}
