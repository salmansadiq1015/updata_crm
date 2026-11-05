import React from 'react';
export type IconName = 'arrow' | 'check' | 'chevron' | 'close' | 'download' | 'eye' | 'eye-off' | 'history' | 'moon' | 'search' | 'settings' | 'spark' | 'sun' | 'target' | 'users' | 'pin' | 'building' | 'restaurant' | 'hotel' | 'health' | 'retail' | 'shield' | 'sync' | 'logout' | 'filter' | 'alert';

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, string> = {
    pin: 'M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z', building: 'M4 21V5l8-2v18M12 9h8v12M2 21h20M7 7h2M7 11h2M7 15h2M15 12h2M15 16h2', restaurant: 'M4 3v6a3 3 0 0 0 6 0V3M7 3v18M19 21V3c-4 2-5 8 0 9', hotel: 'M3 21V5h18v16M3 12h18M7 8h3M14 8h3M7 16h3M14 16h3', health: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z', retail: 'M4 9h16l-2-6H6ZM5 9v12h14V9M9 21v-7h6v7', shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6', sync: 'M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5', logout: 'M9 4H4v16h5m4-8h9m-4-4 4 4-4 4', filter: 'M4 6h16M7 12h10M10 18h4', alert: 'm12 3 10 18H2Zm0 6v5m0 3v.1', arrow: 'M5 12h14M13 6l6 6-6 6', check: 'm5 12 4 4L19 6', chevron: 'm6 9 6 6 6-6', close: 'M6 6l12 12M18 6 6 18', download: 'M12 3v12m0 0 4-4m-4 4-4-4M5 20h14', eye: 'M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Zm9.5 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z', 'eye-off': 'm3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.5 10.5 0 0 1 12 5c6 0 9.5 7 9.5 7a16.6 16.6 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2.5 12 2.5 12s3.5 7 9.5 7a10.5 10.5 0 0 0 3-.4', history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2', moon: 'M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z', search: 'm21 21-4.4-4.4M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z', settings: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm7.4-3.2a7.6 7.6 0 0 0-.1-1.1l2-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-1.9-1.1L14.8 3h-5.6l-.4 2.8a7.6 7.6 0 0 0-1.9 1.1l-2.3-.9-2 3.4 2 1.5a7.6 7.6 0 0 0 0 2.2l-2 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 1.9 1.1l.4 2.8h5.6l.4-2.8a7.6 7.6 0 0 0 1.9-1.1l2.3.9 2-3.4-2-1.5c.1-.4.1-.7.1-1.1Z', spark: 'm12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Zm7 12 .6 2.4L22 18l-2.4.6L19 15Z', sun: 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z', target: 'M12 3v3m0 12v3M3 12h3m12 0h3M16.2 7.8a6 6 0 1 1-8.4 0 6 6 0 0 1 8.4 0ZM14.5 9.5a3.5 3.5 0 1 1 5 5 3.5 3.5 0 0 1-5-5Z', users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8'
  };
  paths.spark = 'm12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Zm7 12 .6 2.4L22 18l-2.4.6L19 21l-.6-2.4L16 18l2.4-.6L19 15Z';
  paths.target = 'M12 3v3m0 12v3M3 12h3m12 0h3M16.2 7.8a6 6 0 1 1-8.4 0 6 6 0 0 1 8.4 0ZM14.5 9.5a3.5 3.5 0 1 1-5 5 3.5 3.5 0 0 1 5-5Z';
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

export function categoryIcon(category: string): IconName {
  if (/restaurant|cafe|bakery|food|bar/i.test(category)) return 'restaurant';
  if (/hotel|lodging/i.test(category)) return 'hotel';
  if (/health|doctor|dent|hospital|pharmacy/i.test(category)) return 'health';
  if (/shop|retail|store|supermarket/i.test(category)) return 'retail';
  return 'building';
}
export function BrandMark() {
  return <img className="brand-mark" src="icons/icon128.png" alt="Updata" width={40} height={40} />;
}
export function DiscoveryArt({ variant = 'map' }: { variant?: 'map' | 'leads' | 'history' }) {
  return <svg className={`discovery-art art-${variant}`} aria-hidden="true" viewBox="0 0 240 150" fill="none"><path d="m24 41 57-19 79 21 57-20v99l-57 20-79-21-57 19Z" fill="currentColor" fillOpacity=".035" stroke="currentColor" strokeOpacity=".22"/><path d="M81 22v99m79-78v99M24 84l57-18 79 22 57-20M49 32v99m55-103v99m81-93v99" stroke="currentColor" strokeOpacity=".12"/><ellipse cx="122" cy="93" rx="57" ry="28" stroke="currentColor" strokeOpacity=".25" strokeDasharray="3 5"/><ellipse cx="122" cy="93" rx="33" ry="16" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeOpacity=".3"/><path className="art-pin" d="M140 60c0 15-18 30-18 30s-18-15-18-30a18 18 0 1 1 36 0Z" fill="#233e80" stroke="#89b0ff" strokeWidth="1.5"/><circle cx="122" cy="60" r="6" fill="#8ab7ff"/><circle cx="61" cy="66" r="4" fill="#729bff"/><circle cx="182" cy="89" r="4" fill="#729bff"/><path d="M58 105h16m-8-8v16M175 48h12m-6-6v12" stroke="currentColor" strokeOpacity=".5" strokeLinecap="round"/>{variant !== 'map' && <g><rect x="137" y="83" width="67" height="43" rx="7" fill="#14223e" stroke="#729bff" strokeOpacity=".6"/><path d={variant === 'leads' ? 'm148 105 5 5 9-11m10 3h20m-20 8h13' : 'M150 97v9h9m-8-7a10 10 0 1 1-1 13m12-12v7l4 2'} stroke="#8ab7ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></g>}</svg>;
}
