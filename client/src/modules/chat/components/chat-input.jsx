'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Paperclip, Smile, Mic, ArrowUp, X, Lock, FileText, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { chatService } from '../services/chat-service';
import { useChatTyping } from '../hooks/use-chat-typing';
import { ChatReplyPreview } from './chat-reply-preview';
import { ChatAudioRecorder } from './chat-audio-recorder';
import { ChatEmojiPicker } from './chat-emoji-picker';

export function ChatInput({ onSend, isLoading, roomId, replyTarget, onClearReply, isBlocked, editTarget, onClearEdit }) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState(null); // { url, fileId, messageType, name }
  const [uploading, setUploading] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const { onKeystroke } = useChatTyping(roomId);

  // Pre-fill text when editing
  const prevEditId = useRef(null);
  if (editTarget && editTarget._id !== prevEditId.current) {
    prevEditId.current = editTarget._id;
    setText(editTarget.content || '');
  }
  if (!editTarget && prevEditId.current) {
    prevEditId.current = null;
  }

  const canSend = (text.trim().length > 0 || attachment) && !isLoading && !uploading;

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    const payload = editTarget
      ? { content: text.trim(), messageType: 'TEXT' }
      : {
          messageType: attachment?.messageType || 'TEXT',
          content: text.trim() || (attachment ? '' : ''),
          attachmentUrl: attachment?.url,
          attachmentFileId: attachment?.fileId,
          replyToId: replyTarget?._id,
        };
    setText('');
    setAttachment(null);
    textareaRef.current?.focus();
    await onSend(payload);
  }, [canSend, text, attachment, replyTarget, editTarget, onSend]);

  const handleKeyDown = useCallback(e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    onKeystroke();
  }, [handleSend, onKeystroke]);

  const handleFileChange = useCallback(async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await chatService.uploadFile(formData);
      const url = res.attachmentUrl || res.url;
      const fileId = res._id || res.attachmentFileId;
      const type = file.type.startsWith('image/') ? 'PHOTO'
        : file.type.startsWith('video/') ? 'VIDEO'
        : file.type.startsWith('audio/') ? 'AUDIO'
        : 'DOCUMENT';
      setAttachment({ url, fileId, messageType: type, name: file.name });
    } catch {
      // silent fail
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }, []);

  const handleAudioComplete = useCallback(result => {
    setShowRecorder(false);
    const payload = {
      messageType: 'AUDIO',
      content: '',
      attachmentUrl: result.attachmentUrl,
      attachmentFileId: result.attachmentFileId,
      replyToId: replyTarget?._id,
    };
    onSend(payload);
  }, [replyTarget, onSend]);

  if (isBlocked) {
    return (
      <div className="border-t border-border/40 bg-card px-4 py-3 flex items-center justify-center gap-2 text-muted-foreground">
        <Lock className="h-4 w-4" />
        <span className="text-sm">You cannot send messages</span>
      </div>
    );
  }

  return (
    <div className="border-t border-border/40 bg-card">
      {/* Edit indicator */}
      {editTarget && (
        <div className="flex items-center justify-between px-4 pt-2 pb-1 text-xs text-primary">
          <span className="font-medium">Editing message</span>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { onClearEdit?.(); setText(''); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Reply preview */}
      {!editTarget && replyTarget && (
        <div className="px-3 pt-2">
          <ChatReplyPreview message={replyTarget} onClear={onClearReply} />
        </div>
      )}

      {/* Attachment preview */}
      {attachment && (
        <div className="flex items-center gap-2 px-4 pt-2 pb-1">
          <div className="flex items-center gap-1.5 bg-muted rounded-lg px-2.5 py-1.5 text-xs max-w-50">
            {attachment.messageType === 'PHOTO' ? <ImageIcon className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{attachment.name}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAttachment(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Audio recorder mode */}
      {showRecorder ? (
        <div className="px-3 py-2">
          <ChatAudioRecorder
            onComplete={handleAudioComplete}
            onCancel={() => setShowRecorder(false)}
          />
        </div>
      ) : (
        <div className="flex items-end gap-2 px-3 py-2">
          {/* Attach */}
          <Button
            variant="ghost" size="icon"
            className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Paperclip className="h-4.5 w-4.5" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={handleFileChange}
          />

          {/* Textarea */}
          <div className="relative flex-1">
            <Textarea
              ref={textareaRef}
              value={text}
              onChange={e => { setText(e.target.value); onKeystroke(); }}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              rows={1}
              className={cn(
                'min-h-10 max-h-32 resize-none rounded-2xl border-0 bg-muted/60 py-2.5 pr-9 pl-3',
                'text-sm leading-relaxed focus-visible:ring-1 focus-visible:ring-primary/50',
                'scrollbar-thin'
              )}
            />
            {/* Emoji button inside textarea */}
            <Button
              variant="ghost" size="icon"
              className="absolute right-1.5 bottom-1 h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => setShowPicker(v => !v)}
            >
              <Smile className="h-4 w-4" />
            </Button>
          </div>

          {/* Send / Mic */}
          {canSend ? (
            <Button
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full bg-[#00a884] hover:bg-[#00a884]/90 text-white"
              onClick={handleSend}
              disabled={isLoading}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost" size="icon"
              className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => setShowRecorder(true)}
            >
              <Mic className="h-4.5 w-4.5" />
            </Button>
          )}
        </div>
      )}

      {/* Emoji picker */}
      {showPicker && (
        <div className="px-3 pb-2">
          <ChatEmojiPicker
            onSelect={emoji => { setText(t => t + emoji); setShowPicker(false); textareaRef.current?.focus(); }}
            onClose={() => setShowPicker(false)}
          />
        </div>
      )}
    </div>
  );
}
