const LOGO_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);
const FONT_MIME_TYPES = new Set([
  'font/ttf',
  'font/otf',
  'application/x-font-ttf',
  'application/x-font-opentype',
  'application/octet-stream',
]);

const FONT_FILE_FIELDS = {
  light: 'light',
  medium: 'medium',
  bold: 'bold',
};

function cloneConfig(ciConfig) {
  if (!ciConfig) return null;
  return {
    ...ciConfig,
    logo: { ...(ciConfig.logo || {}) },
    fonts: {
      ...(ciConfig.fonts || {}),
      weights: {
        light: { ...(ciConfig.fonts?.weights?.light || {}) },
        medium: { ...(ciConfig.fonts?.weights?.medium || {}) },
        bold: { ...(ciConfig.fonts?.weights?.bold || {}) },
      },
    },
  };
}

async function loadFileBuffer(fileId, allowedMimeTypes, purpose) {
  if (!fileId) return null;

  const { default: fileService } = await import('../files/file.service.js');
  const { default: storageService } = await import('../../shared/storage/StorageService.js');
  const file = await fileService.getById(fileId);

  if (!file) {
    throw new Error(`CI ${purpose} file is missing: ${fileId}`);
  }
  if (!allowedMimeTypes.has(file.mimeType)) {
    throw new Error(`CI ${purpose} file type is not supported for PDF rendering: ${file.mimeType}`);
  }

  return storageService.download(file.key);
}

class CIRenderAssetsService {
  async prepare(ciConfig) {
    const prepared = cloneConfig(ciConfig);
    if (!prepared) return prepared;

    const logoFileId = prepared.logo?.pngFileId || prepared.logo?.rgbFileId;
    if (logoFileId) {
      prepared.logoBuffer = await loadFileBuffer(logoFileId, LOGO_MIME_TYPES, 'logo');
    }

    const fontBuffers = {};
    for (const [weightKey, bufferKey] of Object.entries(FONT_FILE_FIELDS)) {
      const fileId = prepared.fonts?.weights?.[weightKey]?.fileId;
      if (fileId) {
        fontBuffers[bufferKey] = await loadFileBuffer(fileId, FONT_MIME_TYPES, `${weightKey} font`);
      }
    }
    if (Object.keys(fontBuffers).length) prepared.fontBuffers = fontBuffers;

    return prepared;
  }
}

const ciRenderAssetsService = new CIRenderAssetsService();
export default ciRenderAssetsService;
