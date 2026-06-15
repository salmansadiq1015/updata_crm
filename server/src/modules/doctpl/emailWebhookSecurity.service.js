import crypto from 'crypto';

const SIGNATURE_HEADERS = [
  'x-doctpl-signature',
  'x-email-signature',
  'x-webhook-signature',
  'x-signature',
];

class EmailWebhookSecurityService {
  verify(req) {
    const secret = process.env.DOCTPL_EMAIL_WEBHOOK_SECRET || process.env.EMAIL_WEBHOOK_SECRET || '';
    if (!secret) {
      return process.env.NODE_ENV !== 'production';
    }

    const signature = this._extractSignature(req);
    if (!signature) return false;

    const payload = req.rawBody instanceof Buffer
      ? req.rawBody
      : Buffer.from(JSON.stringify(req.body || {}));
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return this._safeCompare(signature, expected);
  }

  _extractSignature(req) {
    for (const header of SIGNATURE_HEADERS) {
      const value = req.get?.(header) || req.headers?.[header];
      if (value) return `${value}`.replace(/^sha256=/i, '').trim();
    }
    return '';
  }

  _safeCompare(left, right) {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    if (leftBuffer.length !== rightBuffer.length) return false;
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
  }
}

const emailWebhookSecurityService = new EmailWebhookSecurityService();
export default emailWebhookSecurityService;
