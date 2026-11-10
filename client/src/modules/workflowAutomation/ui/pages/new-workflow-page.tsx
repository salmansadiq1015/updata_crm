'use client';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, FilePlus2, FlaskConical, GitBranch, Link2, ListChecks, Rocket, ShieldCheck, Sparkles, SquarePlus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/shared/components/page-header';
import { PermissionGate } from '@/shared/components/permission-gate';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useWorkflowMutations, useWorkflowTemplates } from '../../hooks/use-workflows';
import type { WorkflowTemplate } from '../../types/workflow-types';
import { Panel } from './page-kit';
import { TemplateCard, TemplatePreviewDialog } from './templates-page';

const STEPS = [
  { key: 'choose', icon: SquarePlus }, { key: 'trigger', icon: Zap }, { key: 'actions', icon: Sparkles }, { key: 'conditions', icon: GitBranch },
  { key: 'connect', icon: Link2 }, { key: 'validate', icon: ShieldCheck }, { key: 'test', icon: FlaskConical }, { key: 'publish', icon: Rocket },
] as const;

export function NewWorkflowPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const params = useSearchParams();
  const templates = useWorkflowTemplates();
  const m = useWorkflowMutations();
  const [picked, setChoice] = useState<string | null>(null);
  const [typedName, setTypedName] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [preview, setPreview] = useState<WorkflowTemplate | null>(null);
  // ?template=<key> preselects a template until the user picks something else.
  const fromUrl = params.get('template');
  const choice = picked ?? (fromUrl && templates.data?.some((tpl) => tpl.key === fromUrl) ? fromUrl : 'blank');
  // The name follows the chosen template until the user types their own.
  const name = typedName ?? (choice === 'blank' ? '' : t(`workflowPages.template.${choice}.title`, choice));
  const setName = (v: string) => setTypedName(v);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    m.create.mutate(
      { name: name.trim(), description: description.trim(), ...(choice === 'blank' ? {} : { templateKey: choice }) },
      { onSuccess: (wf) => router.push(`/automation/workflows/${wf._id}`) },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('workflow.nav.create', 'Create workflow')} description={t('workflowPages.new.description', 'Pick a starting point, name it, and continue in the visual builder.')} icon={SquarePlus} />

      <Panel title={t('workflowPages.new.howItWorks', 'How it works')} bodyClassName="p-3 sm:p-4">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {STEPS.map((s, i) => (
            <li key={s.key} className={cn('flex items-center gap-2.5 rounded-xl border px-3 py-2.5 dark:border-white/10', i === 0 && 'border-primary/50 bg-primary/5')}>
              <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg text-xs font-semibold', i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-xs font-semibold"><s.icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /><span className="truncate">{t(`workflowPages.new.step.${s.key}`, s.key)}</span></span>
              </span>
            </li>
          ))}
        </ol>
      </Panel>

      <PermissionGate permission="workflow:write" fallback={<p className="text-sm text-muted-foreground">{t('workflowPages.new.noWrite', 'You can view workflows but not create them.')}</p>}>
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <Panel title={t('workflowPages.new.chooseTitle', '1 · Choose a starting point')}>
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              <button type="button" data-testid="choice-blank" onClick={() => setChoice('blank')}
                className={cn('flex flex-col items-start rounded-2xl border border-dashed bg-card p-4 text-start transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg dark:border-white/15', choice === 'blank' && 'border-solid border-primary ring-2 ring-primary/30')}>
                <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><FilePlus2 className="size-5" aria-hidden /></span>
                <span className="mt-3 text-sm font-semibold">{t('workflowPages.new.blank', 'Blank workflow')}</span>
                <span className="mt-1 text-xs leading-5 text-muted-foreground">{t('workflowPages.new.blankHint', 'Start from an empty canvas and drag in a trigger, actions and conditions.')}</span>
                {choice === 'blank' && <CheckCircle2 className="mt-3 size-5 text-primary" aria-hidden />}
              </button>
              {!templates.data ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />) : templates.data.map((tpl) => (
                <TemplateCard key={tpl.key} tpl={tpl} selected={choice === tpl.key} onPreview={() => setPreview(tpl)} onUse={() => setChoice(tpl.key)}
                  useLabel={choice === tpl.key ? t('workflowPages.new.selected', 'Selected') : t('workflowPages.new.select', 'Select')} />
              ))}
            </div>
          </Panel>

          <Panel title={t('workflowPages.new.detailsTitle', '2 · Name your workflow')} className="h-fit xl:sticky xl:top-4">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="" htmlFor="wf-name">{t('workflowPages.new.name', 'Name')}</Label>
                <Input id="wf-name" value={name} maxLength={160} required onChange={(e) => setName(e.target.value)} placeholder={t('workflowPages.new.namePlaceholder', 'e.g. Qualify new website leads')} />
              </div>
              <div className="space-y-1.5">
                <Label className="" htmlFor="wf-desc">{t('workflowPages.new.descriptionLabel', 'Description (optional)')}</Label>
                <Textarea className="" id="wf-desc" value={description} maxLength={2000} rows={4} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)} placeholder={t('workflowPages.new.descriptionPlaceholder', 'What should this automation achieve?')} />
              </div>
              <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5 font-medium text-foreground"><ListChecks className="size-3.5" aria-hidden />{t('workflowPages.new.nextTitle', 'Next in the builder')}</p>
                <p className="mt-1">{t('workflowPages.new.nextHint', 'Configure each step, validate, run a dry test on a real lead, then publish. Nothing runs before you publish.')}</p>
              </div>
              <Button type="submit" className="w-full gap-2" disabled={!name.trim() || m.create.isPending}>
                <Rocket className="size-4" />{m.create.isPending ? t('workflowPages.new.creating', 'Creating…') : t('workflowPages.new.submit', 'Create and open builder')}
              </Button>
            </form>
          </Panel>
        </div>
      </PermissionGate>
      <TemplatePreviewDialog tpl={preview} onClose={() => setPreview(null)} onUse={(tpl) => { setChoice(tpl.key); setPreview(null); }} />
    </div>
  );
}
