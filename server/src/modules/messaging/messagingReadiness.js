const HTTPS = 'https:';

function valuePresent(value, minLength = 1) {
  return typeof value === 'string' && value.trim().length >= minLength;
}

function isHttpsUrl(value) {
  try {
    return new URL(String(value || '')).protocol === HTTPS;
  } catch {
    return false;
  }
}

function timezoneValid(value) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

/**
 * Produces a credential-safe deployment report. It intentionally reports only
 * environment variable names, never their values.
 */
export function buildMessagingReadiness(settings, providers, env = process.env, queue = null) {
  const checks = [];
  const add = (id, label, status, detail) => checks.push({ id, label, status, detail });
  const enabled = settings?.providers || {};
  const enabledNames = [
    enabled.emailEnabled && 'email',
    enabled.metaWhatsappEnabled && 'metaWhatsapp',
    enabled.textbeeEnabled && 'textbee',
    enabled.twilioEnabled && 'twilio',
    enabled.twilioWhatsappEnabled && 'twilioWhatsapp',
  ].filter(Boolean);
  const requireEnv = (id, label, names, valid = (name) => valuePresent(env[name])) => {
    const missing = names.filter((name) => !valid(name));
    add(id, label, missing.length ? 'fail' : 'pass', missing.length
      ? `Missing required secret/configuration: ${missing.join(', ')}`
      : 'Required server-side configuration is present.');
  };

  add('provider-enabled', 'At least one delivery provider', enabledNames.length ? 'pass' : 'fail',
    enabledNames.length ? `${enabledNames.length} provider(s) enabled.` : 'Enable at least one provider before deployment.');
  requireEnv('destination-hash-secret', 'Suppression destination hashing', ['MESSAGE_DESTINATION_HASH_SECRET'],
    (name) => valuePresent(env[name], 16));
  add('outbound-queue', 'Persistent outbound queue', queue ? 'pass' : 'fail', queue
    ? `Queue available (${Number(queue.waiting || 0)} waiting, ${Number(queue.failed || 0)} failed).`
    : 'Outbound BullMQ/Redis queue is unavailable or not registered.');

  const quotaReady = Number(settings?.quotas?.daily) > 0
    && Number(settings?.quotas?.monthly) > 0
    && Number(settings?.quotas?.perCampaign) > 0;
  add('quotas', 'Organization sending quotas', quotaReady ? 'pass' : 'fail', quotaReady
    ? 'Daily, monthly, and per-campaign limits are positive.'
    : 'Daily, monthly, and per-campaign limits must be greater than zero.');

  if (enabled.emailEnabled) {
    requireEnv('email-config', 'Existing email provider configuration', ['SMTP_MAIL', 'SMTP_PASSWORD']);
    requireEnv('unsubscribe-secret', 'Signed email unsubscribe links', ['MESSAGE_UNSUBSCRIBE_SECRET'],
      (name) => valuePresent(env[name], 16));
    add('public-api-url', 'Public unsubscribe URL', isHttpsUrl(env.MESSAGING_PUBLIC_API_URL) ? 'pass' : 'fail',
      isHttpsUrl(env.MESSAGING_PUBLIC_API_URL)
        ? 'MESSAGING_PUBLIC_API_URL uses HTTPS.'
        : 'MESSAGING_PUBLIC_API_URL must be an externally reachable HTTPS origin.');
  }

  if (enabled.metaWhatsappEnabled) {
    requireEnv('meta-config', 'Meta WhatsApp Cloud API configuration', [
      'META_WHATSAPP_BUSINESS_ACCOUNT_ID', 'META_WHATSAPP_PHONE_NUMBER_ID',
      'META_WHATSAPP_ACCESS_TOKEN', 'META_WHATSAPP_WEBHOOK_VERIFY_TOKEN',
      'META_APP_SECRET', 'META_GRAPH_API_VERSION',
    ]);
  }

  if (enabled.textbeeEnabled) {
    requireEnv('textbee-config', 'TextBee gateway configuration', [
      'TEXTBEE_API_KEY', 'TEXTBEE_WEBHOOK_SECRET',
    ], (name) => valuePresent(env[name], name === 'TEXTBEE_WEBHOOK_SECRET' ? 20 : 1));
    add('textbee-device', 'TextBee device selection', valuePresent(env.TEXTBEE_DEVICE_ID) ? 'pass' : 'warn',
      valuePresent(env.TEXTBEE_DEVICE_ID)
        ? 'A specific Android gateway is selected and batch reconciliation polling is available.'
        : 'TEXTBEE_DEVICE_ID is optional for sending, but without it TextBee chooses the default/recent device and batch reconciliation polling is unavailable.');
  }

  if (enabled.twilioEnabled) {
    requireEnv('twilio-auth', 'Twilio authentication', ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']);
    const senderReady = valuePresent(env.TWILIO_FROM_NUMBER) || valuePresent(env.TWILIO_MESSAGING_SERVICE_SID);
    add('twilio-sender', 'Twilio sender identity', senderReady ? 'pass' : 'fail', senderReady
      ? 'A sender number or Messaging Service SID is configured.'
      : 'Set TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID.');
    const callback = env.TWILIO_STATUS_CALLBACK_URL;
    const publicCallback = env.TWILIO_WEBHOOK_PUBLIC_URL;
    const callbackReady = isHttpsUrl(callback) && isHttpsUrl(publicCallback) && callback === publicCallback;
    add('twilio-callback', 'Twilio signed status callback', callbackReady ? 'pass' : 'fail', callbackReady
      ? 'The configured HTTPS callback and signature-verification URL match.'
      : 'TWILIO_STATUS_CALLBACK_URL and TWILIO_WEBHOOK_PUBLIC_URL must be the same externally visible HTTPS URL.');
  }

  if (enabled.twilioWhatsappEnabled) {
    requireEnv('twilio-whatsapp-auth', 'Twilio WhatsApp authentication', ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']);
    const senderReady = valuePresent(env.TWILIO_WHATSAPP_FROM) || valuePresent(env.TWILIO_WHATSAPP_MESSAGING_SERVICE_SID);
    add('twilio-whatsapp-sender', 'Twilio WhatsApp sender identity', senderReady ? 'pass' : 'fail', senderReady
      ? 'A WhatsApp sender or Messaging Service SID is configured.'
      : 'Set TWILIO_WHATSAPP_FROM or TWILIO_WHATSAPP_MESSAGING_SERVICE_SID.');
    add('twilio-whatsapp-callback', 'Twilio WhatsApp signed callback', isHttpsUrl(env.TWILIO_WHATSAPP_STATUS_CALLBACK_URL) ? 'pass' : 'fail',
      isHttpsUrl(env.TWILIO_WHATSAPP_STATUS_CALLBACK_URL)
        ? 'The WhatsApp status callback uses HTTPS.'
        : 'TWILIO_WHATSAPP_STATUS_CALLBACK_URL must be an externally reachable HTTPS URL.');
  }

  for (const key of enabledNames) {
    const state = providers?.[key];
    add(`provider-health-${key}`, `${key} live health check`, state?.eligible ? 'pass' : 'fail', state?.eligible
      ? 'Provider accepted the current health check.'
      : `Provider is not currently eligible (${state?.reason || 'health unavailable'}).`);
  }

  if (settings?.smsFallback?.enabled) {
    const fallback = settings.smsFallback;
    add('fallback-providers', 'Fallback provider pair', enabled.textbeeEnabled && enabled.twilioEnabled ? 'pass' : 'fail',
      enabled.textbeeEnabled && enabled.twilioEnabled
        ? 'TextBee primary and Twilio fallback are both enabled.'
        : 'Enable both TextBee and Twilio to use fallback.');
    add('fallback-countries', 'Fallback country allowlist', fallback.allowedCountries?.length ? 'pass' : 'fail',
      fallback.allowedCountries?.length ? `${fallback.allowedCountries.length} country/countries explicitly allowed.` : 'Add at least one ISO-2 country; an unrestricted fallback is not deployment-ready.');
    add('fallback-purposes', 'Fallback purpose allowlist', fallback.allowedPurposes?.length ? 'pass' : 'fail',
      fallback.allowedPurposes?.length ? `${fallback.allowedPurposes.length} purpose(s) explicitly allowed.` : 'Add at least one permitted message purpose.');
    const spendingReady = Number(fallback.dailySpendLimit) > 0 && Number(fallback.monthlySpendLimit) > 0;
    add('fallback-spending', 'Fallback spending caps', spendingReady ? 'pass' : 'fail', spendingReady
      ? 'Daily and monthly Twilio fallback caps are configured.'
      : 'Set positive daily and monthly Twilio fallback spending caps.');
  }

  if (settings?.whatsappFallback?.enabled) {
    const fallback = settings.whatsappFallback;
    add('whatsapp-fallback-providers', 'WhatsApp fallback provider pair', enabled.metaWhatsappEnabled && enabled.twilioWhatsappEnabled ? 'pass' : 'fail',
      enabled.metaWhatsappEnabled && enabled.twilioWhatsappEnabled
        ? 'Meta primary and Twilio WhatsApp fallback are both enabled.'
        : 'Enable Meta WhatsApp and Twilio WhatsApp to use fallback.');
    add('whatsapp-fallback-countries', 'WhatsApp fallback country allowlist', fallback.allowedCountries?.length ? 'pass' : 'fail',
      fallback.allowedCountries?.length ? `${fallback.allowedCountries.length} country/countries explicitly allowed.` : 'Add at least one ISO-2 country.');
    add('whatsapp-fallback-purposes', 'WhatsApp fallback purpose allowlist', fallback.allowedPurposes?.length ? 'pass' : 'fail',
      fallback.allowedPurposes?.length ? `${fallback.allowedPurposes.length} purpose(s) explicitly allowed.` : 'Add at least one permitted message purpose.');
    const spendingReady = Number(fallback.dailySpendLimit) > 0 && Number(fallback.monthlySpendLimit) > 0;
    add('whatsapp-fallback-spending', 'WhatsApp fallback spending caps', spendingReady ? 'pass' : 'fail', spendingReady
      ? 'Daily and monthly Twilio WhatsApp fallback caps are configured.'
      : 'Set positive daily and monthly fallback spending caps.');
  }

  if (settings?.quietHours?.enabled) {
    add('quiet-hours-timezone', 'Quiet-hours timezone', timezoneValid(settings.quietHours.timezone) ? 'pass' : 'fail',
      timezoneValid(settings.quietHours.timezone)
        ? `Timezone ${settings.quietHours.timezone} is valid.`
        : 'Configure a valid IANA timezone for quiet hours.');
  }

  const routing = settings?.countryRouting || {};
  if (enabled.textbeeEnabled && !routing.textbeeAllowedCountries?.length) {
    add('textbee-country-scope', 'TextBee country scope', 'warn', 'No country allowlist is configured; all countries are eligible at the CRM policy layer.');
  }
  if (enabled.twilioEnabled && !routing.twilioAllowedCountries?.length) {
    add('twilio-country-scope', 'Twilio country scope', 'warn', 'No country allowlist is configured; all countries are eligible at the CRM policy layer.');
  }
  if (enabled.metaWhatsappEnabled && !routing.whatsappAllowedCountries?.length) {
    add('whatsapp-country-scope', 'WhatsApp country scope', 'warn', 'No country allowlist is configured; all countries are eligible at the CRM policy layer.');
  }

  const pricing = settings?.pricing || {};
  if (enabled.textbeeEnabled && Number(pricing.textbeeCarrierPerSegment) <= 0) {
    add('textbee-pricing', 'TextBee carrier cost estimate', 'warn', 'No SIM/carrier cost per SMS segment is configured.');
  }
  if (enabled.twilioEnabled && Number(pricing.twilioDefaultPerSegment) <= 0) {
    add('twilio-pricing', 'Twilio cost estimate', 'warn', 'No default Twilio segment rate is configured; provider invoices remain authoritative.');
  }
  if (enabled.metaWhatsappEnabled && [
    pricing.metaMarketingPerMessage, pricing.metaUtilityPerMessage, pricing.metaServicePerMessage,
  ].some((value) => Number(value) <= 0)) {
    add('meta-pricing', 'Meta category cost estimates', 'warn', 'One or more Meta category rates are not configured.');
  }

  const counts = checks.reduce((result, check) => {
    result[check.status] += 1;
    return result;
  }, { pass: 0, warn: 0, fail: 0 });
  return { ready: counts.fail === 0, counts, checks };
}

export default buildMessagingReadiness;
