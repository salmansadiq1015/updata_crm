'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/lib/i18n/language-context';
import { AiEntityList, useEntitiesReady } from '../entity/ai-entity-list';
import { CheckCircle2, ClipboardCheck, FileText, Sparkles } from 'lucide-react';
import { MIN_AGENT_INPUT_LENGTH } from '../../constants/ai-constants';
import { getSessionTranscript } from '../../utils/voice-session-transcript';

export function AiPanelEntities({ session, onConfirm, onCancel, isConfirming }) {
  const transcript = getSessionTranscript(session);
  const sessionKey = session?._id || session?.id || transcript.text || 'voice-session-review';

  return (
    <AiPanelEntitiesForm
      key={sessionKey}
      session={session}
      transcript={transcript}
      onConfirm={onConfirm}
      onCancel={onCancel}
      isConfirming={isConfirming}
    />
  );
}

function AiPanelEntitiesForm({ session, transcript, onConfirm, onCancel, isConfirming }) {
  const { t } = useLanguage();
  const [corrections, setCorrections] = useState([]);
  const [transcriptText, setTranscriptText] = useState(transcript.text);
  const entities   = session?.entities ?? [];
  const isReady    = useEntitiesReady(entities, corrections);
  const hasTranscript = transcriptText.trim().length >= MIN_AGENT_INPUT_LENGTH;

  return (
    <div className="flex min-h-full flex-col gap-4 px-5 py-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-400/10 text-brand-200 ring-1 ring-brand-200/20">
            <ClipboardCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">{t('ai.chat.extracted')}</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {t('ai.panel.reviewExtracted', 'Review extracted details before the assistant continues.')}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-brand-300/15 bg-brand-400/[0.05] p-4">
        <label
          htmlFor="ai-transcript-review"
          className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-brand-100"
        >
          <FileText className="h-4 w-4" />
          {t('ai.panel.voiceTranscript', 'Voice transcript')}
        </label>
        <Textarea
          id="ai-transcript-review"
          data-testid="ai-transcript-review"
          value={transcriptText}
          onChange={(event) => setTranscriptText(event.target.value)}
          placeholder={t('ai.panel.transcriptPlaceholder', 'Review or correct the transcript before confirming...')}
          className="min-h-28 resize-none border-white/10 bg-slate-950/50 text-sm leading-6 text-white shadow-none placeholder:text-slate-500 focus-visible:bg-slate-950/70"
          maxLength={10000}
        />
        {!hasTranscript && (
          <p className="mt-2 text-xs leading-5 text-amber-200">
            {t('ai.panel.transcriptRequired', 'A transcript is required before the assistant can continue.')}
          </p>
        )}
        {transcript.confidence !== null && transcript.confidence < 0.6 && (
          <p className="mt-2 text-xs leading-5 text-amber-200">
            {t('ai.voice.lowConfidence', 'Low confidence transcript. Please review before confirming.')}
          </p>
        )}
      </div>

      {entities.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
          <AiEntityList
            entities={entities}
            onCorrectionsChange={setCorrections}
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-slate-300">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-400">
            <Sparkles className="h-4 w-4 text-brand-300" />
            {t('ai.panel.noEntitiesTitle', 'No structured fields detected')}
          </div>
          {t('ai.panel.noEntitiesDescription', 'Confirm the transcript to continue with a general assistant action.')}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/10 hover:text-white"
          onClick={onCancel}
          disabled={isConfirming}
        >
          {t('common.cancel')}
        </Button>
        <Button
          size="sm"
          className="flex-1 bg-primary-gradient text-primary-foreground shadow-[0_12px_32px_rgba(14,165,233,0.18)]"
          onClick={() => onConfirm({ corrections, transcriptText, originalTranscript: transcript.text })}
          disabled={!hasTranscript || !isReady || isConfirming}
        >
          {!isConfirming && <CheckCircle2 className="mr-1.5 h-4 w-4" />}
          {isConfirming ? t('ai.confirm.submitting') : t('ai.confirm.confirmArrow')}
        </Button>
      </div>
    </div>
  );
}
