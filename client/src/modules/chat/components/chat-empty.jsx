import { MessageSquare } from 'lucide-react';

export function ChatEmpty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center h-full gap-4 bg-muted/10">
      <div className="rounded-full bg-primary/10 p-6">
        <MessageSquare className="h-12 w-12 text-primary/60" />
      </div>
      <div className="text-center space-y-1">
        <h3 className="text-xl font-semibold text-foreground">Your conversations</h3>
        <p className="text-sm text-muted-foreground max-w-60">
          Select a chat to start messaging or create a new conversation
        </p>
      </div>
    </div>
  );
}
