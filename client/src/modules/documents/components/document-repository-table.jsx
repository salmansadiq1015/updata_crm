'use client';

import Link from 'next/link';
import {
  AlertTriangle, Archive, ArchiveRestore, Download, Eye, FileCheck2, FolderOpen, Loader2, Trash2, Pencil,
  Ellipsis, Send, Undo2, ShieldCheck, Lock, Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useLanguage } from '@/lib/i18n/language-context';
import { intlLocaleFor } from '@/lib/i18n/locale-config';
import { cn } from '@/lib/utils';
import { SOURCE_BADGE_CLASS, formatDocumentDate } from '../utils/document-formatters';
import {
  fileKindOf, FILE_KIND_META, LINK_META, DEFAULT_LINK_META, documentLinks, formatBytes, humanizeCode,
} from '../utils/document-visuals';

const TYPE_KEYS = {
  OTHER: 'other', CONTRACT: 'contract', OFFER: 'offer', ORDER: 'order', INVOICE: 'invoice', DELIVERY_NOTE: 'deliveryNote',
  SERVICE_REPORT: 'serviceReport', PHOTO: 'photo', CERTIFICATE: 'certificate',
};

function useTypeLabel() {
  const { t } = useLanguage();
  return (value) => {
    if (!value) return '—';
    const key = TYPE_KEYS[String(value).toUpperCase()];
    return key ? t(`documents.repository.type.${key}`, humanizeCode(value)) : humanizeCode(value);
  };
}

export function FileKindIcon({ doc, className }) {
  const kind = fileKindOf(doc);
  const meta = FILE_KIND_META[kind];
  const Icon = meta.icon;
  return (
    <span className={cn('relative grid size-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset', meta.tone, className)} aria-hidden="true">
      <Icon className="size-[18px]" />
      <span className="absolute -bottom-1 rounded-[5px] bg-background px-1 text-[8px] font-bold leading-[13px] tracking-wide text-muted-foreground ring-1 ring-border">{meta.label}</span>
    </span>
  );
}

function SourceBadge({ doc, t }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium', SOURCE_BADGE_CLASS[doc.source])}>
      {t(`documents.repository.source.${doc.source}`, doc.sourceLabel || doc.source)}
    </span>
  );
}

/** Sign-off, field release, archive and retention, as small quiet pills. */
function StatusPills({ doc, t, dateLocale }) {
  const pills = [];
  if (doc.visumBy || doc.visum) {
    const who = doc.visum?.byName;
    pills.push({ key: 'visum', icon: ShieldCheck, cls: 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-300', label: t('documents.hub.status.signedOff', 'Signed off'), tip: [who, doc.visum?.at || doc.visumAt ? formatDocumentDate(doc.visum?.at || doc.visumAt, dateLocale) : null].filter(Boolean).join(' · ') });
  }
  if (doc.releasedToField) pills.push({ key: 'rel', icon: Radio, cls: 'text-sky-700 bg-sky-500/10 dark:text-sky-300', label: t('documents.hub.status.released', 'In the field') });
  if (doc.archived) pills.push({ key: 'arch', icon: Archive, cls: 'text-amber-700 bg-amber-500/10 dark:text-amber-300', label: t('documents.hub.status.archived', 'Archived') });
  if (doc.retentionLocked) pills.push({ key: 'ret', icon: Lock, cls: 'text-slate-600 bg-slate-500/10 dark:text-slate-300', label: t('documents.hub.status.retention', 'Retention') });
  if (!pills.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {pills.map(({ key, icon: Icon, cls, label, tip }) => {
        const pill = (
          <span key={key} className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium', cls)}>
            <Icon className="size-2.5" aria-hidden="true" />{label}
          </span>
        );
        return tip ? (
          <Tooltip key={key}><TooltipTrigger asChild>{pill}</TooltipTrigger><TooltipContent>{tip}</TooltipContent></Tooltip>
        ) : pill;
      })}
    </div>
  );
}

function LinkSummary({ doc, t, max = 2 }) {
  const links = documentLinks(doc);
  if (!links.length) return <span className="text-xs text-muted-foreground/70">{t('documents.repository.unlinked')}</span>;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {links.slice(0, max).map((link) => {
        const meta = LINK_META[link.type] || DEFAULT_LINK_META;
        const Icon = meta.icon;
        const typeLabel = t(`documents.repository.link.${link.type}`, humanizeCode(link.type));
        const name = link.label || (link.missing ? t('documents.hub.link.removed', 'removed') : `…${String(link.id).slice(-6)}`);
        const content = (
          <>
            <Icon className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="shrink-0 text-muted-foreground">{typeLabel}:</span>
            <span className="truncate font-medium text-foreground">{name}</span>
          </>
        );
        const cls = 'inline-flex max-w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px]';
        return meta.href && !link.missing ? (
          <Link key={`${link.type}-${link.id}`} href={meta.href(link.id)} title={[typeLabel, link.label, link.code].filter(Boolean).join(' · ')} className={cn(cls, 'hover:bg-muted')} onClick={(e) => e.stopPropagation()}>
            {content}
          </Link>
        ) : (
          <span key={`${link.type}-${link.id}`} className={cls} title={[typeLabel, link.label].filter(Boolean).join(' · ')}>{content}</span>
        );
      })}
      {links.length > max ? <span className="ps-1.5 text-[11px] text-muted-foreground">+{links.length - max}</span> : null}
    </div>
  );
}

function IconAction({ title, onClick, disabled, className, children }) {
  return (
    <Button type="button" variant="ghost" size="icon" className={cn('size-8 rounded-lg', className)} title={title} aria-label={title} onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}

function DocumentActions({ doc, title, actionBusy, onPreview, onDownload, onDelete, onArchive, onVisum, onRelease, onEdit, canDelete, t }) {
  const hasMenu = Boolean(onArchive || onVisum || onRelease || (onEdit && doc.editable));
  const hasVisum = Boolean(doc.visumBy || doc.visum);
  const deleteBlocked = doc.canDelete === false;
  const deleteLabel = deleteBlocked ? t('documents.repository.deleteBlocked') : t('common.delete');

  return (
    <div className="flex items-center justify-end gap-0.5">
      <IconAction title={t('common.preview')} onClick={() => onPreview?.(doc)} disabled={actionBusy}><Eye className="size-4" /></IconAction>
      <IconAction title={t('common.download')} onClick={() => onDownload?.(doc)} disabled={actionBusy}>
        {actionBusy && !hasMenu ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      </IconAction>
      {hasMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="size-8 rounded-lg" aria-label={`${t('documents.hub.moreActions', 'More actions')}: ${title}`} disabled={actionBusy}>
              {actionBusy ? <Loader2 className="size-4 animate-spin" /> : <Ellipsis className="size-4" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {onEdit && doc.editable ? <DropdownMenuItem onSelect={() => onEdit(doc)}><Pencil className="size-4" />{t('documents.hub.edit', 'Edit details')}</DropdownMenuItem> : null}
            {onVisum ? (
              <DropdownMenuItem onSelect={() => onVisum(doc)}>
                <FileCheck2 className={cn('size-4', hasVisum && 'text-emerald-500')} />
                {hasVisum ? t('documents.repository.visumRemove') : t('documents.repository.visumSet')}
              </DropdownMenuItem>
            ) : null}
            {onRelease ? (
              <DropdownMenuItem onSelect={() => onRelease(doc)}>
                {doc.releasedToField ? <Undo2 className="size-4" /> : <Send className="size-4" />}
                {doc.releasedToField ? t('documents.repository.releaseRevoke') : t('documents.repository.release')}
              </DropdownMenuItem>
            ) : null}
            {onArchive ? (
              <DropdownMenuItem onSelect={() => onArchive(doc)}>
                {doc.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                {doc.archived ? t('documents.repository.unarchive') : t('documents.repository.archive')}
              </DropdownMenuItem>
            ) : null}
            {canDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" disabled={deleteBlocked} onSelect={() => onDelete?.(doc)} title={deleteLabel}>
                  <Trash2 className="size-4" />{deleteLabel}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : canDelete ? (
        <IconAction title={deleteLabel} onClick={() => onDelete?.(doc)} disabled={actionBusy || deleteBlocked} className="text-destructive hover:text-destructive">
          <Trash2 className="size-4" />
        </IconAction>
      ) : null}
    </div>
  );
}

function MobileDocumentCard({ doc, dateLocale, intl, selectable, selected, onToggle, typeLabel, t, ...actions }) {
  const title = doc.title || doc.fileName || t('documents.repository.untitled');
  return (
    <article className={cn('rounded-2xl border bg-card p-4 transition-colors', selected ? 'border-sky-500/50 bg-sky-500/5' : 'border-border')}>
      <div className="flex min-w-0 items-start gap-3">
        {selectable ? <Checkbox className="mt-3" checked={selected} onCheckedChange={() => onToggle(doc.id)} aria-label={title} /> : null}
        <FileKindIcon doc={doc} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{doc.fileName !== title ? doc.fileName : doc.folderPath ? `/${doc.folderPath}` : ''}</p>
          <StatusPills doc={doc} t={t} dateLocale={dateLocale} />
        </div>
        <SourceBadge doc={doc} t={t} />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-xs">
        <div className="min-w-0"><dt className="text-muted-foreground">{t('documents.repository.type')}</dt><dd className="mt-0.5 truncate font-medium">{typeLabel(doc.documentType || doc.category)}</dd></div>
        <div className="min-w-0"><dt className="text-muted-foreground">{t('documents.repository.date')}</dt><dd className="mt-0.5 truncate font-medium">{formatDocumentDate(doc.createdAt, dateLocale)}</dd></div>
        <div className="min-w-0"><dt className="text-muted-foreground">{t('documents.repository.size')}</dt><dd className="mt-0.5 truncate font-medium tabular-nums">{formatBytes(doc.fileSizeBytes, intl)}</dd></div>
      </dl>
      <div className="mt-3 flex items-end justify-between gap-3 border-t border-border/60 pt-3">
        <div className="min-w-0 flex-1"><LinkSummary doc={doc} t={t} max={1} /></div>
        <DocumentActions doc={doc} title={title} actionBusy={actions.busyId === doc.id} t={t} {...actions} />
      </div>
    </article>
  );
}

export function DocumentRepositoryTable({
  documents = [],
  loading = false,
  error = null,
  onPreview,
  onDownload,
  onDelete,
  onArchive,
  onVisum,
  onRelease,
  onEdit,
  busyId,
  canDelete = false,
  selectable = false,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  emptyAction = null,
}) {
  const { t, locale } = useLanguage();
  const intl = intlLocaleFor(locale);
  const dateLocale = intl;
  const typeLabel = useTypeLabel();
  const selected = selectedIds || new Set();
  const allSelected = documents.length > 0 && documents.every((d) => selected.has(d.id));
  const someSelected = !allSelected && documents.some((d) => selected.has(d.id));
  const actions = { onPreview, onDownload, onDelete, onArchive, onVisum, onRelease, onEdit, canDelete, busyId };

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive" role="alert">
        <div className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" />{t('documents.repository.loadFailed')}</div>
        <p className="mt-1 text-xs text-destructive/80">{error?.message || t('documents.repository.tryRefresh')}</p>
      </div>
    );
  }

  if (!loading && !documents.length) {
    return (
      <div className="rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-500/15 to-cyan-400/10 ring-1 ring-sky-500/20">
          <FolderOpen className="size-6 text-sky-600 dark:text-sky-300" />
        </div>
        <h3 className="mt-4 text-sm font-semibold">{t('documents.repository.emptyTitle')}</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t('documents.repository.emptyDescription')}</p>
        {emptyAction ? <div className="mt-5">{emptyAction}</div> : null}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid gap-3 lg:hidden">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)
          : documents.map((doc) => (
            <MobileDocumentCard
              key={doc.id}
              doc={doc}
              dateLocale={dateLocale}
              intl={intl}
              selectable={selectable}
              selected={selected.has(doc.id)}
              onToggle={onToggleSelect}
              typeLabel={typeLabel}
              t={t}
              {...actions}
            />
          ))}
      </div>

      <div className="hidden min-w-0 overflow-hidden rounded-2xl border border-border bg-card lg:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] table-fixed text-sm">
            <colgroup>
              {selectable ? <col className="w-12" /> : null}
              <col />
              <col className="w-[128px]" />
              <col className="w-[150px]" />
              <col className="w-[230px]" />
              <col className="w-[150px]" />
              <col className="w-[84px]" />
              <col className="w-[120px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                {selectable ? (
                  <th className="ps-4">
                    <Checkbox checked={allSelected ? true : someSelected ? 'indeterminate' : false} onCheckedChange={() => onToggleAll?.(!allSelected)} aria-label={t('documents.hub.selectAll', 'Select all on this page')} />
                  </th>
                ) : null}
                <th className={cn('py-3 font-medium', selectable ? 'ps-2' : 'ps-5')}>{t('documents.repository.document')}</th>
                <th className="py-3 font-medium">{t('documents.repository.source')}</th>
                <th className="py-3 font-medium">{t('documents.repository.type')}</th>
                <th className="py-3 font-medium">{t('documents.repository.links')}</th>
                <th className="py-3 font-medium">{t('documents.repository.date')}</th>
                <th className="py-3 text-end font-medium">{t('documents.repository.size')}</th>
                <th className="py-3 pe-4"><span className="sr-only">{t('documents.hub.actions', 'Actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 7 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0">
                    {selectable ? <td className="ps-4"><Skeleton className="size-4" /></td> : null}
                    <td className={cn('py-3.5', selectable ? 'ps-2' : 'ps-5')}><div className="flex items-center gap-3"><Skeleton className="size-10 rounded-xl" /><div className="space-y-2"><Skeleton className="h-4 w-56" /><Skeleton className="h-3 w-36" /></div></div></td>
                    <td><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td><Skeleton className="h-4 w-24" /></td>
                    <td><Skeleton className="h-4 w-40" /></td>
                    <td><Skeleton className="h-4 w-28" /></td>
                    <td><Skeleton className="ms-auto h-4 w-12" /></td>
                    <td className="pe-4"><Skeleton className="ms-auto h-8 w-24" /></td>
                  </tr>
                ))
                : documents.map((doc) => {
                  const title = doc.title || doc.fileName || t('documents.repository.untitled');
                  const isSelected = selected.has(doc.id);
                  const subtitle = doc.fileName && doc.fileName !== title ? doc.fileName : '';
                  return (
                    <tr
                      key={doc.id}
                      className={cn('group border-b border-border/60 align-middle transition-colors last:border-0 hover:bg-muted/30', isSelected && 'bg-sky-500/5 hover:bg-sky-500/10')}
                    >
                      {selectable ? (
                        <td className="ps-4"><Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect?.(doc.id)} aria-label={title} /></td>
                      ) : null}
                      <td className={cn('py-3', selectable ? 'ps-2' : 'ps-5')}>
                        <div className="flex min-w-0 items-center gap-3">
                          <button type="button" onClick={() => onPreview?.(doc)} className="shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50" aria-label={`${t('common.preview')}: ${title}`}>
                            <FileKindIcon doc={doc} />
                          </button>
                          <div className="min-w-0">
                            <button type="button" onClick={() => onPreview?.(doc)} className="block max-w-full truncate text-start text-sm font-semibold text-foreground hover:text-sky-600 dark:hover:text-sky-300" title={title}>
                              {title}
                            </button>
                            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                              {subtitle ? <span className="truncate" title={subtitle}>{subtitle}</span> : null}
                              {doc.folderPath ? <span className="hidden max-w-[200px] shrink truncate xl:inline" title={`/${doc.folderPath}`}>/{doc.folderPath}</span> : null}
                            </div>
                            <StatusPills doc={doc} t={t} dateLocale={dateLocale} />
                          </div>
                        </div>
                      </td>
                      <td><SourceBadge doc={doc} t={t} /></td>
                      <td className="pe-3">
                        <div className="truncate text-sm text-foreground" title={doc.documentType || doc.category}>{typeLabel(doc.documentType || doc.category)}</div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">{doc.origin ? t(`documents.repository.origin.${doc.origin}`, doc.origin) : '—'}</div>
                      </td>
                      <td className="pe-3"><LinkSummary doc={doc} t={t} /></td>
                      <td className="pe-3">
                        <div className="text-sm tabular-nums text-foreground">{formatDocumentDate(doc.createdAt, dateLocale)}</div>
                        {doc.uploadedByName ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{doc.uploadedByName}</div> : null}
                      </td>
                      <td className="pe-2 text-end text-sm tabular-nums text-muted-foreground">{formatBytes(doc.fileSizeBytes, intl)}</td>
                      <td className="pe-3">
                        <DocumentActions doc={doc} title={title} actionBusy={busyId === doc.id} t={t} {...actions} />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </TooltipProvider>
  );
}
