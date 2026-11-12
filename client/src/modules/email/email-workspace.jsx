'use client';
import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import DOMPurify from 'dompurify';
import { toast } from 'sonner';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, Inbox, Send, FileEdit, Star, Flag, Archive, ShieldAlert, Trash2, Search, SlidersHorizontal, Plus, ChevronDown, ArrowRight, Reply, ReplyAll, Forward, RefreshCw, Settings2, Sparkles, Paperclip, X, Check, Clock3, ShieldCheck, Bold, Italic, List, Underline, Link2, Download, Eye, Menu, ArrowLeft, Loader2, CheckCheck, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/shared/hooks/use-auth';
import { usePermissions } from '@/shared/hooks/use-permissions';
import api from '@/lib/api/client';
import { emailApi, recipients, replyRecipients, replySubject } from './email-api';
import styles from './email.module.css';
import { useLanguage } from '@/lib/i18n/language-context';
import { BandChip, PageBand, heroButton } from '@/shared/components/page-hero';
const folders = [['inbox', 'Inbox', Inbox], ['starred', 'Starred', Star], ['important', 'Important', Flag], ['sent', 'Sent', Send], ['drafts', 'Drafts', FileEdit], ['scheduled', 'Scheduled', Clock3], ['approval', 'Needs approval', ShieldCheck], ['archive', 'Archive', Archive], ['spam', 'Spam', ShieldAlert], ['trash', 'Trash', Trash2]];
const initials = text => (text || '?').replace(/<.*>/, '').trim().slice(0, 2).toUpperCase();
const sender = text => (text || 'Unknown sender').replace(/<.*>/, '').replace(/"/g, '').trim();
const stamp = value => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const dateTime = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const cleanHtml = html => DOMPurify.sanitize(html || '', { FORBID_TAGS: ['script', 'form', 'iframe', 'object', 'embed', 'link', 'meta', 'style'], FORBID_ATTR: ['style'], ADD_ATTR: ['target'] });
function IconButton({ icon: Icon, label, ...props }) { return <button type="button" title={label} aria-label={label} className={styles.iconButton} {...props}><Icon size={17} /></button>; }
function ErrorState({ error, retry }) { return <div className={styles.error} role="alert"><ShieldAlert size={18} /><span>{error?.message || 'Something went wrong. Please try again.'}</span>{retry && <button onClick={retry}>Retry</button>}</div>; }
function Modal({ title, description, children, onClose, wide = false }) { return <Dialog open onOpenChange={open => !open && onClose()}><DialogContent className={`${styles.modal} ${wide ? styles.wideModal : ''}`}><div className={styles.modalHeading}><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></div><div className={styles.modalBody}>{children}</div></DialogContent></Dialog>; }
export default function EmailWorkspace({ initialMessageId = null }) {
  const { user } = useAuth(), { hasPermission, permissions } = usePermissions(), qc = useQueryClient(), { t } = useLanguage();
  const permissionsReady = Boolean(permissions.length || user?.role?.name === 'Admin' || user?.role === 'Admin');
  const can = action => permissionsReady && hasPermission(`email:${action}`), baseKey = ['email', user?._id || user?.id];
  const [accountId, setAccountId] = useState(''), [folder, setFolder] = useState('inbox'), [query, setQuery] = useState(''), [debounced, setDebounced] = useState('');
  const [filters, setFilters] = useState({}), [showFilters, setShowFilters] = useState(false), [selected, setSelected] = useState(initialMessageId ? { _id: initialMessageId } : null), [checked, setChecked] = useState([]);
  const [composer, setComposer] = useState(null), [connect, setConnect] = useState(false), [settingsId, setSettingsId] = useState(null), [mobileFolders, setMobileFolders] = useState(false), [busy, setBusy] = useState(false);
  const searchRef = useRef(null);
  const accounts = useQuery({ queryKey: [...baseKey, 'accounts'], queryFn: () => emailApi.get('/accounts'), enabled: can('read'), refetchInterval: 30000 });
  const accountList = accounts.data || [], activeAccount = accountList.find(a => a._id === accountId);
  const messages = useInfiniteQuery({ queryKey: [...baseKey, 'messages', accountId, folder, debounced, filters], queryFn: ({ pageParam }) => emailApi.get('/messages', { ...(accountId ? { accountId } : {}), folder, q: debounced, ...filters, ...(pageParam ? { cursor: pageParam } : {}) }), initialPageParam: null, getNextPageParam: page => page.nextCursor || undefined, enabled: can('read'), refetchInterval: 30000 });
  const rows = messages.data?.pages.flatMap(p => p.items) || [];
  const currentSelected = rows.find(m => m._id === selected?._id) || selected;
  const conversation = useQuery({ queryKey: [...baseKey, 'conversation', selected?._id], queryFn: () => emailApi.get(`/messages/${selected._id}`), enabled: Boolean(selected), refetchInterval: selected ? 30000 : false });
  const invalidate = () => qc.invalidateQueries({ queryKey: baseKey });
  useEffect(() => { const timer = setTimeout(() => setDebounced(query), 250); return () => clearTimeout(timer); }, [query]);
  const changeFolder = id => { setFolder(id); setSelected(null); setChecked([]); setMobileFolders(false); };
  const mutate = async (patch, ids = checked.length ? checked : selected ? [selected._id] : []) => {
    if (!ids.length || !can('write')) return;
    setBusy(true);
    try {
      const result = await emailApi.post('/messages/bulk', { ids, ...patch });
      const failures = result.filter(r => !r.ok);
      if (failures.length) toast.error(failures[0].error); else if (ids.length > 1) toast.success(`${ids.length} messages updated`);
      setChecked([]); await invalidate();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const compose = async (mode = 'new', message = conversation.data?.at(-1) || selected) => {
    if (!can('write')) return;
    const a = accountList.find(a => a._id === message?.accountId) || activeAccount || accountList.find(a => a.status === 'connected');
    if (!a) { setConnect(true); return; }
    if (mode === 'edit' && message?.state === 'draft') {
      try { setComposer({ account: a, draft: await emailApi.get(`/drafts/${message._id}`) }); } catch (e) { toast.error(e.message); } return;
    }
    setComposer({ account: a, ...(mode === 'new' ? {} : { message, mode }) });
  };
  // Keyboard actions are scoped to this workspace and never intercept typing.
  useEffect(() => {
    const handler = e => {
      if (composer || connect || settingsId || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input,textarea,select,[contenteditable="true"],[role="dialog"]')) return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'c') { e.preventDefault(); compose(); }
      if (e.key === 'Escape') setSelected(null);
      if (e.key === 'r' && selected) compose('reply');
      if (e.key === 'e' && selected) mutate({ folder: 'archive' });
      if (e.key === 'j' || e.key === 'k') { e.preventDefault(); const i = rows.findIndex(r => r._id === selected?._id); setSelected(rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'j' ? 1 : -1)))] || null); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  });
  const sync = async () => {
    setBusy(true); try { for (const a of (activeAccount ? [activeAccount] : accountList).filter(a => a.status === 'connected')) await emailApi.post(`/accounts/${a._id}/sync`); toast.success('Mailbox synchronization queued'); await invalidate(); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  if (!can('read')) return <div className={styles.empty}><ShieldCheck /><h2>Email access required</h2><p>Ask your administrator for access to the email workspace.</p></div>;
  return <div className={styles.workspace}>
    <PageBand
      className="mb-4"
      id="email-title"
      art="/hero/email"
      icon={Mail}
      eyebrow={t('emailHero.eyebrow', 'Communication workspace')}
      title={t('emailHero.title', 'Email')}
      subtitle={t('emailHero.subtitle', 'Your conversations, in focus — connected to your CRM.')}
      chips={<><BandChip icon={Mail} value={accountList.filter(a => a.status === 'connected').length} label={t('emailHero.accounts', 'connected accounts')} /><BandChip icon={Inbox} value={(activeAccount ? [activeAccount] : accountList).reduce((sum, a) => sum + (a.unreadCount || 0), 0)} label={t('emailHero.unread', 'unread')} /></>}
      actions={<>{can('manage') && <button type="button" className={heroButton.ghost} onClick={() => setConnect(true)}><Plus aria-hidden="true" />{t('emailHero.connect', 'Connect account')}</button>}<button type="button" className={heroButton.primary} onClick={() => compose()} disabled={!can('write')}><Plus aria-hidden="true" />{t('emailHero.new', 'Compose')}</button></>}
    />
    <div className={`${styles.shell} ${selected ? styles.hasSelection : ''}`}>
      <aside className={`${styles.folders} ${mobileFolders ? styles.foldersOpen : ''}`} aria-label="Mail folders">
        <div className={styles.brand}><span className={styles.brandIcon}><Mail size={19} /></span><div><strong>Your mail</strong><small>{accountList.length} connected account{accountList.length === 1 ? '' : 's'}</small></div><IconButton icon={X} label="Close folders" onClick={() => setMobileFolders(false)} /></div>
        <button className={styles.composeButton} onClick={() => compose()} disabled={!can('write')}><Plus size={18} /> Compose <kbd>C</kbd></button>
        <label className={styles.accountSwitch}><span>MAILBOX</span><div><Mail size={15} /><select aria-label="Switch email account" value={accountId} onChange={e => { setAccountId(e.target.value); setSelected(null); setChecked([]); }}><option value="">All accounts</option>{accountList.map(a => <option key={a._id} value={a._id}>{a.address}</option>)}</select></div></label>
        <nav>{folders.map(([id, title, Icon]) => <button key={id} className={`${styles.folder} ${folder === id ? styles.folderActive : ''}`} onClick={() => changeFolder(id)}><Icon size={17} /><span>{title}</span>{id === 'inbox' && <span className={styles.count}>{(activeAccount ? [activeAccount] : accountList).reduce((sum, a) => sum + a.unreadCount, 0)}</span>}</button>)}</nav>
        <div className={styles.accountsHeading}><span>YOUR ACCOUNTS</span>{can('manage') && <IconButton icon={Plus} label="Connect account" onClick={() => setConnect(true)} />}</div>
        <div className={styles.accountList}>{accountList.map((a, i) => <div key={a._id} className={styles.accountRow}><button onClick={() => { setAccountId(a._id); setSelected(null); }}><span className={styles.accountDot} style={{ '--account-color': ['#7864d8', '#38a391', '#d5a34d'][i % 3] }} /><span title={a.address}>{a.address}<small>{a.lastError ? 'Sync needs attention' : a.status === 'connected' ? a.lastSyncAt ? `Synced ${stamp(a.lastSyncAt)}` : 'First sync pending' : 'Disconnected'}</small></span></button>{can('manage') && <IconButton icon={Settings2} label={`Manage ${a.address}`} onClick={() => setSettingsId(a._id)} />}</div>)}</div>
        <div className={styles.privateNote}><ShieldCheck size={15} /><span>Private by default.<br />Shared with agents by you.</span></div>
      </aside>
      <section className={styles.listPanel} aria-label="Conversations">
        <div className={styles.listHeading}><div><IconButton icon={Menu} label="Open mail folders" onClick={() => setMobileFolders(true)} /><h2>{folders.find(f => f[0] === folder)?.[1]}</h2><span>{rows.length}{messages.hasNextPage ? '+' : ''}</span></div><IconButton icon={RefreshCw} label="Synchronize mail" disabled={busy || !accountList.length || !can('write')} onClick={sync} /></div>
        <div className={styles.search}><Search size={17} /><input ref={searchRef} aria-label="Search email" placeholder="Search your conversations" value={query} onChange={e => { setQuery(e.target.value); setSelected(null); }} /><IconButton icon={SlidersHorizontal} label="Advanced search filters" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)} /></div>
        {showFilters && <div className={styles.filters}>{[['from', 'Sender'], ['subject', 'Subject']].map(([key, label]) => <label key={key}>{label}<input value={filters[key] || ''} onChange={e => setFilters(f => ({ ...f, [key]: e.target.value || undefined }))} /></label>)}{[['after', 'After'], ['before', 'Before']].map(([key, label]) => <label key={key}>{label}<input type="date" onChange={e => setFilters(f => ({ ...f, [key]: e.target.value ? new Date(e.target.value).toISOString() : undefined }))} /></label>)}<label className={styles.checkbox}><input type="checkbox" checked={filters.unread === 'true'} onChange={e => setFilters(f => ({ ...f, unread: e.target.checked ? 'true' : undefined }))} /> Unread only</label></div>}
        <div className={styles.listToolbar}><label className={styles.checkbox}><input type="checkbox" aria-label="Select all visible conversations" checked={Boolean(rows.length) && checked.length === rows.length} onChange={e => setChecked(e.target.checked ? rows.map(r => r._id) : [])} /><span>{checked.length ? `${checked.length} selected` : 'Recent conversations'}</span></label>{checked.length > 0 && can('write') && <div><IconButton icon={Archive} label="Archive selected" disabled={busy} onClick={() => mutate({ folder: 'archive' })} /><IconButton icon={CheckCheck} label="Mark selected read" disabled={busy} onClick={() => mutate({ unread: false })} /><IconButton icon={Trash2} label="Move selected to trash" disabled={busy} onClick={() => mutate({ folder: 'trash' })} /></div>}</div>
        {messages.error && <ErrorState error={messages.error} retry={() => messages.refetch()} />}
        {accounts.error && <ErrorState error={accounts.error} retry={() => accounts.refetch()} />}
        <div className={styles.messages}>{messages.isPending ? Array.from({ length: 6 }, (_, i) => <div className={styles.skeleton} key={i}><span /><div /><div /></div>) : rows.length ? rows.map(m => <article key={m._id} className={`${styles.messageRow} ${selected?._id === m._id ? styles.selected : ''} ${m.unreadCount ? styles.unread : ''}`}>
          <input className={styles.rowCheck} type="checkbox" aria-label={`Select ${m.subject || 'Untitled'}`} checked={checked.includes(m._id)} onChange={e => setChecked(ids => e.target.checked ? [...ids, m._id] : ids.filter(id => id !== m._id))} />
          <button className={styles.rowMain} onClick={() => setSelected(m)}><div className={styles.rowTop}><span className={styles.avatar}>{initials(m.from || activeAccount?.address)}</span><strong>{sender(m.from) || 'Draft'}</strong><time>{stamp(m.date)}</time></div><h3>{m.subject || '(No subject)'}{m.conversationCount > 1 && <small>{m.conversationCount}</small>}</h3><p>{m.snippet || (m.state === 'draft' ? 'Continue writing your draft…' : 'Open conversation')}</p><div className={styles.rowMeta}><span className={styles.providerDot} />{accountList.find(a => a._id === m.accountId)?.address}<span>{m.attachments?.length > 0 && <Paperclip size={12} />}{m.agentId && <Sparkles size={12} />}{m.intelligence?.category && <b>{m.intelligence.category}</b>}{['high', 'urgent'].includes(m.intelligence?.priority) && <Flag size={12} />}{['approval', 'queued', 'unknown'].includes(m.state) && <b>{m.state === 'queued' ? 'Scheduled' : m.state === 'approval' ? 'Review' : 'Check delivery'}</b>}</span></div></button>
          <button className={`${styles.star} ${m.starred ? styles.isStarred : ''}`} aria-label={m.starred ? 'Unstar email' : 'Star email'} disabled={!can('write') || busy} onClick={() => mutate({ starred: !m.starred }, [m._id])}><Star size={15} fill={m.starred ? 'currentColor' : 'none'} /></button>
        </article>) : <div className={styles.listEmpty}><Inbox size={32} /><h3>{query || Object.values(filters).some(Boolean) ? 'No matching conversations' : accountList.length ? 'A little breathing room' : 'Your inbox starts here'}</h3><p>{accountList.length ? 'Messages appear here after synchronization. Try another folder or search.' : 'Connect your email and bring every customer conversation together.'}</p>{!accountList.length && can('manage') && <button onClick={() => setConnect(true)}>Connect your first account <ArrowRight size={14} /></button>}</div>}
          {messages.hasNextPage && <button className={styles.loadMore} disabled={messages.isFetchingNextPage} onClick={() => messages.fetchNextPage()}>{messages.isFetchingNextPage ? 'Loading…' : 'Load more conversations'}</button>}
        </div><div className={styles.listFooter}><span className={styles.liveDot} />{messages.isFetching ? 'Refreshing conversations…' : 'Updates every 30 seconds'}<span>J ↓ K ↑</span></div>
      </section>
      <section className={styles.viewer} aria-label="Message viewer">
        {selected ? <><div className={styles.viewerToolbar}><div><IconButton icon={ArrowLeft} label="Back to conversation list" onClick={() => setSelected(null)} />{can('write') && <><IconButton icon={Archive} label="Archive conversation" disabled={busy} onClick={() => mutate({ folder: 'archive' })} /><IconButton icon={Trash2} label="Move to trash" disabled={busy} onClick={() => mutate({ folder: 'trash' })} /><IconButton icon={Mail} label={currentSelected.unread ? 'Mark read' : 'Mark unread'} disabled={busy} onClick={() => mutate({ unread: !currentSelected.unread })} /><IconButton icon={Flag} label="Toggle important" disabled={busy} onClick={() => mutate({ important: !currentSelected.important })} /></>}</div><span>{activeAccount?.address || accountList.find(a => a._id === selected.accountId)?.address}</span></div>
          {conversation.error && <ErrorState error={conversation.error} retry={() => conversation.refetch()} />}
          {conversation.isPending ? <div className={styles.viewerSkeleton}><div className={styles.skeleton} /><div className={styles.skeleton} /></div> : <Conversation key={selected._id} messages={conversation.data || []} selected={selected} can={can} onCompose={compose} onRefresh={invalidate} onMutate={mutate} baseKey={baseKey} />}
        </> : <div className={styles.viewerEmpty}><div className={styles.emptyArt}><div /><div /><span><Mail size={38} strokeWidth={1.2} /></span><i><Check size={16} /></i></div><div className={styles.eyebrow}>A CLEARER WAY TO CONNECT</div><h2>Make room for<br />meaningful conversations.</h2><p>All your accounts. Every customer.<br />One thoughtful workspace.</p><div className={styles.emptyFeatures}><span><ShieldCheck size={15} /> Secure accounts</span><span><Sparkles size={15} /> AI assistance</span></div>{can('write') && <Button variant="outline" onClick={() => compose()}>Write a message <ArrowRight size={15} /></Button>}</div>}
      </section>
    </div>
    {connect && <ConnectModal onClose={() => setConnect(false)} onDone={invalidate} />}
    {settingsId && <AccountSettings account={accountList.find(a => a._id === settingsId)} baseKey={baseKey} onClose={() => setSettingsId(null)} onDone={invalidate} />}
    {composer && <Composer key={composer.draft?._id || `${composer.account._id}-${composer.mode || 'new'}`} {...composer} accounts={accountList} can={can} onClose={() => setComposer(null)} onDone={invalidate} />}
  </div>;
}
function Conversation({ messages, selected, can, onCompose, onRefresh, onMutate, baseKey }) {
  const [ai, setAi] = useState(null), [busy, setBusy] = useState(false), [link, setLink] = useState(false), [label, setLabel] = useState('');
  const last = messages.at(-1) || selected;
  const action = async path => { setBusy(true); try { await emailApi.post(`/messages/${last._id}/${path}`); await onRefresh(); toast.success(path === 'approve' ? 'Approved and queued for sending' : 'Returned to drafts'); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  const assist = async () => { setBusy(true); try { const result = await emailApi.post(`/messages/${last._id}/ai`, { action: 'insights' }); setAi(result.text); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  return <div className={styles.conversation}>
    <div className={styles.subject}><h2>{last.subject || '(No subject)'}</h2><div><span className={styles.tag}>{last.folder}</span>{last.leadId && <Link className={styles.crmLink} href={`/leads?detail=${last.leadId}`}><Link2 size={12} /> Linked lead <ExternalLink size={11} /></Link>}{last.contactId && <span className={styles.tag}>Linked customer</span>}<span>{messages.length} message{messages.length === 1 ? '' : 's'}</span></div></div>
    {last.error && <ErrorState error={{ message: last.error }} />}
    {['approval', 'queued'].includes(last.state) && <div className={styles.approvalBanner}><ShieldCheck size={20} /><div><strong>{last.state === 'approval' ? 'Ready for your review' : 'Scheduled for sending'}</strong><p>{last.state === 'approval' ? 'Review the complete message and recipients before approving.' : dateTime(last.scheduledAt)}</p></div>{last.state === 'approval' && can('send') && <Button size="sm" disabled={busy} onClick={() => action('approve')}>Approve & send</Button>}{can('write') && <Button variant="outline" size="sm" disabled={busy} onClick={() => action('cancel')}>Return to draft</Button>}</div>}
    {messages.map((m, index) => <article className={styles.mailCard} key={m._id}><div className={styles.mailHeader}><span className={`${styles.avatar} ${styles.largeAvatar}`}>{initials(m.from)}</span><div><strong>{sender(m.from) || 'You'}</strong><p>To: {m.to?.join(', ') || '(No recipients)'}</p>{Boolean(m.cc?.length) && <p>Cc: {m.cc.join(', ')}</p>}{Boolean(m.bcc?.length) && <p>Bcc: {m.bcc.join(', ')}</p>}</div><time>{dateTime(m.date)}</time><Star size={15} className={m.starred ? styles.isStarred : ''} /></div>
      {index < messages.length - 1 ? <details className={styles.previousMail}><summary>{m.snippet || 'Show earlier message'}</summary><MessageBody message={m} /></details> : <MessageBody message={m} />}
      {m.attachments?.length > 0 && <div className={styles.attachments}>{m.attachments.map(f => <Attachment key={f._id} file={f} />)}</div>}
    </article>)}
    {can('write') && <div className={styles.replyActions}>{last.state === 'draft' ? <Button onClick={() => onCompose('edit', last)}><FileEdit size={15} /> Continue draft</Button> : <><Button variant="outline" onClick={() => onCompose('reply', last)}><Reply size={16} /> Reply</Button><Button variant="outline" onClick={() => onCompose('replyAll', last)}><ReplyAll size={16} /> Reply all</Button><Button variant="ghost" onClick={() => onCompose('forward', last)}><Forward size={16} /> Forward</Button></>}</div>}
    <div className={styles.insightCard}><div><span className={styles.aiIcon}><Sparkles size={17} /></span><div><strong>A little context goes a long way</strong><p>Summaries, intent and suggested next steps.</p></div>{can('ai') && <button disabled={busy} onClick={assist}>{busy ? <Loader2 size={16} className={styles.spin} /> : 'Get insights'} <ArrowRight size={14} /></button>}</div>{(ai || last.intelligence?.text) && <div className={styles.aiText}><small>AI suggestion · review before acting</small><p>{ai || last.intelligence.text}</p></div>}</div>
    {can('write') && <div className={styles.crmTools}><button onClick={() => setLink(true)}><Link2 size={15} /> Link to a lead or customer</button><form onSubmit={e => { e.preventDefault(); if (label.trim()) { onMutate({ labels: [...new Set([...(last.labels || []), label.trim()])] }, [last._id]); setLabel(''); } }}><input aria-label="New email label" placeholder="Add a label" value={label} maxLength={80} onChange={e => setLabel(e.target.value)} /><button aria-label="Add label" type="submit"><Plus size={15} /></button></form></div>}
    {last.labels?.length > 0 && <div className={styles.labelList}>{last.labels.map(l => <span key={l}>{l}</span>)}</div>}
    {link && <CrmLink messageId={last._id} baseKey={baseKey} onClose={() => setLink(false)} onDone={onRefresh} />}
  </div>;
}
function MessageBody({ message }) {
  const [html, setHtml] = useState(false);
  // HTML opens in a sandbox with no scripts, forms, navigation or remote images.
  const src = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';"><style>body{font:14px/1.7 system-ui;color:#283044;overflow-wrap:anywhere;padding:12px}img{max-width:100%}a{color:#6251c6}</style></head><body>${cleanHtml(message.html)}</body></html>`;
  return <div className={styles.body}>{html ? <iframe title="Email HTML preview" sandbox="" referrerPolicy="no-referrer" srcDoc={src} /> : <div className={styles.plainText}>{message.text || message.snippet || 'This email contains HTML content.'}</div>}{message.html && <button className={styles.htmlToggle} onClick={() => setHtml(!html)}><Eye size={13} />{html ? 'Show plain text' : 'Show formatted email · external images blocked'}</button>}</div>;
}
function Attachment({ file }) {
  const [busy, setBusy] = useState(false), [preview, setPreview] = useState(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const get = async show => {
    setBusy(true); try { const blob = await emailApi.attachment(file._id), url = URL.createObjectURL(new Blob([blob], { type: file.mime })); if (show) setPreview(url); else { const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const safePreview = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'].includes(file.mime);
  return <><div className={styles.attachment}><Paperclip size={17} /><div><strong>{file.name}</strong><small>{Math.ceil(file.size / 1024)} KB</small></div>{safePreview && <IconButton icon={Eye} label={`Preview ${file.name}`} disabled={busy} onClick={() => get(true)} />}<IconButton icon={Download} label={`Download ${file.name}`} disabled={busy} onClick={() => get(false)} /></div>{preview && <Modal title={file.name} description="Attachment preview" wide onClose={() => setPreview(null)}>{file.mime.startsWith('image/') ? <Image className={styles.preview} alt={file.name} src={preview} width={1200} height={900} unoptimized /> : <iframe className={styles.preview} title={file.name} sandbox="" src={preview} />}</Modal>}</>;
}
function ConnectModal({ onClose, onDone }) {
  const [custom, setCustom] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const connect = async provider => { setBusy(true); setError(null); try { const { url } = await emailApi.post(`/oauth/${provider}`); window.location.assign(url); } catch (e) { setError(e); setBusy(false); } };
  const submit = async e => { e.preventDefault(); setBusy(true); setError(null); const data = Object.fromEntries(new FormData(e.currentTarget)); data.smtpPort = Number(data.smtpPort); data.imapPort = 993; try { await emailApi.post('/accounts/imap', data); await onDone(); toast.success('Account connected. Your first synchronization will begin shortly.'); onClose(); } catch (err) { setError(err); } finally { setBusy(false); } };
  return <Modal title="A home for all your email" description="Connect your work accounts and keep customer conversations close." onClose={onClose}>
    <div className={styles.providerOptions}><button disabled={busy} onClick={() => connect('google')}><span className={styles.google}>G</span><div><strong>Google</strong><small>Gmail & Google Workspace</small></div><ArrowRight size={18} /></button><button disabled={busy} onClick={() => connect('microsoft')}><span className={styles.microsoft}><i /><i /><i /><i /></span><div><strong>Microsoft</strong><small>Outlook & Microsoft 365</small></div><ArrowRight size={18} /></button><button disabled={busy} onClick={() => setCustom(!custom)}><span className={styles.customProvider}><Mail size={22} /></span><div><strong>Other email provider</strong><small>Secure IMAP & SMTP connection</small></div><ChevronDown size={18} /></button></div>
    {custom && <form className={styles.form} onSubmit={submit}><label>Email address<input required name="address" type="email" autoComplete="email" /></label><label>Display name<input name="name" maxLength={120} /></label><label>Mailbox username<input required name="user" autoComplete="username" /></label><label>App password<input required name="password" type="password" autoComplete="new-password" /></label><div className={styles.formGrid}><label>IMAP server<input required name="imapHost" placeholder="imap.example.com" /></label><label>SMTP server<input required name="smtpHost" placeholder="smtp.example.com" /></label></div><label>SMTP encryption<select name="smtpPort"><option value="465">TLS · Port 465</option><option value="587">STARTTLS · Port 587</option></select></label><p className={styles.help}>IMAP connects using TLS on port 993. Your administrator must allow your mail server before connecting.</p><Button disabled={busy} type="submit">{busy && <Loader2 size={15} className={styles.spin} />} Connect securely</Button></form>}
    {error && <ErrorState error={error} />}<div className={styles.secureFoot}><ShieldCheck size={16} /><span>OAuth for Google and Microsoft. Encrypted credentials for custom accounts.</span></div>
  </Modal>;
}
function AccountSettings({ account, baseKey, onClose, onDone }) {
  const [autoIntelligence, setAutoIntelligence] = useState(account?.autoIntelligence || false), [followUp, setFollowUp] = useState({ enabled: false, delayHours: 48, subject: 'Following up', template: '', ...(account?.followUp || {}) }), [signature, setSignature] = useState(account?.signature || ''), [grants, setGrants] = useState(account?.agentGrants || []), [busy, setBusy] = useState(false), [error, setError] = useState(null), [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const agents = useQuery({ queryKey: [...baseKey, 'agents'], queryFn: () => emailApi.get('/agents') });
  if (!account) return null;
  const save = async () => { setBusy(true); setError(null); try { await emailApi.patch(`/accounts/${account._id}`, { signature, autoIntelligence, followUp: { enabled: followUp.enabled, ...(followUp.agentId ? { agentId: followUp.agentId } : {}), delayHours: Number(followUp.delayHours), subject: followUp.subject || 'Following up', template: followUp.template || '' }, agentGrants: grants.map(({ agentId, read, draft, send, requireApproval, instructions = '', template = '' }) => ({ agentId, read, draft, send, requireApproval, instructions, template })) }); await onDone(); toast.success('Account settings saved'); onClose(); } catch (e) { setError(e); } finally { setBusy(false); } };
  const disconnect = async () => { setBusy(true); try { await emailApi.disconnect(account._id); await onDone(); onClose(); toast.success('Account disconnected. Local history retained.'); } catch (e) { setError(e); } finally { setBusy(false); } };
  return <Modal title="Account settings" description={account.address} wide onClose={onClose}><div className={styles.settingsStatus}><span className={styles.liveDot} /> {account.status}{account.lastSyncAt && <span>Last sync {dateTime(account.lastSyncAt)}</span>}</div>{account.lastError && <ErrorState error={{ message: account.lastError }} />}<div className={styles.form}><label>Email signature<textarea rows={3} value={signature} onChange={e => setSignature(e.target.value)} placeholder="Your name, role and contact details" maxLength={10000} /></label></div><label className={styles.checkbox}><input type="checkbox" checked={autoIntelligence} onChange={e => setAutoIntelligence(e.target.checked)} /> Automatically summarize and categorize new inbox messages</label><div className={styles.sectionHeading}><Sparkles size={17} /><div><h3>Agent access</h3><p>Choose which agents can use this account. Approval is on by default.</p></div></div>
    {agents.error && <ErrorState error={agents.error} />}{agents.isPending && <p>Loading your agents…</p>}
    {(agents.data || []).map(agent => { const g = grants.find(g => g.agentId === agent._id); const update = patch => setGrants(old => old.map(x => x.agentId === agent._id ? { ...x, ...patch } : x)); return <div className={styles.grant} key={agent._id}><label className={styles.checkbox}><input type="checkbox" checked={Boolean(g)} onChange={e => setGrants(old => e.target.checked ? [...old, { agentId: agent._id, read: true, draft: true, send: false, requireApproval: true, instructions: '', template: '' }] : old.filter(x => x.agentId !== agent._id))} /><strong>{agent.name}</strong><span>{agent.availability}</span></label>{g && <><div className={styles.grantPermissions}>{[['read', 'Read conversations'], ['draft', 'Create drafts'], ['send', 'Allow sending'], ['requireApproval', 'Require human approval']].map(([key, label]) => <label className={styles.checkbox} key={key}><input type="checkbox" checked={g[key]} onChange={e => update({ [key]: e.target.checked })} />{label}</label>)}</div>{g.send && !g.requireApproval && <p className={styles.help}>This agent may send without asking you to review each message.</p>}<div className={styles.formGrid}><label>Agent instructions<textarea rows={2} maxLength={4000} value={g.instructions} onChange={e => update({ instructions: e.target.value })} /></label><label>Approved response template<textarea rows={2} maxLength={10000} value={g.template} onChange={e => update({ template: e.target.value })} /></label></div></>}</div>; })}
    <div className={styles.sectionHeading}><Clock3 size={17} /><div><h3>Automatic follow-up</h3><p>Send one follow-up to a linked lead when your original email receives no reply. Your agent approval settings still apply.</p></div></div><label className={styles.checkbox}><input type="checkbox" checked={followUp.enabled} onChange={e => setFollowUp(f => ({ ...f, enabled: e.target.checked }))} /> Enable follow-up for new sent emails</label>{followUp.enabled && <div className={styles.form}><label>Assigned agent<select value={followUp.agentId || ''} onChange={e => setFollowUp(f => ({ ...f, agentId: e.target.value }))}><option value="">Choose an agent with draft access</option>{(agents.data || []).filter(a => grants.some(g => g.agentId === a._id && g.draft)).map(a => <option value={a._id} key={a._id}>{a.name}</option>)}</select></label><label>Wait after sending (hours)<input type="number" min={1} max={720} value={followUp.delayHours} onChange={e => setFollowUp(f => ({ ...f, delayHours: e.target.value }))} /></label><label>Follow-up subject<input maxLength={998} value={followUp.subject} onChange={e => setFollowUp(f => ({ ...f, subject: e.target.value }))} /></label><label>Follow-up template<textarea rows={3} maxLength={10000} placeholder="Hi {{name}}, following up on {{subject}}…" value={followUp.template} onChange={e => setFollowUp(f => ({ ...f, template: e.target.value }))} /></label></div>}
    {agents.data?.length === 0 && <p className={styles.help}>Create a calling agent in AI Calling to grant it email access.</p>}{error && <ErrorState error={error} />}<div className={styles.modalActions}><Button disabled={busy} onClick={save}>{busy && <Loader2 size={15} className={styles.spin} />} Save settings</Button>{account.status !== 'disconnected' && <button className={styles.danger} onClick={() => setConfirmDisconnect(!confirmDisconnect)}>Disconnect account</button>}</div>{confirmDisconnect && <div className={styles.disconnectConfirm}><p>Disconnect {account.address}? Credentials will be removed and pending sends returned to drafts. Your email history stays available.</p><Button variant="destructive" disabled={busy} onClick={disconnect}>Disconnect {account.address}</Button></div>}</Modal>;
}
const escapeHtml = value => (value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
function Composer({ account, accounts, draft, message, mode, can, onClose, onDone }) {
  const forward = mode === 'forward', reply = mode === 'reply' || mode === 'replyAll';
  const [accountId, setAccountId] = useState(account._id), [to, setTo] = useState(draft?.to?.join(', ') || (reply ? replyRecipients(message, account.address, mode === 'replyAll') : ''));
  const [cc, setCc] = useState(draft?.cc?.join(', ') || ''), [bcc, setBcc] = useState(draft?.bcc?.join(', ') || ''), [showCc, setShowCc] = useState(Boolean(draft?.cc?.length || draft?.bcc?.length));
  const [subject, setSubject] = useState(draft?.subject || (message ? replySubject(message.subject, forward) : ''));
  const [files, setFiles] = useState(draft?.attachments?.map(f => typeof f === 'string' ? ({ _id: f, name: 'Saved attachment' }) : f) || (forward ? message?.attachments || [] : []));
  const [scheduledAt, setScheduledAt] = useState(draft?.scheduledAt ? new Date(new Date(draft.scheduledAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
  const [minSchedule] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)), [savedId, setSavedId] = useState(draft?._id || null), [requestId] = useState(draft?.idempotencyKey || crypto.randomUUID()), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(null), [savedAt, setSavedAt] = useState(null);
  const fileRef = useRef(null);
  const initial = draft?.html || (draft?.text ? `<p>${escapeHtml(draft.text)}</p>` : `<p></p>${account.signature ? `<p>${cleanHtml(account.signature).replace(/\n/g, '<br>')}</p>` : ''}${forward ? `<hr><p>Forwarded message from ${escapeHtml(message.from)}</p><blockquote>${escapeHtml(message.text)}</blockquote>` : ''}`);
  const editor = useEditor({ extensions: [StarterKit], content: initial, immediatelyRender: false, onUpdate: () => setDirty(true), editorProps: { attributes: { 'aria-label': 'Email message body', role: 'textbox', 'aria-multiline': 'true', class: styles.editor } } });
  useEffect(() => { editor?.setEditable(!busy); }, [editor, busy]);
  const update = fn => e => { fn(e.target.value); setDirty(true); };
  const close = () => { if (!dirty || window.confirm('Discard unsaved changes to this draft?')) onClose(); };
  const save = async (send = false) => {
    if (!editor || busy) return;
    setBusy(true); setError(null);
    try {
      const payload = { accountId, to: recipients(to), cc: recipients(cc), bcc: recipients(bcc), subject, html: editor.getHTML(), text: editor.getText(), attachments: files.map(f => f._id), idempotencyKey: requestId, ...(reply ? { replyToId: message._id } : {}), ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}) };
      const m = savedId ? await emailApi.put(`/drafts/${savedId}`, payload) : await emailApi.post('/drafts', payload);
      setSavedId(m._id); setDirty(false); setSavedAt(new Date());
      if (send) { await emailApi.post(`/messages/${m._id}/send`); toast.success(scheduledAt ? 'Email scheduled' : 'Email queued for sending'); await onDone(); onClose(); }
      else { await onDone(); toast.success('Draft saved'); }
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const upload = async e => {
    const selectedFiles = [...(e.target.files || [])]; if (!selectedFiles.length) return;
    if (selectedFiles.reduce((n, f) => n + f.size, files.reduce((n, f) => n + (f.size || 0), 0)) > 8 * 1024 * 1024 || files.length + selectedFiles.length > 10) { setError({ message: 'Choose up to 10 attachments totaling at most 8 MB.' }); return; }
    setBusy(true); setError(null);
    try { for (const f of selectedFiles) { const result = await emailApi.upload(accountId, f); setFiles(old => [...old, result]); setDirty(true); } } catch (err) { setError(err); } finally { setBusy(false); e.target.value = ''; }
  };
  const assist = async () => {
    if (!message && !savedId) { setError({ message: 'Save your draft before using writing assistance.' }); return; }
    setBusy(true); setError(null);
    try { const result = await emailApi.post(`/messages/${message?._id || savedId}/ai`, { action: reply ? 'reply' : 'rewrite', instructions: editor.getText().slice(0, 4000) }); editor.commands.setContent(`<p>${escapeHtml(result.text)}</p>`); setDirty(true); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return <Modal title={forward ? 'Forward message' : reply ? 'Your reply' : 'New message'} description={savedAt ? `Draft saved at ${savedAt.toLocaleTimeString()}` : 'A thoughtful message makes a difference.'} wide onClose={close}><div className={styles.composer} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && can('send')) { e.preventDefault(); save(true); } }}>
    <div className={styles.composerFields}><label>From<select aria-label="Sending account" disabled={Boolean(reply || savedId || files.length || busy)} value={accountId} onChange={update(setAccountId)}>{accounts.filter(a => a.status === 'connected').map(a => <option key={a._id} value={a._id}>{a.address}</option>)}</select></label><label>To<input aria-label="To recipients" autoFocus placeholder="name@company.com" value={to} onChange={update(setTo)} disabled={busy} /><button onClick={() => setShowCc(!showCc)} type="button">Cc / Bcc</button></label>{showCc && <><label>Cc<input aria-label="CC recipients" value={cc} onChange={update(setCc)} disabled={busy} /></label><label>Bcc<input aria-label="BCC recipients" value={bcc} onChange={update(setBcc)} disabled={busy} /></label></>}<label>Subject<input aria-label="Email subject" value={subject} maxLength={998} onChange={update(setSubject)} disabled={busy} /></label></div>
    <div className={styles.formatToolbar}><IconButton icon={Bold} label="Bold" onClick={() => editor?.chain().focus().toggleBold().run()} /><IconButton icon={Italic} label="Italic" onClick={() => editor?.chain().focus().toggleItalic().run()} /><IconButton icon={Underline} label="Underline" onClick={() => editor?.chain().focus().toggleUnderline().run()} /><IconButton icon={List} label="Bullet list" onClick={() => editor?.chain().focus().toggleBulletList().run()} /><IconButton icon={Link2} label="Insert link" onClick={() => { const href = window.prompt('Link URL (https://)'); if (href?.startsWith('https://')) editor?.chain().focus().extendMarkRange('link').setLink({ href }).run(); }} />{can('ai') && <button className={styles.aiCompose} disabled={busy} onClick={assist}><Sparkles size={14} /> {reply ? 'Suggest a reply' : 'Polish writing'}</button>}</div>
    <EditorContent editor={editor} />
    {files.length > 0 && <div className={styles.composerFiles}>{files.map(f => <span key={f._id}><Paperclip size={13} />{f.name}<button aria-label={`Remove ${f.name}`} disabled={busy} onClick={() => { setFiles(old => old.filter(x => x._id !== f._id)); setDirty(true); }}><X size={13} /></button></span>)}</div>}
    {error && <ErrorState error={error} />}<div className={styles.scheduleField}><Clock3 size={15} /><label>Send later<input aria-label="Scheduled sending time" type="datetime-local" value={scheduledAt} onChange={update(setScheduledAt)} min={minSchedule} disabled={busy} /></label>{scheduledAt && <button onClick={() => { setScheduledAt(''); setDirty(true); }}>Clear</button>}</div>
    <div className={styles.composerFooter}><Button onClick={() => save(true)} disabled={busy || !editor || !can('send') || (!to.trim() && !cc.trim() && !bcc.trim())}>{busy ? <Loader2 size={15} className={styles.spin} /> : <Send size={15} />}{scheduledAt ? 'Schedule email' : 'Send email'}</Button><Button variant="outline" disabled={busy || !editor} onClick={() => save(false)}>Save draft</Button><input ref={fileRef} type="file" multiple hidden onChange={upload} /><IconButton icon={Paperclip} label="Attach files" disabled={busy} onClick={() => fileRef.current?.click()} /><span>{dirty ? 'Unsaved changes' : savedAt || savedId ? 'Saved to drafts' : '⌘ / Ctrl + Enter to send'}</span></div>
  </div></Modal>;
}
function CrmLink({ messageId, baseKey, onClose, onDone }) {
  const [kind, setKind] = useState('lead'), [term, setTerm] = useState(''), [selected, setSelected] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(null), [search, setSearch] = useState('');
  useEffect(() => { const timer = setTimeout(() => setSearch(term), 300); return () => clearTimeout(timer); }, [term]);
  const results = useQuery({ queryKey: [...baseKey, 'crm-search', kind, search], queryFn: async () => { const r = await api.get(kind === 'lead' ? '/crm/leads' : '/crm/customers', { params: { search, limit: 20 } }); return Array.isArray(r.data) ? r.data : r.data?.items || r.data?.leads || r.data?.customers || []; }, enabled: search.length >= 2 });
  const save = async () => { setBusy(true); setError(null); try { await emailApi.post(`/messages/${messageId}/link`, { [kind === 'lead' ? 'leadId' : 'contactId']: selected }); await onDone(); toast.success('Conversation added to customer history'); onClose(); } catch (e) { setError(e); } finally { setBusy(false); } };
  return <Modal title="Keep the customer story together" description="Linking copies this conversation into the CRM history visible to users with access to that record." onClose={onClose}><div className={styles.form}><label>Record type<select value={kind} onChange={e => { setKind(e.target.value); setSelected(''); }}><option value="lead">Lead</option><option value="customer">Customer</option></select></label><label>Find a record<input value={term} placeholder="Search by name or email" onChange={e => setTerm(e.target.value)} /></label><div className={styles.crmResults}>{results.isFetching && <p>Searching…</p>}{results.data?.map(r => <label key={r._id} className={styles.checkbox}><input type="radio" name="crm-record" checked={selected === r._id} onChange={() => setSelected(r._id)} /><strong>{r.name}</strong><span>{r.email}</span></label>)}{search.length >= 2 && results.data?.length === 0 && <p>No matching records.</p>}</div>{results.error && <ErrorState error={results.error} />}{error && <ErrorState error={error} />}<Button disabled={!selected || busy} onClick={save}><Link2 size={15} /> Link conversation</Button></div></Modal>;
}
