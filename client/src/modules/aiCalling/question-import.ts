import type { Clause, Question, QuestionType, RuleAction, StatusRule } from './types/ai-calling-types';

/**
 * Plain-text question format: people paste it, or ask any AI assistant to write
 * it with the prompt from buildAiPrompt(). Blocks are separated by `---`, a
 * numbered/bulleted line, or a new `Q:` line. Lenient on input (aliases, Q&A
 * pairs, code fences), strict on output: everything the server would reject is
 * reported before anything is applied.
 */

export const MAX_QUESTIONS = 40;
const QUESTION_TYPES: QuestionType[] = ['short_text', 'long_text', 'boolean', 'single_choice', 'multiple_choice', 'integer', 'decimal', 'currency', 'date', 'time', 'email', 'phone', 'url', 'address', 'rating', 'enum'];
const CHOICE_TYPES = new Set<QuestionType>(['single_choice', 'multiple_choice', 'enum']);
const NUMERIC_TYPES = new Set<QuestionType>(['integer', 'decimal', 'currency', 'rating']);

const TYPE_ALIASES: Record<string, QuestionType> = {
  text: 'short_text', 'short text': 'short_text', short: 'short_text', name: 'short_text',
  'long text': 'long_text', paragraph: 'long_text', long: 'long_text', notes: 'long_text',
  'yes/no': 'boolean', 'yes / no': 'boolean', 'yes no': 'boolean', yesno: 'boolean', bool: 'boolean',
  choice: 'single_choice', 'single choice': 'single_choice', select: 'single_choice', dropdown: 'single_choice',
  'multiple choice': 'multiple_choice', multi: 'multiple_choice', 'multi select': 'multiple_choice', checkboxes: 'multiple_choice',
  number: 'integer', int: 'integer', count: 'integer', float: 'decimal', money: 'currency', amount: 'currency', price: 'currency', budget: 'currency',
  website: 'url', link: 'url', 'phone number': 'phone', mobile: 'phone', telephone: 'phone', 'e-mail': 'email', mail: 'email', score: 'rating',
};
const ACTION_ALIASES: Record<string, RuleAction> = {
  qualified: 'mark_qualified', qualify: 'mark_qualified', unqualified: 'mark_unqualified', disqualify: 'mark_unqualified',
  'not interested': 'mark_not_interested', callback: 'schedule_callback', 'call back': 'schedule_callback',
  review: 'request_review', 'do not contact': 'mark_do_not_contact', dnc: 'mark_do_not_contact', contacted: 'mark_contacted', none: 'none',
};
const ACTIONS: RuleAction[] = ['mark_qualified', 'mark_unqualified', 'mark_not_interested', 'schedule_callback', 'request_review', 'mark_do_not_contact', 'mark_contacted', 'none'];

const KEYS: Record<string, string> = {
  q: 'text', question: 'text', ask: 'text',
  label: 'label', title: 'label', field: 'label',
  type: 'type', 'answer type': 'type', format: 'type',
  required: 'required', mandatory: 'required',
  confirm: 'confirm', 'read back': 'confirm', 'confirm (read back)': 'confirm',
  options: 'options', choices: 'options',
  guidance: 'guidance', instructions: 'guidance', description: 'guidance', note: 'guidance', notes: 'guidance', hint: 'guidance',
  a: 'answer', answer: 'answer', 'expected answer': 'answer', example: 'answer',
  key: 'key', 'field key': 'key', id: 'key',
  'map to': 'mapTo', mapto: 'mapTo', 'crm field': 'mapTo',
  min: 'min', minimum: 'min', max: 'max', maximum: 'max', 'max length': 'maxLength', maxlength: 'maxLength',
  sensitive: 'sensitive', 'ask if': 'askIf', 'ask only if': 'askIf', 'show if': 'askIf', condition: 'askIf',
  rule: 'rule',
};

export interface ImportIssue { line?: number; question?: number; message: string }
export interface ParsedImport {
  questions: Question[]; rules: StatusRule[];
  errors: ImportIssue[]; warnings: ImportIssue[];
}
type Block = { start: number; fields: Record<string, string>; askIfRaw?: string };

const yes = (v: string) => /^(y|yes|true|1|required|on)$/i.test(v.trim());
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'question';
const splitList = (v: string) => v.split(/\s*[|,;]\s*|\s+\/\s+/).map(s => s.trim()).filter(Boolean);

export function resolveType(raw: string): QuestionType | null {
  const key = raw.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const exact = QUESTION_TYPES.find(t => t.replace(/_/g, ' ') === key);
  return exact || TYPE_ALIASES[key] || TYPE_ALIASES[key.replace(/ /g, '')] || null;
}

function inferType(text: string, fields: Record<string, string>): QuestionType {
  if (fields.options) return 'single_choice';
  const answer = fields.answer || '';
  if (/^\s*(yes\s*\/\s*no|yes or no|y\/n)\s*$/i.test(answer)) return 'boolean';
  const t = text.toLowerCase();
  if (/\be-?mail\b/.test(t)) return 'email';
  if (/\b(phone|mobile|whatsapp) (number)?\b|number .*reach you/.test(t)) return 'phone';
  if (/\bwebsite\b|\burl\b/.test(t)) return 'url';
  if (/\baddress\b/.test(t)) return 'address';
  if (/\bhow many\b/.test(t)) return 'integer';
  if (/\bbudget\b|\bhow much\b/.test(t)) return 'currency';
  if (/^(do|does|did|are|is|was|were|would|could|can|have|has|will|should)\b/.test(t.trim())) return 'boolean';
  return 'short_text';
}

/** Splits text into question blocks plus global rule lines. */
const CONTINUABLE = new Set(['text', 'label', 'guidance', 'answer', 'options', 'askIf']);

function toBlocks(text: string): { blocks: Block[]; ruleLines: Array<{ line: number; value: string }>; skipped: number } {
  const lines = text.replace(/\r\n?/g, '\n').replace(/^```[\w-]*\s*$/gm, '').split('\n');
  // With explicit "Q:" markers, stray prose (an AI's "Here you go", "Let me know…") is commentary, not a question.
  const structured = /^\s*(?:\d{1,2}[.)]\s*)?(?:\*\*)?(?:q|question)(?:\*\*)?\s*[:：]/im.test(text);
  let skipped = 0;
  const blocks: Block[] = [];
  const ruleLines: Array<{ line: number; value: string }> = [];
  let current: Block | null = null;
  let lastKey: string | null = null;
  let blankBefore = false;
  const open = (start: number) => { current = { start, fields: {} }; blocks.push(current); lastKey = null; return current; };

  lines.forEach((rawLine, i) => {
    const lineNo = i + 1;
    let line = rawLine.trim();
    if (!line) { blankBefore = true; return; }
    if (/^(-{3,}|\*{3,}|={3,}|_{3,})$/.test(line)) { current = null; lastKey = null; blankBefore = false; return; }
    if (/^#{1,6}\s/.test(line)) { blankBefore = false; return; } // markdown headings ("## Questions")
    line = line.replace(/^\*\*(.+?)\*\*/, '$1'); // "**Q:** ..." from chat UIs
    let bullet = false;
    const listMatch = line.match(/^(?:\d{1,2}[.)]|[-*•])\s+(.*)$/);
    if (listMatch) { bullet = true; line = listMatch[1].replace(/^\*\*(.+?)\*\*/, '$1'); }

    const kv = line.match(/^([A-Za-z][A-Za-z ()/-]{0,24}?)\s*[:：]\s*(.*)$/);
    const key = kv ? KEYS[kv[1].trim().toLowerCase()] : undefined;
    if (key === 'rule') { ruleLines.push({ line: lineNo, value: kv![2].trim() }); blankBefore = false; return; }

    if (key) {
      const value = kv![2].trim();
      const block = current as Block | null;
      if (key === 'text' && (!block || block.fields.text)) open(lineNo);
      else if (!block) open(lineNo);
      (current as unknown as Block).fields[key] = value;
      lastKey = key;
    } else {
      const block = current as Block | null;
      const isQuestion = /\?\s*$/.test(line);
      // A new unkeyed question: list item, or a "?" line after a blank line once this block has its question.
      const startsQuestion = structured
        ? Boolean(bullet || isQuestion) && (!block || (Boolean(block.fields.text) && (bullet || blankBefore)))
        : !block || (bullet && Boolean(block.fields.text)) || (blankBefore && Boolean(block.fields.text) && isQuestion);
      const continues = block && lastKey && CONTINUABLE.has(lastKey) && !blankBefore;
      if (startsQuestion) { open(lineNo).fields.text = line; lastKey = 'text'; }
      else if (continues) block.fields[lastKey!] = `${block.fields[lastKey!]} ${line}`.trim();
      else if (block && !block.fields.text && !structured) { block.fields.text = line; lastKey = 'text'; }
      else if (!structured && lastKey && block) block.fields[lastKey] = `${block.fields[lastKey]} ${line}`.trim();
      else skipped += 1;
    }
    blankBefore = false;
  });
  return { blocks, ruleLines, skipped };
}

function coerce(value: string, type: QuestionType | undefined): unknown {
  const v = value.trim().replace(/^["']|["']$/g, '');
  if (type === 'boolean') { if (/^(yes|true|y)$/i.test(v)) return true; if (/^(no|false|n)$/i.test(v)) return false; }
  if (type && NUMERIC_TYPES.has(type) && v !== '' && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

/** "budget >= 1000 and interest = yes" → { all: [...] } against the questions known so far. */
function parseCondition(raw: string, known: Question[], where: string): { condition?: { all?: Clause[]; any?: Clause[] }; error?: string } {
  const hasAnd = /\s+and\s+/i.test(raw); const hasOr = /\s+or\s+/i.test(raw);
  if (hasAnd && hasOr) return { error: `${where}: use either "and" or "or", not both` };
  const parts = raw.split(hasOr ? /\s+or\s+/i : /\s+and\s+/i).map(s => s.trim()).filter(Boolean);
  const clauses: Clause[] = [];
  for (const part of parts) {
    const m = part.match(/^(.+?)\s*(>=|<=|!=|=|>|<|\bin\b|\bcontains\b|\bis set\b|\bexists\b|\bis not set\b)\s*(.*)$/i);
    if (!m) return { error: `${where}: cannot read "${part}" (expected e.g. interest = yes)` };
    const ref = m[1].trim().toLowerCase();
    const q = known.find(k => k.fieldKey.toLowerCase() === ref || k.label.toLowerCase() === ref);
    if (!q) return { error: `${where}: "${m[1].trim()}" is not an earlier question key or label` };
    const op = m[2].toLowerCase(); const value = m[3];
    const c: Clause = { field: q.fieldKey };
    if (op === '=') c.equals = coerce(value, q.type);
    else if (op === '!=') c.notEquals = coerce(value, q.type);
    else if (op === 'in') c.in = splitList(value).map(v => coerce(v, q.type));
    else if (op === 'contains') c.contains = coerce(value, q.type);
    else if (op === 'is set' || op === 'exists') c.exists = true;
    else if (op === 'is not set') c.exists = false;
    else {
      const n = Number(value.trim());
      if (Number.isNaN(n)) return { error: `${where}: "${op}" needs a number` };
      c[({ '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' } as const)[op as '>' | '>=' | '<' | '<=']] = n;
    }
    clauses.push(c);
  }
  return { condition: hasOr ? { any: clauses } : { all: clauses } };
}

export function parseQuestionText(text: string, { existing = [] as Question[], mode = 'replace' as 'replace' | 'append' } = {}): ParsedImport {
  const { blocks, ruleLines, skipped } = toBlocks(text);
  const errors: ImportIssue[] = []; const warnings: ImportIssue[] = [];
  if (skipped) warnings.push({ message: `Ignored ${skipped} line${skipped === 1 ? '' : 's'} that ${skipped === 1 ? 'is' : 'are'} not part of a question (for example an introduction from the AI).` });
  const base = mode === 'append' ? existing : [];
  const used = new Set(base.map(q => q.fieldKey));
  const questions: Question[] = [];

  blocks.forEach((block, i) => {
    const n = i + 1; const f = block.fields;
    const where = `Question ${n} (line ${block.start})`;
    const qText = (f.text || '').trim();
    if (!qText) { errors.push({ line: block.start, question: n, message: `${where}: missing the question text (Q: …)` }); return; }
    let type: QuestionType;
    if (f.type) {
      const resolved = resolveType(f.type);
      if (!resolved) { errors.push({ line: block.start, question: n, message: `${where}: unknown type "${f.type}". Use one of: ${QUESTION_TYPES.join(', ')}` }); return; }
      type = resolved;
    } else { type = inferType(qText, f); warnings.push({ question: n, message: `${where}: no Type given, using "${type.replace(/_/g, ' ')}"` }); }

    const label = (f.label || qText.replace(/\?+$/, '')).trim().slice(0, 200);
    if (!f.label && qText.length > 60) warnings.push({ question: n, message: `${where}: no Label given; the question text is used as the label` });
    let fieldKey = f.key ? f.key.trim() : slug(f.label || qText.split(/\s+/).slice(0, 5).join(' '));
    if (f.key && !/^[a-zA-Z0-9_.]+$/.test(fieldKey)) { errors.push({ question: n, message: `${where}: Key "${fieldKey}" may only use letters, numbers, "_" and "."` }); return; }
    if (used.has(fieldKey)) {
      if (f.key) { errors.push({ question: n, message: `${where}: Key "${fieldKey}" is already used` }); return; }
      let k = 2; while (used.has(`${fieldKey}_${k}`)) k += 1; fieldKey = `${fieldKey}_${k}`;
    }
    used.add(fieldKey);

    const q: Question = {
      fieldKey: fieldKey.slice(0, 80), label, text: qText.slice(0, 1000), type,
      required: f.required ? yes(f.required) : true, confirmCritical: f.confirm ? yes(f.confirm) : false,
      order: base.length + questions.length + 1,
    };
    if (qText.length > 1000) warnings.push({ question: n, message: `${where}: question text shortened to 1000 characters` });
    const guidance = [f.guidance, f.answer ? `Expected answer: ${f.answer}` : ''].filter(Boolean).join('\n');
    if (guidance) q.description = guidance.slice(0, 1000);
    if (f.options) q.options = splitList(f.options).slice(0, 50);
    if (CHOICE_TYPES.has(type) && !q.options?.length) { errors.push({ question: n, message: `${where}: a ${type.replace(/_/g, ' ')} question needs Options (e.g. Options: yes, no, later)` }); return; }
    if (f.options && !CHOICE_TYPES.has(type)) warnings.push({ question: n, message: `${where}: Options are ignored for type "${type.replace(/_/g, ' ')}"` });
    if (!CHOICE_TYPES.has(type)) delete q.options;
    for (const k of ['min', 'max', 'maxLength'] as const) {
      if (f[k] == null || f[k] === '') continue;
      const v = Number(f[k]);
      if (Number.isNaN(v)) errors.push({ question: n, message: `${where}: ${k} must be a number` }); else q[k] = k === 'maxLength' ? Math.round(v) : v;
    }
    if (f.mapTo) q.mapTo = f.mapTo.trim().slice(0, 120);
    if (f.sensitive) q.sensitive = yes(f.sensitive);
    if (f.askIf) {
      const parsed = parseCondition(f.askIf, [...base, ...questions], where);
      if (parsed.error) { errors.push({ question: n, message: parsed.error }); return; }
      q.condition = parsed.condition;
    }
    questions.push(q);
  });

  if (!blocks.length && text.trim()) errors.push({ message: 'No questions found. Start each question with "Q:" or a numbered line.' });
  if (base.length + questions.length > MAX_QUESTIONS) errors.push({ message: `An agent can have at most ${MAX_QUESTIONS} questions (this would make ${base.length + questions.length}).` });

  const rules: StatusRule[] = [];
  const allQuestions = [...base, ...questions];
  for (const { line, value } of ruleLines) {
    const m = value.match(/^(.+?)\s+if\s+(.+?)(\s*\[(?:needs )?review\])?$/i);
    if (!m) { errors.push({ line, message: `Rule (line ${line}): expected "Rule: qualified if interest = yes"` }); continue; }
    const actionKey = m[1].trim().toLowerCase().replace(/_/g, ' ');
    const action = (ACTIONS.find(a => a.replace(/_/g, ' ') === actionKey) || ACTION_ALIASES[actionKey]) as RuleAction | undefined;
    if (!action) { errors.push({ line, message: `Rule (line ${line}): unknown action "${m[1].trim()}". Use: ${ACTIONS.join(', ')}` }); continue; }
    const parsed = parseCondition(m[2], allQuestions, `Rule (line ${line})`);
    if (parsed.error || !parsed.condition) { errors.push({ line, message: parsed.error || `Rule (line ${line}): missing condition` }); continue; }
    rules.push({ id: `rule_${rules.length + 1}_${slug(action)}`, when: parsed.condition as StatusRule['when'], action, requiresReview: Boolean(m[3]) });
  }
  return { questions, rules, errors, warnings };
}

const OP_TEXT: Array<[keyof Clause, string]> = [['equals', '='], ['notEquals', '!='], ['gt', '>'], ['gte', '>='], ['lt', '<'], ['lte', '<='], ['contains', 'contains']];
const valueText = (v: unknown) => typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v);
function conditionText(condition: Question['condition']): string {
  if (!condition) return '';
  const group = condition.any?.length ? 'any' : 'all';
  return (condition[group] || []).map(c => {
    if (c.in) return `${c.field} in ${c.in.map(valueText).join(' | ')}`;
    if (c.exists !== undefined) return `${c.field} ${c.exists ? 'is set' : 'is not set'}`;
    const op = OP_TEXT.find(([k]) => c[k] !== undefined);
    return op ? `${c.field} ${op[1]} ${valueText(c[op[0]])}` : c.field;
  }).join(group === 'any' ? ' or ' : ' and ');
}

/** The current questions (and rules) in the paste format — round-trips through parseQuestionText. */
export function serializeQuestions(questions: Question[], rules: StatusRule[] = []): string {
  const blocks = questions.map(q => [
    `Q: ${q.text}`, `Label: ${q.label}`, `Key: ${q.fieldKey}`, `Type: ${q.type}`,
    `Required: ${q.required ? 'yes' : 'no'}`, `Confirm: ${q.confirmCritical ? 'yes' : 'no'}`,
    q.options?.length ? `Options: ${q.options.map(o => typeof o === 'string' ? o : o.value).join(', ')}` : '',
    q.description ? `Guidance: ${q.description.replace(/\s*\n\s*/g, ' ')}` : '',
    q.min != null ? `Min: ${q.min}` : '', q.max != null ? `Max: ${q.max}` : '', q.maxLength != null ? `Max length: ${q.maxLength}` : '',
    q.mapTo ? `Map to: ${q.mapTo}` : '', q.sensitive ? 'Sensitive: yes' : '',
    q.condition ? `Ask if: ${conditionText(q.condition)}` : '',
  ].filter(Boolean).join('\n'));
  const ruleText = rules.filter(r => r.action).map(r => `Rule: ${r.action} if ${conditionText(r.when)}${r.requiresReview ? ' [review]' : ''}`);
  return [...blocks, ...(ruleText.length ? [ruleText.join('\n')] : [])].join('\n---\n');
}

export const FORMAT_GUIDE = `Q: <the question, exactly as the agent should ask it>
Label: <short name shown in the CRM>
Key: <unique snake_case id, e.g. budget>
Type: short_text | long_text | boolean | single_choice | multiple_choice | integer | decimal | currency | date | time | email | phone | url | address | rating
Required: yes | no
Confirm: yes | no   (read the answer back to the lead)
Options: a, b, c   (only for single_choice / multiple_choice)
Guidance: <how to interpret or validate the answer>
Ask if: <earlier key> = <value>   (optional; also != > >= < <= in contains, joined by "and" or "or")
---
(next question)

Rule: qualified | unqualified | not interested | callback | review | do not contact | contacted if <key> = <value> [review]`;

export const EXAMPLE = `Q: Are you the person who makes decisions about software for your business?
Label: Decision maker
Key: decision_maker
Type: boolean
Required: yes
Confirm: no
---
Q: Roughly how many people work at your company?
Label: Company size
Key: company_size
Type: integer
Required: yes
Min: 1
---
Q: Which of these best describes your main goal: more leads, better follow-up, or reporting?
Label: Main goal
Key: main_goal
Type: single_choice
Options: more leads, better follow-up, reporting
Required: no
---
Q: What monthly budget have you set aside for this?
Label: Monthly budget
Key: budget
Type: currency
Required: no
Ask if: decision_maker = yes
Guidance: Accept a range and record the lower number.
---
Rule: qualified if decision_maker = yes and company_size >= 5
Rule: not interested if main_goal = reporting [review]`;

export interface PromptParams {
  company: string; offering: string; goal: string; audience: string;
  language: string; count: number; mustCollect: string; tone: string; includeRules: boolean;
}
export const DEFAULT_PROMPT_PARAMS: PromptParams = {
  company: '', offering: '', goal: 'Qualify the lead for a sales follow-up', audience: '',
  language: 'English', count: 6, mustCollect: '', tone: 'Friendly and professional', includeRules: true,
};

/** A ready-to-paste prompt for any AI assistant; its answer pastes straight back into the importer. */
export function buildAiPrompt(p: PromptParams): string {
  const v = (s: string, fallback: string) => s.trim() || fallback;
  const count = Math.min(MAX_QUESTIONS, Math.max(1, Math.round(p.count) || 6));
  return `You are designing the question script for an AI phone agent that calls business leads.

Context
- Company: ${v(p.company, '[YOUR COMPANY NAME]')}
- What we offer: ${v(p.offering, '[WHAT YOU SELL OR DO]')}
- Goal of the call: ${v(p.goal, '[WHAT THE CALL SHOULD ACHIEVE]')}
- Who we are calling: ${v(p.audience, '[TARGET AUDIENCE]')}
- Information we must collect: ${v(p.mustCollect, 'whatever best serves the goal')}
- Tone: ${v(p.tone, 'Friendly and professional')}
- Language of the questions: ${v(p.language, 'English')}

Task
Write ${count} questions the agent should ask, in the order it should ask them.

Rules for the questions
- One topic per question; short and easy to answer over the phone.
- Start with the most important qualifying questions.
- Never ask for passwords, card or bank numbers, or government ID numbers.
- Pick the most specific Type. Use single_choice or multiple_choice only with an Options line.
- Use "Ask if" only to reference the Key of an EARLIER question.
- Keys must be unique, lowercase snake_case.
- Write Q, Label, Options and Guidance in ${v(p.language, 'English')}; keep the field names (Q:, Label:, Type: …) and Type values in English.
${p.includeRules ? '- After the questions, add 1 to 3 "Rule:" lines that decide when a lead is qualified or not interested.\n' : ''}
Output format
Reply with ONLY the questions in exactly this format, separated by a line containing only ---. No introduction, no explanation, no markdown, no code block.

${FORMAT_GUIDE}

Example of a correct reply
${EXAMPLE}`;
}
