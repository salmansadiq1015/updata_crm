import { S3Client } from '@aws-sdk/client-s3';
import config from './index.js';

/**
 * S3 client configuration.
 * Supports AWS S3, MinIO, and local S3-compatible backends.
 *
 * For MinIO/local dev: set AWS_S3_ENDPOINT to 'http://localhost:9000'
 * and forcePathStyle enables bucket-in-path URLs.
 */
let s3Client = null;

export function getS3Client() {
  if (s3Client) return s3Client;

  const { accessKeyId, secretAccessKey, bucket, region, endpoint } = config.storage.aws;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      'S3 credentials are not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.',
    );
  }

  if (!bucket) {
    throw new Error('S3 bucket is not configured. Set AWS_S3_BUCKET_NAME.');
  }

  const clientConfig = {
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  };

  // MinIO / local S3-compatible endpoint (already normalized in config loader)
  if (endpoint) {
    clientConfig.endpoint = endpoint;
    clientConfig.forcePathStyle = true;
  }

  s3Client = new S3Client(clientConfig);
  return s3Client;
}

// Allowed MIME types by bucket category
export const ALLOWED_MIME_TYPES = {
  images: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    // HEIF/HEIC accepted; normalized to JPEG when a decoder is available,
    // otherwise stored as-is (CRM-010 AC-2).
    'image/heic',
    'image/heif',
  ],
  documents: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
  ],
  photos: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ],
  'ci-assets': [
    'image/jpeg',
    'image/png',
    'application/postscript',
    'image/x-eps',
    'font/ttf',
    'font/otf',
    'font/woff',
    'font/woff2',
    'application/font-woff',
    'application/font-woff2',
    'application/x-font-ttf',
    'application/x-font-opentype',
    'application/vnd.ms-fontobject',
    'application/octet-stream',
  ],
  all: [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'image/heic', 'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv', 'text/plain',
    'application/postscript', 'image/x-eps',
    'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
    'application/font-woff', 'application/font-woff2',
    'application/x-font-ttf', 'application/x-font-opentype',
    'application/vnd.ms-fontobject',
    // Audio (voice messages + uploads)
    'audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/ogg;codecs=opus',
    'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav',
    // Video
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
  ],
};

export default { getS3Client, ALLOWED_MIME_TYPES };
