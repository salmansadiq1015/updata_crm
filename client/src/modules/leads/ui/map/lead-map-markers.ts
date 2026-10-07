// Lead-status → marker styling. Shared (no Leaflet import) so the canvas can
// build DivIcons from it and the sidebar/legend can show matching swatches.
//
// Status is NEVER conveyed by colour alone: every status has a distinct inline
// SVG glyph as well, so meaning survives greyscale / colour-blindness. These are
// the real CRM lead statuses (lead.model.js) — no invented states.

import type { LeadStatus } from '../../types/lead-types';

export type LeadMarkerStyle = {
  /** Solid pin fill + text + border — full literal Tailwind classes. */
  marker: string;
  /** Small swatch (legend / list dot) — tinted, readable in both themes. */
  swatch: string;
};

export const LEAD_MARKER_STYLE: Record<LeadStatus, LeadMarkerStyle> = {
  new: {
    marker: 'bg-primary text-primary-foreground border-primary',
    swatch: 'bg-primary',
  },
  contacted: {
    marker: 'bg-blue-600 text-white border-blue-600',
    swatch: 'bg-blue-600',
  },
  qualified: {
    marker: 'bg-emerald-600 text-white border-emerald-600',
    swatch: 'bg-emerald-600',
  },
  unqualified: {
    marker: 'bg-slate-500 text-white border-slate-500',
    swatch: 'bg-slate-500',
  },
  converted: {
    marker: 'bg-emerald-700 text-white border-emerald-700',
    swatch: 'bg-emerald-700',
  },
};

/** Inline SVG glyph per status (mirrors the status-badge lucide icons). */
export function leadStatusGlyph(status: LeadStatus): string {
  const common = 'viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"';
  switch (status) {
    case 'new':
      // Sparkles — "new".
      return `<svg ${common} fill="currentColor"><path d="M12 2l2.3 6.1L20.5 10l-6.2 1.9L12 18l-2.3-6.1L3.5 10l6.2-1.9z"/></svg>`;
    case 'contacted':
      // Phone — "contacted".
      return `<svg ${common} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
    case 'qualified':
      // Badge-check — "qualified".
      return `<svg ${common} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg>`;
    case 'unqualified':
      // Circle-off — "unqualified".
      return `<svg ${common} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 2 20 20"/><path d="M8.35 2.69A10 10 0 0 1 21.3 15.65"/><path d="M19.08 19.08A10 10 0 1 1 4.92 4.92"/></svg>`;
    case 'converted':
    default:
      // Circle-check — "converted" (the won, terminal state).
      return `<svg ${common} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`;
  }
}
