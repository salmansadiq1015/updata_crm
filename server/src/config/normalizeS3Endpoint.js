/**
 * Normalize AWS_S3_ENDPOINT for the S3 client.
 *
 * Production misconfigurations that cause runtime "Invalid URL" errors:
 * - whitespace-only values (truthy in JS, invalid for URL parsing)
 * - hostnames without a scheme (e.g. "localhost:9000", "s3.amazonaws.com")
 *
 * Returns undefined when unset/blank so the AWS SDK uses the regional endpoint.
 */
export function normalizeS3Endpoint(raw) {
  if (raw == null) return undefined;

  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    const scheme = trimmed.split(':')[0];
    throw new Error(`AWS_S3_ENDPOINT must use http or https, got "${scheme}:"`);
  }

  const asUrl = (value) => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`AWS_S3_ENDPOINT must use http or https, got "${url.protocol}"`);
    }
    return url.origin;
  };

  // Full URL — parse as-is (strip any trailing path).
  if (/^https?:\/\//i.test(trimmed)) {
    return asUrl(trimmed);
  }

  // Bare hostname:port or hostname — common copy/paste mistake from docs.
  // Must not call new URL(trimmed) directly: "localhost:9000" is parsed as protocol "localhost:".
  for (const scheme of ['http', 'https']) {
    try {
      return asUrl(`${scheme}://${trimmed}`);
    } catch (err) {
      if (err.message.startsWith('AWS_S3_ENDPOINT')) throw err;
    }
  }

  throw new Error(
    `AWS_S3_ENDPOINT is not a valid URL: "${trimmed}". ` +
    'Use a full URL like "http://localhost:9000" for MinIO, or leave empty for AWS S3.',
  );
}

export default normalizeS3Endpoint;
