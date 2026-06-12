const CI_FONT_NAMES = {
  light: 'MBB-CI-Light',
  medium: 'MBB-CI-Medium',
  bold: 'MBB-CI-Bold',
};

const FALLBACK_FONTS = {
  body: 'Helvetica',
  medium: 'Helvetica-Bold',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
};

export function registerCiFonts(doc, ciConfig = {}) {
  const fontBuffers = ciConfig.fontBuffers || {};
  for (const [weight, fontName] of Object.entries(CI_FONT_NAMES)) {
    const buffer = fontBuffers[weight];
    if (buffer) doc.registerFont(fontName, buffer);
  }
}

export function pdfFonts(ciConfig = {}) {
  const fontBuffers = ciConfig.fontBuffers || {};
  return {
    body: fontBuffers.light ? CI_FONT_NAMES.light : FALLBACK_FONTS.body,
    medium: fontBuffers.medium ? CI_FONT_NAMES.medium : FALLBACK_FONTS.medium,
    bold: fontBuffers.bold ? CI_FONT_NAMES.bold : FALLBACK_FONTS.bold,
    italic: FALLBACK_FONTS.italic,
  };
}
