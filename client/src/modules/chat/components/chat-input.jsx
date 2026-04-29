'use client';

import { useState, useRef, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Paperclip, Mic, Send, X, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { useChatTyping } from '../hooks/use-chat-typing';
import { chatService } from '../services/chat-service';
import { ChatReplyPreview } from './chat-reply-preview';
import { ChatAudioRecorder } from './chat-audio-recorder';

function detectMessageType(file) {
  if (file.type.startsWith('image/')) return 'PHOTO';
  if (file.type.startsWith('video/')) return 'VIDEO';
  if (file.type.startsWith('audio/')) return 'AUDIO';
  return 'DOCUMENT';
}

export function ChatInput({ onSend, isLoading, roomId, replyTarget, onClearReply, isBlocked }) {
  const [value, setValue] = useState('');
  const [attachment, setAttachment] = useState(null); // { attachmentUrl, attachmentFileId, messageType, name }
  const [uploading, setUploading] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const { onKeystroke } = useChatTyping(roomId);
  const { t } = useLanguage();

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if ((!trimmed && !attachment) || isLoading) return;
    onSend({
      messageType: attachment?.messageType || 'TEXT',
      content: trimmed || attachment?.name || '',
      attachmentUrl: attachment?.attachmentUrl || null,
      attachmentFileId: attachment?.attachmentFileId || null,
      replyToId: replyTarget?._id || null,
    });
    setValue('');
    setAttachment(null);
    onClearReply?.();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [value, attachment, isLoading, onSend, replyTarget, onClearReply]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); return; }
    onKeystroke();
  }, [handleSend, onKeystroke]);

  const handleChange = useCallback((e) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await chatService.uploadFile(formData);
      setAttachment({
        attachmentUrl: result.attachmentUrl || result.url,
        attachmentFileId: result._id || result.attachmentFileId,
        messageType: detectMessageType(file),
        name: file.name,
      });
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const handleRecordingComplete = useCallback(({ attachmentUrl, attachmentFileId, duration }) => {
    setShowRecorder(false);
    onSend({
      messageType: 'AUDIO',
      content: `Voice message (${duration}s)`,
      attachmentUrl,
      attachmentFileId,
      replyToId: replyTarget?._id || null,
    });
    onClearReply?.();
  }, [onSend, replyTarget, onClearReply]);

  if (isBlocked) {
    return (
      <div className="p-3 border-t text-center text-sm text-muted-foreground">
        {t('chat.blocked', 'You have blocked this user')}
      </div>
    );
  }

  return (
    <div className="border-t shrink-0">
      {/* Reply preview */}
      {replyTarget && (
        <div className="px-3 pt-2">
          <ChatReplyPreview message={replyTarget} onClear={onClearReply} />
        </div>
      )}

      {/* Attachment preview */}
      {attachment && (
        <div className="flex items-center gap-2 px-3 pt-2">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground truncate flex-1">{attachment.name}</span>
          <button onClick={() => setAttachment(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Recorder row */}
      {showRecorder ? (
        <div className="p-3">
          <ChatAudioRecorder onComplete={handleRecordingComplete} onCancel={() => setShowRecorder(false)} />
        </div>
      ) : (
        <div className="flex items-end gap-2 p-3">
          {/* File attach */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-muted-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          {/* Textarea */}
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={uploading ? 'Uploading...' : t('fieldOps.chat.messagePlaceholder', 'Type a message…')}
            rows={1}
            className="flex-1 resize-none max-h-24 overflow-y-auto"
            disabled={isLoading || uploading}
          />

          {/* Mic or Send */}
          {value.trim() || attachment ? (
            <Button
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={handleSend}
              disabled={isLoading || uploading}
            >
              <Send className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground"
              onClick={() => setShowRecorder(true)}
            >
              <Mic className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
