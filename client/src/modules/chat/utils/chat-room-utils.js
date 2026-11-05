const AVATAR_COLORS = [
  '#ef4444',
  '#db2777',
  '#9333ea',
  '#4f46e5',
  '#0284c7',
  '#0d9488',
  '#16a34a',
  '#f59e0b',
  '#64748b',
];

function translate(t, key, fallback, vars) {
  return typeof t === 'function' ? t(key, fallback, vars) : fallback;
}

export function stableColor(value) {
  const input = value || 'chat';
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function getUserDisplayName(user) {
  if (!user) return '';
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return name || user.email || '';
}

export function getInitials(value) {
  return String(value || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

export function getOtherMember(room, currentUserId) {
  return room?.members?.find(
    (member) => String(member.userId?._id || member.userId) !== String(currentUserId)
  );
}

export function getRoomDisplayName(room, currentUserId, t) {
  if (!room) return translate(t, 'chat.chat', 'Chat');

  if (room.roomType === 'DM') {
    const other = getOtherMember(room, currentUserId);
    return getUserDisplayName(other?.userId) || translate(t, 'chat.directMessage', 'Direct Message');
  }

  if (room.roomType === 'LEAD') return room.name || (room.leadIds || []).map(lead => lead.name).filter(Boolean).join(', ') || translate(t, 'chat.workspace.leadChat', 'Lead conversation');

  if (room.roomType === 'GROUP') return room.name || translate(t, 'chat.group', 'Group');

  if (room.roomType === 'TEAM') return room.name || translate(t, 'chat.teamChannel', 'Team channel');
  if (room.roomType === 'DEPARTMENT') return room.name || translate(t, 'chat.departmentChannel', 'Department channel');

  const project = room.project || room.projectId;
  const order = room.order || room.orderId;
  const customerName = project?.customerName || order?.customerName || room.customer?.name;
  const reference = project?.projectNumber || order?.orderNumber;

  if (customerName && reference) return `${customerName} - #${reference}`;
  if (project?.name) return project.name;
  if (order?.title || order?.name) return order.title || order.name;
  return room.roomType === 'ORDER'
    ? translate(t, 'chat.jobChat', 'Job Chat')
    : translate(t, 'chat.projectChat', 'Project Chat');
}

export function getRoomKindLabel(room, t) {
  if (!room) return translate(t, 'chat.conversation', 'Conversation');
  if (room.roomType === 'LEAD') return translate(t, 'chat.workspace.leadChat', 'Lead conversation');
  if (room.roomType === 'DM') return translate(t, 'chat.direct', 'Direct');
  if (room.roomType === 'GROUP') {
    return room.projectId || room.orderId
      ? translate(t, 'chat.projectGroup', 'Project group')
      : translate(t, 'chat.group', 'Group');
  }
  if (room.roomType === 'PROJECT') return translate(t, 'chat.project', 'Project');
  if (room.roomType === 'ORDER') return translate(t, 'chat.job', 'Job');
  if (room.roomType === 'TEAM') return translate(t, 'chat.team', 'Team');
  if (room.roomType === 'DEPARTMENT') return translate(t, 'chat.department', 'Department');
  return translate(t, 'chat.conversation', 'Conversation');
}

export function isRoomOnline(room, currentUserId, onlineIds) {
  if (!room || room.roomType !== 'DM') return false;
  const other = getOtherMember(room, currentUserId);
  const otherId = String(other?.userId?._id || other?.userId || '');
  return Boolean(otherId && onlineIds?.has(otherId));
}

export function getRoomSubtitle(room, currentUserId, onlineIds, t) {
  if (!room) return '';

  if (room.roomType === 'DM') {
    return isRoomOnline(room, currentUserId, onlineIds)
      ? translate(t, 'chat.online', 'Online')
      : translate(t, 'chat.directMessage', 'Direct Message');
  }

  const memberCount = room.members?.length ?? 0;
  const memberLabel = memberCount === 1
    ? translate(t, 'chat.memberCountOne', '1 member')
    : translate(t, 'chat.memberCount', '{count} members', { count: memberCount });
  const kind = getRoomKindLabel(room, t);
  return `${kind} - ${memberLabel}`;
}

export function getRoomStats(rooms = []) {
  return rooms.reduce(
    (stats, room) => {
      stats.total += 1;
      stats.unread += room.unreadCount ?? 0;
      if (room.unreadCount > 0) stats.unreadRooms += 1;
      if (room.roomType === 'LEAD' || room.leadIds?.length) stats.leads += 1;
      if (room.roomType === 'DM') stats.direct += 1;
      if (room.roomType === 'GROUP') stats.groups += 1;
      if (room.roomType === 'PROJECT' || room.projectId) stats.projects += 1;
      if (room.roomType === 'TEAM' || room.roomType === 'DEPARTMENT') stats.channels += 1;
      return stats;
    },
    { total: 0, unread: 0, unreadRooms: 0, leads: 0, direct: 0, groups: 0, projects: 0, channels: 0 }
  );
}

export function filterRooms(rooms, filter, search, currentUserId, t) {
  const query = search.trim().toLowerCase();

  return (rooms ?? []).filter((room) => {
    const matchesFilter =
      filter === 'All' ||
      (filter === 'Unread' && room.unreadCount > 0) ||
      (filter === 'Leads' && (room.roomType === 'LEAD' || room.leadIds?.length)) ||
      (filter === 'Direct' && room.roomType === 'DM') ||
      (filter === 'Groups' && room.roomType === 'GROUP') ||
      (filter === 'Projects' && (room.roomType === 'PROJECT' || room.projectId || room.orderId)) ||
      (filter === 'Channels' && (room.roomType === 'TEAM' || room.roomType === 'DEPARTMENT'));

    if (!matchesFilter) return false;
    if (!query) return true;

    return [
      getRoomDisplayName(room, currentUserId, t),
      getRoomKindLabel(room, t),
      room.lastMessageText,
      room.description,
      room.project?.name,
      room.project?.projectNumber,
      room.order?.orderNumber,
      room.customer?.name,
      ...(room.leadIds || []).flatMap(lead => [lead.name, lead.leadNumber]),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

export function getMentionableMembers(room, currentUserId, t) {
  return (room?.members ?? [])
    .map((member) => member.userId)
    .filter(Boolean)
    .filter((user) => String(user._id || user) !== String(currentUserId))
    .map((user) => ({
      id: String(user._id || user),
      name: getUserDisplayName(user) || translate(t, 'chat.teamMember', 'Team member'),
      email: user.email || '',
    }));
}

export function extractMentionIds(content, selectedMentions = []) {
  const normalized = content.toLowerCase();
  return [
    ...new Set(
      selectedMentions
        .filter((mention) => normalized.includes(`@${mention.name.toLowerCase()}`))
        .map((mention) => mention.id)
    ),
  ];
}
