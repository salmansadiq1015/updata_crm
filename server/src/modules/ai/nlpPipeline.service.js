import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

/**
 * LLM-based intent and entity extraction pipeline.
 *
 * Uses GPT-4o with structured JSON output to extract intents and entities
 * from transcribed voice input in an HVAC field service context.
 */
class NlpPipelineService {
  constructor() {
    this._client = null;
  }

  /**
   * Process a transcript and extract intent + entities.
   *
   * @param {string} transcript - Transcribed text
   * @param {object} context - Session context
   * @param {string} [context.sessionType] - e.g. ORDER_CREATION, REPORT_DICTATION
   * @param {string} [context.contextModule] - e.g. crm, pm, deploy
   * @param {string} [context.language] - e.g. de-CH
   * @returns {{ intent: { name, confidence }, entities: [], processingTimeMs }}
   */
  async process(transcript, context = {}) {
    const startTime = Date.now();

    logger.debug('NLP pipeline processing started', {
      module: 'ai',
      action: 'nlp.process',
      transcriptLength: transcript?.length,
      sessionType: context.sessionType,
      language: context.language,
    });

    // Build system prompt with context
    const systemPrompt = this._buildSystemPrompt(context);

    // Call GPT-4o with JSON mode for structured output
    let parsed;
    try {
      parsed = await this._callLLM(systemPrompt, transcript);
    } catch (err) {
      logger.error('NLP LLM call failed', {
        module: 'ai',
        action: 'nlp.process',
        error: { message: err.message, stack: err.stack },
      });
      throw err;
    }

    // Normalize the parsed response
    const intent = {
      name: parsed.intent?.name || 'general',
      confidence: typeof parsed.intent?.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.intent.confidence))
        : 0,
    };

    let entities = Array.isArray(parsed.entities) ? parsed.entities : [];

    // Normalize entity structure
    entities = entities.map((e) => ({
      type: e.type || 'DESCRIPTION',
      value: e.value || '',
      normalizedValue: e.normalizedValue || null,
      confidence: typeof e.confidence === 'number'
        ? Math.max(0, Math.min(1, e.confidence))
        : 0,
      startOffset: typeof e.startOffset === 'number' ? e.startOffset : null,
      endOffset: typeof e.endOffset === 'number' ? e.endOffset : null,
    }));

    // Attempt entity resolution
    entities = await this._resolveEntities(entities, context.language || 'de-CH');

    const processingTimeMs = Date.now() - startTime;

    logger.info('NLP pipeline completed', {
      module: 'ai',
      action: 'nlp.process',
      intentName: intent.name,
      intentConfidence: intent.confidence,
      entityCount: entities.length,
      processingTimeMs,
    });

    return { intent, entities, processingTimeMs };
  }

  /**
   * Build the system prompt for GPT-4o NLP extraction.
   *
   * @param {object} context
   * @returns {string}
   */
  _buildSystemPrompt(context) {
    const sessionType = context.sessionType || 'GENERAL';
    const contextModule = context.contextModule || 'unknown';
    const language = context.language || 'de-CH';

    return `You are an NLP extraction engine for an HVAC field service application (Swiss plumbing and heating company).
Given a transcribed voice input, extract:
1. Intent (one of: create_order, create_report, search_customer, update_status, navigate, capture_address, general)
2. Entities with types: CUSTOMER_NAME, ADDRESS, EQUIPMENT_MODEL, PART_NUMBER, DATE, TIME, URGENCY, QUANTITY, DESCRIPTION, STATUS

Context:
- Session type: ${sessionType}
- Context module: ${contextModule}
- Language: ${language}

Rules:
- For Swiss German input, normalize to standard German values where possible.
- Dates should be in ISO format (YYYY-MM-DD) in normalizedValue.
- Times should be in HH:MM format in normalizedValue.
- Addresses should include PLZ and city in normalizedValue if mentioned.
- URGENCY values: low, medium, high, critical.
- STATUS values: pending, in_progress, completed, cancelled.
- If the intent is unclear, use "general" with low confidence.
- Extract ALL entities mentioned, even if intent is unclear.

Respond with JSON only:
{
  "intent": { "name": "...", "confidence": 0.0-1.0 },
  "entities": [
    { "type": "...", "value": "...", "normalizedValue": "...", "confidence": 0.0-1.0, "startOffset": N, "endOffset": N }
  ]
}`;
  }

  /**
   * Call GPT-4o with structured JSON output.
   *
   * @param {string} systemPrompt
   * @param {string} userMessage
   * @returns {object} Parsed JSON response
   */
  async _callLLM(systemPrompt, userMessage) {
    const openai = await this._getClient();

    const response = await openai.chat.completions.create({
      model: config.ai.model || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      max_tokens: config.ai.maxTokens || 2000,
      temperature: 0.1,
    });

    const raw = response.choices[0]?.message?.content || '{}';

    try {
      return JSON.parse(raw);
    } catch (err) {
      logger.warn('NLP LLM response not valid JSON, returning defaults', {
        module: 'ai',
        action: 'nlp.callLLM',
        raw: raw.slice(0, 200),
      });
      return { intent: { name: 'general', confidence: 0 }, entities: [] };
    }
  }

  /**
   * Resolve extracted entities by looking up related records.
   *
   * @param {object[]} entities
   * @param {string} language
   * @returns {object[]} Entities with resolvedId and normalizedValue filled
   */
  async _resolveEntities(entities, language) {
    const resolved = [];

    for (const entity of entities) {
      const enriched = { ...entity };

      switch (entity.type) {
        case 'CUSTOMER_NAME': {
          try {
            const { default: customerService } = await import('../crm/customer.service.js');
            const results = await customerService.search(entity.value, 3);
            if (results?.length > 0) {
              enriched.resolvedId = results[0]._id;
              enriched.normalizedValue = results[0].name;
              enriched.candidates = results.map((c, i) => ({
                resolvedId: c._id,
                label: c.name,
                score: Math.max(0.5, 1 - i * 0.15),
              }));
            }
          } catch {
            // CRM module may not be available; skip resolution
          }
          break;
        }

        case 'ADDRESS': {
          try {
            const { default: swissPlzService } = await import('../../shared/ai/swissPlz.service.js');
            const parsed = swissPlzService.parseAddress(entity.value);
            if (parsed.postalCode) {
              enriched.normalizedValue = [
                parsed.street,
                parsed.houseNumber,
                parsed.postalCode,
                parsed.city,
              ].filter(Boolean).join(', ');
              if (parsed.canton) {
                enriched.normalizedValue += ` (${parsed.canton})`;
              }
              if (parsed.validationErrors?.length) {
                enriched.validationWarnings = parsed.validationErrors;
              }
            }
          } catch {
            enriched.normalizedValue = enriched.normalizedValue || entity.value;
          }
          break;
        }

        case 'EQUIPMENT_MODEL': {
          try {
            const { default: articleService } = await import('../catalog/article.service.js');
            const results = await articleService.search(entity.value, 1);
            if (results && results.length > 0) {
              enriched.resolvedId = results[0]._id;
              enriched.normalizedValue = results[0].name || results[0].articleNumber;
            }
          } catch {
            // Catalog module may not be available; skip resolution
          }
          break;
        }

        case 'DATE': {
          const parsed = this._parseDateExpression(entity.value, language);
          if (parsed) {
            enriched.normalizedValue = parsed;
          }
          break;
        }

        case 'TIME': {
          // Normalize time expressions to HH:MM
          const timeMatch = entity.value.match(/(\d{1,2})[:\s.](\d{2})/);
          if (timeMatch) {
            enriched.normalizedValue = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
          }
          break;
        }

        default:
          break;
      }

      resolved.push(enriched);
    }

    return resolved;
  }

  /**
   * Parse relative and absolute date expressions into ISO date strings.
   * Handles German expressions: "morgen", "uebermorgen", "naechsten Montag",
   * "am 15. Maerz", "heute", etc.
   *
   * @param {string} text - Date expression
   * @param {string} language - Language code
   * @returns {string|null} ISO date string (YYYY-MM-DD) or null
   */
  _parseDateExpression(text, language) {
    if (!text) return null;

    const lower = text.toLowerCase().trim();
    const now = new Date();

    // Relative expressions (German)
    if (lower === 'heute' || lower === 'today') {
      return this._toISODate(now);
    }
    if (lower === 'morgen' || lower === 'tomorrow') {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      return this._toISODate(d);
    }
    if (lower === 'übermorgen' || lower === 'uebermorgen') {
      const d = new Date(now);
      d.setDate(d.getDate() + 2);
      return this._toISODate(d);
    }
    if (lower === 'gestern' || lower === 'yesterday') {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      return this._toISODate(d);
    }

    // "nächsten <weekday>" / "naechsten <weekday>"
    const dayMap = {
      montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4,
      freitag: 5, samstag: 6, sonntag: 0,
      monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
      friday: 5, saturday: 6, sunday: 0,
    };

    const nextDayMatch = lower.match(/(?:nächsten|naechsten|next)\s+(\w+)/);
    if (nextDayMatch) {
      const targetDay = dayMap[nextDayMatch[1]];
      if (targetDay !== undefined) {
        const d = new Date(now);
        const currentDay = d.getDay();
        let daysAhead = targetDay - currentDay;
        if (daysAhead <= 0) daysAhead += 7;
        d.setDate(d.getDate() + daysAhead);
        return this._toISODate(d);
      }
    }

    // "am 15. März" or "15. März 2024"
    const monthMap = {
      januar: 0, februar: 1, märz: 2, maerz: 2, april: 3,
      mai: 4, juni: 5, juli: 6, august: 7,
      september: 8, oktober: 9, november: 10, dezember: 11,
    };

    const absoluteMatch = lower.match(/(?:am\s+)?(\d{1,2})\.?\s+(\w+)(?:\s+(\d{4}))?/);
    if (absoluteMatch) {
      const day = parseInt(absoluteMatch[1], 10);
      const monthName = absoluteMatch[2];
      const year = absoluteMatch[3] ? parseInt(absoluteMatch[3], 10) : now.getFullYear();
      const month = monthMap[monthName];

      if (month !== undefined && day >= 1 && day <= 31) {
        const d = new Date(year, month, day);
        // If the date is in the past and no year was specified, assume next year
        if (!absoluteMatch[3] && d < now) {
          d.setFullYear(d.getFullYear() + 1);
        }
        return this._toISODate(d);
      }
    }

    // DD.MM.YYYY format
    const dottedMatch = lower.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (dottedMatch) {
      const day = parseInt(dottedMatch[1], 10);
      const month = parseInt(dottedMatch[2], 10) - 1;
      const year = parseInt(dottedMatch[3], 10);
      if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
        return this._toISODate(new Date(year, month, day));
      }
    }

    // If the entity already has an ISO-like normalizedValue from the LLM, use it
    const isoMatch = lower.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return isoMatch[0];
    }

    return null;
  }

  /**
   * Format a Date to ISO date string (YYYY-MM-DD).
   *
   * @param {Date} d
   * @returns {string}
   */
  _toISODate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Lazy-load OpenAI client.
   */
  async _getClient() {
    if (!this._client) {
      const { createOpenAiClient } = await import('../../shared/ai/llmFactory.js');
      this._client = await createOpenAiClient();
    }
    return this._client;
  }
}

const nlpPipelineService = new NlpPipelineService();
export default nlpPipelineService;
