'use client';

import { useState } from 'react';
import { useFieldOpsOrderPhotos } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useLanguage } from '@/lib/i18n/language-context';
import { ImageOff } from 'lucide-react';

const CATEGORY_LABELS = {
  BEFORE: { de: 'Vorher', en: 'Before' },
  AFTER: { de: 'Nachher', en: 'After' },
  DAMAGE: { de: 'Schaden', en: 'Damage' },
  INSTALLATION: { de: 'Installation', en: 'Installation' },
  GENERAL: { de: 'Allgemein', en: 'General' },
  NAMEPLATE: { de: 'Typenschild', en: 'Nameplate' },
};

export function FieldOpsPhotoGallery({ orderId }) {
  const { language } = useLanguage();
  const { data: photos = [], isLoading } = useFieldOpsOrderPhotos(orderId);
  const [lightbox, setLightbox] = useState(null);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {[1,2,3,4,5,6].map((i) => <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />)}
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <ImageOff className="h-8 w-8" />
        <p className="text-sm">{language === 'de' ? 'Keine Fotos vorhanden.' : 'No photos.'}</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {photos.map((photo) => {
          const url = photo.remote_file_url || photo.remoteFileUrl || photo.local_file_path;
          const cat = CATEGORY_LABELS[photo.category];
          return (
            <button
              key={photo._id || photo.id}
              onClick={() => setLightbox(photo)}
              className="group relative aspect-square rounded-lg overflow-hidden border hover:ring-2 hover:ring-primary transition-all"
            >
              <img src={url} alt={photo.caption || photo.category} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
              {cat && (
                <span className="absolute bottom-1 left-1 text-[9px] font-bold uppercase tracking-wider bg-black/60 text-white rounded px-1.5 py-0.5">
                  {language === 'de' ? cat.de : cat.en}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <Dialog open={!!lightbox} onOpenChange={(v) => { if (!v) setLightbox(null); }}>
        <DialogContent className="max-w-3xl p-2 bg-black border-0">
          {lightbox && (
            <div className="space-y-2">
              <img
                src={lightbox.remote_file_url || lightbox.remoteFileUrl || lightbox.local_file_path}
                alt={lightbox.caption || lightbox.category}
                className="w-full max-h-[70vh] object-contain rounded"
              />
              {lightbox.caption && <p className="text-sm text-white/70 px-2 pb-2">{lightbox.caption}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
