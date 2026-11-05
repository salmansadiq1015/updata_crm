import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { translations } from '@/lib/i18n/translations';
import { SUPPORTED_LOCALES } from '@/lib/i18n/locale-config';
import {
  DASHBOARD_BREAKDOWN_LABEL_KEYS,
  DASHBOARD_METRIC_LABEL_KEYS,
} from '../utils/dashboard-i18n';

const locales = SUPPORTED_LOCALES;
const dashboardRoot = path.resolve(process.cwd(), 'src/modules/dashboard');

const sourceFiles = [
  'components/premium-dashboard.jsx',
  'components/dashboard-intelligence.jsx',
  'components/dashboard-workspaces.jsx',
  'components/dashboard-chart-panels.jsx',
  'components/dashboard-primitives.jsx',
  'data/dashboard-config.js',
  'utils/dashboard-i18n.js',
];

function collectStaticDashboardKeys() {
  const keys = new Set();
  const keyPattern = /(?:t\(\s*|labelKey:\s*)['"`]([^'"`]+)['"`]/g;

  for (const sourceFile of sourceFiles) {
    const text = fs.readFileSync(path.join(dashboardRoot, sourceFile), 'utf8');
    let match = keyPattern.exec(text);

    while (match) {
      if (match[1].startsWith('dashboard.') && !match[1].includes('${')) keys.add(match[1]);
      match = keyPattern.exec(text);
    }
  }

  return keys;
}

function collectObjectValues(value, output = new Set()) {
  if (!value || typeof value !== 'object') return output;

  for (const nestedValue of Object.values(value)) {
    if (typeof nestedValue === 'string' && nestedValue.startsWith('dashboard.')) {
      output.add(nestedValue);
    } else {
      collectObjectValues(nestedValue, output);
    }
  }

  return output;
}

function collectDashboardTranslationKeys() {
  return new Set([
    ...collectStaticDashboardKeys(),
    ...collectObjectValues(DASHBOARD_METRIC_LABEL_KEYS),
    ...collectObjectValues(DASHBOARD_BREAKDOWN_LABEL_KEYS),
  ]);
}

describe('dashboard translations', () => {
  test('has every dashboard key used by the analytics surface in all supported locales', () => {
    const keys = collectDashboardTranslationKeys();
    const missing = [];

    for (const locale of locales) {
      for (const key of keys) {
        if (!translations[locale]?.[key]) missing.push(`${locale}:${key}`);
      }
    }

    expect(missing, `Missing dashboard translations under ${dashboardRoot}: ${missing.join(', ')}`).toEqual([]);
  });

  test('keeps dashboard.analytics keys bidirectionally complete across locales', () => {
    const unionKeys = new Set();

    for (const locale of locales) {
      for (const key of Object.keys(translations[locale])) {
        if (key.startsWith('dashboard.analytics.') || key.startsWith('dashboard.intelligence.')) unionKeys.add(key);
      }
    }

    const missing = [];
    for (const locale of locales) {
      for (const key of unionKeys) {
        if (!translations[locale]?.[key]) missing.push(`${locale}:${key}`);
      }
    }

    expect(missing, `Missing dashboard.analytics parity: ${missing.join(', ')}`).toEqual([]);
  });
});
