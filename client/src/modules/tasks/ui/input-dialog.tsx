'use client';

import { type ChangeEvent, type KeyboardEvent, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/lib/i18n/language-context';

type InputDialogProps = {
  open: boolean;
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

export function InputDialog({
  open,
  title,
  placeholder = '',
  defaultValue = '',
  confirmLabel = 'Save',
  onConfirm,
  onCancel,
}: InputDialogProps) {
  const { t } = useLanguage();
  const [value, setValue] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentValue = value ?? defaultValue;

  const handleCancel = () => {
    setValue(null);
    onCancel();
  };

  const handleConfirm = () => {
    const trimmed = currentValue.trim();
    if (!trimmed) return;
    setValue(null);
    onConfirm(trimmed);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o: boolean) => {
        if (!o) handleCancel();
      }}
    >
      <DialogContent className="sm:max-w-sm " hideClose>
        <DialogHeader className="">
          <DialogTitle className="">{title}</DialogTitle>
        </DialogHeader>
        <div className="px-5 pb-3">
        <Input
          ref={inputRef}
          type="text"
          className=""
          value={currentValue}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") handleConfirm();
            if (e.key === "Escape") handleCancel();
          }}
          autoFocus
        />
        <DialogFooter className=" mt-2 rounded-md">
          <Button className="" variant="outline" onClick={handleCancel}>
            {t('common.cancel', 'Abbrechen')}
          </Button>
          <Button className="" onClick={handleConfirm} disabled={!currentValue.trim()}>
            {confirmLabel}
          </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
