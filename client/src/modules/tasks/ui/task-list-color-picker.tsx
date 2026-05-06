'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LIST_COLORS } from './task-ui-constants';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type TaskListColorPickerProps = {
  currentColor: string | null;
  onColorChange: (color: string | null) => void;
  children: ReactNode;
};

export function TaskListColorPicker({ currentColor, onColorChange, children }: TaskListColorPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-52 p-3" align="start">
        <p className="text-xs font-medium text-muted-foreground mb-2">List color</p>
        <div className="grid grid-cols-8 gap-1.5">
          {LIST_COLORS.map((color) => (
            <button
              key={color}
              className={cn(
                'h-5 w-5 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring flex items-center justify-center',
                currentColor === color && 'ring-2 ring-ring ring-offset-1'
              )}
              style={{ backgroundColor: color }}
              onClick={() => onColorChange(color)}
              aria-label={color}
            >
              {currentColor === color && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
            </button>
          ))}
        </div>
        <button
          className="mt-2 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          onClick={() => onColorChange(null)}
        >
          Remove color
        </button>
      </PopoverContent>
    </Popover>
  );
}
