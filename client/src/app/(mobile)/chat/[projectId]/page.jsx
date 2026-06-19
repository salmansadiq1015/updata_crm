'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Send, Paperclip, Camera, X, FileText, ImageIcon, File } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { EmptyState } from '@/modules/mobile/components/empty-state';
import { useChatMessages, useChatMutations, useChatMembers } from '@/modules/mobile/hooks/use-chat';
import { MESSAGE_TYPE, SYNC_STATUS } from '@/modules/mobile/constants/mobile-constants';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

function formatMentions(text) {
  if (!text) return null;
  const parts = text.split(/(@[^\s@]+)/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="font-semibold text-primary">
        {part}
      </span>
    ) : (
      part
    )
  );
}

function getMemberId(member) {
  return member?._id || member?.id;
}

function getMemberName(member) {
  return member?.name
    || `${member?.firstName || member?.first_name || ''} ${member?.lastName || member?.last_name || ''}`.trim()
    || member?.username
    || member?.email
    || 'User';
}

function getMentionToken(member) {
  return member?.username || member?.firstName || member?.first_name || getMemberName(member).split(/\s+/)[0];
}

export default function ChatPage() {
  const { projectId } = useParams();
  const { t, locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';

  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [attachmentType, setAttachmentType] = useState(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [caretPos, setCaretPos] = useState(0);
  const [selectedMentionIds, setSelectedMentionIds] = useState([]);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const { data: messages, isLoading, isOffline } = useChatMessages(projectId);
  const { sendMessage } = useChatMutations(projectId);
  const { data: members } = useChatMembers(projectId);

  const allMessages = Array.isArray(messages) ? messages : [];
  const memberList = Array.isArray(members) ? members : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages.length]);

  const handleTextChange = (e) => {
    const val = e.target.value;
    setMessage(val);
    const pos = e.target.selectionStart;
    setCaretPos(pos);

    const textBefore = val.slice(0, pos);
    const mentionMatch = textBefore.match(/@([^\s@]*)$/);
    if (mentionMatch && memberList.length > 0) {
      setMentionQuery(mentionMatch[1].toLowerCase());
      setShowMentions(true);
    } else {
      setShowMentions(false);
      setMentionQuery('');
    }
  };

  const insertMention = (member) => {
    const memberId = getMemberId(member);
    const token = getMentionToken(member);
    const textBefore = message.slice(0, caretPos);
    const textAfter = message.slice(caretPos);
    const replaced = textBefore.replace(/@([^\s@]*)$/, `@${token} `);
    setMessage(replaced + textAfter);
    if (memberId) {
      setSelectedMentionIds((prev) => (prev.includes(memberId) ? prev : [...prev, memberId]));
    }
    setShowMentions(false);
    setMentionQuery('');
    textareaRef.current?.focus();
  };

  const filteredMembers = mentionQuery
    ? memberList.filter((member) =>
        `${getMentionToken(member)} ${getMemberName(member)} ${member.email || ''}`
          .toLowerCase()
          .includes(mentionQuery)
      )
    : memberList;

  const handleFileSelect = (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachment(file);
    setAttachmentType(type || (file.type.startsWith('image/') ? MESSAGE_TYPE.PHOTO : MESSAGE_TYPE.DOCUMENT));
    e.target.value = '';
  };

  const handleSend = async () => {
    const text = message.trim();
    if (!text && !attachment) return;

    const mentions = [...selectedMentionIds];
    const mentionRegex = /@([^\s@]+)/g;
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      const token = match[1].toLowerCase();
      const member = memberList.find((candidate) =>
        getMentionToken(candidate).toLowerCase() === token
        || getMemberName(candidate).toLowerCase().replace(/\s+/g, '') === token
      );
      const memberId = getMemberId(member);
      if (memberId && !mentions.includes(memberId)) mentions.push(memberId);
    }

    setMessage('');
    setAttachment(null);
    setAttachmentType(null);
    setSelectedMentionIds([]);

    const payload = {
      content: text || (attachment ? attachment.name : ''),
      messageType: attachment ? attachmentType : MESSAGE_TYPE.TEXT,
      message_type: attachment ? attachmentType : MESSAGE_TYPE.TEXT,
      is_own: true,
      mentions,
    };
    if (attachment) payload.attachment = attachment;

    try {
      await sendMessage.mutateAsync(payload);
    } catch {
      toast.error(lang === 'de' ? 'Nachricht konnte nicht gesendet werden' : 'Could not send message');
    }
  };

  const handleKeyDown = (e) => {
    if (showMentions && e.key === 'Escape') {
      setShowMentions(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full min-h-full">
      <MobileHeader
        title={t('mobile.chat.title', 'Projekt-Chat')}
        showBack
        right={
          isOffline && (
            <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded-lg">
              Offline
            </span>
          )
        }
      />

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {isLoading ? (
          <ChatSkeleton />
        ) : allMessages.length === 0 ? (
          <EmptyState
            variant="empty"
            title={lang === 'de' ? 'Noch keine Nachrichten' : 'No messages yet'}
            description={
              lang === 'de'
                ? 'Beginnen Sie eine Unterhaltung mit Ihrem Team.'
                : 'Start a conversation with your team.'
            }
          />
        ) : (
          allMessages.map((msg) => (
            <ChatBubble key={msg.id || msg._id} message={msg} lang={lang} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {showMentions && filteredMembers.length > 0 && (
        <div className="px-4 py-2 border-t border-border bg-background">
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {filteredMembers.slice(0, 8).map((member) => {
              const name = getMentionToken(member);
              const label = getMemberName(member);
              return (
                <button
                  key={getMemberId(member) || name}
                  onClick={() => insertMention(member)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  <span className="h-5 w-5 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center font-bold">
                    {(label || 'U')[0].toUpperCase()}
                  </span>
                  @{name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="border-t border-border bg-background">
        {attachment && (
          <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border">
            {attachmentType === MESSAGE_TYPE.PHOTO ? (
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
            ) : (
              <FileText className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-xs truncate flex-1">{attachment.name}</span>
            <button
              onClick={() => { setAttachment(null); setAttachmentType(null); }}
              className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-muted"
              aria-label="Remove attachment"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="px-3 py-3">
          <div className="flex items-end gap-2">
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="h-[42px] w-[42px] flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Take photo"
              >
                <Camera className="h-5 w-5" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="h-[42px] w-[42px] flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Attach file"
              >
                <Paperclip className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                placeholder={lang === 'de' ? 'Nachricht schreiben...' : 'Type a message...'}
                rows={1}
                className={cn(
                  'w-full resize-none rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm',
                  'focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20',
                  'max-h-32 min-h-[42px]'
                )}
                style={{ height: 'auto', overflowY: message.split('\n').length > 3 ? 'auto' : 'hidden' }}
              />
            </div>
            <Button
              size="sm"
              className="h-[42px] w-[42px] p-0 rounded-xl shrink-0"
              onClick={handleSend}
              disabled={(!message.trim() && !attachment) || sendMessage.isPending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handleFileSelect(e, MESSAGE_TYPE.PHOTO)}
          className="hidden"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          onChange={(e) => handleFileSelect(e, null)}
          className="hidden"
        />
      </div>
    </div>
  );
}

function ChatBubble({ message, lang }) {
  const isOwn = message.is_own || message.isOwn;
  const isPending = message.sync_status === SYNC_STATUS.PENDING_SYNC;
  const sentAt = message.sent_at || message.sentAt || message.created_at || message.createdAt;
  const msgType = message.message_type || message.messageType || MESSAGE_TYPE.TEXT;
  const content = message.content || '';
  const senderName = message.sender_name || message.senderName;
  const attachmentUrl = message.attachment_url || message.attachmentUrl || message.attachment_local_path;

  const mentions = (() => {
    try {
      if (!message.mentions) return [];
      return typeof message.mentions === 'string'
        ? JSON.parse(message.mentions)
        : message.mentions;
    } catch {
      return [];
    }
  })();

  return (
    <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl overflow-hidden',
          isOwn
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted rounded-bl-md'
        )}
      >
        {!isOwn && senderName && (
          <p className={cn('text-xs font-semibold px-4 pt-2.5 pb-0.5 opacity-70')}>
            {senderName}
          </p>
        )}

        {msgType === MESSAGE_TYPE.PHOTO && attachmentUrl && (
          <div className="relative">
            <img
              src={attachmentUrl}
              alt={lang === 'de' ? 'Foto' : 'Photo'}
              className="w-full max-w-[280px] object-cover max-h-48"
              loading="lazy"
            />
          </div>
        )}

        {msgType === MESSAGE_TYPE.DOCUMENT && (
          <div className={cn(
            'flex items-center gap-3 px-4 py-3',
            isOwn ? '' : ''
          )}>
            <div className={cn(
              'flex items-center justify-center h-10 w-10 rounded-lg shrink-0',
              isOwn ? 'bg-primary-foreground/20' : 'bg-background'
            )}>
              <File className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {content || (lang === 'de' ? 'Dokument' : 'Document')}
              </p>
              {attachmentUrl && (
                <a
                  href={attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'text-[10px] underline',
                    isOwn ? 'text-primary-foreground/70' : 'text-primary'
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  {lang === 'de' ? 'Oeffnen' : 'Open'}
                </a>
              )}
            </div>
          </div>
        )}

        {content && msgType === MESSAGE_TYPE.TEXT && (
          <p className="text-sm whitespace-pre-wrap break-words px-4 py-2.5">
            {mentions.length > 0 ? formatMentions(content) : content}
          </p>
        )}
        {content && msgType !== MESSAGE_TYPE.TEXT && msgType !== MESSAGE_TYPE.DOCUMENT && (
          <p className="text-xs opacity-80 px-4 pb-2">
            {content}
          </p>
        )}

        <div className={cn(
          'flex items-center gap-1 px-4 pb-2',
          isOwn ? 'justify-end' : 'justify-start'
        )}>
          {sentAt && (
            <span className={cn('text-[10px]', isOwn ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
              {new Date(sentAt).toLocaleTimeString(lang === 'de' ? 'de-CH' : 'en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          {isPending && (
            <span className={cn('text-[10px]', isOwn ? 'text-primary-foreground/50' : 'text-muted-foreground/50')}>
              ...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex justify-start"><div className="h-16 w-48 bg-muted rounded-2xl animate-pulse" /></div>
      <div className="flex justify-end"><div className="h-12 w-40 bg-primary/20 rounded-2xl animate-pulse" /></div>
      <div className="flex justify-start"><div className="h-20 w-56 bg-muted rounded-2xl animate-pulse" /></div>
      <div className="flex justify-end"><div className="h-12 w-44 bg-primary/20 rounded-2xl animate-pulse" /></div>
    </div>
  );
}
