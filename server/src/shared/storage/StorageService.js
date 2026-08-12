import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import path from 'path';
import { getS3Client, ALLOWED_MIME_TYPES } from '../../config/storage.js';
import config from '../../config/index.js';
import logger from '../logger/index.js';
import { ExternalServiceError, ValidationError } from '../errors/AppError.js';
import ERROR_CODES from '../errors/errorCodes.js';

/**
 * S3-compatible file storage abstraction.
 *
 * Supports AWS S3, MinIO, and local S3-compatible backends.
 * Configuration-only switch between backends (no code changes).
 *
 * Key organization: <module>/<entityType>/<entityId>/<timestamp>_<originalName>
 * This enables prefix-based listing per entity.
 */
class StorageService {
  constructor() {
    this.client = null;
    this.bucket = config.storage.aws.bucket;
  }

  _getClient() {
    if (!this.client) {
      this.client = getS3Client();
    }
    return this.client;
  }

  /**
   * Build the S3 object key from entity metadata.
   */
  buildKey({ module, entityType, entityId, originalName }) {
    const safeName = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const parts = [module];
    if (entityType) parts.push(entityType);
    if (entityId) parts.push(String(entityId));
    parts.push(`${timestamp}_${safeName}`);
    return parts.join('/');
  }

  /**
   * Validate file against bucket policies.
   */
  validateFile(mimeType, sizeBytes, bucket = 'all') {
    const allowedTypes = ALLOWED_MIME_TYPES[bucket] || ALLOWED_MIME_TYPES.all;
    if (!allowedTypes.includes(mimeType)) {
      throw new ValidationError(`File type '${mimeType}' is not allowed`, [
        { field: 'mimeType', message: `Allowed types: ${allowedTypes.join(', ')}` },
      ]);
    }

    if (sizeBytes > config.storage.maxFileSize) {
      const maxMB = Math.round(config.storage.maxFileSize / (1024 * 1024));
      throw new ValidationError(`File size exceeds maximum of ${maxMB}MB`, [
        { field: 'size', message: `Maximum file size: ${maxMB}MB` },
      ]);
    }
  }

  /**
   * Upload a file to S3.
   *
   * @param {object} params
   * @param {string} params.key - S3 object key
   * @param {Buffer|ReadableStream} params.body - File content
   * @param {string} params.mimeType - MIME type
   * @param {object} params.metadata - Custom metadata
   * @returns {{ key, bucket, etag, checksumSha256 }}
   */
  async upload({ key, body, mimeType, metadata = {} }) {
    try {
      // Calculate checksum for integrity
      let checksumSha256 = '';
      if (Buffer.isBuffer(body)) {
        checksumSha256 = crypto.createHash('sha256').update(body).digest('hex');
      }

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
        Metadata: {
          ...metadata,
          uploadedAt: new Date().toISOString(),
        },
      });

      const result = await this._getClient().send(command);

      logger.info('File uploaded to S3', {
        module: 'storage',
        action: 'upload',
        key,
        mimeType,
        etag: result.ETag,
      });

      return {
        key,
        bucket: this.bucket,
        etag: result.ETag,
        checksumSha256,
      };
    } catch (err) {
      const hint = err.message === 'Invalid URL'
        ? ' Check AWS_S3_ENDPOINT — leave empty for AWS S3 or use a full URL like http://localhost:9000 for MinIO.'
        : '';
      logger.error('S3 upload failed', {
        module: 'storage',
        action: 'upload',
        key,
        error: { message: err.message },
      });
      throw new ExternalServiceError('S3', `Upload failed: ${err.message}${hint}`, ERROR_CODES.S3_UPLOAD_FAILED);
    }
  }

  /**
   * Download an S3 object and return its content as a Buffer.
   */
  async download(key) {
    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      const result = await this._getClient().send(command);
      const chunks = [];
      for await (const chunk of result.Body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (err) {
      logger.error('S3 download failed', {
        module: 'storage',
        action: 'download',
        key,
        error: { message: err.message },
      });
      throw new ExternalServiceError('S3', `Download failed: ${err.message}`, ERROR_CODES.S3_DOWNLOAD_FAILED);
    }
  }

  /**
   * Generate a pre-signed download URL.
   *
   * @param {string}  key
   * @param {number}  [expiresIn]
   * @param {object}  [options]
   * @param {string}  [options.attachmentFilename] - When set, the URL will force
   *   a browser download with the given filename (Content-Disposition: attachment).
   */
  async getPresignedUrl(key, expiresIn = config.storage.presignExpiry, options = {}) {
    try {
      const params = { Bucket: this.bucket, Key: key };
      if (options.attachmentFilename) {
        const safe = options.attachmentFilename.replace(/["\r\n]/g, '_');
        params.ResponseContentDisposition = `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
      }
      const command = new GetObjectCommand(params);
      return getSignedUrl(this._getClient(), command, { expiresIn });
    } catch (err) {
      logger.error('S3 presign failed', {
        module: 'storage',
        action: 'presign',
        key,
        error: { message: err.message },
      });
      throw new ExternalServiceError('S3', `Failed to generate download URL`, ERROR_CODES.S3_DOWNLOAD_FAILED);
    }
  }

  /**
   * Delete a file from S3.
   */
  async delete(key) {
    try {
      await this._getClient().send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );

      logger.info('File deleted from S3', { module: 'storage', action: 'delete', key });
      return true;
    } catch (err) {
      logger.error('S3 delete failed', {
        module: 'storage',
        action: 'delete',
        key,
        error: { message: err.message },
      });
      throw new ExternalServiceError('S3', `Delete failed: ${err.message}`, ERROR_CODES.S3_DELETE_FAILED);
    }
  }

  /**
   * List objects by prefix.
   */
  async listByPrefix(prefix, maxKeys = 100) {
    try {
      const result = await this._getClient().send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          MaxKeys: maxKeys,
        }),
      );
      return (result.Contents || []).map((obj) => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
      }));
    } catch (err) {
      logger.error('S3 list failed', {
        module: 'storage',
        action: 'list',
        prefix,
        error: { message: err.message },
      });
      return [];
    }
  }

  /**
   * Check if S3 is accessible (for health checks).
   */
  async healthCheck() {
    try {
      await this._getClient().send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: '__health_check__',
        }),
      );
      return true;
    } catch (err) {
      // NotFound is fine — means S3 is accessible, the key just doesn't exist
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return true;
      }
      // Access denied also means S3 is reachable
      if (err.$metadata?.httpStatusCode === 403) {
        return true;
      }
      return false;
    }
  }
}

// Singleton
const storageService = new StorageService();
export default storageService;
