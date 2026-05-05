'use client';

import { useState, useCallback, useRef } from 'react';
import { toMarkdown, toPlainText } from '../utils/copy-formatter';

const RESET_DELAY_MS = 2000;

export function useMessageCopy() {
  const [copyState, setCopyState] = useState({ copied: false, messageId: null });
  const timerRef = useRef(null);

  const copy = useCallback(async (content, format = 'markdown', messageId = null) => {
    if (!navigator?.clipboard) return;
    const text = format === 'plain' ? toPlainText(content) : toMarkdown(content);
    try {
      await navigator.clipboard.writeText(text);
      if (timerRef.current) clearTimeout(timerRef.current);
      setCopyState({ copied: true, messageId });
      timerRef.current = setTimeout(
        () => setCopyState({ copied: false, messageId: null }),
        RESET_DELAY_MS
      );
    } catch {
      // clipboard denied — ignore silently
    }
  }, []);

  return { copy, copyState };
}
