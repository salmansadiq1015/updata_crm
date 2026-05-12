'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Paperclip, Smile, Mic, ArrowUp, X, Lock, FileText, Image as ImageIcon, Film, Music, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { chatService } from '../services/chat-service';
import { useChatTyping } from '../hooks/use-chat-typing';
import { ChatReplyPreview } from './chat-reply-preview';
import { ChatAudioRecorder } from './chat-audio-recorder';
import { ChatEmojiPicker } from './chat-emoji-picker';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const ACCEPTED_TYPES = [
  'image/*', 'video/*', 'audio/*',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.zip',
].join(',');

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileType(file) {
  if (file.type.startsWith('image/')) return 'PHOTO';
  if (file.type.startsWith('video/')) return 'VIDEO';
  if (file.type.startsWith('audio/')) return 'AUDIO';
  return 'DOCUMENT';
}

function FileTypeIcon({ type, className }) {
  if (type === 'PHOTO') return <ImageIcon className={className} />;
  if (type === 'VIDEO') return <Film className={className} />;
  if (type === 'AUDIO') return <Music className={className} />;
  return <FileText className={className} />;
}

export function ChatInput({ onSend, isLoading, roomId, replyTarget, onClearReply, isBlocked, editTarget, onClearEdit }) {
  const { t } = useLanguage();
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState(null); // { url, fileId, messageType, name, size, preview }
  const [uploadProgress, setUploadProgress] = useState(null); // null | 0-100
  const [uploadError, setUploadError] = useState('');
  const [showRecorder, setShowRecorder] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const previewUrlRef = useRef(null);
  const { onKeystroke } = useChatTyping(roomId);

  // Clean up object URL on unmount or attachment change
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  // Pre-fill text when editing
  const prevEditId = useRef(null);
  if (editTarget && editTarget._id !== prevEditId.current) {
    prevEditId.current = editTarget._id;
    setText(editTarget.content || '');
  }
  if (!editTarget && prevEditId.current) {
    prevEditId.current = null;
  }

  const uploading = uploadProgress !== null;
  const canSend = (text.trim().length > 0 || attachment) && !isLoading && !uploading;

  const clearAttachment = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setAttachment(null);
    setUploadError('');
    setUploadProgress(null);
  }, []);

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    const payload = editTarget
      ? { content: text.trim(), messageType: 'TEXT' }
      : {
          messageType: attachment?.messageType || 'TEXT',
          content: text.trim() || '',
          attachmentUrl: attachment?.url,
          attachmentFileId: attachment?.fileId,
          replyToId: replyTarget?._id,
        };
    setText('');
    clearAttachment();
    textareaRef.current?.focus();
    await onSend(payload);
  }, [canSend, text, attachment, replyTarget, editTarget, onSend, clearAttachment]);

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
    e.target.value = '';

    setUploadError('');

    // Client-side size validation
    if (file.size > MAX_FILE_SIZE) {
      setUploadError(t('chat.fileTooLarge', 'File too large. Maximum size is 25 MB (your file: {size})', { size: formatBytes(file.size) }));
      return;
    }

    const type = getFileType(file);

    // Generate local preview URL for images
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const preview = type === 'PHOTO' ? URL.createObjectURL(file) : null;
    previewUrlRef.current = preview;

    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('module', 'chat');

      const res = await chatService.uploadFile(formData, (pct) => setUploadProgress(pct));
      const url = res.attachmentUrl || res.url || res.fileUrl;
      const fileId = res._id || res.id || res.attachmentFileId;

      setAttachment({ url, fileId, messageType: type, name: file.name, size: file.size, preview });
    } catch (err) {
      if (preview) { URL.revokeObjectURL(preview); previewUrlRef.current = null; }
      const msg = err?.response?.data?.message ?? t('chat.uploadFailed', 'Upload failed. Please try again.');
      setUploadError(msg);
    } finally {
      setUploadProgress(null);
    }
  }, []);

  const handleAudioComplete = useCallback(result => {
    setShowRecorder(false);
    onSend({
      messageType: 'AUDIO',
      content: '',
      attachmentUrl: result.attachmentUrl,
      attachmentFileId: result.attachmentFileId,
      replyToId: replyTarget?._id,
    });
  }, [replyTarget, onSend]);

  if (isBlocked) {
    return (
      <div className="border-t border-border/40 bg-card px-4 py-3 flex items-center justify-center gap-2 text-muted-foreground">
        <Lock className="h-4 w-4" />
        <span className="text-sm">{t('chat.cannotSend', 'You cannot send messages')}</span>
      </div>
    );
  }

  return (
    <div className="border-t border-border/40 bg-card">
      {/* Edit indicator */}
      {editTarget && (
        <div className="flex items-center justify-between px-4 pt-2 pb-1 text-xs text-primary">
          <span className="font-medium">{t('chat.editingMessage', 'Editing message')}</span>
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

      {/* Upload error */}
      {uploadError && (
        <div className="flex items-center gap-2 mx-3 mt-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{uploadError}</span>
          <button onClick={() => setUploadError('')} className="shrink-0 hover:opacity-70">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Uploading progress */}
      {uploading && (
        <div className="mx-3 mt-2 rounded-xl bg-muted/60 px-3 py-2.5">
          <div className="flex items-center gap-2.5 mb-2">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
            <span className="text-xs font-medium text-foreground flex-1">Uploading…</span>
            <span className="text-xs text-muted-foreground tabular-nums">{uploadProgress}%</span>
          </div>
          <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-200 ease-out"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Attachment preview (after upload complete) */}
      {attachment && !uploading && (
        <div className="mx-3 mt-2 flex items-center gap-2.5 rounded-xl bg-muted/60 px-2.5 py-2">
          {/* Thumbnail for images */}
          {attachment.messageType === 'PHOTO' && attachment.preview ? (
            <img
              src={attachment.preview}
              alt=""
              className="h-10 w-10 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileTypeIcon type={attachment.messageType} className="h-4.5 w-4.5 text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{attachment.name}</p>
            <p className="text-[11px] text-muted-foreground">{formatBytes(attachment.size)}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" onClick={clearAttachment}>
            <X className="h-3.5 w-3.5" />
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
          {/* Attach button */}
          <Button
            variant="ghost" size="icon"
            className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
            onClick={() => { setUploadError(''); fileInputRef.current?.click(); }}
            disabled={uploading}
            title={t('chat.attachFile', 'Attach file (max 25 MB)')}
          >
            {uploading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Paperclip className="h-4.5 w-4.5" />
            }
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={ACCEPTED_TYPES}
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
              disabled={uploading}
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
