/**
 * Public routes for the customer page (mounted at /c). Only the link token
 * authorises access; a device cookie binds the conversation to the phone that
 * opened it. Rate-limited per IP, per link, and for unknown links.
 */
import express from 'express';
import Joi from 'joi';

import logger from '../../shared/logger/index.js';
import { linkMessageLimiter, linkMissLimiter, linkPageLimiter } from '../../shared/middleware/rateLimiter.js';
import service from './linkAssistant.service.js';
import { DEVICE_COOKIE, MAX_MESSAGE_CHARS } from './linkAssistant.constants.js';
import { generateDeviceId } from './engine/linkTokens.js';
import { assetByPath, CSP, renderChatPage, renderErrorPage } from './page/template.js';

const router = express.Router();

const PREVIEW_BOTS = /(whatsapp|facebookexternalhit|facebot|telegrambot|twitterbot|slackbot|skypeuripreview|discordbot|linkedinbot|googlebot|bingbot|applebot|embedly|preview)/i;

function pageHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=(), payment=()');
  res.setHeader('Cache-Control', 'no-store');
}

function deviceId(req, res) {
  const existing = req.cookies?.[DEVICE_COOKIE];
  if (typeof existing === 'string' && /^[0-9a-f]{32}$/.test(existing)) return existing;
  const id = generateDeviceId();
  res.cookie(DEVICE_COOKIE, id, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/c/', maxAge: 90 * 24 * 3_600_000,
  });
  return id;
}

const sendError = (res, error) => {
  const status = error?.statusCode || 500;
  const code = error?.code && /^[A-Z_]+$/.test(error.code) ? error.code : 'ERROR';
  if (status >= 500) logger.error('link assistant public error', { module: 'link-assistant', error: error?.message });
  res.status(status).json({ success: false, code });
};

// Fingerprinted assets: immutable, pre-compressed.
router.get('/assets/:file', linkPageLimiter, (req, res) => {
  const asset = assetByPath.get(`/c/assets/${req.params.file}`);
  if (!asset) return res.status(404).end();
  res.setHeader('Content-Type', asset.type);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Accept-Encoding');
  if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable, no-transform');
    return res.end(asset.gzip);
  }
  return res.end(asset.body);
});

router.get('/:token', linkPageLimiter, linkMissLimiter, async (req, res) => {
  pageHeaders(res);
  // Link previews (WhatsApp etc.) get a neutral page and never touch the session.
  if (PREVIEW_BOTS.test(req.headers['user-agent'] || '')) {
    return res.status(200).type('html').send(renderErrorPage('LINK_REVOKED').replace('This link is no longer active', 'A message for you'));
  }
  const device = deviceId(req, res);
  try {
    const model = await service.pageModel(req.params.token, device);
    return res.status(200).type('html').send(renderChatPage(model));
  } catch (error) {
    const code = error?.code || 'LINK_NOT_FOUND';
    if (!error?.statusCode || error.statusCode >= 500) logger.error('link page failed', { module: 'link-assistant', error: error?.message });
    return res.status(error?.statusCode && error.statusCode < 500 ? error.statusCode : 404).type('html').send(renderErrorPage(code));
  }
});

// Every API call needs the device cookie and a same-origin marker header (no CSRF / no simple-form posts).
function guard(req, res, next) {
  if (req.headers['x-requested-with'] !== 'ula') return res.status(400).json({ success: false, code: 'BAD_REQUEST' });
  req.deviceId = req.cookies?.[DEVICE_COOKIE] || null;
  return next();
}

const messageSchema = Joi.object({
  text: Joi.string().allow('', null).max(MAX_MESSAGE_CHARS),
  action: Joi.string().allow(null).max(120).pattern(/^[\w:-]+$/),
  clientMessageId: Joi.string().allow(null).max(64).pattern(/^[\w-]+$/),
}).or('text', 'action');

router.get('/:token/api/state', linkPageLimiter, linkMissLimiter, guard, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    return res.json(await service.pageModel(req.params.token, req.deviceId));
  } catch (error) { return sendError(res, error); }
});

router.post('/:token/api/open', linkPageLimiter, linkMissLimiter, guard, async (req, res) => {
  try {
    if (!req.deviceId) return res.status(400).json({ success: false, code: 'NO_DEVICE' });
    return res.json(await service.markOpened(req.params.token, req.deviceId));
  } catch (error) { return sendError(res, error); }
});

router.post('/:token/api/verify', linkPageLimiter, linkMissLimiter, guard, async (req, res) => {
  try {
    const { value, error } = Joi.object({ last4: Joi.string().pattern(/^\d{4}$/).required() }).validate(req.body || {});
    if (error) return res.status(400).json({ success: false, code: 'VERIFY_FAILED' });
    return res.json(await service.verifyDevice(req.params.token, req.deviceId, value.last4));
  } catch (error) { return sendError(res, error); }
});

router.post('/:token/api/language', linkPageLimiter, linkMissLimiter, guard, async (req, res) => {
  try {
    const { value, error } = Joi.object({ language: Joi.string().valid('en', 'ur', 'roman_ur').required() }).validate(req.body || {});
    if (error) return res.status(400).json({ success: false, code: 'BAD_LANGUAGE' });
    return res.json(await service.setLanguage(req.params.token, req.deviceId, value.language));
  } catch (error) { return sendError(res, error); }
});

/** One customer message; the reply streams back as NDJSON lines (token / replace / done). */
router.post('/:token/api/message', linkPageLimiter, linkMissLimiter, linkMessageLimiter, guard, async (req, res) => {
  const { value, error } = messageSchema.validate(req.body || {}, { stripUnknown: true });
  if (error) return res.status(400).json({ success: false, code: 'BAD_MESSAGE' });
  let streaming = false;
  const write = (event) => {
    if (!streaming) {
      streaming = true;
      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();
    }
    res.write(`${JSON.stringify(event)}\n`);
  };
  try {
    await service.handleMessage(req.params.token, req.deviceId, value, write);
    if (!streaming) write({ type: 'done', reply: '' });
    return res.end();
  } catch (err) {
    if (streaming) {
      res.write(`${JSON.stringify({ type: 'replace', text: 'Sorry, something went wrong. Your answers so far are saved.' })}\n`);
      res.write(`${JSON.stringify({ type: 'done', error: true })}\n`);
      return res.end();
    }
    return sendError(res, err);
  }
});

export default router;
