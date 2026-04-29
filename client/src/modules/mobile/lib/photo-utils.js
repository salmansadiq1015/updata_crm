import { PHOTO_CONFIG } from '../constants/mobile-constants';

export async function compressPhoto(file) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = getScaledDimensions(
    bitmap.width,
    bitmap.height,
    PHOTO_CONFIG.MAX_DIMENSION
  );

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await canvas.convertToBlob({
    type: 'image/jpeg',
    quality: PHOTO_CONFIG.JPEG_QUALITY,
  });

  return blob;
}

export async function generateThumbnail(file) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = getScaledDimensions(
    bitmap.width,
    bitmap.height,
    PHOTO_CONFIG.THUMBNAIL_DIMENSION
  );

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await canvas.convertToBlob({
    type: 'image/jpeg',
    quality: PHOTO_CONFIG.THUMBNAIL_QUALITY,
  });

  return blob;
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
