'use client';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, Copy, FlaskConical, Plus, Flag, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { CATEGORY_STYLES, portTone, PORT_TONE_CLASSES, visualFor } from '../../lib/node-registry';
import { NodeConfigForm } from './node-config-form';
import { Field, SectionTitle, SelectField, SwitchField, TextField } from './form-controls';
import type { CanvasNode } from '../shared/workflow-node-card';
import type { ValidationResult, WorkflowCatalog, WorkflowSettings } from '../../types/workflow-types';
import { fixesFor, type QuickFix } from './validation-panel';

interface Props {
  workflowId: string;
  node: CanvasNode | null;
  catalog: WorkflowCatalog;
  validation: ValidationResult | null;
  nodeOptions: Array<{ id: string; label: string }>;
  readOnly: boolean;
  meta: { name: string; description: string; settings: WorkflowSettings };
  onMetaChange: (patch: Partial<{ name: string; description: string; settings: WorkflowSettings }>) => void;
  onNodeChange: (id: string, patch: { label?: string; config?: Record<string, unknown> }) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onClose: () => void;
  onFocusNode: (id: string) => void;
  onFix?: (fix: QuickFix) => void;
  onTestNode?: (id: string) => void;
  onAiHelp?: (id: string) => void;
  connectedPorts?: (nodeId: string) => Set<string>;
}

export function ConfigPanel(props: Props) {
  return props.node ? <NodePanel {...props} node={props.node} /> : <WorkflowPanel {...props} />;
}

function NodePanel({ workflowId, node, catalog, validation, nodeOptions, readOnly, onNodeChange, onDelete, onDuplicate, onClose, onFix, onTestNode, onAiHelp, connectedPorts }: Props & { node: CanvasNode }) {
  const { t } = useLanguage();
  const type = node.type || '';
  const v = visualFor(type);
  const Icon = v.icon;
  const issues = (validation?.errors || []).filter((i) => i.nodeId === node.id);
  const warnings = (validation?.warnings || []).filter((i) => i.nodeId === node.id);
  const general = issues.filter((i) => !i.field);
  const isTrigger = v.category === 'trigger';
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-3 border-b p-4">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', CATEGORY_STYLES[v.category].icon)}><Icon className="size-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('workflowBuilder.panel.selected', 'Selected step')}</p>
          <p className="truncate text-sm font-semibold">{t(`workflow.node.${type}.label`, type)}</p>
        </div>
        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onClose} aria-label={t('workflowBuilder.panel.close', 'Close')}><X className="size-4" /></Button>
      </div>
      <fieldset disabled={readOnly} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">{t(`workflow.node.${type}.desc`, '')}</p>
        <TextField label={t('workflowBuilder.panel.label', 'Step name')} value={node.data.label || ''} onChange={(label) => onNodeChange(node.id, { label })} maxLength={120}
          placeholder={t(`workflow.node.${type}.label`, type)} />
        {general.map((i) => (
          <p key={i.code} role="alert" className="flex items-start gap-1.5 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="mt-px size-3.5 shrink-0" />{t(`workflowBuilder.validation.${i.code}`, i.code)}
          </p>
        ))}
        {(onAiHelp || onTestNode) && !readOnly && (
          <div className="grid grid-cols-2 gap-2">
            {onAiHelp && <Button type="button" size="sm" variant="outline" className="h-9 border-sky-500/30 bg-sky-500/5 text-sky-800 hover:bg-sky-500/10 dark:text-sky-200" onClick={() => onAiHelp(node.id)}><Sparkles className="me-1.5 size-4" />{t('workflowBuilder.panel.aiHelp', 'Help me configure')}</Button>}
            {onTestNode && <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => onTestNode(node.id)}><FlaskConical className="me-1.5 size-4" />{t('workflowBuilder.panel.testStep', 'Test this step')}</Button>}
          </div>
        )}
        {warnings.map((i) => {
          const fixes = readOnly || !onFix ? [] : fixesFor(i, () => node.data.outputs).filter((f) => f.kind !== 'add_end' || !connectedPorts?.(f.nodeId).has(f.port));
          return (
            <div key={i.code} className={cn('space-y-2 rounded-lg px-3 py-2.5 text-xs', i.severity === 'info' ? 'bg-sky-500/8 text-sky-900 dark:text-sky-100' : 'bg-amber-500/10 text-amber-900 dark:text-amber-100')}>
              <p className="flex items-start gap-1.5 font-medium"><AlertTriangle className="mt-px size-3.5 shrink-0" />{t(`workflowBuilder.validation.${i.code}`, i.code)}</p>
              <p className="opacity-80">{t(`workflowBuilder.fix.${i.code}`, '')}</p>
              {fixes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {fixes.map((f, k) => (
                    <Button key={k} type="button" size="sm" variant="outline" className="h-7 bg-background text-[11px]" onClick={() => onFix!(f)}>
                      {f.kind === 'intentional_end' ? <Flag className="me-1 size-3" /> : <Plus className="me-1 size-3" />}
                      {f.kind === 'add_end' ? t('workflowBuilder.fixAction.addEnd', 'Add End step on “{port}”', { port: t(`workflow.port.${f.port}`, f.port) }) : t('workflowBuilder.fixAction.intentional', 'Mark as intentional end')}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="space-y-4">
          <SectionTitle>{t('workflowBuilder.panel.configuration', 'Configuration')}</SectionTitle>
          <NodeConfigForm workflowId={workflowId} nodeId={node.id} type={type} config={node.data.config} catalog={catalog} nodeOptions={nodeOptions}
            issues={issues.filter((i) => i.field)} onChange={(config) => onNodeChange(node.id, { config })} />
        </div>
        {node.data.outputs.length > 0 && type !== 'end' && (
          <div className="space-y-2">
            <SectionTitle>{t('workflowBuilder.panel.branches', 'Branches')}</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {node.data.outputs.map((p) => (
                <span key={p} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs">
                  <span className={cn('size-1.5 rounded-full', PORT_TONE_CLASSES[portTone(p)].split(' ')[0])} />{t(`workflow.port.${p}`, p)}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t('workflowBuilder.panel.branchHelp', 'Drag from a branch dot to the next step. An unconnected branch ends the run.')}</p>
          </div>
        )}
        {t(`workflowBuilder.outputs.${type}`, '') && (
          <div className="space-y-1.5">
            <SectionTitle>{t('workflowBuilder.panel.produces', 'What this step produces')}</SectionTitle>
            <p className="text-xs leading-relaxed text-muted-foreground">{t(`workflowBuilder.outputs.${type}`, '')}</p>
          </div>
        )}
        {!isTrigger && type !== 'end' && (
          <SwitchField label={t('workflowBuilder.panel.intentionalEnd', 'The run may end after this step')}
            help={t('workflowBuilder.panel.intentionalEndHelp', 'Turn on when unconnected branches are meant to finish the run (no warning).')}
            checked={Boolean(node.data.config.intentionalEnd)} onChange={(v) => onNodeChange(node.id, { config: { ...node.data.config, intentionalEnd: v || undefined } })} />
        )}
        <details className="group rounded-xl border">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground">
            {t('workflowBuilder.panel.advanced', 'Advanced (technical details)')}<ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t px-3 py-2.5">
            <p className="font-mono text-[11px] text-muted-foreground">{t('workflowBuilder.panel.stepId', 'Step ID')}: {node.id}</p>
            <pre dir="ltr" className="max-h-56 overflow-auto rounded-lg bg-muted/60 p-2 font-mono text-[11px] leading-relaxed">{JSON.stringify(node.data.config, null, 2)}</pre>
          </div>
        </details>
      </fieldset>
      {!readOnly && (
        <div className="flex gap-2 border-t p-3">
          {!isTrigger && <Button variant="outline" size="sm" className="flex-1" onClick={() => onDuplicate(node.id)}><Copy className="me-1.5 size-4" />{t('workflowBuilder.panel.duplicate', 'Duplicate')}</Button>}
          <Button variant="outline" size="sm" className="flex-1 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700" onClick={() => onDelete(node.id)}><Trash2 className="me-1.5 size-4" />{t('workflowBuilder.panel.delete', 'Delete')}</Button>
        </div>
      )}
    </div>
  );
}

function WorkflowPanel({ validation, readOnly, meta, onMetaChange, onFocusNode, nodeOptions }: Props) {
  const { t } = useLanguage();
  const label = (id?: string | null) => nodeOptions.find((n) => n.id === id)?.label || id || '';
  const errors = validation?.errors || [];
  const warnings = validation?.warnings || [];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('workflowBuilder.panel.workflow', 'Workflow')}</p>
        <p className="text-sm font-semibold">{t('workflowBuilder.panel.settings', 'Settings & health')}</p>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <fieldset disabled={readOnly} className="space-y-4">
          <Field label={t('workflowBuilder.panel.name', 'Name')}>
            <Input value={meta.name} maxLength={160} onChange={(e) => onMetaChange({ name: e.target.value })} className="text-sm" />
          </Field>
          <TextField label={t('workflowBuilder.panel.description', 'Description')} value={meta.description} onChange={(description) => onMetaChange({ description })} multiline rows={3} maxLength={2000} />
          <SelectField label={t('workflowBuilder.panel.reentry', 'Re-enrollment')} value={meta.settings.reentry} onChange={(v) => onMetaChange({ settings: { ...meta.settings, reentry: (v || 'after_completion') as WorkflowSettings['reentry'] } })}
            options={(['after_completion', 'never', 'always'] as const).map((r) => ({ value: r, label: t(`workflowBuilder.reentry.${r}`, r) }))}
            help={t(`workflowBuilder.reentryHelp.${meta.settings.reentry}`, '')} />
          <SwitchField label={t('workflowBuilder.panel.stopOnOptOut', 'Stop when the lead opts out')} help={t('workflowBuilder.panel.stopOnOptOutHelp', 'A STOP reply or unsubscribe cancels this lead’s active run immediately.')}
            checked={meta.settings.stopOnOptOut !== false} onChange={(v) => onMetaChange({ settings: { ...meta.settings, stopOnOptOut: v } })} />
        </fieldset>

        <div className="space-y-2">
          <SectionTitle>{t('workflowBuilder.panel.health', 'Validation')}</SectionTitle>
          {!validation ? <p className="text-xs text-muted-foreground">{t('workflowBuilder.panel.validating', 'Checking…')}</p>
            : !errors.length && !warnings.length ? (
              <p className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4" />{t('workflowBuilder.panel.ready', 'Ready to publish')}</p>
            ) : (
              <ul className="space-y-1.5">
                {[...errors.map((i) => ({ ...i, level: 'error' as const })), ...warnings.map((i) => ({ ...i, level: 'warning' as const }))].map((i, idx) => (
                  <li key={idx}>
                    <button type="button" disabled={!i.nodeId} onClick={() => i.nodeId && onFocusNode(i.nodeId)}
                      className={cn('flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-start text-xs transition-colors', i.level === 'error' ? 'bg-rose-500/8 text-rose-800 hover:bg-rose-500/15 dark:text-rose-200' : 'bg-amber-500/8 text-amber-900 hover:bg-amber-500/15 dark:text-amber-100')}>
                      {i.level === 'error' ? <AlertCircle className="mt-px size-3.5 shrink-0" /> : <AlertTriangle className="mt-px size-3.5 shrink-0" />}
                      <span className="min-w-0">
                        {i.nodeId && <span className="block truncate font-semibold">{label(i.nodeId)}</span>}
                        {t(`workflowBuilder.validation.${i.code}`, i.code)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </div>

        <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
          <SectionTitle>{t('workflowBuilder.panel.shortcuts', 'Keyboard shortcuts')}</SectionTitle>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {[['⌘/Ctrl S', 'save'], ['⌘/Ctrl Z', 'undo'], ['⇧ ⌘/Ctrl Z', 'redo'], ['⌘/Ctrl C · V', 'copyPaste'], ['⌘/Ctrl D', 'duplicate'], ['Del / ⌫', 'delete'], ['⇧ + drag', 'multiSelect'], ['⌘/Ctrl A', 'selectAll']].map(([k, key]) => (
              <div key={key} className="contents"><dt><kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10.5px]">{k}</kbd></dt><dd className="text-muted-foreground">{t(`workflowBuilder.shortcut.${key}`, key)}</dd></div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
