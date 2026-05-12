'use client';

import { useState } from 'react';
import { Send, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AiMicButton } from '../recorder/ai-mic-button';
import { AiHelpOverlay } from '../ai-help-overlay';
import { useLanguage } from '@/lib/i18n/language-context';

export function AiPanelIdle({ onStartRecording, onTextSubmit, isSupported, isCreating }) {
  const { t } = useLanguage();
  const [text, setText]         = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim().length < 3) return;
    onTextSubmit(text.trim());
    setText('');
  };

  return (
    <div className="flex flex-col items-center gap-6 px-2 py-4">
      <p className="text-sm text-muted-foreground text-center">{t('ai.panel.prompt', 'Wie kann ich helfen?')}</p>

      {/* Microphone */}
      <div className="flex flex-col items-center gap-2">
        <AiMicButton
          isSupported={isSupported}
          onClick={onStartRecording}
          disabled={isCreating}
        />
        {!isSupported && (
          <p className="text-xs text-muted-foreground text-center max-w-48">
            {t('ai.panel.voiceUnsupported', 'Sprache wird in diesem Browser nicht unterstuetzt. Nutzen Sie die Texteingabe.')}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 w-full text-xs text-muted-foreground">
        <span className="flex-1 h-px bg-border" />
        {t('common.or', 'oder')}
        <span className="flex-1 h-px bg-border" />
      </div>

      {/* Text input */}
      <form onSubmit={handleSubmit} className="flex gap-2 w-full">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('ai.panel.commandPlaceholder', 'Befehl eingeben...')}
          className="flex-1 text-sm"
          maxLength={2000}
        />
        <Button type="submit" size="icon" disabled={text.trim().length < 3}>
          <Send className="h-4 w-4" />
        </Button>
      </form>

      {/* Help */}
      <button
        type="button"
        onClick={() => setShowHelp(true)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        {t('ai.panel.helpTrigger', 'Was kann ich sagen?')}
      </button>

      {showHelp && <AiHelpOverlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}
