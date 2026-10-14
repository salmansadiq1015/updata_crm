import { LiveKitSipProvider } from './livekitSip.provider.js';

/**
 * Optional Twilio carrier fallback. Twilio is only the SIP carrier: media and
 * agent orchestration remain on LiveKit + OpenAI. A separately provisioned
 * LiveKit outbound trunk is required so the primary carrier can never be
 * silently replaced.
 */
export class TwilioVoiceFallbackProvider extends LiveKitSipProvider {
  constructor(env = process.env, fetchImpl = globalThis.fetch) {
    super({
      ...env,
      LIVEKIT_SIP_OUTBOUND_TRUNK_ID: env.LIVEKIT_TWILIO_SIP_OUTBOUND_TRUNK_ID || '',
      LIVEKIT_SIP_CALLER_ID: env.TWILIO_VOICE_FROM_NUMBER || '',
      SIP_OUTBOUND_ADDRESS: '',
      SIP_OUTBOUND_NUMBER: '',
      SIP_OUTBOUND_USERNAME: '',
      SIP_OUTBOUND_PASSWORD: '',
    }, fetchImpl, { providerName: 'twilio_voice', allowTwilioCarrier: true });
    this.enabled = String(env.AI_CALLING_TWILIO_FALLBACK_ENABLED || 'false').toLowerCase() === 'true';
    this.allowedCountries = String(env.AI_CALLING_TWILIO_FALLBACK_COUNTRIES || '')
      .split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
  }

  eligibleFor(country) {
    if (!this.enabled || !this.configured) return false;
    return this.allowedCountries.length === 0 || this.allowedCountries.includes(String(country || '').toUpperCase());
  }

  async health() {
    const base = await super.health();
    return { ...base, enabled: this.enabled, allowedCountries: this.allowedCountries, eligible: this.enabled && base.eligible };
  }
}

export default new TwilioVoiceFallbackProvider();
