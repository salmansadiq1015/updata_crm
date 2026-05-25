import { PHOTO_CONFIG } from '../constants/mobile-constants';

export async function compressPhoto(file) {
  const bitmap = await createImageBitmap(file);
  let { width, height } = getScaledDimensions(
    bitmap.width,
    bitmap.height,
    PHOTO_CONFIG.MAX_DIMENSION
  );

  let quality = PHOTO_CONFIG.JPEG_QUALITY;
  let blob = await drawBitmapToBlob(bitmap, width, height, quality, { closeBitmap: false });

  while (
    blob.size > PHOTO_CONFIG.MAX_COMPRESSED_SIZE &&
    quality > PHOTO_CONFIG.MIN_JPEG_QUALITY
  ) {
    quality = Math.max(PHOTO_CONFIG.MIN_JPEG_QUALITY, quality - 0.1);
    blob = await drawBitmapToBlob(bitmap, width, height, quality, { closeBitmap: false });
  }

  while (blob.size > PHOTO_CONFIG.MAX_COMPRESSED_SIZE && width > 900 && height > 900) {
    width = Math.round(width * 0.85);
    height = Math.round(height * 0.85);
    blob = await drawBitmapToBlob(bitmap, width, height, PHOTO_CONFIG.MIN_JPEG_QUALITY, { closeBitmap: false });
  }

  bitmap.close();
  return blob;
}

export async function generateThumbnail(file) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = getScaledDimensions(
    bitmap.width,
    bitmap.height,
    PHOTO_CONFIG.THUMBNAIL_DIMENSION
  );

  return drawBitmapToBlob(bitmap, width, height, PHOTO_CONFIG.THUMBNAIL_QUALITY);
}

async function drawBitmapToBlob(bitmap, width, height, quality, { closeBitmap = true } = {}) {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    if (closeBitmap) bitmap.close();
    return canvas.convertToBlob({ type: 'image/jpeg', quality });
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  if (closeBitmap) bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Image compression failed'));
      },
      'image/jpeg',
      quality
    );
  });
}

function getScaledDimensions(origWidth, origHeight, maxDimension) {
  if (origWidth <= maxDimension && origHeight <= maxDimension) {
    return { width: origWidth, height: origHeight };
  }

  const ratio = Math.min(maxDimension / origWidth, maxDimension / origHeight);
  return {
    width: Math.round(origWidth * ratio),
    height: Math.round(origHeight * ratio),
  };
}

export function captureGeoLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  });
}
