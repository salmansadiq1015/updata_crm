/**
 * Tracked links for workflow messages.
 *
 *   ensure()  one link per message step (idempotent on actionKey) → https://<api>/t/<token>
 *   click()   classify the request, count it, publish ONE workflow.link.clicked event on the
 *             first human click, and return the stored destination (never a client-supplied
 *             URL, so the endpoint cannot be used as an open redirect).
 *
 * Scanner filtering: email/SMS security gateways and link-preview bots prefetch links.
 * A request counts as human only if it is a GET from a browser-like client that sends
 * Accept-Language, is not a known bot/scanner User-Agent, and arrives more than a few
 * seconds after the link was issued (scanners hit links immediately on delivery).
 */
import crypto from 'node:crypto';
import { WorkflowLink } from './workflow.models.js';
import { recordEvent } from './workflow.runner.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';

const SCANNER_UA = /bot|crawl|spider|slurp|preview|scanner|scan|proofpoint|mimecast|barracuda|safelinks|safe-links|urldefense|fireeye|trendmicro|symantec|messagelabs|forcepoint|sophos|cisco|ironport|zscaler|facebookexternalhit|whatsapp|telegram|slack|discord|skype|teams|linkedin|twitter|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch|headless|phantom|lighthouse|monitor/i;
const MIN_HUMAN_DELAY_MS = 5_000;

export function trackedBaseUrl() {
  return String(process.env.WORKFLOW_LINK_BASE_URL || process.env.PUBLIC_API_BASE_URL || process.env.LINK_ASSISTANT_BASE_URL || 'http://localhost:9097').replace(/\/+$/, '');
}

export function classifyClick({ method = 'GET', userAgent = '', acceptLanguage = '', purpose = '', linkCreatedAt = null, now = new Date() }) {
  if (String(method).toUpperCase() !== 'GET') return { human: false, reason: 'non_get' };
  if (!userAgent) return { human: false, reason: 'no_user_agent' };
  if (SCANNER_UA.test(userAgent)) return { human: false, reason: 'scanner_user_agent' };
  if (/prefetch|preview/i.test(purpose)) return { human: false, reason: 'prefetch' };
  if (!acceptLanguage) return { human: false, reason: 'no_accept_language' };
  if (linkCreatedAt && now - new Date(linkCreatedAt) < MIN_HUMAN_DELAY_MS) return { human: false, reason: 'too_fast' };
  return { human: true, reason: null };
}

class WorkflowLinkService {
  async ensure({ actionKey, url = '', run, nodeId, kind = 'link' }) {
    const token = crypto.randomBytes(16).toString('base64url');
    const doc = await WorkflowLink.findOneAndUpdate(
      { actionKey },
      { $setOnInsert: { token, url, kind, actionKey, workflowId: run.workflowId, runId: run._id, leadId: run.leadId, nodeId } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).lean();
    return { ...doc, trackedUrl: kind === 'open' ? `${trackedBaseUrl()}/t/o/${doc.token}.gif` : `${trackedBaseUrl()}/t/${doc.token}` };
  }

  /**
   * Email open pixel. Mail-provider image proxies (Gmail, Yahoo) load images when the
   * recipient opens the mail, so they count; security scanners and instant prefetches do not.
   * Apple Mail Privacy Protection preloads images and cannot be told apart — opens are
   * therefore a signal "where supported", never proof.
   */
  async open(token, req) {
    if (!/^[A-Za-z0-9_-]{16,40}$/.test(String(token || ''))) return null;
    const link = await WorkflowLink.findOne({ token, kind: 'open' }).lean();
    if (!link) return null;
    const ua = req.get('user-agent') || '';
    const now = new Date();
    const proxy = /GoogleImageProxy|YahooMailProxy|ggpht\.com/i.test(ua);
    const scanner = !proxy && (SCANNER_UA.test(ua) || !ua || (link.createdAt && now - new Date(link.createdAt) < MIN_HUMAN_DELAY_MS));
    if (scanner) {
      await WorkflowLink.updateOne({ _id: link._id }, { $inc: { clicks: 1, scannerHits: 1 }, $set: { lastClickAt: now } });
      return { human: false };
    }
    await WorkflowLink.updateOne({ _id: link._id }, { $inc: { clicks: 1, humanClicks: 1 }, $set: { lastClickAt: now }, $min: { firstClickAt: now } });
    const first = await recordEvent({
      type: 'message.opened', workflowId: link.workflowId, leadId: link.leadId, nodeId: link.nodeId,
      run: { _id: link.runId, workflowId: link.workflowId, leadId: link.leadId, campaignId: null },
      data: { linkId: String(link._id), via: proxy ? 'mail_proxy' : 'client' }, dedupeKey: `open:${link._id}:first`,
    });
    if (first) {
      try { eventBus.publish(EVENT_TYPES.MESSAGE_OPENED, { linkId: String(link._id), leadId: String(link.leadId), runId: String(link.runId), workflowId: String(link.workflowId), nodeId: link.nodeId, channel: 'email' }, { source: 'workflow' }); } catch { /* best effort */ }
    }
    return { human: true, first };
  }

  async click(token, req) {
    if (!/^[A-Za-z0-9_-]{16,40}$/.test(String(token || ''))) return null;
    const link = await WorkflowLink.findOne({ token, kind: { $ne: 'open' } }).lean();
    if (!link) return null;
    const now = new Date();
    const verdict = classifyClick({
      method: req.method, userAgent: req.get('user-agent') || '', acceptLanguage: req.get('accept-language') || '',
      purpose: req.get('purpose') || req.get('sec-purpose') || req.get('x-purpose') || '', linkCreatedAt: link.createdAt, now,
    });
    if (!verdict.human) {
      await WorkflowLink.updateOne({ _id: link._id }, { $inc: { clicks: 1, scannerHits: 1 }, $set: { lastClickAt: now } });
      return { url: link.url, human: false, reason: verdict.reason };
    }
    await WorkflowLink.updateOne({ _id: link._id }, { $inc: { clicks: 1, humanClicks: 1 }, $set: { lastClickAt: now }, $min: { firstClickAt: now } });
    // First human click only → one event / one trigger per link, however often it is opened.
    const first = await recordEvent({
      type: 'link.clicked', workflowId: link.workflowId, leadId: link.leadId, nodeId: link.nodeId,
      run: { _id: link.runId, workflowId: link.workflowId, leadId: link.leadId, campaignId: null },
      data: { linkId: String(link._id), url: link.url }, dedupeKey: `link:${link._id}:first`,
    });
    if (first) {
      try {
        eventBus.publish(EVENT_TYPES.WORKFLOW_LINK_CLICKED, {
          linkId: String(link._id), leadId: String(link.leadId), runId: String(link.runId), workflowId: String(link.workflowId), url: link.url, nodeId: link.nodeId,
        }, { source: 'workflow' });
      } catch { /* best effort */ }
    }
    return { url: link.url, human: true, first };
  }
}

export default new WorkflowLinkService();
