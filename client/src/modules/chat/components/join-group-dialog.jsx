'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useChatMutations } from '@/modules/chat/hooks/use-chat-mutations';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Hash } from 'lucide-react';

export function JoinGroupDialog({ open, onClose }) {
  const router = useRouter();
  const [digits, setDigits] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const inputRefs = useRef([]);

  const { joinByCode } = useChatMutations();

  const prevOpen = useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current) {
      setTimeout(() => {
        setDigits(['', '', '', '']);
        setError('');
        inputRefs.current[0]?.focus();
      }, 0);
    }
    prevOpen.current = open;
  }, [open]);

  function handleChange(index, e) {
    const val = e.target.value.replace(/\D/g, '').slice(-1);
    const next = digits.map((d, i) => (i === index ? val : d));
    setDigits(next);
    setError('');

    if (val && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 4 digits filled
    if (val && next.every((d) => d !== '')) {
      submit(next.join(''));
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace') {
      if (digits[index] === '' && index > 0) {
        const next = digits.map((d, i) => (i === index - 1 ? '' : d));
        setDigits(next);
        inputRefs.current[index - 1]?.focus();
      } else {
        setDigits((prev) => prev.map((d, i) => (i === index ? '' : d)));
      }
    }
  }

  function submit(code) {
    joinByCode.mutate(code, {
      onSuccess: (room) => {
        router.push(`/field-ops/chat?chatId=${room._id}`);
        onClose();
      },
      onError: (err) => {
        setError(err?.response?.data?.message ?? 'Invalid or expired code. Please try again.');
        setDigits(['', '', '', '']);
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Join a Group</DialogTitle>
          <DialogDescription className="sr-only">Enter the 4-digit code to join a group chat.</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="flex flex-col items-center gap-6">
            <div className="rounded-full bg-primary/10 p-4">
              <Hash className="h-8 w-8 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Enter the 4-digit code shared by the group admin
            </p>
            <div className="flex gap-3">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (inputRefs.current[i] = el)}
                  value={d}
                  onChange={(e) => handleChange(i, e)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="w-14 h-14 text-center text-2xl font-bold border-2 rounded-xl bg-muted focus:border-primary focus:outline-none transition-colors"
                  type="text"
                  maxLength={1}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  disabled={joinByCode.isPending}
                />
              ))}
            </div>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            {joinByCode.isPending && (
              <p className="text-sm text-muted-foreground">Joining…</p>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={joinByCode.isPending}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
