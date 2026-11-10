'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Check, CloudUpload, Copy, FlaskConical, History, LayoutGrid, Loader2, Maximize, Megaphone, MoreHorizontal,
  PanelLeft, Pause, Play, Redo2, Rocket, Undo2, ZoomIn, ZoomOut, Archive, Sparkles, ListChecks, Map as MapIcon, Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { WorkflowStatusBadge } from '../shared/status-badge';
import type { WorkflowStatus } from '../../types/workflow-types';

interface Props {
  name: string;
  onNameChange: (v: string) => void;
  status: WorkflowStatus;
  publishedVersion: number | null;
  dirty: boolean;
  saving: boolean;
  savedAt: Date | null;
  readOnly: boolean;
  canPublish: boolean;
  canUndo: boolean;
  canRedo: boolean;
  errorCount: number;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onLayout: () => void;
  onTest: () => void;
  onPublish: () => void;
  onVersions: () => void;
  onDuplicate: () => void;
  onStatus: (s: 'published' | 'paused' | 'archived') => void;
  onTogglePalette: () => void;
  workflowId: string;
  onCopilot: () => void;
  copilotOpen: boolean;
  onValidate: () => void;
  issueCount: number;
  minimap: boolean;
  onToggleMinimap: () => void;
  autosave: boolean;
  onToggleAutosave: () => void;
}

function IconAction({ label, onClick, disabled, children, className }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className={cn('size-9', className)} onClick={onClick} disabled={disabled} aria-label={label}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent className="">{label}</TooltipContent>
    </Tooltip>
  );
}

export function BuilderToolbar(p: Props) {
  const { t } = useLanguage();
  const router = useRouter();
  const saveLabel = p.saving ? t('workflowBuilder.toolbar.saving', 'Saving…') : p.dirty ? (p.autosave ? t('workflowBuilder.toolbar.autosavePending', 'Saving shortly…') : t('workflowBuilder.toolbar.unsaved', 'Unsaved changes')) : t('workflowBuilder.toolbar.saved', 'All changes saved');
  return (
    <header className="flex h-14 shrink-0 items-center gap-1.5 border-b bg-card/80 px-2 backdrop-blur supports-[backdrop-filter]:bg-card/70 sm:gap-2 sm:px-3">
      <IconAction label={t('workflowBuilder.toolbar.back', 'Back to workflows')} onClick={() => router.push('/automation/workflows')}><ArrowLeft className="size-4 rtl:rotate-180" /></IconAction>
      <IconAction label={t('workflowBuilder.toolbar.palette', 'Building blocks')} onClick={p.onTogglePalette} className="lg:hidden"><PanelLeft className="size-4" /></IconAction>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <input
          value={p.name}
          onChange={(e) => p.onNameChange(e.target.value)}
          readOnly={p.readOnly}
          maxLength={160}
          aria-label={t('workflowBuilder.panel.name', 'Name')}
          className="min-w-0 max-w-[22rem] flex-1 truncate rounded-md bg-transparent px-1.5 py-1 text-[15px] font-semibold outline-none transition-colors hover:bg-muted/60 focus:bg-muted/60 focus:ring-2 focus:ring-ring/30"
        />
        <WorkflowStatusBadge status={p.status} className="hidden sm:inline-flex" />
        {p.publishedVersion && <span className="hidden rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground md:inline">{t('workflow.common.version', 'v{version}', { version: p.publishedVersion })}</span>}
        <span className={cn('hidden items-center gap-1 text-xs xl:flex', p.dirty ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')} aria-live="polite">
          {p.saving ? <Loader2 className="size-3.5 animate-spin" /> : p.dirty ? <span className="size-1.5 rounded-full bg-amber-500" /> : <Check className="size-3.5" />}{saveLabel}
        </span>
      </div>

      <div className="hidden items-center md:flex">
        <IconAction label={t('workflowBuilder.toolbar.undo', 'Undo')} onClick={p.onUndo} disabled={!p.canUndo || p.readOnly}><Undo2 className="size-4" /></IconAction>
        <IconAction label={t('workflowBuilder.toolbar.redo', 'Redo')} onClick={p.onRedo} disabled={!p.canRedo || p.readOnly}><Redo2 className="size-4" /></IconAction>
        <span className="mx-1 h-5 w-px bg-border" />
        <IconAction label={t('workflowBuilder.toolbar.zoomOut', 'Zoom out')} onClick={p.onZoomOut}><ZoomOut className="size-4" /></IconAction>
        <IconAction label={t('workflowBuilder.toolbar.zoomIn', 'Zoom in')} onClick={p.onZoomIn}><ZoomIn className="size-4" /></IconAction>
        <IconAction label={t('workflowBuilder.toolbar.fit', 'Fit to screen')} onClick={p.onFit}><Maximize className="size-4" /></IconAction>
        <IconAction label={t('workflowBuilder.toolbar.layout', 'Auto-arrange')} onClick={p.onLayout} disabled={p.readOnly}><LayoutGrid className="size-4" /></IconAction>
        <IconAction label={p.minimap ? t('workflowBuilder.toolbar.hideMinimap', 'Hide minimap') : t('workflowBuilder.toolbar.showMinimap', 'Show minimap')} onClick={p.onToggleMinimap} className={cn(p.minimap && 'text-primary')}><MapIcon className="size-4" /></IconAction>
        <span className="mx-1 h-5 w-px bg-border" />
      </div>

      {!p.readOnly && (
        <Button type="button" size="sm" onClick={p.onCopilot} aria-pressed={p.copilotOpen}
          className={cn('h-9 border-0 text-white shadow-sm transition-all', p.copilotOpen ? 'bg-sky-700 hover:bg-sky-700' : 'bg-gradient-to-r from-sky-600 to-cyan-500 hover:from-sky-700 hover:to-cyan-600')}>
          <Sparkles className="size-4 sm:me-1.5" /><span className="hidden sm:inline">{t('workflowBuilder.toolbar.buildWithAi', 'Build with AI')}</span>
        </Button>
      )}
      <Button type="button" variant="outline" size="sm" className="hidden h-9 lg:inline-flex" onClick={p.onValidate}>
        <ListChecks className="me-1.5 size-4" />{t('workflowBuilder.toolbar.validate', 'Check')}
        {p.issueCount > 0 && <span className={cn('ms-1.5 rounded-full px-1.5 text-[11px] font-bold text-white', p.errorCount ? 'bg-rose-500' : 'bg-amber-500')}>{p.issueCount}</span>}
      </Button>
      <Button type="button" variant="outline" size="sm" className="hidden h-9 sm:inline-flex" onClick={p.onTest}><FlaskConical className="me-1.5 size-4" />{t('workflowBuilder.toolbar.test', 'Test')}</Button>
      {!p.readOnly && (
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={p.onSave} disabled={!p.dirty || p.saving}>
          {p.saving ? <Loader2 className="size-4 animate-spin sm:me-1.5" /> : <CloudUpload className="size-4 sm:me-1.5" />}<span className="hidden sm:inline">{t('workflowBuilder.toolbar.save', 'Save draft')}</span>
        </Button>
      )}
      {p.canPublish && (
        <Button type="button" size="sm" className="h-9" onClick={p.onPublish}>
          <Rocket className="size-4 sm:me-1.5" /><span className="hidden sm:inline">{t('workflowBuilder.toolbar.publish', 'Publish')}</span>
          {p.errorCount > 0 && <span className="ms-1.5 rounded-full bg-white/25 px-1.5 text-[11px] font-bold">{p.errorCount}</span>}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={t('workflowBuilder.toolbar.more', 'More actions')}><MoreHorizontal className="size-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem className="sm:hidden" onClick={p.onTest}><FlaskConical className="me-2 size-4" />{t('workflowBuilder.toolbar.test', 'Test')}</DropdownMenuItem>
          <DropdownMenuItem className="md:hidden" onClick={p.onLayout} disabled={p.readOnly}><LayoutGrid className="me-2 size-4" />{t('workflowBuilder.toolbar.layout', 'Auto-arrange')}</DropdownMenuItem>
          <DropdownMenuItem className="lg:hidden" onClick={p.onValidate}><ListChecks className="me-2 size-4" />{t('workflowBuilder.toolbar.validate', 'Check')}</DropdownMenuItem>
          <DropdownMenuItem onClick={p.onVersions}><History className="me-2 size-4" />{t('workflowBuilder.toolbar.versions', 'Version history')}</DropdownMenuItem>
          {!p.readOnly && <DropdownMenuItem onClick={p.onToggleAutosave}><Save className="me-2 size-4" />{p.autosave ? t('workflowBuilder.toolbar.autosaveOff', 'Turn off autosave') : t('workflowBuilder.toolbar.autosaveOn', 'Turn on autosave')}</DropdownMenuItem>}
          {p.status === 'published' && (
            <DropdownMenuItem asChild><Link href={`/automation/campaigns?workflowId=${p.workflowId}`}><Megaphone className="me-2 size-4" />{t('workflowBuilder.toolbar.campaign', 'Start a campaign')}</Link></DropdownMenuItem>
          )}
          {!p.readOnly && <DropdownMenuItem onClick={p.onDuplicate}><Copy className="me-2 size-4" />{t('workflowBuilder.toolbar.duplicate', 'Duplicate workflow')}</DropdownMenuItem>}
          {p.canPublish && (
            <>
              <DropdownMenuSeparator />
              {p.status === 'published' && <DropdownMenuItem onClick={() => p.onStatus('paused')}><Pause className="me-2 size-4" />{t('workflowBuilder.toolbar.pause', 'Pause new enrollments')}</DropdownMenuItem>}
              {p.status === 'paused' && <DropdownMenuItem onClick={() => p.onStatus('published')}><Play className="me-2 size-4" />{t('workflowBuilder.toolbar.activate', 'Resume enrollments')}</DropdownMenuItem>}
              {p.status !== 'archived' && <DropdownMenuItem className="text-rose-600 focus:text-rose-700" onClick={() => p.onStatus('archived')}><Archive className="me-2 size-4" />{t('workflowBuilder.toolbar.archive', 'Archive')}</DropdownMenuItem>}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
