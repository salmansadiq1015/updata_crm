'use client';

import { useRef } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { showError } from '@/lib/toast';

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];

export function AvatarUpload({ avatarUrl, initials, onUpload, onRemove, isLoading = false }) {
  const inputRef = useRef(null);

  const handleClick = () => {
    if (!isLoading) {
      inputRef.current?.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      showError('Nur JPEG- und PNG-Dateien sind erlaubt.');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_SIZE) {
      showError('Die Datei darf maximal 5 MB gross sein.');
      e.target.value = '';
      return;
    }

    onUpload?.(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative group">
        <Avatar className="h-24 w-24 cursor-pointer" onClick={handleClick}>
          {avatarUrl && <AvatarImage src={avatarUrl} alt="Avatar" />}
          <AvatarFallback className="text-xl font-semibold">{initials || '?'}</AvatarFallback>
        </Avatar>

        {/* Hover overlay */}
        <div
          onClick={handleClick}
          className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
        >
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          ) : (
            <Camera className="h-6 w-6 text-white" />
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={handleFileChange}
        disabled={isLoading}
      />

      {avatarUrl && onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={isLoading}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Entfernen
        </Button>
      )}
    </div>
  );
}
