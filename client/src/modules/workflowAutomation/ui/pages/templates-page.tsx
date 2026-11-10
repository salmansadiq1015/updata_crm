'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Eye, Layers, LayoutTemplate, Mail, MessageCircle, MessageSquareText, MousePointerClick, PhoneCall, PhoneIncoming, PhoneMissed, RefreshCcw, Sparkles, Sprout, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/shared/components/page-header';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useWorkflowMutations, useWorkflowTemplates, useWorkflows } from '../../hooks/use-workflows';
import { formatRelative } from '../../lib/format';
import type { WorkflowTemplate } from '../../types/workflow-types';
import { WorkflowDiagram } from '../shared/workflow-diagram';
import { WorkflowStatusBadge } from '../shared/status-badge';
import { EmptyBlock, ErrorBlock, Panel } from './page-kit';

export const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles, 'phone-missed': PhoneMissed, 'mouse-pointer-click': MousePointerClick, 'phone-callback': RefreshCcw, sprout: Sprout, 'phone-incoming': PhoneIncoming,
  'message-square-text': MessageSquareText, 'message-circle': MessageCircle, mail: Mail, layers: Layers,
};
const CATEGORY_TONE: Record<string, string> = {
  qualification: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', calling: 'bg-blue-500/10 text-blue-700 dark:text-blue-300', follow_up: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  nurturing: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', inbound: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
};

export function TemplateCard({ tpl, onPreview, onUse, selected = false, busy = false, useLabel }: {
  tpl: WorkflowTemplate; onPreview: () => void; onUse?: () => void; selected?: boolean; busy?: boolean; useLabel?: string;
}) {
  const { t } = useLanguage();
  const Icon = TEMPLATE_ICONS[tpl.icon] || PhoneCall;
  return (
    <div data-testid={`template-${tpl.key}`} className={cn('group flex flex-col rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10', selected && 'border-primary ring-2 ring-primary/30')}>
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-sky-500/15 to-cyan-500/10 text-sky-600 dark:text-sky-400"><Icon className="size-5" aria-hidden /></span>
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', CATEGORY_TONE[tpl.category] || 'bg-muted text-muted-foreground')}>{t(`workflowPages.templateCategory.${tpl.category}`, tpl.category)}</span>
      </div>
      <h3 className="mt-3 text-sm font-semibold">{t(`workflowPages.template.${tpl.key}.title`, tpl.key)}</h3>
      <p className="mt-1 flex-1 text-xs leading-5 text-muted-foreground">{t(`workflowPages.template.${tpl.key}.desc`, '')}</p>
      <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('workflowPages.templates.steps', '{count} steps', { count: tpl.nodes })}</p>
      <div className="mt-3 flex gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onPreview}><Eye className="size-3.5" />{t('workflowPages.templates.preview', 'Preview')}</Button>
        {onUse && <Button size="sm" className="flex-1" disabled={busy} onClick={onUse}>{useLabel || t('workflowPages.templates.use', 'Use template')}</Button>}
      </div>
    </div>
  );
}

export function TemplatePreviewDialog({ tpl, onClose, onUse, busy }: { tpl: WorkflowTemplate | null; onClose: () => void; onUse?: (tpl: WorkflowTemplate) => void; busy?: boolean }) {
  const { t } = useLanguage();
  return (
    <Dialog open={Boolean(tpl)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{tpl ? t(`workflowPages.template.${tpl.key}.title`, tpl.key) : ''}</DialogTitle>
          <DialogDescription>{tpl ? t(`workflowPages.template.${tpl.key}.desc`, '') : ''}</DialogDescription>
        </DialogHeader>
        <div className="h-[60vh] min-h-80">{tpl && <WorkflowDiagram graph={tpl.graph} minimap />}</div>
        <p className="text-xs text-muted-foreground">{t('workflowPages.templates.placeholderHint', 'Agents, users and link targets are left empty on purpose — the builder asks you to choose them before publishing.')}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('workflowPages.common.close', 'Close')}</Button>
          {onUse && tpl && <Button disabled={busy} onClick={() => onUse(tpl)}>{t('workflowPages.templates.use', 'Use template')}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TemplatesPage() {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('workflow:write');
  const templates = useWorkflowTemplates();
  const own = useWorkflows({ templates: true, limit: 50 });
  const m = useWorkflowMutations();
  const [preview, setPreview] = useState<WorkflowTemplate | null>(null);

  const use = (tpl: WorkflowTemplate) => m.create.mutate(
    { name: t(`workflowPages.template.${tpl.key}.title`, tpl.key), templateKey: tpl.key },
    { onSuccess: (wf) => router.push(`/automation/workflows/${wf._id}`) },
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('workflow.nav.templates', 'Templates')} description={t('workflowPages.templates.description', 'Proven automations you can clone, adapt and publish in minutes.')} icon={LayoutTemplate} />
      <Panel title={t('workflowPages.templates.builtIn', 'Built-in templates')} description={t('workflowPages.templates.builtInHint', 'Each one uses your existing AI agents, messaging and CRM — nothing runs until you publish.')}>
        {templates.isError ? <ErrorBlock onRetry={() => templates.refetch()} /> : !templates.data ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {templates.data.map((tpl) => <TemplateCard key={tpl.key} tpl={tpl} onPreview={() => setPreview(tpl)} onUse={canWrite ? () => use(tpl) : undefined} busy={m.create.isPending} />)}
          </div>
        )}
      </Panel>

      <Panel title={t('workflowPages.templates.yours', 'Your templates')} description={t('workflowPages.templates.yoursHint', 'Workflows your team marked as reusable templates.')} bodyClassName="p-0">
        {own.isLoading ? <div className="p-4"><Skeleton className="h-16 rounded-xl" /></div> : !own.data?.data.length ? (
          <div className="p-4"><EmptyBlock icon={Copy} title={t('workflowPages.templates.yoursEmpty', 'No custom templates yet')} description={t('workflowPages.templates.yoursEmptyHint', 'Open a workflow in the builder and save it as a template to reuse it here.')} /></div>
        ) : (
          <ul className="divide-y dark:divide-white/10">
            {own.data.data.map((w) => (
              <li key={w._id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Link href={`/automation/workflows/${w._id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{w.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{w.description || formatRelative(w.updatedAt, locale)}</p>
                </Link>
                <WorkflowStatusBadge status={w.status} />
                {canWrite && (
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={m.duplicate.isPending}
                    onClick={() => m.duplicate.mutate(w._id, { onSuccess: (copy) => router.push(`/automation/workflows/${copy._id}`) })}>
                    <Copy className="size-3.5" />{t('workflowPages.templates.clone', 'Clone')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <TemplatePreviewDialog tpl={preview} onClose={() => setPreview(null)} onUse={canWrite ? use : undefined} busy={m.create.isPending} />
    </div>
  );
}
