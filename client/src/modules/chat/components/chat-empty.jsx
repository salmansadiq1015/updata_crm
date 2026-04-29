'use client';

import { MessageSquare } from 'lucide-react';

export function ChatEmpty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground h-full">
      <MessageSquare className="h-12 w-12 opacity-30" />
      <p className="text-lg font-medium">Select a conversation</p>
      <p className="text-sm">Choose from your existing conversations or start a new one</p>
    </div>
  );
}
