'use client';

import { X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useAiAssistant } from '../../hooks/use-ai-assistant';
import { useAiSocketEvents } from '../../hooks/use-ai-socket-events';
import { PANEL_VIEWS, RECORDING_STATES } from '../../constants/ai-constants';
import { AiPanelIdle } from './ai-panel-idle';
import { AiPanelRecording } from './ai-panel-recording';
import { AiPanelProcessing } from './ai-panel-processing';
import { AiPanelEntities } from './ai-panel-entities';
import { AiPanelAgent } from './ai-panel-agent';
import { AiPanelResult } from './ai-panel-result';
import { AiAgentConfirm } from '../confirmation/ai-agent-confirm';

export function AiAssistantPanel() {
  // Register socket listeners
  useAiSocketEvents();

  const {
    isPanelOpen, panelView, closePanel, resetToIdle,
    session,
    createSession, stopRecording, submitCorrections, confirmSession, cancelSession, isConfirmingSession, isCancellingSession,
    recorder,
    agentRun, workflowLabel, dispatch, isDispatching, confirmRun, isConfirmingRun,
    isCreating,
  } = useAiAssistant();

  const handleConfirmEntities = async (corrections = []) => {
    const entityCorrections = corrections
      .filter((correction) => correction.entityId && correction.correctedValue)
      .map((correction) => ({
        entityId: correction.entityId,
        correctedValue: correction.correctedValue,
      }));

    if (entityCorrections.length > 0) {
      await submitCorrections({ entityCorrections });
    }
    await confirmSession();
  };

  return (
    <Sheet open={isPanelOpen} onOpenChange={(open) => !open && closePanel()}>
      <SheetContent
        side="right"
        className="w-full sm:w-[380px] lg:w-[420px] flex flex-col p-0 gap-0"
      >
        <SheetHeader className="flex flex-row items-center justify-between px-4 py-3 border-b shrink-0">
          <SheetTitle className="text-sm">MB Boiler</SheetTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1" onClick={closePanel}>
            <X className="h-4 w-4" />
          </Button>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-2">
          {panelView === PANEL_VIEWS.IDLE && (
            <AiPanelIdle
              onStartRecording={createSession}
              onTextSubmit={dispatch}
              isSupported={recorder.isSupported}
              isCreating={isCreating || isDispatching}
            />
          )}

          {panelView === PANEL_VIEWS.RECORDING && (
            <AiPanelRecording
              recorder={recorder}
              onStop={stopRecording}
            />
          )}

          {(panelView === PANEL_VIEWS.UPLOADING || panelView === PANEL_VIEWS.PROCESSING) && (
            <AiPanelProcessing
              uploadProgress={recorder.uploadProgress}
              onCancel={cancelSession}
              isCancelling={isCancellingSession}
            />
          )}

          {panelView === PANEL_VIEWS.ENTITIES && (
            <AiPanelEntities
              session={session}
              onConfirm={handleConfirmEntities}
              onCancel={cancelSession}
              isConfirming={isConfirmingSession}
            />
          )}

          {panelView === PANEL_VIEWS.AGENT && (
            <AiPanelAgent
              agentRun={agentRun}
              workflowLabel={workflowLabel}
            />
          )}

          {panelView === PANEL_VIEWS.AGENT_CONFIRMATION && (
            <AiAgentConfirm
              agentRun={agentRun}
              onConfirm={() => confirmRun(true)}
              onCancel={() => confirmRun(false)}
              isConfirming={isConfirmingRun}
            />
          )}

          {panelView === PANEL_VIEWS.RESULT && (
            <AiPanelResult
              agentRun={agentRun}
              onStartOver={resetToIdle}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
