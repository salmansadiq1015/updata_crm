'use client';
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Flag, Info, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import type { ValidationIssue, ValidationResult } from '../../types/workflow-types';

export type QuickFix =
  | { kind: 'add_end'; nodeId: string; port: string }
  | { kind: 'intentional_end'; nodeId: string }
  | { kind: 'add_trigger' }
  | { kind: 'add_end_free' };

type Level = 'error' | 'warning' | 'info';
const INFO_CODES = new Set(['branch_unconnected', 'loop_present']);

export function issueLevel(issue: ValidationIssue, isError: boolean): Level {
  if (isError) return 'error';
  return issue.severity === 'info' || INFO_CODES.has(issue.code) ? 'info' : 'warning';
}

export function fixesFor(issue: ValidationIssue, outputsOf: (nodeId: string) => string[]): QuickFix[] {
  if (issue.code === 'node_dead_end' && issue.nodeId) {
    const port = outputsOf(issue.nodeId)[0];
    return [...(port ? [{ kind: 'add_end' as const, nodeId: issue.nodeId, port }] : []), { kind: 'intentional_end', nodeId: issue.nodeId }];
  }
  if (issue.code === 'branch_unconnected' && issue.nodeId) return (issue.ports || []).slice(0, 4).map((port) => ({ kind: 'add_end' as const, nodeId: issue.nodeId!, port }));
  if (issue.code === 'condition_branch_missing' && issue.nodeId) return ['yes', 'no'].map((port) => ({ kind: 'add_end' as const, nodeId: issue.nodeId!, port }));
  if (issue.code === 'trigger_missing') return [{ kind: 'add_trigger' }];
  if (issue.code === 'end_missing') return [{ kind: 'add_end_free' }];
  return [];
}

interface Props {
  validation: ValidationResult | null;
  nodeLabel: (id?: string | null) => string;
  outputsOf: (nodeId: string) => string[];
  connectedPorts: (nodeId: string) => Set<string>;
  onFocus: (nodeId: string) => void;
  onFix: (fix: QuickFix) => void;
  onClose: () => void;
  readOnly: boolean;
}

export function ValidationPanel({ validation, nodeLabel, outputsOf, connectedPorts, onFocus, onFix, onClose, readOnly }: Props) {
  const { t } = useLanguage();
  const items = validation ? [
    ...validation.errors.map((i) => ({ ...i, level: 'error' as Level })),
    ...validation.warnings.map((i) => ({ ...i, level: issueLevel(i, false) })),
  ] : [];
  const counts = { error: items.filter((i) => i.level === 'error').length, warning: items.filter((i) => i.level === 'warning').length, info: items.filter((i) => i.level === 'info').length };
  const icon = { error: AlertCircle, warning: AlertTriangle, info: Info };
  const tone = {
    error: 'border-rose-500/30 bg-rose-500/5 text-rose-900 dark:text-rose-100',
    warning: 'border-amber-500/30 bg-amber-500/5 text-amber-950 dark:text-amber-100',
    info: 'border-sky-500/25 bg-sky-500/5 text-sky-950 dark:text-sky-100',
  };
  const fixLabel = (f: QuickFix) => f.kind === 'add_end' ? t('workflowBuilder.fixAction.addEnd', 'Add End step on “{port}”', { port: t(`workflow.port.${f.port}`, f.port) })
    : f.kind === 'intentional_end' ? t('workflowBuilder.fixAction.intentional', 'Mark as intentional end')
    : f.kind === 'add_trigger' ? t('workflowBuilder.fixAction.addTrigger', 'Add a “Campaign start” trigger') : t('workflowBuilder.fixAction.addEndFree', 'Add an End step');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-3 border-b p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t('workflowBuilder.validationPanel.title', 'Workflow check')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('workflowBuilder.validationPanel.subtitle', 'Errors block publishing. Warnings and suggestions help you avoid surprises.')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
            <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-rose-700 dark:text-rose-300">{t('workflowBuilder.validationPanel.errors', '{count} errors', { count: counts.error })}</span>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">{t('workflowBuilder.validationPanel.warnings', '{count} warnings', { count: counts.warning })}</span>
            <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-700 dark:text-sky-300">{t('workflowBuilder.validationPanel.suggestions', '{count} suggestions', { count: counts.info })}</span>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label={t('workflowBuilder.panel.close', 'Close')}><X className="size-4" /></Button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {!validation && <p className="text-sm text-muted-foreground">{t('workflowBuilder.panel.validating', 'Checking…')}</p>}
        {validation && !items.length && (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4" />{t('workflowBuilder.validationPanel.clean', 'No problems found — ready to publish.')}</p>
        )}
        {items.map((issue, idx) => {
          const Icon = icon[issue.level];
          const fixes = readOnly ? [] : fixesFor(issue, outputsOf).filter((f) => f.kind !== 'add_end' || !connectedPorts(f.nodeId).has(f.port));
          return (
            <div key={`${issue.code}-${issue.nodeId}-${idx}`} className={cn('rounded-xl border p-3', tone[issue.level])}>
              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{t(`workflowBuilder.severity.${issue.level}`, issue.level)}{issue.nodeId ? ` · ${nodeLabel(issue.nodeId)}` : ''}</p>
                  <p className="text-sm font-medium">{t(`workflowBuilder.validation.${issue.code}`, issue.code)}</p>
                  <p className="text-xs leading-relaxed opacity-80">{t(`workflowBuilder.fix.${issue.code}`, t('workflowBuilder.fix.default', 'Open the step and complete the highlighted setting.'))}</p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {issue.nodeId && (
                      <Button size="sm" variant="outline" className="h-7 bg-background text-xs" onClick={() => onFocus(issue.nodeId!)}>
                        {t('workflowBuilder.validationPanel.goTo', 'Go to step')}<ArrowRight className="ms-1 size-3 rtl:rotate-180" />
                      </Button>
                    )}
                    {fixes.map((f, i) => (
                      <Button key={i} size="sm" variant="outline" className="h-7 bg-background text-xs" onClick={() => onFix(f)}>
                        {f.kind === 'intentional_end' ? <Flag className="me-1 size-3" /> : <Plus className="me-1 size-3" />}{fixLabel(f)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
