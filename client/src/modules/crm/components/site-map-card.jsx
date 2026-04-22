'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { MapPin, ExternalLink } from 'lucide-react';

/**
 * Lightweight map card using OpenStreetMap embed.
 *
 * Why not Leaflet / Mapbox:
 *   - No extra bundle weight (the <iframe> is lazy + browser-cached)
 *   - No API key required
 *   - Works offline-first via tile CDN
 *
 * When coords are missing but we have a postal address, we fall back to
 * OSM's text search — still useful, just less precise.
 */
export function SiteMapCard({ site }) {
  const { t } = useLanguage();

  if (!site) return null;

  const hasCoords = Number.isFinite(site.latitude) && Number.isFinite(site.longitude);
  const hasAddress = !!(site.street || site.postalCode || site.city);
  if (!hasCoords && !hasAddress) return null;

  const title = t('crm.siteMap', 'Location');

  const { src, openUrl } = buildMapUrls(site, { hasCoords });

  return (
    <Card>
      <CardContent className="p-0 overflow-hidden rounded-lg">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium">{title}</span>
            {!hasCoords && (
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                {t('crm.siteMapApprox', 'Approximate')}
              </span>
            )}
          </div>
          <Button asChild variant="ghost" size="sm" className="h-7 gap-1 text-xs">
            <a href={openUrl} target="_blank" rel="noopener noreferrer">
              {t('crm.openInMaps', 'Open map')}
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        </div>
        <iframe
          title={title}
          src={src}
          className="w-full h-64 border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </CardContent>
    </Card>
  );
}

function buildMapUrls(site, { hasCoords }) {
  if (hasCoords) {
    const lat = site.latitude;
    const lng = site.longitude;
    const pad = 0.005;
    const bbox = [lng - pad, lat - pad, lng + pad, lat + pad].join('%2C');
    return {
      src: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`,
      openUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`,
    };
  }

  const query = [site.street, site.postalCode, site.city, site.country || 'CH']
    .filter(Boolean)
    .join(', ');
  const encoded = encodeURIComponent(query);
  return {
    src: `https://www.openstreetmap.org/export/embed.html?bbox=8.50%2C47.36%2C8.57%2C47.40&layer=mapnik`,
    openUrl: `https://www.openstreetmap.org/search?query=${encoded}`,
  };
}
