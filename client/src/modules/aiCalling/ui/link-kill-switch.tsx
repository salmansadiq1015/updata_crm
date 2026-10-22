'use client';

import { useState, type ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageSquareText, Pause, Play } from 'lucide-react';
import { showError, showSuccess } from '@/lib/toast';
import { ConfirmDialog as ConfirmDialogRaw } from '@/shared/components/confirm-dialog';
import { linkAssistantApi } from '../services/link-assistant-api';

// ConfirmDialog is an untyped .jsx; loosen its prop types for this .tsx module.
const ConfirmDialog = ConfirmDialogRaw as (props: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string;
  confirmText?: string; cancelText?: string; variant?: string; isLoading?: boolean; onConfirm: () => void;
}) => ReactElement;

/**
 * SMS link assistant status + the global kill switch: pausing stops every new link and
 * every AI reply immediately (open pages show a polite notice). Needs ai-calling:admin.
 */
export function LinkKillSwitch() {
  const qc = useQueryClient();
  const [confirmPause, setConfirmPause] = useState(false);
  const settings = useQuery({ queryKey: ['link-assistant', 'settings'], queryFn: () => linkAssistantApi.settings(), retry: false });
  const toggle = useMutation({
    mutationFn: (paused: boolean) => linkAssistantApi.setPaused(paused, paused ? 'Paused from the CRM' : ''),
    onSuccess: (data) => {
      setConfirmPause(false);
      qc.setQueryData(['link-assistant', 'settings'], data);
      showSuccess(data.paused ? 'SMS link assistant paused' : 'SMS link assistant resumed');
    },
    onError: () => showError('Only administrators can change this'),
  });
  const s = settings.data;
  if (!s) return null;
  const paused = s.paused;
  return (
    <div
      role="region"
      aria-label="SMS link assistant status"
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-2.5 text-sm ${paused ? 'border-rose-500/30 bg-rose-500/5' : 'border-border bg-card'}`}
    >
      <span className="flex items-center gap-2">
        <MessageSquareText className="h-4 w-4 text-brand-500" aria-hidden="true" />
        <span className="font-medium">SMS link assistant</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${paused ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${paused ? 'bg-rose-500' : 'bg-emerald-500'}`} aria-hidden="true" />
          {paused ? 'Paused' : 'Active'}
        </span>
      </span>
      <span className="min-w-0 basis-full text-xs text-muted-foreground sm:basis-auto sm:flex-1">
        {s.aiConfigured ? <>AI model <span className="font-medium text-foreground">{s.model}</span></> : 'AI model not configured: replies use fixed texts'}
        <span aria-hidden="true"> · </span>
        <span className="break-all">links {s.baseUrl}/c/…</span>
        {paused && s.changedAt ? <> · paused {new Date(s.changedAt).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</> : null}
      </span>
      {s.pausedByEnv ? (
        <span className="text-xs text-muted-foreground">Paused by server setting</span>
      ) : (
        <button
          type="button"
          onClick={() => (paused ? toggle.mutate(false) : setConfirmPause(true))}
          disabled={toggle.isPending}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:opacity-60 ${paused ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-rose-500/40 text-rose-600 hover:bg-rose-500/10'}`}
        >
          {toggle.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          {paused ? 'Resume' : 'Pause all'}
        </button>
      )}
      <ConfirmDialog
        open={confirmPause}
        onOpenChange={setConfirmPause}
        title="Pause the SMS link assistant?"
        description="No new links can be sent and every open chat stops replying until you resume. Customers see a polite “paused” notice. Answers already given are kept."
        confirmText="Pause all"
        cancelText="Keep running"
        isLoading={toggle.isPending}
        onConfirm={() => toggle.mutate(true)}
      />
    </div>
  );
}
