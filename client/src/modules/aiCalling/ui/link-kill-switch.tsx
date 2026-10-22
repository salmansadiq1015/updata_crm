'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareText, Pause, Play } from 'lucide-react';
import { showError, showSuccess } from '@/lib/toast';
import { linkAssistantApi } from '../services/link-assistant-api';

/**
 * SMS link assistant status + the global kill switch: pausing stops every new link and
 * every AI reply immediately (open pages show a polite notice). Needs ai-calling:admin.
 */
export function LinkKillSwitch() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['link-assistant', 'settings'], queryFn: () => linkAssistantApi.settings(), retry: false });
  const toggle = useMutation({
    mutationFn: (paused: boolean) => linkAssistantApi.setPaused(paused, paused ? 'Paused from the CRM' : ''),
    onSuccess: (data) => {
      qc.setQueryData(['link-assistant', 'settings'], data);
      showSuccess(data.paused ? 'SMS link assistant paused' : 'SMS link assistant resumed');
    },
    onError: () => showError('Only administrators can change this'),
  });
  const s = settings.data;
  if (!s) return null;
  const paused = s.paused;
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${paused ? 'border-rose-500/30 bg-rose-500/5' : 'border-border bg-card'}`}>
      <MessageSquareText className="h-4 w-4 text-brand-500" />
      <span className="font-medium">SMS link assistant</span>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${paused ? 'bg-rose-500/10 text-rose-600' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
        {paused ? 'Paused' : 'Active'}
      </span>
      <span className="text-xs text-muted-foreground">
        {s.aiConfigured ? `AI model: ${s.model}` : 'AI model not configured: replies use fixed texts'} · links: {s.baseUrl}/c/…
      </span>
      {s.pausedByEnv ? (
        <span className="ml-auto text-xs text-muted-foreground">Paused by server setting</span>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (!paused && !window.confirm('Pause every SMS link and AI chat now?')) return;
            toggle.mutate(!paused);
          }}
          disabled={toggle.isPending}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${paused ? 'bg-brand-500 text-white hover:bg-brand-600' : 'border border-rose-500/40 text-rose-600 hover:bg-rose-500/10'}`}
        >
          {paused ? <><Play className="h-3.5 w-3.5" /> Resume</> : <><Pause className="h-3.5 w-3.5" /> Pause all (kill switch)</>}
        </button>
      )}
    </div>
  );
}
