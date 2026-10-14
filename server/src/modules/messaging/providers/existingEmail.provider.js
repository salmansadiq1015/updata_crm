import emailService from '../../doctpl/email.service.js';
import { accepted, rejected } from './providerResult.js';
import { createUnsubscribeToken } from '../unsubscribeToken.js';
import { destinationHash } from '../destinationHash.js';
import { verifyMailTransport } from '../../../shared/mail/mail.js';

export class ExistingEmailProvider {
  constructor(env = process.env, verifyTransport = verifyMailTransport) {
    this.env = env;
    this.verifyTransport = verifyTransport;
  }

  get configured() {
    return Boolean(
      this.env.SMTP_MAIL
      && this.env.SMTP_PASSWORD
      && (this.env.SMTP_HOST || this.env.SMTP_SERVICE),
    );
  }

  async health() {
    if (!this.configured) return { configured: false, reachable: false, eligible: false, reason: 'not_configured' };
    try {
      await this.verifyTransport(this.env);
      return { configured: true, reachable: true, eligible: true, reason: null };
    } catch (error) {
      const code = String(error?.code || '').toUpperCase();
      const authenticationFailure = code === 'EAUTH' || Number(error?.responseCode) === 535;
      const timeout = ['ETIMEDOUT', 'ESOCKET'].includes(code) || error?.name === 'TimeoutError';
      return {
        configured: true,
        reachable: authenticationFailure,
        eligible: false,
        reason: authenticationFailure ? 'authentication_failed' : (timeout ? 'timeout' : 'unreachable'),
      };
    }
  }

  async send({ to, subject, bodyHtml, bodyText, leadId, createdBy, senderName, purpose }) {
    if (!this.configured) return rejected('existing_email', { message: 'Existing SMTP service is not configured', code: 'NOT_CONFIGURED', permanent: true });
    let finalHtml = bodyHtml;
    let finalText = bodyText;
    if (purpose === 'promotional') {
      const baseUrl = String(process.env.MESSAGING_PUBLIC_API_URL || '').replace(/\/$/, '');
      if (!baseUrl) return rejected('existing_email', { message: 'Public unsubscribe URL is not configured', code: 'UNSUBSCRIBE_NOT_CONFIGURED', permanent: true });
      try {
        const token = createUnsubscribeToken({ leadId: String(leadId), destinationHash: destinationHash('email', to) });
        const url = `${baseUrl}/api/v1/webhooks/messaging/unsubscribe?token=${encodeURIComponent(token)}`;
        finalHtml = `${bodyHtml || ''}<hr><p style="font-size:12px;color:#6b7280">You are receiving this message because consent was recorded. <a href="${url}">Unsubscribe</a>.</p>`;
        finalText = `${bodyText || ''}\n\nUnsubscribe: ${url}`;
      } catch (error) {
        return rejected('existing_email', { message: error.message, code: 'UNSUBSCRIBE_NOT_CONFIGURED', permanent: true });
      }
    }
    try {
      const record = await emailService.send({
        to: [to], subject, bodyHtml: finalHtml, bodyText: finalText, sourceModule: 'lead', sourceRecordId: leadId,
        senderName, createdBy,
      });
      return accepted('existing_email', String(record._id), 'queued');
    } catch (error) {
      return rejected('existing_email', { message: error.message, code: 'EMAIL_QUEUE_FAILED', permanent: false });
    }
  }
}

export default new ExistingEmailProvider();
