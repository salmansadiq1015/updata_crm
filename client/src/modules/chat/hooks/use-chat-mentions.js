'use client';

import { useCallback, useMemo, useState } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';
import { extractMentionIds, getMentionableMembers } from '../utils/chat-room-utils';

function findMentionQuery(value) {
  const match = value.match(/(?:^|\s)@([^\s@]{0,40})$/);
  return match ? match[1].toLowerCase() : null;
}

export function useChatMentions({ room, currentUserId, value }) {
  const { t } = useLanguage();
  const [selectedMentions, setSelectedMentions] = useState([]);
  const mentionableMembers = useMemo(
    () => getMentionableMembers(room, currentUserId, t),
    [room, currentUserId, t]
  );

  const mentionQuery = findMentionQuery(value);
  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    return mentionableMembers
      .filter((member) =>
        member.name.toLowerCase().includes(mentionQuery) ||
        member.email.toLowerCase().includes(mentionQuery)
      )
      .slice(0, 6);
  }, [mentionQuery, mentionableMembers]);

  const registerMention = useCallback((member) => {
    setSelectedMentions((current) => {
      if (current.some((item) => item.id === member.id)) return current;
      return [...current, member];
    });
  }, []);

  const getMentionIds = useCallback((content) => {
    return extractMentionIds(content, selectedMentions);
  }, [selectedMentions]);

  const clearMentions = useCallback(() => setSelectedMentions([]), []);

  return {
    mentionQuery,
    suggestions,
    registerMention,
    getMentionIds,
    clearMentions,
  };
}
