import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const CI_FONT_NAMES = {
  light: 'MBB-CI-Light',
  medium: 'MBB-CI-Medium',
  bold: 'MBB-CI-Bold',
};

// Museo Sans shipped with the server, used when no font was uploaded in the CI
// configuration. Without it every document silently fell back to Helvetica.
const LOCAL_FONT_NAMES = {
  light: 'MBB-Local-Light',
  medium: 'MBB-Local-Medium',
  bold: 'MBB-Local-Bold',
};

const LOCAL_FONT_FILES = {
  light: 'MuseoSans-300.ttf',
  medium: 'MuseoSans-500.ttf',
  bold: 'MuseoSans-700.ttf',
};

const FALLBACK_FONTS = {
  body: 'Helvetica',
  medium: 'Helvetica-Bold',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
};

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../../assets/ci-defaults');

let localFonts = null;

/** Read the bundled faces once; a missing file simply leaves that weight null. */
function loadLocalFonts() {
  if (localFonts) return localFonts;
  localFonts = {};
  for (const [weight, file] of Object.entries(LOCAL_FONT_FILES)) {
    try {
      const path = join(ASSETS_DIR, file);
      localFonts[weight] = existsSync(path) ? readFileSync(path) : null;
    } catch {
      localFonts[weight] = null;
    }
  }
  return localFonts;
}

/**
 * Which set of faces this document will use: the fonts uploaded in the CI
 * configuration win, then the bundled Museo Sans, then PDFKit's Helvetica.
 * Both exported functions go through this so the names they register and the
 * names they hand to the renderers can never drift apart.
 */
function resolveFontSource(ciConfig = {}) {
  const uploaded = ciConfig.fontBuffers || {};
  if (uploaded.light && uploaded.bold) {
    return { buffers: uploaded, names: CI_FONT_NAMES };
  }
  const local = loadLocalFonts();
  if (local.light && local.bold) {
    return { buffers: local, names: LOCAL_FONT_NAMES };
  }
  return null;
}

export function registerCiFonts(doc, ciConfig = {}) {
  const source = resolveFontSource(ciConfig);
  if (!source) return;
  for (const [weight, fontName] of Object.entries(source.names)) {
    const buffer = source.buffers[weight];
    if (buffer) doc.registerFont(fontName, buffer);
  }
}

export function pdfFonts(ciConfig = {}) {
  const source = resolveFontSource(ciConfig);
  if (!source) return { ...FALLBACK_FONTS };

  const { buffers, names } = source;
  return {
    body: names.light,
    medium: buffers.medium ? names.medium : names.light,
    bold: names.bold,
    // The CI family ships no italic cut, so emphasis keeps using Helvetica's
    // oblique — it is what marks optional positions apart in the line table.
    italic: FALLBACK_FONTS.italic,
  };
}
