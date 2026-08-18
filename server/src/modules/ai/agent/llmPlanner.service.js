/**
 * LLM planning step for the agent: classifies the user's message into one
 * ERP action and extracts clean, structured parameters in a single GPT call.
 *
 * This replaces keyword-first classification as the primary brain. The
 * deterministic heuristics remain the fallback when no API key is configured
 * or the call fails, so the agent still works (degraded) without OpenAI.
 */
import { ChatOpenAI } from '@langchain/openai';
import config from '../../../config/index.js';
import logger from '../../../shared/logger/index.js';

export const PLANNER_ACTIONS = Object.freeze([
  'CREATE_CUSTOMER', 'UPDATE_CUSTOMER', 'DELETE_CUSTOMER', 'SEARCH_CUSTOMER',
  'CREATE_TASK', 'UPDATE_TASK', 'DELETE_TASK', 'SEARCH_TASKS', 'CREATE_TASK_REMINDER',
  'CREATE_PROJECT', 'UPDATE_PROJECT', 'DELETE_PROJECT', 'SEARCH_PROJECTS',
  'CREATE_ORDER', 'UPDATE_ORDER', 'DELETE_ORDER', 'SEARCH_ORDERS',
  'CREATE_ASSIGNMENT', 'RESCHEDULE_ASSIGNMENT', 'DELETE_ASSIGNMENT',
  'CREATE_REPORT', 'UPDATE_REPORT', 'DELETE_REPORT', 'SEARCH_REPORTS',
  'SEARCH_DOCUMENTS', 'CREATE_QUOTATION', 'CREATE_INVOICE', 'CREATE_NOTE',
  'SEND_CHAT', 'SUMMARIZE_CHAT', 'RECORD_TIME', 'ANALYZE_WORKFORCE',
  'ANALYZE_FIELD_TICKET', 'SEND_NOTIFICATION', 'GENERAL',
]);

const VALID_PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

const SYSTEM_PROMPT = (todayIso) => `You are the planning brain of an ERP assistant for MB Boiler & Heizungen AG (Swiss HVAC company). Users write in German, French, Italian or English.

Classify the user message into exactly ONE action and extract parameters. Reply with JSON only, no markdown fences:
{"action":"<ACTION>","params":{"title":null,"description":null,"priority":null,"dueDate":null,"dateTime":null,"durationHours":null,"assigneeName":null,"customerName":null,"projectName":null,"searchTerm":null,"listAll":false,"status":null,"messageContent":null}}

Actions: ${PLANNER_ACTIONS.join(', ')}.

Hard rules:
- QUESTIONS are never mutations. "Wie viele offene Aufgaben gibt es?", "Welche Projekte laufen?", "Zeige mir…" → the matching SEARCH_* action (SEARCH_TASKS, SEARCH_PROJECTS, SEARCH_ORDERS, SEARCH_CUSTOMER, SEARCH_REPORTS, SEARCH_DOCUMENTS). Only choose CREATE_*/UPDATE_*/DELETE_* when the user explicitly asks to create, change or delete something.
- Questions about how the system works, greetings, or anything that maps to no ERP data → GENERAL.
- "Fasse den Chat zusammen" / summarize a chat/conversation → SUMMARIZE_CHAT.
- Parameters:
  - title: clean, human-readable title WITHOUT command words ("Erstelle eine Aufgabe Boiler entkalken" → title "Boiler entkalken"). Keep the user's language.
  - priority: LOW | MEDIUM | HIGH | URGENT ("hohe Priorität" → HIGH, "dringend" → URGENT).
  - dueDate: ISO date YYYY-MM-DD. Resolve relative dates against today = ${todayIso} (timezone Europe/Zurich). "morgen" = today + 1 day.
  - dateTime: ISO datetime for scheduling actions ("morgen um 14 Uhr" → the exact datetime).
  - durationHours: number, for assignments/time recording.
  - assigneeName / customerName / projectName: person, customer or project names mentioned.
  - searchTerm: for SEARCH_* — the term to search for; null with listAll=true when the user wants everything / a count ("alle Aufgaben", "wie viele Rechnungen").
  - status: target status when the user wants a status change ("erledigt" → the status they mean, as said).
  - messageContent: the message body for SEND_CHAT / SEND_NOTIFICATION.
- Unknown fields stay null. Never invent values.`;

class LlmPlannerService {
  constructor() {
    this._llm = null;
  }

  _getLlm() {
    if (!this._llm) {
      this._llm = new ChatOpenAI({
        apiKey: config.ai.apiKey,
        model: config.ai.model || 'gpt-4o',
        temperature: 0,
      });
    }
    return this._llm;
  }

  /**
   * Returns { action, params } or null when planning is unavailable/failed
   * (caller falls back to the deterministic heuristics).
   */
  async plan(input) {
    if (!config.ai.apiKey) return null;
    try {
      const todayIso = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' });
      const response = await this._getLlm().invoke([
        { role: 'system', content: SYSTEM_PROMPT(todayIso) },
        { role: 'user', content: input },
      ]);
      const parsed = JSON.parse(String(response.content).replace(/```json|```/g, '').trim());
      if (!PLANNER_ACTIONS.includes(parsed.action)) return null;
      return { action: parsed.action, params: this._sanitizeParams(parsed.params) };
    } catch (err) {
      logger.warn('LLM planner failed, falling back to heuristics', {
        module: 'ai-agent',
        action: 'planner.plan',
        error: err.message,
      });
      return null;
    }
  }

  _sanitizeParams(raw = {}) {
    const str = (v, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
    const params = {
      title: str(raw.title, 200),
      description: str(raw.description, 2000),
      priority: VALID_PRIORITIES.has(raw.priority) ? raw.priority : null,
      dueDate: this._parseDate(raw.dueDate),
      dateTime: this._parseDate(raw.dateTime),
      durationHours: Number.isFinite(Number(raw.durationHours)) && Number(raw.durationHours) > 0
        ? Math.min(Number(raw.durationHours), 24) : null,
      assigneeName: str(raw.assigneeName, 120),
      customerName: str(raw.customerName, 120),
      projectName: str(raw.projectName, 120),
      searchTerm: str(raw.searchTerm, 120),
      listAll: raw.listAll === true,
      status: str(raw.status, 60),
      messageContent: str(raw.messageContent, 2000),
    };
    return params;
  }

  _parseDate(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    // Date-only values get a working-hour anchor so they don't land at midnight UTC.
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? `${value.trim()}T09:00:00` : value.trim();
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}

export default new LlmPlannerService();
