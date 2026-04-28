'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { SendHorizontal } from 'lucide-react';

export function FieldOpsChatInput({ onSend, isLoading }) {
  const { t } = useLanguage();
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend({ messageType: 'TEXT', content: trimmed, mentions: [] });
    setText('');
  };

  return (
    <div className="flex gap-2 p-4 border-t bg-background">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        placeholder={t('fieldOps.chat.sendPlaceholder', 'Write a message...')}
        className="flex-1"
        disabled={isLoading}
      />
      <Button size="icon" onClick={handleSend} disabled={!text.trim() || isLoading}>
        <SendHorizontal className="h-4 w-4" />
      </Button>
    </div>
  );
}
