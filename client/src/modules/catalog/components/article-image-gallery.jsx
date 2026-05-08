'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { articleService } from '../services/article-service';
import { Trash2, ImagePlus } from 'lucide-react';
import { useRef } from 'react';

export function ArticleImageGallery({ articleId, onUpload, onDelete }) {
  const fileRef = useRef(null);
  const { data: images = [] } = useQuery({
    queryKey: queryKeys.catalog.articleImages(articleId),
    queryFn: () => articleService.listImages(articleId).then((r) => r.data ?? r),
    enabled: !!articleId,
  });

  return (
    <div className="flex flex-wrap gap-2">
      {images.map((img) => (
        <div key={img._id} className="relative group w-20 h-20">
          <img
            src={img.url}
            alt={img.originalName}
            className="w-full h-full object-cover rounded-md border"
          />
          <button
            type="button"
            onClick={() => onDelete(img._id)}
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
        <span className="text-xs mt-1">Add</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
