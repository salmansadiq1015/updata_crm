'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const EMOJIS = [
  '👍','👎','❤️','😂','😮','😢','😡','🎉',
  '🙏','👏','🔥','💯','✅','❌','💪','🤔',
  '😊','😍','🥰','😎','🤣','😅','🤩','😴',
  '👋','✌️','🤝','👌','💥','⭐','🌟','💫',
  '🙌','🫡','🥹','😭','💀','🤯','🫶','🎊',
];

export function ChatEmojiPicker({ onSelect, children }) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end" side="top">
        <div className="grid grid-cols-8 gap-0.5">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onSelect(emoji)}
              className="h-8 w-8 flex items-center justify-center text-lg rounded hover:bg-muted transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
