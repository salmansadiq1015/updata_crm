'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, FolderSearch, Inbox, Loader2, Play, PlugZap, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError, showSuccess } from '@/lib/toast';
import { ingestionService } from '../services/ingestion-service';

const QUERY_KEY = ['documents', 'ingestion'];

/**
 * Where paperwork comes in from without anybody uploading it.
 *
 * The screen is built around one fact the office has to be able to see at a
 * glance: whether the last sweep worked. A mailbox that stopped answering on
 * Tuesday looks exactly like a quiet week, and the difference is a fortnight
 * of invoices nobody filed — so the outcome of the last run, and the count of
 * what could not be placed, sit above the configuration rather than below it.
 */

const OUTCOME_TONE = {
  filed: 'text-emerald-600 dark:text-emerald-400',
  unclassified: 'text-amber-600 dark:text-amber-400',
  no_project: 'text-amber-600 dark:text-amber-400',
  duplicate: 'text-muted-foreground',
  failed: 'text-destructive',
};

function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] leading-4 text-muted-foreground/80">{hint}</p> : null}
    </div>
  );
}

function SourceCard({ icon: Icon, title, description, source, fields, note, noteValue, onSave, onTest, onRun, busy, t }) {
  // Seeded from the server once, then owned by whoever is typing. Syncing it
  // back on every refetch looked tidier and was worse: react-query refetches
  // on window focus, so switching to the mail app to copy the password and
  // coming back would have wiped the half-filled form.
  const [draft, setDraft] = useState(source.config || {});
  const [enabled, setEnabled] = useState(Boolean(source.isEnabled));
  const [probe, setProbe] = useState(null);

  const set = (name) => (event) => setDraft((d) => ({ ...d, [name]: event.target.value }));

  return (
    <section className="rounded-xl border border-border bg-card/70 shadow-sm">
      <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            {enabled ? t('documents.ingestion.on', 'Aktiv') : t('documents.ingestion.off', 'Inaktiv')}
          </span>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={busy} />
        </div>
      </header>

      {source.lastErrorMessage ? (
        <div className="flex items-start gap-2 border-b border-border bg-destructive/5 px-4 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-xs leading-5 text-destructive">
            {t('documents.ingestion.lastError', 'Letzter Fehler')}: {source.lastErrorMessage}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
        {fields.map((field) => (
          <Field key={field.name} label={field.label} hint={field.hint}>
            <Input
              value={draft[field.name] ?? field.fallback ?? ''}
              onChange={set(field.name)}
              placeholder={field.placeholder}
              type={field.type || 'text'}
              disabled={busy}
            />
          </Field>
        ))}
      </div>

      {note ? (
        <div className="mx-4 mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <p className="text-xs leading-5 text-muted-foreground">
            {note}
          </p>
          {noteValue ? (
            <code className="mt-1 inline-block rounded bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              {noteValue}
            </code>
          ) : null}
        </div>
      ) : null}

      {probe ? (
        <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          {probe.ok
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
          <p className="text-xs leading-5 text-foreground">{probe.message}</p>
        </div>
      ) : null}

      <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        <Button size="sm" onClick={() => onSave({ isEnabled: enabled, config: draft })} disabled={busy}>
          {t('common.save', 'Speichern')}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={busy}
          onClick={async () => setProbe(await onTest(draft))}>
          <PlugZap className="h-3.5 w-3.5" />
          {t('documents.ingestion.test', 'Verbindung prüfen')}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={busy || !source.isEnabled}
          onClick={async () => setProbe(await onRun())}>
          <Play className="h-3.5 w-3.5" />
          {t('documents.ingestion.runNow', 'Jetzt abholen')}
        </Button>
        {!source.isEnabled ? (
          <span className="text-[11px] text-muted-foreground">
            {t('documents.ingestion.saveFirst', 'Zum Abholen muss die Quelle gespeichert und aktiv sein.')}
          </span>
        ) : null}
      </footer>
    </section>
  );
}

export function DocumentIngestionAdmin() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: QUERY_KEY, queryFn: () => ingestionService.overview() });

  const save = useMutation({
    mutationFn: ({ key, payload }) => ingestionService.save(key, payload),
    onSuccess: (res) => { queryClient.invalidateQueries({ queryKey: QUERY_KEY }); showSuccess(res?.message); },
    onError: showError,
  });

  const sources = useMemo(() => {
    const list = data?.sources || [];
    return {
      inbox: list.find((s) => s.key === 'document_inbox') || { isEnabled: false, config: {} },
      folder: list.find((s) => s.key === 'document_scan_folder') || { isEnabled: false, config: {} },
    };
  }, [data]);

  const probe = async (fn) => {
    setBusy(true);
    try {
      const res = await fn();
      return { ok: res?.data?.ok ?? true, message: res?.data?.message || res?.message };
    } catch (err) {
      return { ok: false, message: err?.response?.data?.error?.message || err.message };
    } finally { setBusy(false); }
  };

  if (isLoading) {
    return <div className="space-y-4">{[0, 1].map((i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}</div>;
  }

  const summary = data?.summary || {};
  const recent = data?.recent || [];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['filed', t('documents.ingestion.filed', 'Abgelegt'), 'text-emerald-600 dark:text-emerald-400'],
          ['unclassified', t('documents.ingestion.unclassified', 'Typ unklar'), 'text-amber-600 dark:text-amber-400'],
          ['no_project', t('documents.ingestion.noProject', 'Ohne Projekt'), 'text-amber-600 dark:text-amber-400'],
          ['failed', t('documents.ingestion.failed', 'Fehlgeschlagen'), 'text-destructive'],
        ].map(([key, label, tone]) => (
          <div key={key} className="rounded-xl border border-border bg-card/70 px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${summary[key] ? tone : 'text-foreground'}`}>
              {summary[key] ?? 0}
            </p>
          </div>
        ))}
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        {t('documents.ingestion.summaryScope', 'Letzte 24 Stunden.')}
      </p>

      <SourceCard
        icon={Inbox}
        title={t('documents.ingestion.inbox.title', 'Dokumenten-Postfach')}
        description={t('documents.ingestion.inbox.desc', 'Ein eigenes Postfach, an das Rechnungen und Bewilligungen weitergeleitet werden. Jede ungelesene Nachricht wird geöffnet, ihre Anhänge werden eingelesen und die Nachricht als gelesen markiert — deshalb nie ein persönliches Postfach angeben.')}
        source={sources.inbox}
        busy={busy || save.isPending}
        t={t}
        fields={[
          { name: 'host', label: 'IMAP-Server', placeholder: 'imap.hostpoint.ch' },
          { name: 'port', label: 'Port', placeholder: '993', type: 'number', fallback: 993 },
          { name: 'user', label: 'Benutzer', placeholder: 'dokumente@updata.ai' },
          { name: 'folder', label: 'Ordner', fallback: 'INBOX' },
          { name: 'maxPerRun', label: 'Nachrichten pro Durchlauf', type: 'number', fallback: 20 },
        ]}
        note={data?.passwordHint}
        noteValue={data?.passwordEnv}
        onSave={(payload) => save.mutate({ key: 'document_inbox', payload })}
        onTest={(config) => probe(() => ingestionService.test('document_inbox', config))}
        onRun={() => probe(() => ingestionService.runNow('document_inbox'))}
      />

      <SourceCard
        icon={FolderSearch}
        title={t('documents.ingestion.folder.title', 'Scan-Ordner')}
        description={t('documents.ingestion.folder.desc', 'Der Ordner, in den der Kopierer scannt. Dateien werden nur gelesen, nie verschoben oder gelöscht. Ein Scan mit einer Projekt- oder Auftragsnummer im Namen ordnet sich selbst zu.')}
        source={sources.folder}
        busy={busy || save.isPending}
        t={t}
        fields={[
          {
            name: 'folder',
            label: 'Pfad auf dem Server',
            placeholder: '/srv/scans',
            hint: t('documents.ingestion.folder.hint', 'Der Pfad muss für den Server erreichbar sein — bei einem Netzlaufwerk muss es eingebunden sein.'),
          },
          { name: 'maxPerRun', label: 'Dateien pro Durchlauf', type: 'number', fallback: 30 },
        ]}
        onSave={(payload) => save.mutate({ key: 'document_scan_folder', payload })}
        onTest={(config) => probe(() => ingestionService.test('document_scan_folder', config))}
        onRun={() => probe(() => ingestionService.runNow('document_scan_folder'))}
      />

      <section className="rounded-xl border border-border bg-card/70 shadow-sm">
        <header className="border-b border-border px-4 py-3">
          <p className="text-sm font-medium text-foreground">
            {t('documents.ingestion.recent', 'Zuletzt eingelesen')}
          </p>
        </header>
        {recent.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {t('documents.ingestion.empty', 'Noch nichts eingelesen. Sobald eine Quelle aktiv ist, erscheint hier jeder Eingang — auch die, die nicht zugeordnet werden konnten.')}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((row) => (
              <li key={row._id} className="flex items-start gap-3 px-4 py-2.5">
                <span className={`mt-0.5 shrink-0 text-xs font-medium ${OUTCOME_TONE[row.outcome] || ''}`}>
                  {t(`documents.ingestion.outcome.${row.outcome}`, row.outcome)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{row.fileName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.projectId?.projectNumber ? `${row.projectId.projectNumber} · ` : ''}{row.message}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  {new Date(row.createdAt).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {busy ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('documents.ingestion.working', 'Läuft …')}
        </p>
      ) : null}
    </div>
  );
}
