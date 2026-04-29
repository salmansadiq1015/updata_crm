'use client';

import { useState, useRef, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { useFieldOpsChatTyping } from '@/modules/field-ops/hooks/use-field-ops-chat-typing';
import { useLanguage } from '@/lib/i18n/language-context';

export function FieldOpsChatInput({ onSend, isLoading, projectId }) {
  const [value, setValue] = useState('');
  const { onKeystroke } = useFieldOpsChatTyping(projectId);
  const { t } = useLanguage();
  const textareaRef = useRef(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend({ messageType: 'TEXT', content: trimmed, mentions: [] });
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, isLoading, onSend]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
        return;
      }
      onKeystroke();
    },
    [handleSend, onKeystroke]
  );

  const handleChange = useCallback((e) => {
    setValue(e.target.value);
    // Auto-grow
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  return (
    <div className="flex items-end gap-2 p-3 border-t shrink-0">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={t('fieldOps.chat.messagePlaceholder', 'Type a message…')}
        rows={1}
        className="resize-none max-h-24 overflow-y-auto flex-1"
        disabled={isLoading}
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={!value.trim() || isLoading}
        className="shrink-0"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
