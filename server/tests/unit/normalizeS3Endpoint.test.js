import { normalizeS3Endpoint } from '../../src/config/normalizeS3Endpoint.js';

describe('normalizeS3Endpoint', () => {
  it('returns undefined for empty or whitespace values', () => {
    expect(normalizeS3Endpoint(undefined)).toBeUndefined();
    expect(normalizeS3Endpoint(null)).toBeUndefined();
    expect(normalizeS3Endpoint('')).toBeUndefined();
    expect(normalizeS3Endpoint('   ')).toBeUndefined();
  });

  it('accepts full http/https URLs', () => {
    expect(normalizeS3Endpoint('http://localhost:9000')).toBe('http://localhost:9000');
    expect(normalizeS3Endpoint('https://minio.example.com/')).toBe('https://minio.example.com');
  });

  it('adds a scheme for bare hostnames', () => {
    expect(normalizeS3Endpoint('localhost:9000')).toBe('http://localhost:9000');
    expect(normalizeS3Endpoint('s3.amazonaws.com')).toBe('http://s3.amazonaws.com');
  });

  it('throws for invalid values', () => {
    expect(() => normalizeS3Endpoint('not a url!!!')).toThrow(/AWS_S3_ENDPOINT is not a valid URL/);
    expect(() => normalizeS3Endpoint('s3://mbboiler')).toThrow(/AWS_S3_ENDPOINT must use http or https, got "s3:"/);
  });
});
