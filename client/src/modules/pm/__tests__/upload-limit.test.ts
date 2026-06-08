import {
  PROJECT_DOCUMENT_MAX_UPLOAD_MB,
  PROJECT_DOCUMENT_MAX_UPLOAD_BYTES,
  exceedsUploadLimit,
} from '../constants/pm-constants';

describe('document upload limit (PROJ-006 AC-8)', () => {
  it('derives bytes from the MB constant', () => {
    expect(PROJECT_DOCUMENT_MAX_UPLOAD_BYTES).toBe(PROJECT_DOCUMENT_MAX_UPLOAD_MB * 1024 * 1024);
  });

  it('accepts files at or under the limit', () => {
    expect(exceedsUploadLimit(0)).toBe(false);
    expect(exceedsUploadLimit(PROJECT_DOCUMENT_MAX_UPLOAD_BYTES)).toBe(false);
  });

  it('rejects files over the limit', () => {
    expect(exceedsUploadLimit(PROJECT_DOCUMENT_MAX_UPLOAD_BYTES + 1)).toBe(true);
  });
});
