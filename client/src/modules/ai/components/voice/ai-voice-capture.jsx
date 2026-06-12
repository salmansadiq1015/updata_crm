'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { showError, showSuccess } from '@/lib/toast';
import { useContextVoiceSession } from '../../hooks/use-context-voice-session';
import { aiAdminService } from '../../services/ai-admin-service';
import { DocumentPreviewDrawer } from '@/modules/doctpl/components/DocumentPreviewDrawer';
import { AiEntityList } from '../entity/ai-entity-list';
import { AiVoiceTranscriptPreview } from './ai-voice-transcript-preview';
import { SESSION_STATUSES, SESSION_TYPES, normalizeSessionStatus } from '../../constants/ai-constants';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

export function AiVoiceCapture({
  sessionType,
  contextModule,
  contextRecordType,
  contextRecordId,
  className,
  onComplete,
  compact = false,
}) {
  const { t } = useLanguage();
  const [corrections, setCorrections] = useState([]);
  const [isGeneratingDocument, setIsGeneratingDocument] = useState(false);
  const [documentPreview, setDocumentPreview] = useState(null);
  const [isPreviewingDocument, setIsPreviewingDocument] = useState(false);
  const lastCompletedSessionIdRef = useRef(null);
  const voice = useContextVoiceSession({
    sessionType,
    contextModule,
    contextRecordType,
    contextRecordId,
    onComplete,
  });

  const voiceSession = voice.session;
  const handleSessionComplete = voice.handleSessionComplete;
  const status = normalizeSessionStatus(voiceSession?.status);
  const entities = voiceSession?.entities || [];
  const showReview = status === SESSION_STATUSES.AWAITING_CONFIRMATION;

  useEffect(() => {
    const sessionId = voiceSession?._id || voiceSession?.id || null;
    if (status !== SESSION_STATUSES.COMPLETED) return;
    if (!sessionId || lastCompletedSessionIdRef.current === sessionId) return;
    lastCompletedSessionIdRef.current = sessionId;
    handleSessionComplete(voiceSession);
  }, [status, voiceSession, handleSessionComplete]);

  useEffect(() => {
    setDocumentPreview(null);
    setIsGeneratingDocument(false);
    setIsPreviewingDocument(false);
  }, [voiceSession?._id]);

  const handleCorrectionsSubmit = async () => {
    const entityCorrections = corrections
      .filter((correction) => correction.entityId && correction.correctedValue)
      .map((correction) => ({
        entityId: correction.entityId,
        correctedValue: correction.correctedValue,
      }));

    if (entityCorrections.length > 0) {
      await voice.submitCorrections({ entityCorrections });
    }
    await voice.confirmSession();
  };

  const handleGenerateDocument = async () => {
    const sessionId = voice.session?._id || voice.session?.id;
    if (!sessionId || !documentPreview) return;
    setIsGeneratingDocument(true);
    try {
      await aiAdminService.generateDocument({ sessionId });
      showSuccess(t('ai.document.generated'));
    } catch (err) {
      showError(err);
    } finally {
      setIsGeneratingDocument(false);
    }
  };

  const handlePreviewDocument = async () => {
    const sessionId = voice.session?._id || voice.session?.id;
    if (!sessionId) return;
    setIsPreviewingDocument(true);
    try {
      const preview = await aiAdminService.previewDocument({ sessionId });
      setDocumentPreview(preview?.data || preview);
    } catch (err) {
      showError(err);
    } finally {
      setIsPreviewingDocument(false);
    }
  };

  if (compact && !voice.isRecording && !showReview) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn('gap-2', className)}
        onClick={voice.startRecording}
      >
        <Mic className="h-4 w-4" />
        {t('ai.voice.dictate')}
      </Button>
    );
  }

  return (
    <div className={cn('rounded-lg border border-border p-3 space-y-3', className)}>
      {voice.isRecording && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-destructive animate-pulse flex items-center gap-2">
            <Mic className="h-4 w-4" /> {t('ai.voice.recording')}
          </span>
          <Button type="button" size="sm" variant="destructive" onClick={voice.stopAndProcess}>
            <Square className="h-3.5 w-3.5 mr-1" /> {t('ai.voice.stop')}
          </Button>
        </div>
      )}

      {!voice.isRecording && !showReview && status !== SESSION_STATUSES.PROCESSING && (
        <Button type="button" className="w-full gap-2" onClick={voice.startRecording}>
          <Mic className="h-4 w-4" />
          {t('ai.voice.startDictation')}
        </Button>
      )}

      {status === SESSION_STATUSES.PROCESSING && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('ai.voice.processing')}
        </div>
      )}

      {showReview && (
        <>
          <AiVoiceTranscriptPreview
            transcript={{
              text: voice.session?.correctedTranscript || voice.session?.rawTranscript,
              confidence: voice.session?.transcriptConfidence,
            }}
          />
          {voice.session?.audioFileUrl && (
            <audio className="w-full" controls src={voice.session.audioFileUrl} />
          )}
          {entities.length > 0 && (
            <AiEntityList entities={entities} onCorrectionsChange={setCorrections} />
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="flex-1 gap-1" onClick={handleCorrectionsSubmit}>
              <Check className="h-4 w-4" /> {t('ai.voice.confirm')}
            </Button>
            {sessionType === SESSION_TYPES.REPORT_DICTATION && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1"
                  onClick={handlePreviewDocument}
                  disabled={isPreviewingDocument || isGeneratingDocument}
                >
                  {isPreviewingDocument ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t('ai.document.preview')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1"
                  onClick={handleGenerateDocument}
                  disabled={isGeneratingDocument || !documentPreview}
                >
                  {isGeneratingDocument ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t('ai.document.generate')}
                </Button>
              </>
            )}
            <Button type="button" variant="outline" onClick={voice.cancelSession} title={t('common.cancel')}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
      <DocumentPreviewDrawer
        open={!!documentPreview}
        url={documentPreview?.downloadUrl || documentPreview?.url}
        fileName={documentPreview?.fileName}
        onClose={() => setDocumentPreview(null)}
      />
    </div>
  );
}
