'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatRooms } from '@/modules/chat/hooks/use-chat-rooms';
import { useAuthStore } from '@/stores/auth-store';
import { getExistingSocket } from '@/modules/mobile/lib/websocket-client';
import { queryKeys } from '@/lib/query/keys';
import { ChatSidebarItem } from './chat-sidebar-item';
import { UserSearchDialog } from './user-search-dialog';

const FILTERS = ['All', 'Projects', 'Direct'];

export function ChatSidebar({ activeRoomId }) {
  const [filter, setFilter] = useState('All');
  const [searchOpen, setSearchOpen] = useState(false);
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((s) => s.user?._id);
  const { data: rooms = [], isLoading } = useChatRooms();

  useEffect(() => {
    if (!currentUserId) return;
    const socket = getExistingSocket();
    if (!socket) return;

    const event = `user:${currentUserId}`;
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms() });
    };

    socket.on(event, (data) => {
      if (data?.type === 'chat:room_updated') handler();
    });

    return () => {
      socket.off(event);
    };
  }, [currentUserId, queryClient]);

  const filteredRooms = rooms.filter((room) => {
    if (filter === 'Projects') return room.roomType === 'PROJECT';
    if (filter === 'Direct') return room.roomType === 'DM';
    return true;
  });

  return (
    <div className="flex flex-col h-full w-72 border-r bg-background shrink-0">
      <div className="p-3 border-b flex items-center gap-2">
        <h2 className="font-bold text-base flex-1">Chats</h2>
        <Button size="sm" variant="outline" onClick={() => setSearchOpen(true)}>
          + New
        </Button>
      </div>

      <div className="flex gap-1 p-2 border-b">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-3 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            {filteredRooms.map((room) => (
              <ChatSidebarItem
                key={room._id}
                room={room}
                isActive={room._id === activeRoomId}
                currentUserId={currentUserId}
                onClick={() => {}}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      <UserSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
