'use client';

import { useState, useRef, useEffect } from 'react';
import { Copy, Check, Volume2, VolumeX, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AiChatMessageActions({
  content,
  messageId,
  onCopy,
  copyState,
  onPlay,
  onPause,
  onStop,
  ttsActive = false,
  showTts = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const isCopied = copyState.copied && copyState.messageId === messageId;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <div className="flex items-center gap-0.5">
      {/* Copy */}
      <div className="relative" ref={menuRef}>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => onCopy(content, 'markdown', messageId)}
          onContextMenu={(e) => { e.preventDefault(); setMenuOpen((s) => !s); }}
          title={isCopied ? 'Copied!' : 'Copy'}
        >
          {isCopied
            ? <Check className="h-3 w-3 text-green-500" />
            : <Copy className="h-3 w-3 text-muted-foreground" />}
        </Button>

        {menuOpen && (
          <div className="absolute bottom-full right-0 mb-1 z-50 min-w-36 rounded-md border bg-popover shadow-md py-1">
            <button
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors"
              onClick={() => { onCopy(content, 'markdown', messageId); setMenuOpen(false); }}
            >
              Copy
            </button>
            <button
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors"
              onClick={() => { onCopy(content, 'plain', messageId); setMenuOpen(false); }}
            >
              Copy as plain text
            </button>
          </div>
        )}
      </div>

      {/* TTS controls (AI messages only) */}
      {showTts && (
        ttsActive ? (
          <>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onPause} title="Pause">
              <Pause className="h-3 w-3 text-muted-foreground" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onStop} title="Stop">
              <VolumeX className="h-3 w-3 text-muted-foreground" />
            </Button>
          </>
        ) : (
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onPlay} title="Play">
            <Volume2 className="h-3 w-3 text-muted-foreground" />
          </Button>
        )
      )}
    </div>
  );
}
