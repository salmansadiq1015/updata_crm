'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { MapPin, Navigation } from 'lucide-react';

/**
 * Google Maps directions link for a site. Universal link: on mobile the
 * installed Google Maps app intercepts it and starts navigation directly;
 * otherwise Google Maps opens in the browser.
 */
export function buildGoogleMapsUrl(site) {
  if (!site) return null;
  const hasCoords = Number.isFinite(site.latitude) && Number.isFinite(site.longitude);
  const destination = hasCoords
    ? `${site.latitude},${site.longitude}`
    : [site.street, site.postalCode, site.city, site.country || 'CH'].filter(Boolean).join(', ');
  if (!destination) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/**
 * Lightweight map card using OpenStreetMap embed.
 *
 * Why not Leaflet / Mapbox:
 *   - No extra bundle weight (the <iframe> is lazy + browser-cached)
 *   - No API key required
 *   - Works offline-first via tile CDN
 *
 * When coords are missing but we have a postal address, we fall back to
 * a city-level default view — still useful, just less precise.
 */
export function SiteMapCard({ site }) {
  const { t } = useLanguage();

  if (!site) return null;

  const hasCoords = Number.isFinite(site.latitude) && Number.isFinite(site.longitude);
  const hasAddress = !!(site.street || site.postalCode || site.city);
  if (!hasCoords && !hasAddress) return null;

  const title = t('crm.siteMap', 'Location');

  const src = buildEmbedSrc(site, { hasCoords });
  const routeUrl = buildGoogleMapsUrl(site);

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
          {routeUrl && (
            <Button asChild size="sm" className="h-7 gap-1.5 text-xs">
              <a href={routeUrl} target="_blank" rel="noopener noreferrer">
                <Navigation className="h-3 w-3" />
                {t('crm.siteRoute', 'Route')}
              </a>
            </Button>
          )}
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

function buildEmbedSrc(site, { hasCoords }) {
  if (hasCoords) {
    const lat = site.latitude;
    const lng = site.longitude;
    const pad = 0.005;
    const bbox = [lng - pad, lat - pad, lng + pad, lat + pad].join('%2C');
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
  }
  return 'https://www.openstreetmap.org/export/embed.html?bbox=8.50%2C47.36%2C8.57%2C47.40&layer=mapnik';
}
