'use client';

import { useState } from 'react';
import { Archive, BookOpen, Check, GitCompare, History, Loader2, Pencil, Plus, RotateCcw, Send, Trash2, Undo2, Upload } from 'lucide-react';
import { useIntelT } from '../hooks/use-intel-t';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useKnowledge, useKnowledgeDiff, useKnowledgeMutations, useKnowledgeVersions } from '../hooks/use-calling-intelligence';
import type { KnowledgeContent, KnowledgeEntry, KnowledgeType, KnowledgeVersionSummary } from '../types/calling-intelligence-types';
import { AgentDialog, AgentField, inputClass, panelClass, primaryClass, readableError, secondaryClass } from './calling-agent-primitives';

const TYPES: KnowledgeType[] = ['product', 'pricing', 'policy', 'promise', 'faq'];
type T = (key: string, fallback?: string, vars?: Record<string, unknown>) => string;
const typeLabel = (t: T, type: string) => t(`callingIntel.kb.type.${type}`, { product: 'Product', pricing: 'Pricing', policy: 'Policy', promise: 'Promise', faq: 'FAQ' }[type] || type);
const statusLabel = (t: T, status: string) => t(`callingIntel.kb.status.${status}`, { draft: 'Draft', pending_approval: 'Awaiting approval', approved: 'Approved', archived: 'Archived' }[status] || status);
const statusTone: Record<string, string> = { draft: 'border-white/15 text-slate-300', pending_approval: 'border-amber-400/30 text-amber-200', approved: 'border-cyan-400/30 text-cyan-200', archived: 'border-white/10 text-slate-500' };
const lines = (value: string) => value.split('\n').map(s => s.trim()).filter(Boolean);

function useKnowledgeRoles() {
  const { isAdmin, hasPermission } = usePermissions();
  return {
    canWrite: isAdmin || ['ai-calling:write', 'crm:write', 'crm:admin'].some(hasPermission),
    canApprove: isAdmin || ['ai-calling:admin', 'crm:admin'].some(hasPermission),
  };
}

export function KnowledgeBasePanel() {
  const t = useIntelT();
  const { canWrite, canApprove } = useKnowledgeRoles();
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [editing, setEditing] = useState<KnowledgeEntry | 'new' | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useKnowledge({ status: status || undefined, type: type || undefined });
  const m = useKnowledgeMutations();
  const latest = query.data?.data.latestVersion;
  const entries = query.data?.data.entries || [];
  const act = async (entry: KnowledgeEntry, action: 'submit' | 'approve' | 'reject' | 'archive' | 'restore') => {
    setError(null);
    try { await m.action.mutateAsync({ id: entry._id, action, body: action === 'approve' ? { revision: entry.revision } : {} }); } catch (e) { setError(readableError(e)); }
  };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4 text-sky-300" />{t('callingIntel.kb.title', 'Approved business knowledge')}</h2><p className="mt-1 max-w-2xl text-xs text-slate-400">{t('callingIntel.kb.subtitle', 'Products, prices, policies and promises your agents may state. Agents only receive a published version; anything else they must leave to a person.')}</p>
        <p className="mt-2 text-xs text-sky-200/80">{latest ? t('callingIntel.kb.latest', 'Live: version {v} · {n} entries · published {date}', { v: latest.version, n: latest.entryCount, date: new Date(latest.publishedAt).toLocaleString() }) : t('callingIntel.kb.nothingPublished', 'Nothing published yet: agents receive no business knowledge.')}</p></div>
      <div className="flex flex-wrap gap-2">{canWrite && <button className={secondaryClass} onClick={() => setEditing('new')}><Plus className="h-4 w-4" />{t('callingIntel.kb.new', 'New entry')}</button>}{canApprove && <button className={primaryClass} onClick={() => setPublishing(true)}><Upload className="h-4 w-4" />{t('callingIntel.kb.publish', 'Publish approved entries')}</button>}</div>
    </div>
    <div className="flex flex-wrap gap-2">
      <select aria-label={t('callingIntel.kb.filterStatus', 'Filter by status')} value={status} onChange={e => setStatus(e.target.value)} className="rounded-lg border border-white/12 bg-[#0c1425] px-3 py-2 text-xs text-slate-300"><option value="">{t('callingIntel.kb.allActive', 'All except archived')}</option>{['draft', 'pending_approval', 'approved', 'archived'].map(s => <option key={s} value={s}>{statusLabel(t, s)}</option>)}</select>
      <select aria-label={t('callingIntel.kb.filterType', 'Filter by type')} value={type} onChange={e => setType(e.target.value)} className="rounded-lg border border-white/12 bg-[#0c1425] px-3 py-2 text-xs text-slate-300"><option value="">{t('callingIntel.kb.allTypes', 'All types')}</option>{TYPES.map(x => <option key={x} value={x}>{typeLabel(t, x)}</option>)}</select>
    </div>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    {query.isLoading && <p role="status" className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />{t('callingIntel.common.loading', 'Loading…')}</p>}
    {query.isError && <p role="alert" className="text-sm text-rose-300">{t('callingIntel.kb.error', 'Knowledge could not be loaded.')}</p>}
    {query.isSuccess && !entries.length && <div className={`${panelClass} py-10 text-center text-sm text-slate-400`}>{t('callingIntel.kb.empty', 'No entries yet. Add your products, prices and the promises agents may make.')}</div>}
    <div className="grid gap-3 lg:grid-cols-2">{entries.map(entry => <article key={entry._id} className={`${panelClass} space-y-3`}>
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wider text-sky-300/80">{typeLabel(t, entry.type)} · {t('callingIntel.kb.revision', 'Revision {n}', { n: entry.revision })}</p><h3 className="mt-1 font-medium text-slate-100 [overflow-wrap:anywhere]">{entry.title}</h3></div><div className="flex flex-wrap gap-1.5"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone[entry.status]}`}>{statusLabel(t, entry.status)}</span>{entry.inLatestVersion && <span className="rounded-full border border-blue-400/30 px-2 py-0.5 text-[10px] font-semibold text-blue-200">{entry.publishedRevision === entry.revision ? t('callingIntel.kb.live', 'Live') : t('callingIntel.kb.liveOlder', 'Live (revision {n})', { n: entry.publishedRevision })}</span>}</div></div>
      {entry.price?.amount != null && <p className="text-sm text-cyan-200">{entry.price.amount.toLocaleString()} {entry.price.currency}{entry.price.unit ? ` / ${entry.price.unit}` : ''}</p>}
      {entry.content && <p className="line-clamp-3 whitespace-pre-wrap text-xs text-slate-400">{entry.content}</p>}
      {entry.allowedPromises.length > 0 && <p className="text-[11px] text-slate-400"><span className="text-slate-300">{t('callingIntel.kb.allowed', 'May promise')}:</span> {entry.allowedPromises.join(' · ')}</p>}
      {entry.forbiddenClaims.length > 0 && <p className="text-[11px] text-rose-300/80"><span>{t('callingIntel.kb.forbidden', 'Never say')}:</span> {entry.forbiddenClaims.join(' · ')}</p>}
      {entry.rejectionNote && entry.status === 'draft' && <p className="text-[11px] text-amber-200">{t('callingIntel.kb.sentBack', 'Sent back')}: {entry.rejectionNote}</p>}
      <div className="flex flex-wrap gap-1.5 border-t border-white/8 pt-3">
        {canWrite && entry.status !== 'archived' && <button className={`${secondaryClass} px-2.5 py-1.5 text-xs`} onClick={() => setEditing(entry)}><Pencil className="h-3 w-3" />{t('callingIntel.kb.edit', 'Edit')}</button>}
        {canWrite && entry.status === 'draft' && <button className={`${secondaryClass} px-2.5 py-1.5 text-xs`} onClick={() => void act(entry, 'submit')}><Send className="h-3 w-3" />{t('callingIntel.kb.submit', 'Submit for approval')}</button>}
        {canApprove && ['draft', 'pending_approval'].includes(entry.status) && <button className={`${primaryClass} px-2.5 py-1.5 text-xs`} onClick={() => void act(entry, 'approve')}><Check className="h-3 w-3" />{t('callingIntel.kb.approve', 'Approve')}</button>}
        {canApprove && entry.status === 'pending_approval' && <button className={`${secondaryClass} px-2.5 py-1.5 text-xs`} onClick={() => void act(entry, 'reject')}><Undo2 className="h-3 w-3" />{t('callingIntel.kb.sendBack', 'Send back')}</button>}
        {canWrite && entry.status !== 'archived' && <button className={`${secondaryClass} px-2.5 py-1.5 text-xs`} onClick={() => void act(entry, 'archive')}><Archive className="h-3 w-3" />{t('callingIntel.kb.archive', 'Archive')}</button>}
        {canWrite && entry.status === 'archived' && <button className={`${secondaryClass} px-2.5 py-1.5 text-xs`} onClick={() => void act(entry, 'restore')}><RotateCcw className="h-3 w-3" />{t('callingIntel.kb.restore', 'Restore')}</button>}
      </div>
    </article>)}</div>
    <KnowledgeVersionHistory canApprove={canApprove} />
    {editing && <KnowledgeEntryEditor entry={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    {publishing && <PublishDialog onClose={() => setPublishing(false)} />}
  </div>;
}

function PublishDialog({ onClose }: { onClose: () => void }) {
  const t = useIntelT();
  const { publish } = useKnowledgeMutations();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  return <AgentDialog title={t('callingIntel.kb.publishTitle', 'Publish a new knowledge version')} description={t('callingIntel.kb.publishDesc', 'Every approved entry is snapshotted into a new, unchangeable version. Agents set to “latest” use it on their next call; pinned agents keep their version.')} onClose={onClose}
    footer={<div className="flex justify-end gap-2"><button className={secondaryClass} onClick={onClose}>{t('callingIntel.common.cancel', 'Cancel')}</button><button className={primaryClass} disabled={publish.isPending} onClick={async () => { setError(null); try { await publish.mutateAsync(note); onClose(); } catch (e) { setError(readableError(e)); } }}>{publish.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{t('callingIntel.kb.publishConfirm', 'Publish')}</button></div>}>
    <AgentField label={t('callingIntel.kb.note', 'Release note (optional)')}><input className={inputClass} value={note} maxLength={500} onChange={e => setNote(e.target.value)} /></AgentField>
    {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
  </AgentDialog>;
}

function KnowledgeEntryEditor({ entry, onClose }: { entry: KnowledgeEntry | null; onClose: () => void }) {
  const t = useIntelT();
  const m = useKnowledgeMutations();
  const [draft, setDraft] = useState({
    type: entry?.type || 'product' as KnowledgeType, title: entry?.title || '', content: entry?.content || '',
    amount: entry?.price?.amount != null ? String(entry.price.amount) : '', currency: entry?.price?.currency || '', unit: entry?.price?.unit || '',
    allowed: (entry?.allowedPromises || []).join('\n'), forbidden: (entry?.forbiddenClaims || []).join('\n'), tags: (entry?.tags || []).join(', '),
    variants: entry?.variants || [],
  });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof draft>) => setDraft(d => ({ ...d, ...patch }));
  const save = async () => {
    setError(null);
    const input: KnowledgeContent = {
      type: draft.type, title: draft.title.trim(), content: draft.content.trim(),
      price: draft.amount !== '' ? { amount: Number(draft.amount), currency: draft.currency.trim().toUpperCase() || null, unit: draft.unit.trim() || null } : null,
      allowedPromises: lines(draft.allowed), forbiddenClaims: lines(draft.forbidden),
      tags: draft.tags.split(',').map(s => s.trim()).filter(Boolean),
      variants: draft.variants.filter(v => v.language.trim() && (v.title?.trim() || v.content?.trim())),
    };
    try {
      if (entry) await m.update.mutateAsync({ id: entry._id, revision: entry.revision, ...input });
      else await m.create.mutateAsync(input);
      onClose();
    } catch (e) { setError(readableError(e)); }
  };
  const busy = m.create.isPending || m.update.isPending;
  return <AgentDialog wide title={entry ? t('callingIntel.kb.editTitle', 'Edit knowledge entry') : t('callingIntel.kb.newTitle', 'New knowledge entry')} description={entry?.status === 'approved' ? t('callingIntel.kb.editApprovedWarning', 'Saving returns this entry to draft. It must be approved and published again before agents use the change.') : t('callingIntel.kb.editorDesc', 'Write it as agents should say it. Keep prices exact and promises specific.')} onClose={onClose}
    footer={<div className="flex items-center justify-end gap-2">{error && <p role="alert" className="me-auto text-sm text-rose-300">{error}</p>}<button className={secondaryClass} onClick={onClose}>{t('callingIntel.common.cancel', 'Cancel')}</button><button className={primaryClass} disabled={busy || !draft.title.trim()} onClick={() => void save()}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{t('callingIntel.kb.saveDraft', 'Save draft')}</button></div>}>
    <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
      <AgentField label={t('callingIntel.kb.typeLabel', 'Type')}><select className={inputClass} value={draft.type} onChange={e => set({ type: e.target.value as KnowledgeType })}>{TYPES.map(x => <option key={x} value={x}>{typeLabel(t, x)}</option>)}</select></AgentField>
      <AgentField label={t('callingIntel.kb.titleLabel', 'Title')}><input className={inputClass} value={draft.title} maxLength={200} onChange={e => set({ title: e.target.value })} /></AgentField>
    </div>
    <div className="mt-4"><AgentField label={t('callingIntel.kb.contentLabel', 'What agents may say')}><textarea className={`${inputClass} min-h-28`} value={draft.content} maxLength={4000} onChange={e => set({ content: e.target.value })} /></AgentField></div>
    <fieldset className="mt-4 grid gap-3 sm:grid-cols-3"><legend className="mb-2 text-xs font-medium text-slate-300">{t('callingIntel.kb.price', 'Price (optional)')}</legend>
      <AgentField label={t('callingIntel.kb.amount', 'Amount')}><input type="number" min={0} step="any" className={inputClass} value={draft.amount} onChange={e => set({ amount: e.target.value })} /></AgentField>
      <AgentField label={t('callingIntel.kb.currency', 'Currency (ISO)')}><input className={inputClass} maxLength={3} placeholder="PKR" value={draft.currency} onChange={e => set({ currency: e.target.value })} /></AgentField>
      <AgentField label={t('callingIntel.kb.unit', 'Per')}><input className={inputClass} maxLength={40} placeholder="month" value={draft.unit} onChange={e => set({ unit: e.target.value })} /></AgentField>
    </fieldset>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <AgentField label={t('callingIntel.kb.allowedLabel', 'Promises agents may make')} hint={t('callingIntel.kb.onePerLine', 'One per line.')}><textarea className={`${inputClass} min-h-24`} value={draft.allowed} onChange={e => set({ allowed: e.target.value })} /></AgentField>
      <AgentField label={t('callingIntel.kb.forbiddenLabel', 'Claims agents must never make')} hint={t('callingIntel.kb.onePerLine', 'One per line.')}><textarea className={`${inputClass} min-h-24`} value={draft.forbidden} onChange={e => set({ forbidden: e.target.value })} /></AgentField>
    </div>
    <div className="mt-4"><AgentField label={t('callingIntel.kb.tags', 'Tags')} hint={t('callingIntel.kb.tagsHint', 'Comma separated.')}><input className={inputClass} value={draft.tags} onChange={e => set({ tags: e.target.value })} /></AgentField></div>
    <div className="mt-4 space-y-3"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-300">{t('callingIntel.kb.variants', 'Language versions')}</p><button type="button" className={`${secondaryClass} px-2.5 py-1.5 text-xs`} onClick={() => set({ variants: [...draft.variants, { language: '', title: '', content: '' }] })}><Plus className="h-3 w-3" />{t('callingIntel.kb.addVariant', 'Add language')}</button></div>
      {draft.variants.map((v, i) => <div key={i} className="grid gap-2 rounded-xl border border-white/8 p-3 sm:grid-cols-[90px_1fr_auto]">
        <input aria-label={t('callingIntel.kb.variantLanguage', 'Language code')} placeholder="ur" className={inputClass} value={v.language} maxLength={10} onChange={e => set({ variants: draft.variants.map((x, j) => (j === i ? { ...x, language: e.target.value } : x)) })} />
        <div className="space-y-2"><input aria-label={t('callingIntel.kb.variantTitle', 'Translated title')} dir="auto" className={inputClass} value={v.title || ''} onChange={e => set({ variants: draft.variants.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} /><textarea aria-label={t('callingIntel.kb.variantContent', 'Translated text')} dir="auto" className={`${inputClass} min-h-20`} value={v.content || ''} onChange={e => set({ variants: draft.variants.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)) })} /></div>
        <button type="button" aria-label={t('callingIntel.kb.removeVariant', 'Remove language')} className={`${secondaryClass} h-10 px-2`} onClick={() => set({ variants: draft.variants.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></button>
      </div>)}
    </div>
  </AgentDialog>;
}

function KnowledgeVersionHistory({ canApprove }: { canApprove: boolean }) {
  const t = useIntelT();
  const versions = useKnowledgeVersions();
  const { rollback } = useKnowledgeMutations();
  const [diffFor, setDiffFor] = useState<KnowledgeVersionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = versions.data?.data || [];
  if (!list.length) return null;
  return <section className={`${panelClass} space-y-3`} aria-label={t('callingIntel.kb.history', 'Version history')}>
    <h3 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-sky-300" />{t('callingIntel.kb.history', 'Version history')}</h3>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    <ul className="divide-y divide-white/8">{list.map((v, i) => <li key={v._id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
      <div><p className="font-medium text-slate-100">{t('callingIntel.kb.versionN', 'Version {v}', { v: v.version })}{i === 0 && <span className="ms-2 rounded-full border border-cyan-400/30 px-2 py-0.5 text-[10px] text-cyan-200">{t('callingIntel.kb.live', 'Live')}</span>}{v.rollbackOf && <span className="ms-2 text-slate-400">{t('callingIntel.kb.rollbackOf', 'rollback of version {v}', { v: v.rollbackOf })}</span>}</p><p className="mt-0.5 text-slate-500">{new Date(v.publishedAt).toLocaleString()} · {t('callingIntel.kb.entryCount', '{n} entries', { n: v.entryCount })}{v.publishedBy ? ` · ${[v.publishedBy.firstName, v.publishedBy.lastName].filter(Boolean).join(' ') || v.publishedBy.email}` : ''}{v.note ? ` · ${v.note}` : ''}</p></div>
      <div className="flex gap-1.5">{i < list.length - 1 && <button className={`${secondaryClass} px-2.5 py-1.5 text-xs`} onClick={() => setDiffFor(v)}><GitCompare className="h-3 w-3" />{t('callingIntel.kb.viewChanges', 'Changes')}</button>}{canApprove && i > 0 && <button className={`${secondaryClass} px-2.5 py-1.5 text-xs`} disabled={rollback.isPending} onClick={async () => { setError(null); try { await rollback.mutateAsync({ id: v._id }); } catch (e) { setError(readableError(e)); } }}><RotateCcw className="h-3 w-3" />{t('callingIntel.kb.rollback', 'Make live again')}</button>}</div>
    </li>)}</ul>
    {diffFor && <VersionDiffDialog version={diffFor} onClose={() => setDiffFor(null)} />}
  </section>;
}

function VersionDiffDialog({ version, onClose }: { version: KnowledgeVersionSummary; onClose: () => void }) {
  const t = useIntelT();
  const diff = useKnowledgeDiff(version._id);
  const d = diff.data;
  return <AgentDialog wide title={t('callingIntel.kb.diffTitle', 'Changes in version {v}', { v: version.version })} description={d ? t('callingIntel.kb.diffDesc', 'Compared with version {v}.', { v: d.fromVersion ?? '—' }) : ''} onClose={onClose}>
    {diff.isLoading ? <p role="status" className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />{t('callingIntel.common.loading', 'Loading…')}</p> : d && <div className="space-y-4 text-xs">
      {!d.added.length && !d.removed.length && !d.changed.length && <p className="text-slate-400">{t('callingIntel.kb.noChanges', 'No differences.')}</p>}
      {d.added.length > 0 && <div><p className="font-semibold text-cyan-200">{t('callingIntel.kb.added', 'Added')}</p><ul className="mt-1 list-disc ps-5 text-slate-300">{d.added.map(e => <li key={e.entryId}>{e.title} ({typeLabel(t, e.type)})</li>)}</ul></div>}
      {d.removed.length > 0 && <div><p className="font-semibold text-rose-300">{t('callingIntel.kb.removed', 'Removed')}</p><ul className="mt-1 list-disc ps-5 text-slate-300">{d.removed.map(e => <li key={e.entryId}>{e.title} ({typeLabel(t, e.type)})</li>)}</ul></div>}
      {d.changed.map(c => <div key={c.entryId} className="rounded-xl border border-white/8 p-3"><p className="font-semibold text-slate-100">{c.title}</p>{c.fields.map(f => <div key={f.field} className="mt-2 grid gap-1 sm:grid-cols-[120px_1fr_1fr]"><span className="text-slate-500">{t(`callingIntel.kb.field.${f.field}`, f.field)}</span><del className="rounded bg-rose-500/10 p-1.5 text-rose-200 [overflow-wrap:anywhere]">{f.before || '—'}</del><ins className="rounded bg-cyan-500/10 p-1.5 text-cyan-100 no-underline [overflow-wrap:anywhere]">{f.after || '—'}</ins></div>)}</div>)}
    </div>}
  </AgentDialog>;
}
