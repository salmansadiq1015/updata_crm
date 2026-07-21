'use client';

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import NextImage from 'next/image';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Paperclip, Smile, Mic, ArrowUp, X, Lock, FileText, Image as ImageIcon, Film, Music, AlertCircle, Loader2, AtSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { CHAT_FILE_ACCEPTED_TYPES } from '../constants/chat-config';
import { useChatAttachmentUpload } from '../hooks/use-chat-attachment-upload';
import { useChatMentions } from '../hooks/use-chat-mentions';
import { useChatTyping } from '../hooks/use-chat-typing';
import { formatBytes } from '../utils/chat-file-utils';
import { ChatReplyPreview } from './chat-reply-preview';
import { ChatAudioRecorder } from './chat-audio-recorder';
import { ChatEmojiPicker } from './chat-emoji-picker';

function FileTypeIcon({ type, className }) {
  if (type === 'PHOTO') return <ImageIcon className={className} />;
  if (type === 'VIDEO') return <Film className={className} />;
  if (type === 'AUDIO') return <Music className={className} />;
  return <FileText className={className} />;
}

export const ChatInput = forwardRef(function ChatInput({ onSend, isLoading, roomId, room, currentUserId, replyTarget, onClearReply, isBlocked, editTarget, onClearEdit }, ref) {
  const { t } = useLanguage();
  const [text, setText] = useState('');
  const [draftSourceId, setDraftSourceId] = useState(null);
  const [attachment, setAttachment] = useState(null); // { url, fileId, messageType, name, size, preview }
  const [showRecorder, setShowRecorder] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const previewUrlRef = useRef(null);
  const { onKeystroke } = useChatTyping(roomId);
  const {
    uploadAttachment,
    uploadProgress,
    uploadError,
    setUploadError,
    clearUploadState,
  } = useChatAttachmentUpload();
  const editTargetId = editTarget?._id || null;
  const inputValue = editTarget && draftSourceId !== editTargetId ? (editTarget.content || '') : text;
  const {
    suggestions: mentionSuggestions,
    registerMention,
    getMentionIds,
    clearMentions,
  } = useChatMentions({ room, currentUserId, value: inputValue });

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const uploading = uploadProgress !== null;
  const canSend = (inputValue.trim().length > 0 || attachment) && !isLoading && !uploading;

  const clearAttachment = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setAttachment(null);
    clearUploadState();
  }, [clearUploadState]);

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    const content = inputValue.trim();
    const payload = editTarget
      ? { content, messageType: 'TEXT' }
      : {
          messageType: attachment?.messageType || 'TEXT',
          content: content || '',
          attachmentUrl: attachment?.url,
          attachmentFileId: attachment?.fileId,
          replyToId: replyTarget?._id,
          mentions: getMentionIds(content),
        };
    await onSend(payload);
    setText('');
    setDraftSourceId(null);
    clearAttachment();
    clearMentions();
    textareaRef.current?.focus();
  }, [canSend, inputValue, attachment, replyTarget, editTarget, onSend, clearAttachment, clearMentions, getMentionIds]);

  const handleKeyDown = useCallback(e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    onKeystroke();
  }, [handleSend, onKeystroke]);

  const processFile = useCallback(async file => {
    if (!file) return;

    setUploadError('');

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    previewUrlRef.current = preview;

    const uploaded = await uploadAttachment(file);
    if (uploaded) {
      setAttachment({ ...uploaded, preview });
    } else if (preview) {
      URL.revokeObjectURL(preview);
      previewUrlRef.current = null;
    }
  }, [setUploadError, uploadAttachment]);

  const handleFileChange = useCallback(e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    processFile(file);
  }, [processFile]);

  // Let the panel forward drag-and-dropped files into the same upload flow.
  useImperativeHandle(ref, () => ({ addFile: file => processFile(file) }), [processFile]);

  const handleAudioComplete = useCallback(result => {
    setShowRecorder(false);
    onSend({
      messageType: 'AUDIO',
      content: '',
      attachmentUrl: result.attachmentUrl,
      attachmentFileId: result.attachmentFileId,
      replyToId: replyTarget?._id,
      mentions: [],
    });
  }, [replyTarget, onSend]);

  const handleMentionSelect = useCallback((member) => {
    setText(
      inputValue.replace(/(^|\s)@([^\s@]{0,40})$/, (_, prefix) => `${prefix}@${member.name} `)
    );
    setDraftSourceId(editTargetId);
    registerMention(member);
    textareaRef.current?.focus();
  }, [editTargetId, inputValue, registerMention]);

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
      {editTarget && (
        <div className="flex items-center justify-between px-4 pt-2 pb-1 text-xs text-primary">
          <span className="font-medium">{t('chat.editingMessage', 'Editing message')}</span>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { onClearEdit?.(); setText(''); setDraftSourceId(null); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {!editTarget && replyTarget && (
        <div className="px-3 pt-2">
          <ChatReplyPreview message={replyTarget} onClear={onClearReply} />
        </div>
      )}

      {uploadError && (
        <div className="flex items-center gap-2 mx-3 mt-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{uploadError}</span>
          <button onClick={() => setUploadError('')} className="shrink-0 hover:opacity-70">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {uploading && (
        <div className="mx-3 mt-2 rounded-xl bg-muted/60 px-3 py-2.5">
          <div className="flex items-center gap-2.5 mb-2">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
            <span className="text-xs font-medium text-foreground flex-1">{t('chat.uploading')}</span>
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

      {attachment && !uploading && (
        <div className="mx-3 mt-2 flex items-center gap-2.5 rounded-xl bg-muted/60 px-2.5 py-2">
          {attachment.messageType === 'PHOTO' && attachment.preview ? (
            <NextImage
              src={attachment.preview}
              alt=""
              width={40}
              height={40}
              unoptimized
              className="h-10 w-10 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileTypeIcon type={attachment.messageType} className="h-4 w-4 text-primary" />
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

      {showRecorder ? (
        <div className="px-3 py-2">
          <ChatAudioRecorder
            onComplete={handleAudioComplete}
            onCancel={() => setShowRecorder(false)}
          />
        </div>
      ) : (
        <div className="flex items-end gap-2 px-3 py-2">
          <Button
            variant="ghost" size="icon"
            className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
            onClick={() => { setUploadError(''); fileInputRef.current?.click(); }}
            disabled={uploading}
            title={t('chat.attachFile', 'Attach file (max 25 MB)')}
          >
            {uploading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Paperclip className="h-4 w-4" />
            }
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={CHAT_FILE_ACCEPTED_TYPES}
            onChange={handleFileChange}
          />

          <div className="relative flex-1">
            {mentionSuggestions.length > 0 && (
              <div className="absolute bottom-full left-0 z-20 mb-2 w-full max-w-sm overflow-hidden rounded-2xl border border-border/70 bg-popover shadow-xl">
                <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <AtSign className="h-3.5 w-3.5" />
                  {t('chat.mentionSomeone', 'Mention someone')}
                </div>
                <div className="max-h-52 overflow-y-auto p-1">
                  {mentionSuggestions.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => handleMentionSelect(member)}
                      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                        {member.name.split(' ').slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{member.name}</span>
                        {member.email && <span className="block truncate text-xs text-muted-foreground">{member.email}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Textarea
              ref={textareaRef}
              value={inputValue}
              onChange={e => { setText(e.target.value); setDraftSourceId(editTargetId); onKeystroke(); }}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.typeMessage')}
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

          {canSend ? (
            <Button
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
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
              <Mic className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {showPicker && (
        <div className="px-3 pb-2">
          <ChatEmojiPicker
            onSelect={emoji => {
              setText(`${inputValue}${emoji}`);
              setDraftSourceId(editTargetId);
              setShowPicker(false);
              textareaRef.current?.focus();
            }}
            onClose={() => setShowPicker(false)}
          />
        </div>
      )}
    </div>
  );
});
