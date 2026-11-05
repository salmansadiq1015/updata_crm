'use client';
import { cn } from '@/lib/utils';
import styles from './chat-workspace.module.css';

export function ChatShell({ sidebar, children, activeRoomId }) {
  return <div className={cn(styles.workspace, 'relative flex h-full min-h-0 min-w-0 overflow-hidden bg-background')}>
    <div className={cn('chat-conversations min-h-0 w-full shrink-0 flex-col overflow-hidden border-e border-border bg-card md:flex md:w-80 lg:w-[340px]', activeRoomId ? 'hidden' : 'flex')}>{sidebar}</div>
    <div className={cn('chat-conversation min-h-0 min-w-0 flex-1 flex-col overflow-hidden', activeRoomId ? 'flex' : 'hidden md:flex')}>{children}</div>
  </div>;
}
