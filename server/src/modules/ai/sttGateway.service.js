import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

/** Infomaniak transcribes asynchronously; these bound the wait for a result. */
const STT_POLL_INTERVAL_MS = 1200;
const STT_RESULT_TIMEOUT_MS = 90_000;
const STT_UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Whisper reads at most ~224 tokens of prompt and silently ignores the rest —
 * and an oversized one does worse than nothing: sending the full 678-term
 * house vocabulary made the request hang instead of transcribing. German
 * trade words run long, so the budget is counted in characters, which is what
 * can actually be measured here.
 */
const STT_VOCAB_PROMPT_MAX_CHARS = 700;

/**
 * Speech-to-Text provider abstraction.
 *
 * Primary provider: OpenAI Whisper API (batch mode).
 * Supports custom vocabulary post-processing and Swiss format normalization.
 */
class SttGatewayService {
  constructor() {
    this._client = null;
  }

  /**
   * Transcribe audio buffer to text.
   *
   * @param {Buffer} audioBuffer - Raw audio data
   * @param {object} options
   * @param {string} [options.language] - BCP-47 language code (e.g. 'de-CH')
   * @param {string} [options.mimeType] - Audio MIME type (e.g. 'audio/wav')
   * @param {string[]} [options.customVocabulary] - Domain-specific terms for accuracy
   * @returns {{ text, confidence, words, provider, processingTimeMs }}
   */
  async transcribe(audioBuffer, { language, mimeType, customVocabulary = [] } = {}) {
    const startTime = Date.now();
    // Validated at boot by the config schema, so an unsupported value can no
    // longer surface here through the environment.
    const provider = String(config.ai?.sttProvider || 'whisper').toLowerCase();

    logger.debug('STT transcription started', {
      module: 'ai',
      action: 'transcribe',
      provider,
      language,
      mimeType,
      audioSize: audioBuffer?.length,
      vocabCount: customVocabulary.length,
    });

    let result;

    switch (provider) {
      case 'whisper':
        result = await this._transcribeWhisper(audioBuffer, { language, mimeType, customVocabulary });
        break;
      case 'google':
        result = await this._transcribeGoogle(audioBuffer, { language, mimeType, customVocabulary });
        break;
      case 'azure':
        result = await this._transcribeAzure(audioBuffer, { language, mimeType, customVocabulary });
        break;
      default:
        throw new Error(`Unsupported STT provider: ${provider}`);
    }

    // Apply custom vocabulary post-processing
    if (customVocabulary.length > 0) {
      result.text = this._applyCustomVocabulary(result.text, customVocabulary);
    }

    // Apply Swiss format normalization
    result.text = this._normalizeSwissFormats(result.text);

    const processingTimeMs = Date.now() - startTime;

    logger.info('STT transcription completed', {
      module: 'ai',
      action: 'transcribe',
      provider,
      processingTimeMs,
      textLength: result.text.length,
      confidence: result.confidence,
    });

    return {
      text: result.text,
      confidence: result.confidence,
      words: result.words,
      provider,
      processingTimeMs,
    };
  }

  /**
   * Transcribe using OpenAI Whisper API.
   *
   * @param {Buffer} audioBuffer
   * @param {object} options
   * @returns {{ text, confidence, words }}
   */
  async _transcribeWhisper(audioBuffer, { language, mimeType, customVocabulary = [] } = {}) {
    const localePrompt = this._buildLocalePrompt(language);
    const vocabPrompt = this._buildVocabularyPrompt(customVocabulary);
    const prompt = [localePrompt, vocabPrompt].filter(Boolean).join('\n');

    if (this._infomaniakAudioBase()) {
      return this._transcribeInfomaniak(audioBuffer, { language, mimeType, prompt });
    }

    const openai = await this._getClient();
    const { fileName, fileType } = this._resolveAudioFileInfo(mimeType);
    const file = new File([audioBuffer], fileName, { type: fileType });

    const response = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      language: language?.split('-')[0] || 'de',
      prompt,
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
    });

    // Extract text
    const text = response.text || '';

    // Extract word-level timestamps
    const words = Array.isArray(response.words)
      ? response.words.map((w) => ({
        word: w.word,
        start: w.start,
        end: w.end,
      }))
      : [];

    // Convert avg_logprob to 0-1 confidence.
    // Whisper avg_logprob typically ranges from -1.0 (low) to 0.0 (high).
    // Map: 0.0 -> 1.0, -1.0 -> 0.0, clamp to [0, 1].
    let confidence = 0.5;
    if (response.segments && response.segments.length > 0) {
      const totalLogprob = response.segments.reduce(
        (sum, seg) => sum + (seg.avg_logprob || -0.5),
        0,
      );
      const avgLogprob = totalLogprob / response.segments.length;
      confidence = Math.max(0, Math.min(1, 1 + avgLogprob));
    }

    return { text, confidence, words };
  }

  /**
   * Infomaniak's audio endpoint, which is OpenAI-compatible in its form only.
   *
   * Three things differ from OpenAI and none of them can be papered over by
   * the SDK: it lives under a different base path than the chat endpoint
   * (`/1/ai/<product>/openai` rather than `/2/…/openai/v1`), the model is
   * called `whisper` and `whisper-1` is rejected outright, and it answers with
   * a batch id rather than a transcript — the result is fetched afterwards.
   * Word-level timestamps are not offered, so `words` comes back empty.
   */
  _infomaniakAudioBase() {
    const baseUrl = config.ai?.baseUrl || '';
    const match = baseUrl.match(/^(https?:\/\/api\.infomaniak\.com)\/\d+\/ai\/(\d+)\//);
    return match ? `${match[1]}/1/ai/${match[2]}` : null;
  }

  async _transcribeInfomaniak(audioBuffer, { language, mimeType, prompt }) {
    const base = this._infomaniakAudioBase();
    const { fileName, fileType } = this._resolveAudioFileInfo(mimeType);
    const headers = { Authorization: `Bearer ${config.ai.apiKey}` };

    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: fileType }), fileName);
    form.append('model', 'whisper');
    form.append('language', language?.split('-')[0] || 'de');
    if (prompt) form.append('prompt', prompt);

    // Without a deadline a stalled upload holds the whole request open.
    const dispatched = await fetch(`${base}/openai/audio/transcriptions`, {
      method: 'POST', headers, body: form, signal: AbortSignal.timeout(STT_UPLOAD_TIMEOUT_MS),
    }).then((res) => res.json());

    if (!dispatched?.batch_id) {
      throw new Error(`Infomaniak rejected the transcription: ${JSON.stringify(dispatched).slice(0, 200)}`);
    }

    const deadline = Date.now() + STT_RESULT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => { setTimeout(resolve, STT_POLL_INTERVAL_MS); });
      const result = await fetch(`${base}/results/${dispatched.batch_id}`, { headers })
        .then((res) => res.json())
        .catch(() => null);
      if (result?.status === 'success') {
        let text = '';
        try { text = JSON.parse(result.data).text || ''; } catch { text = String(result.data || ''); }
        // Infomaniak returns no per-segment logprobs, so confidence stays
        // unknown rather than being invented; the caller treats it as such.
        return { text: text.trim(), confidence: null, words: [] };
      }
      if (result?.status === 'error') {
        throw new Error(`Infomaniak transcription failed: ${JSON.stringify(result).slice(0, 200)}`);
      }
    }
    throw new Error('Infomaniak transcription timed out');
  }

  async _transcribeGoogle() {
    throw new Error('Google STT provider is not configured in this checkout');
  }

  async _transcribeAzure() {
    throw new Error('Azure STT provider is not configured in this checkout');
  }

  /**
   * Lazy-load OpenAI client (same pattern as aiService.js).
   */
  async _getClient() {
    if (!this._client) {
      const { createOpenAiClient } = await import('../../shared/ai/llmFactory.js');
      this._client = await createOpenAiClient();
    }
    return this._client;
  }

  /**
   * The prompt is a style example, not just a hint: Whisper imitates its
   * orthography. Written in transliterated ASCII ("fuer", "Waermepumpe") it
   * taught the model to return "oehlheizung von wiesmann" — lower case and
   * umlaut-free. It is therefore written exactly as the office writes:
   * capitals, umlauts, and no Eszett.
   */
  _buildLocalePrompt(language) {
    const normalized = String(language || '').toLowerCase();
    if (normalized === 'de-ch' || normalized === 'gsw' || normalized === 'gsw-ch') {
      return [
        'Transkribiere Schweizerdeutsch und Deutsch für Heizungs-, Service- und Baustellenrapporte.',
        'Typische Begriffe: Auftrag, Rapport, Heizung, Boiler, Wärmepumpe, Kessel, Brenner, Störung, Anlage, Offerte.',
      ].join(' ');
    }
    if (normalized === 'fr-ch' || normalized === 'it-ch') {
      return 'Transkribiere Schweizer Service- und Heizungsfachsprache mit korrekten Namen, Adressen und technischen Begriffen.';
    }
    return '';
  }

  /** As many domain terms as Whisper will actually read, and no more. */
  _buildVocabularyPrompt(customVocabulary = []) {
    if (!customVocabulary.length) return '';
    const kept = [];
    let length = 0;
    for (const term of customVocabulary) {
      const word = typeof term === 'string' ? term.trim() : String(term?.term || '').trim();
      if (!word) continue;
      if (length + word.length + 2 > STT_VOCAB_PROMPT_MAX_CHARS) break;
      kept.push(word);
      length += word.length + 2;
    }
    if (kept.length < customVocabulary.length) {
      logger.debug('STT vocabulary prompt truncated', {
        module: 'ai', action: 'buildVocabularyPrompt', kept: kept.length, total: customVocabulary.length,
      });
    }
    return kept.length ? `Fachbegriffe: ${kept.join(', ')}` : '';
  }

  _resolveAudioFileInfo(mimeType = 'audio/wav') {
    const normalized = String(mimeType || '').toLowerCase();
    const info = {
      'audio/wav': { fileName: 'audio.wav', fileType: 'audio/wav' },
      'audio/x-wav': { fileName: 'audio.wav', fileType: 'audio/wav' },
      'audio/mpeg': { fileName: 'audio.mp3', fileType: 'audio/mpeg' },
      'audio/mp3': { fileName: 'audio.mp3', fileType: 'audio/mpeg' },
      'audio/ogg': { fileName: 'audio.ogg', fileType: 'audio/ogg' },
      'audio/webm': { fileName: 'audio.webm', fileType: 'audio/webm' },
    };
    return info[normalized] || { fileName: 'audio.bin', fileType: normalized || 'application/octet-stream' };
  }

  /**
   * Post-process text with custom vocabulary corrections.
   * For each vocab term, check if a phonetically similar or split word exists
   * in the text and replace it.
   *
   * @param {string} text - Transcribed text
   * @param {string[]} vocabulary - Domain-specific terms
   * @returns {string} Corrected text
   */
  _applyCustomVocabulary(text, vocabulary) {
    let corrected = text;

    for (const entry of vocabulary) {
      // Callers hand over a plain list of words; one that hands over the
      // vocabulary records instead used to take the whole transcription down.
      const term = typeof entry === 'string' ? entry.trim() : String(entry?.term || '').trim();
      if (term.length < 2) continue;

      // Build a pattern that matches the term split by spaces or hyphens.
      // e.g. "Heizkessel" should match "Heiz kessel", "Heiz-kessel", "heiz kessel"
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Split compound words and look for space-separated variants
      // For terms longer than 5 chars, try splitting at common points
      if (term.length > 5) {
        // Try matching with optional spaces/hyphens between characters
        // Build pattern: for each position, allow an optional space or hyphen
        for (let i = 3; i < term.length - 2; i++) {
          const left = term.slice(0, i);
          const right = term.slice(i);
          const leftEsc = left.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const rightEsc = right.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const splitPattern = new RegExp(`${leftEsc}[\\s-]+${rightEsc}`, 'gi');
          corrected = corrected.replace(splitPattern, term);
        }
      }

      // Also do a direct case-insensitive replacement to normalize casing
      const directPattern = new RegExp(`\\b${escaped}\\b`, 'gi');
      corrected = corrected.replace(directPattern, term);
    }

    return corrected;
  }

  /**
   * Normalize Swiss-specific formats in transcribed text.
   *
   * @param {string} text
   * @returns {string} Normalized text
   */
  _normalizeSwissFormats(text) {
    // Switzerland does not use the Eszett — Whisper is trained on German
    // German and writes "Ausdehnungsgefäß" where the office writes
    // "Ausdehnungsgefäss". Everything downstream searches on the Swiss form.
    let result = String(text).replace(/ß/g, 'ss');

    // Phone numbers: detect Swiss phone patterns and format as 0XX XXX XX XX
    // Match sequences like "079 123 45 67" or "0791234567" or "079 1234567"
    result = result.replace(
      /\b(0\d{2})\s*(\d{3})\s*(\d{2})\s*(\d{2})\b/g,
      '$1 $2 $3 $4',
    );

    // Also handle +41 format: +41 79 123 45 67 -> 079 123 45 67
    result = result.replace(
      /\+41\s*(\d{2})\s*(\d{3})\s*(\d{2})\s*(\d{2})\b/g,
      '0$1 $2 $3 $4',
    );

    // PLZ: 4-digit Swiss postal codes — normalize spacing after them
    // Pattern: number followed by city name (e.g., "8001Zürich" -> "8001 Zürich")
    result = result.replace(
      /\b(\d{4})([A-ZÄÖÜ][a-zäöüéèê]+)/g,
      '$1 $2',
    );

    // Dates: normalize spoken German dates to DD.MM.YYYY format
    const monthMap = {
      januar: '01', februar: '02', märz: '03', april: '04',
      mai: '05', juni: '06', juli: '07', august: '08',
      september: '09', oktober: '10', november: '11', dezember: '12',
    };

    // "15. März 2024" or "15 März 2024" -> "15.03.2024"
    const datePattern = /\b(\d{1,2})\.?\s+(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})\b/gi;
    result = result.replace(datePattern, (match, day, month, year) => {
      const mm = monthMap[month.toLowerCase()];
      if (!mm) return match;
      return `${day.padStart(2, '0')}.${mm}.${year}`;
    });

    // "15. März" (without year) -> "15.03."
    const dateNoYearPattern = /\b(\d{1,2})\.?\s+(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b/gi;
    result = result.replace(dateNoYearPattern, (match, day, month) => {
      const mm = monthMap[month.toLowerCase()];
      if (!mm) return match;
      return `${day.padStart(2, '0')}.${mm}.`;
    });

    // Numbers: Swiss formatting with apostrophes (1'234.56)
    // Match large numbers written with spaces (1 234) and convert to apostrophe format
    result = result.replace(
      /\b(\d{1,3})(?:\s(\d{3}))+(?:\.(\d{1,2}))?\b/g,
      (match) => {
        // Only process if this looks like a number (not a phone/PLZ pattern)
        const cleaned = match.replace(/\s/g, '');
        if (/^\d{4}$/.test(cleaned)) return match; // Skip 4-digit PLZ
        if (/^0\d+$/.test(cleaned)) return match; // Skip phone numbers

        const parts = match.split('.');
        const intPart = parts[0].replace(/\s/g, '');
        const decPart = parts[1] || '';

        // Format with Swiss apostrophes
        const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
        return decPart ? `${formatted}.${decPart}` : formatted;
      },
    );

    return result;
  }
}

const sttGatewayService = new SttGatewayService();
export default sttGatewayService;
