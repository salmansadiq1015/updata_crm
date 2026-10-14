'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { Clause } from '../types/ai-calling-types';

export type ConditionValue = { all?: Clause[]; any?: Clause[] } | null;
export interface FieldOption { value: string; label: string }

type Operator = 'equals' | 'notEquals' | 'in' | 'exists' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';

const OPERATORS: Array<{ value: Operator; label: string }> = [
  { value: 'equals', label: 'is' },
  { value: 'notEquals', label: 'is not' },
  { value: 'in', label: 'is one of' },
  { value: 'contains', label: 'contains' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'exists', label: 'was answered' },
];

const sel = 'rounded-md border border-border bg-card px-2 py-1 text-sm';

function coerce(v: string): unknown {
  const t = v.trim();
  if (t === 'true' || t === 'yes') return true;
  if (t === 'false' || t === 'no') return false;
  if (t !== '' && /^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return v;
}

/** UI row ⇄ Clause object. */
type Row = { field: string; op: Operator; value: string };

function clauseToRow(c: Clause): Row {
  const op = (['notEquals', 'in', 'contains', 'gt', 'gte', 'lt', 'lte', 'exists'] as Operator[]).find((k) => k in c) || 'equals';
  let value = '';
  if (op === 'in') value = Array.isArray(c.in) ? c.in.map(String).join(', ') : '';
  else if (op === 'exists') value = c.exists ? 'yes' : 'no';
  else value = String((c as unknown as Record<string, unknown>)[op] ?? c.equals ?? '');
  return { field: c.field, op, value };
}

function rowToClause(r: Row): Clause {
  const base: Clause = { field: r.field };
  switch (r.op) {
    case 'in': return { ...base, in: r.value.split(',').map((s) => coerce(s.trim())).filter((v) => v !== '') };
    case 'exists': return { ...base, exists: r.value !== 'no' };
    case 'contains': return { ...base, contains: coerce(r.value) };
    case 'gt': return { ...base, gt: Number(r.value) };
    case 'gte': return { ...base, gte: Number(r.value) };
    case 'lt': return { ...base, lt: Number(r.value) };
    case 'lte': return { ...base, lte: Number(r.value) };
    case 'notEquals': return { ...base, notEquals: coerce(r.value) };
    default: return { ...base, equals: coerce(r.value) };
  }
}

/**
 * Edits a { all?: [], any?: [] } condition as a list of field/operator/value
 * clauses plus a match-ALL / match-ANY toggle. Used for question show-if rules
 * (allowEmpty) and multi-clause qualification rules.
 */
export function ConditionEditor({
  condition, onChange, fields, allowEmpty = false, addLabel = 'Add condition',
}: {
  condition: ConditionValue;
  onChange: (next: ConditionValue) => void;
  fields: FieldOption[];
  allowEmpty?: boolean;
  addLabel?: string;
}) {
  const mode: 'all' | 'any' = condition?.any && !condition?.all ? 'any' : 'all';
  const rows: Row[] = (condition?.all || condition?.any || []).map(clauseToRow);

  const emit = (nextRows: Row[], nextMode: 'all' | 'any') => {
    const valid = nextRows.filter((r) => r.field);
    if (!valid.length) { onChange(allowEmpty ? null : { all: [] }); return; }
    const clauses = valid.map(rowToClause);
    onChange(nextMode === 'any' ? { any: clauses } : { all: clauses });
  };

  const setRow = (i: number, patch: Partial<Row>) => emit(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)), mode);
  const addRow = () => emit([...rows, { field: fields[0]?.value || '', op: 'equals', value: '' }], mode);
  const removeRow = (i: number) => emit(rows.filter((_, idx) => idx !== i), mode);

  if (!rows.length) {
    return (
      <button type="button" onClick={addRow} disabled={!fields.length} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-brand-500 disabled:opacity-50">
        <Plus className="h-3 w-3" /> {addLabel}
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      {rows.length > 1 ? (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          Match
          <select className={sel} value={mode} onChange={(e) => emit(rows, e.target.value as 'all' | 'any')}>
            <option value="all">all</option>
            <option value="any">any</option>
          </select>
          of:
        </div>
      ) : null}
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          <select className={sel} value={r.field} onChange={(e) => setRow(i, { field: e.target.value })}>
            {!r.field ? <option value="">select…</option> : null}
            {fields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <select className={sel} value={r.op} onChange={(e) => setRow(i, { op: e.target.value as Operator })}>
            {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {r.op === 'exists' ? (
            <select className={sel} value={r.value || 'yes'} onChange={(e) => setRow(i, { value: e.target.value })}>
              <option value="yes">yes</option>
              <option value="no">no</option>
            </select>
          ) : (
            <input className={`${sel} min-w-[6rem] flex-1`} placeholder={r.op === 'in' ? 'a, b, c' : 'value'} value={r.value} onChange={(e) => setRow(i, { value: e.target.value })} />
          )}
          <button type="button" onClick={() => removeRow(i)} className="rounded p-1 text-muted-foreground hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      <button type="button" onClick={addRow} disabled={!fields.length} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-brand-500 disabled:opacity-50">
        <Plus className="h-3 w-3" /> add clause
      </button>
    </div>
  );
}
