'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { articleService } from '../services/article-service';
import { Trash2, ImagePlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { showError } from '@/lib/toast';
import Image from 'next/image';
import { useLanguage } from '@/lib/i18n/language-context';

export function ArticleImageGallery({ articleId, onUpload, onDelete }) {
  const { t } = useLanguage();
  const fileRef = useRef(null);
  const [deletingId, setDeletingId] = useState(null);
  const { data: images = [] } = useQuery({
    queryKey: queryKeys.catalog.articleImages(articleId),
    queryFn: () => articleService.listImages(articleId).then((r) => r.data ?? r),
    enabled: !!articleId,
  });

  return (
    <div className="flex flex-wrap gap-2">
      {images.map((img) => (
        <div key={img._id} className="relative group w-20 h-20">
          <Image
            src={img.url}
            alt={img.originalName || t('catalog.images.articleAlt')}
            fill
            sizes="80px"
            unoptimized
            className="rounded-md border object-cover"
          />
          <button
            type="button"
            onClick={async () => {
              setDeletingId(img._id);
              try { await onDelete(img._id); } finally { setDeletingId(null); }
            }}
            disabled={deletingId === img._id}
            className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full bg-destructive text-destructive-foreground"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="w-20 h-20 flex flex-col items-center justify-center rounded-md border border-dashed text-muted-foreground hover:border-primary hover:text-primary transition-colors"
      >
        <ImagePlus className="w-5 h-5" />
        <span className="text-xs mt-1">{t('common.add')}</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 2 * 1024 * 1024) {
            showError(t('catalog.images.fileTooLarge'));
            e.target.value = '';
            return;
          }
          onUpload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
