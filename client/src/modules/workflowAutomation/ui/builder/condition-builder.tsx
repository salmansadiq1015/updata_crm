'use client';
import { useId } from 'react';
import { Plus, Trash2, FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import type { ValidationIssue } from '../../types/workflow-types';

export interface ConditionRule { field: string; operator: string; value?: unknown }
export interface ConditionGroup { op: 'and' | 'or'; rules: Array<ConditionRule | ConditionGroup> }
const isGroup = (r: ConditionRule | ConditionGroup): r is ConditionGroup => Array.isArray((r as ConditionGroup).rules);

const NO_VALUE = new Set(['exists', 'not_exists', 'is_true', 'is_false']);
/** Field catalog grouped for the picker; entries ending with "." take a key suffix. */
const FIELD_GROUPS: Array<{ key: string; fields: string[] }> = [
  { key: 'lead', fields: ['lead.status', 'lead.pipelineStage', 'lead.tags', 'lead.source', 'lead.score', 'lead.scoreBand', 'lead.country', 'lead.city', 'lead.hasPhone', 'lead.hasEmail', 'lead.assigned', 'lead.createdAt', 'lead.lastContactedAt', 'lead.qualification.', 'lead.customFields.'] },
  { key: 'call', fields: ['call.outcome', 'call.disposition', 'call.qualification', 'call.reached', 'call.callbackRequested', 'call.attempts', 'call.durationSeconds', 'call.answers.'] },
  { key: 'analysis', fields: ['analysis.qualification', 'analysis.interest', 'analysis.callbackRequested', 'analysis.objections', 'analysis.fields.'] },
  { key: 'message', fields: ['message.status', 'message.delivered', 'message.replied', 'message.opened', 'message.channel', 'link.clicked'] },
  { key: 'consent', fields: ['consent.voice', 'consent.sms', 'consent.email', 'consent.whatsapp'] },
  { key: 'run', fields: ['run.attempts.', 'run.visits', 'event.'] },
];
const BOOLEAN_FIELDS = new Set(['lead.hasPhone', 'lead.hasEmail', 'lead.assigned', 'call.reached', 'call.callbackRequested', 'analysis.callbackRequested', 'message.delivered', 'message.replied', 'message.opened', 'link.clicked', 'consent.voice', 'consent.sms', 'consent.email', 'consent.whatsapp']);
const NUMBER_FIELDS = new Set(['lead.score', 'call.attempts', 'call.durationSeconds', 'run.visits']);
const SUGGESTIONS: Record<string, string[]> = {
  'lead.status': ['new', 'contacted', 'qualified', 'unqualified', 'converted'],
  'lead.pipelineStage': ['LEAD', 'FOLLOW_UP'],
  'lead.scoreBand': ['hot', 'warm', 'cold', 'unscored'],
  'call.outcome': ['answered', 'unanswered', 'failed', 'blocked'],
  'call.qualification': ['qualified', 'unqualified', 'callback', 'review', 'do_not_contact', 'none'],
  'call.disposition': ['answered_completed', 'answered_partial', 'declined', 'callback_requested', 'do_not_contact', 'no_answer', 'busy', 'voicemail', 'failed'],
  'analysis.qualification': ['qualified', 'unqualified', 'callback', 'none'],
  'message.status': ['queued', 'accepted', 'sent', 'delivered', 'read', 'failed', 'undelivered'],
  'message.channel': ['sms', 'whatsapp', 'email'],
};

function defaultOperator(field: string) {
  if (BOOLEAN_FIELDS.has(field)) return 'is_true';
  if (NUMBER_FIELDS.has(field) || field.startsWith('run.attempts.')) return 'gte';
  if (field === 'lead.tags') return 'contains';
  return 'equals';
}
function splitField(field: string) {
  for (const g of FIELD_GROUPS) for (const f of g.fields) if (f.endsWith('.') && field.startsWith(f)) return { base: f, suffix: field.slice(f.length) };
  return { base: field, suffix: '' };
}

interface Props {
  value: ConditionGroup;
  onChange: (v: ConditionGroup) => void;
  issues?: ValidationIssue[];
  nodeOptions: Array<{ id: string; label: string }>;
  qualificationKeys: string[];
}

export function ConditionBuilder({ value, onChange, issues = [], nodeOptions, qualificationKeys }: Props) {
  const tree = value?.rules ? value : { op: 'and' as const, rules: [] };
  return <GroupEditor group={tree} path="rules" depth={0} onChange={onChange} issues={issues} nodeOptions={nodeOptions} qualificationKeys={qualificationKeys} />;
}

function GroupEditor({ group, onChange, onRemove, path, depth, issues, nodeOptions, qualificationKeys }: {
  group: ConditionGroup; onChange: (g: ConditionGroup) => void; onRemove?: () => void; path: string; depth: number; issues: ValidationIssue[];
  nodeOptions: Props['nodeOptions']; qualificationKeys: string[];
}) {
  const { t } = useLanguage();
  const setRule = (i: number, r: ConditionRule | ConditionGroup) => onChange({ ...group, rules: group.rules.map((x, j) => (j === i ? r : x)) });
  const removeRule = (i: number) => onChange({ ...group, rules: group.rules.filter((_, j) => j !== i) });
  const groupIssues = issues.filter((i) => i.field === path);
  return (
    <div className={cn('space-y-2 rounded-xl border p-2.5', depth === 0 ? 'border-border bg-muted/20' : 'border-dashed border-primary/30 bg-primary/[0.03]')}>
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-lg border bg-background p-0.5" role="radiogroup" aria-label={t('workflowBuilder.condition.match', 'Match')}>
          {(['and', 'or'] as const).map((op) => (
            <button key={op} type="button" role="radio" aria-checked={group.op === op} onClick={() => onChange({ ...group, op })}
              className={cn('rounded-md px-2.5 py-1 text-xs font-semibold transition-colors', group.op === op ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {op === 'and' ? t('workflowBuilder.condition.allOf', 'ALL of') : t('workflowBuilder.condition.anyOf', 'ANY of')}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{t('workflowBuilder.condition.theseRules', 'these rules')}</span>
        {onRemove && (
          <Button type="button" variant="ghost" size="icon" className="ms-auto size-7 text-muted-foreground hover:text-rose-600" onClick={onRemove} aria-label={t('workflowBuilder.condition.removeGroup', 'Remove group')}>
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      {group.rules.map((rule, i) => (
        <div key={i} className="relative">
          {i > 0 && <span className="mb-1 block ps-1 text-[10px] font-bold uppercase tracking-wider text-primary/70">{group.op === 'and' ? t('workflowBuilder.condition.and', 'and') : t('workflowBuilder.condition.or', 'or')}</span>}
          {isGroup(rule)
            ? <GroupEditor group={rule} path={`${path}.${i}.rules`} depth={depth + 1} onChange={(g) => setRule(i, g)} onRemove={() => removeRule(i)} issues={issues} nodeOptions={nodeOptions} qualificationKeys={qualificationKeys} />
            : <RuleEditor rule={rule} path={`${path}.${i}`} onChange={(r) => setRule(i, r)} onRemove={() => removeRule(i)} issues={issues} nodeOptions={nodeOptions} qualificationKeys={qualificationKeys} />}
        </div>
      ))}

      {groupIssues.map((i) => <p key={i.code} role="alert" className="text-xs text-rose-600 dark:text-rose-400">{t(`workflowBuilder.validation.${i.code}`, i.code)}</p>)}

      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onChange({ ...group, rules: [...group.rules, { field: 'lead.status', operator: 'equals', value: '' }] })}>
          <Plus className="me-1 size-3.5" />{t('workflowBuilder.condition.addRule', 'Add rule')}
        </Button>
        {depth < 3 && (
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onChange({ ...group, rules: [...group.rules, { op: group.op === 'and' ? 'or' : 'and', rules: [{ field: 'lead.status', operator: 'equals', value: '' }] }] })}>
            <FolderPlus className="me-1 size-3.5" />{t('workflowBuilder.condition.addGroup', 'Add group')}
          </Button>
        )}
      </div>
    </div>
  );
}

function RuleEditor({ rule, onChange, onRemove, path, issues, nodeOptions, qualificationKeys }: {
  rule: ConditionRule; onChange: (r: ConditionRule) => void; onRemove: () => void; path: string; issues: ValidationIssue[];
  nodeOptions: Props['nodeOptions']; qualificationKeys: string[];
}) {
  const { t } = useLanguage();
  const listId = useId();
  const { base, suffix } = splitField(rule.field || '');
  const fieldIssues = issues.filter((i) => i.field?.startsWith(path));
  const needsSuffix = base.endsWith('.');
  const suggestions = SUGGESTIONS[base] || [];
  const setField = (f: string) => onChange({ field: f, operator: defaultOperator(f), value: '' });
  const operators = BOOLEAN_FIELDS.has(base)
    ? ['is_true', 'is_false']
    : ['equals', 'not_equals', 'in', 'not_in', 'contains', 'not_contains', 'gt', 'gte', 'lt', 'lte', 'exists', 'not_exists', 'is_true', 'is_false', 'before', 'after', 'within_last_hours', 'older_than_hours'];

  return (
    <div className={cn('space-y-2 rounded-lg border bg-background p-2.5 shadow-xs', fieldIssues.length && 'border-rose-300 dark:border-rose-500/50')}>
      <div className="flex items-start gap-1.5">
        <Select value={base} onValueChange={setField}>
          <SelectTrigger className="h-8 min-w-0 flex-1 text-xs" aria-label={t('workflowBuilder.condition.field', 'Field')}><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-80">
            {FIELD_GROUPS.map((g) => (
              <SelectGroup key={g.key}>
                <SelectLabel className="text-[11px]">{t(`workflowBuilder.condition.group.${g.key}`, g.key)}</SelectLabel>
                {g.fields.map((f) => <SelectItem key={f} value={f} className="text-xs">{t(`workflowBuilder.condition.fields.${f.replace(/\.$/, '_')}`, f)}</SelectItem>)}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground hover:text-rose-600" onClick={onRemove} aria-label={t('workflowBuilder.condition.removeRule', 'Remove rule')}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {needsSuffix && (
        base === 'run.attempts.' ? (
          <Select value={suffix || undefined} onValueChange={(v) => onChange({ ...rule, field: `${base}${v}` })}>
            <SelectTrigger className="h-8 text-xs" aria-label={t('workflowBuilder.condition.step', 'Step')}><SelectValue placeholder={t('workflowBuilder.condition.chooseStep', 'Choose a step')} /></SelectTrigger>
            <SelectContent>{nodeOptions.map((n) => <SelectItem key={n.id} value={n.id} className="text-xs">{n.label}</SelectItem>)}</SelectContent>
          </Select>
        ) : base === 'lead.qualification.' ? (
          <Select value={suffix || undefined} onValueChange={(v) => onChange({ ...rule, field: `${base}${v}` })}>
            <SelectTrigger className="h-8 text-xs" aria-label={t('workflowBuilder.condition.key', 'Key')}><SelectValue placeholder={t('workflowBuilder.condition.chooseKey', 'Choose a field')} /></SelectTrigger>
            <SelectContent>{qualificationKeys.map((k) => <SelectItem key={k} value={k} className="text-xs">{t(`workflowBuilder.qualField.${k}`, k)}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <Input value={suffix} onChange={(e) => onChange({ ...rule, field: `${base}${e.target.value.replace(/[^a-zA-Z0-9_.]/g, '')}` })} className="h-8 font-mono text-xs"
            placeholder={t('workflowBuilder.condition.keyPlaceholder', 'field key, e.g. budget')} aria-label={t('workflowBuilder.condition.key', 'Key')} />
        )
      )}

      <div className="flex gap-1.5">
        <Select value={rule.operator} onValueChange={(op) => onChange({ ...rule, operator: op, value: NO_VALUE.has(op) ? undefined : rule.value ?? '' })}>
          <SelectTrigger className="h-8 w-[46%] shrink-0 text-xs" aria-label={t('workflowBuilder.condition.operator', 'Operator')}><SelectValue /></SelectTrigger>
          <SelectContent>{operators.map((op) => <SelectItem key={op} value={op} className="text-xs">{t(`workflowBuilder.operator.${op}`, op)}</SelectItem>)}</SelectContent>
        </Select>
        {!NO_VALUE.has(rule.operator) && (
          <>
            <Input value={rule.value == null ? '' : String(rule.value)} onChange={(e) => onChange({ ...rule, value: e.target.value })} list={suggestions.length ? listId : undefined}
              className="h-8 min-w-0 flex-1 text-xs" aria-label={t('workflowBuilder.condition.value', 'Value')}
              placeholder={['in', 'not_in'].includes(rule.operator) ? t('workflowBuilder.condition.listPlaceholder', 'a, b, c') : t('workflowBuilder.condition.valuePlaceholder', 'Value')} />
            {suggestions.length > 0 && <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
          </>
        )}
      </div>
      {fieldIssues.map((i) => <p key={`${i.field}-${i.code}`} role="alert" className="text-xs text-rose-600 dark:text-rose-400">{t(`workflowBuilder.validation.${i.code}`, i.code)}</p>)}
    </div>
  );
}
