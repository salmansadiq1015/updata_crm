'use client';

import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { useParams } from 'next/navigation';
import {
  Camera,
  Upload,
  Trash2,
  ImageIcon,
  X,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Pencil,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { EmptyState } from '@/modules/mobile/components/empty-state';
import { usePhotoMutations } from '@/modules/mobile/hooks/use-photo-mutations';
import { useOrderPhotos } from '@/modules/mobile/hooks/use-photo-queries';
import { PHOTO_CATEGORY } from '@/modules/mobile/constants/mobile-constants';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const PhotoAnnotator = lazy(() =>
  import('@/modules/mobile/components/photo-annotator').then((m) => ({ default: m.PhotoAnnotator }))
);

const CATEGORY_LABELS = {
  [PHOTO_CATEGORY.BEFORE]: { de: 'Vorher', en: 'Before' },
  [PHOTO_CATEGORY.AFTER]: { de: 'Nachher', en: 'After' },
  [PHOTO_CATEGORY.DAMAGE]: { de: 'Schaden', en: 'Damage' },
  [PHOTO_CATEGORY.INSTALLATION]: { de: 'Installation', en: 'Installation' },
  [PHOTO_CATEGORY.GENERAL]: { de: 'Allgemein', en: 'General' },
  [PHOTO_CATEGORY.NAMEPLATE]: { de: 'Typenschild', en: 'Nameplate' },
};

export default function PhotosPage() {
  const { id: orderId } = useParams();
  const { t, locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';

  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState(null);

  const { data: photos, isLoading } = useOrderPhotos(orderId);

  const { uploadPhoto, deletePhoto } = usePhotoMutations(orderId);

  const allPhotos = photos || [];
  const filtered =
    selectedCategory === 'ALL'
      ? allPhotos
      : allPhotos.filter((p) => p.category === selectedCategory);

  return (
    <div className="flex flex-col min-h-full">
      <MobileHeader
        title={t('mobile.photos.title', 'Fotos')}
        showBack
        right={
          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-lg">
            {allPhotos.length}
          </span>
        }
      />

      {/* Category filter */}
      <div className="px-4 py-3 border-b border-border overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          <FilterChip
            active={selectedCategory === 'ALL'}
            onClick={() => setSelectedCategory('ALL')}
            label={lang === 'de' ? 'Alle' : 'All'}
            count={allPhotos.length}
          />
          {Object.entries(CATEGORY_LABELS).map(([key, labels]) => {
            const count = allPhotos.filter((p) => p.category === key).length;
            return (
              <FilterChip
                key={key}
                active={selectedCategory === key}
                onClick={() => setSelectedCategory(key)}
                label={labels[lang]}
                count={count}
              />
            );
          })}
        </div>
      </div>

      {/* Photo grid */}
      <div className="flex-1 overflow-y-auto pb-32">
        {isLoading ? (
          <PhotoGridSkeleton />
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyState
              variant="empty"
              title={lang === 'de' ? 'Keine Fotos' : 'No photos'}
              description={
                lang === 'de'
                  ? 'Nehmen Sie Fotos auf oder laden Sie Bilder hoch.'
                  : 'Take photos or upload images.'
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1 p-1">
            {filtered.map((photo, idx) => (
              <PhotoThumbnail
                key={photo.id}
                photo={photo}
                lang={lang}
                onClick={() => setViewingPhoto(idx)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Capture buttons */}
      <div className="fixed bottom-16 left-0 right-0 bg-background border-t border-border px-4 py-3 flex gap-2 z-30">
        <Button
          className="flex-1"
          onClick={() => setShowUploadForm(true)}
        >
          <Camera className="h-4 w-4 mr-1.5" />
          {lang === 'de' ? 'Foto aufnehmen' : 'Take Photo'}
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => setShowUploadForm(true)}
        >
          <Upload className="h-4 w-4 mr-1.5" />
          {lang === 'de' ? 'Hochladen' : 'Upload'}
        </Button>
      </div>

      {/* Upload form overlay */}
      {showUploadForm && (
        <PhotoUploadForm
          orderId={orderId}
          lang={lang}
          onClose={() => setShowUploadForm(false)}
          uploadPhoto={uploadPhoto}
        />
      )}

      {/* Full-screen photo viewer */}
      {viewingPhoto !== null && (
        <PhotoViewer
          photos={filtered}
          initialIndex={viewingPhoto}
          lang={lang}
          onClose={() => setViewingPhoto(null)}
          onDelete={(id) => {
            deletePhoto.mutate(id);
            setViewingPhoto(null);
          }}
        />
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label, count }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground active:bg-muted/80'
      )}
    >
      {label}
      {count > 0 && (
        <span className={cn('text-[10px]', active ? 'text-primary-foreground/70' : 'text-muted-foreground/60')}>
          {count}
        </span>
      )}
    </button>
  );
}

function PhotoThumbnail({ photo, lang, onClick }) {
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    if (photo.thumbnail_blob) {
      const url = URL.createObjectURL(photo.thumbnail_blob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [photo.thumbnail_blob]);

  const thumbnailSrc = blobUrl || photo.thumbnail_url || photo.url;

  return (
    <button
      onClick={onClick}
      className="relative aspect-square bg-muted rounded-lg overflow-hidden group"
    >
      {thumbnailSrc ? (
        <img
          src={thumbnailSrc}
          alt={photo.caption || ''}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/60 to-transparent px-1.5 py-1">
        <span className="text-[10px] font-medium text-white">
          {CATEGORY_LABELS[photo.category]?.[lang] || photo.category}
        </span>
      </div>
      {photo.sync_status === 'PENDING_SYNC' && (
        <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-400" />
      )}
    </button>
  );
}

function PhotoUploadForm({ orderId, lang, onClose, uploadPhoto }) {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [category, setCategory] = useState(PHOTO_CATEGORY.GENERAL);
  const [caption, setCaption] = useState('');

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error(lang === 'de' ? 'Bitte Foto auswählen' : 'Please select a photo');
      return;
    }
    try {
      await uploadPhoto.mutateAsync({
        file: selectedFile,
        category,
        caption,
      });
      onClose();
    } catch {
      // toast handled by mutation
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="w-full max-w-lg bg-background rounded-t-2xl p-6 space-y-4 animate-in slide-in-from-bottom duration-200 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {lang === 'de' ? 'Foto hinzufügen' : 'Add Photo'}
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-11 w-11 p-0" aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {preview ? (
          <div className="relative">
            <img src={preview} alt="Preview" className="w-full rounded-xl max-h-64 object-contain bg-muted" />
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2 h-11 w-11 p-0 bg-black/50 text-white hover:bg-black/70"
              onClick={() => {
                setSelectedFile(null);
                setPreview(null);
              }}
              aria-label="Clear preview"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex-1 flex flex-col items-center gap-2 py-8 border-2 border-dashed border-border rounded-xl bg-muted/20 active:bg-muted/40 transition-colors"
            >
              <Camera className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">
                {lang === 'de' ? 'Kamera' : 'Camera'}
              </span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex flex-col items-center gap-2 py-8 border-2 border-dashed border-border rounded-xl bg-muted/20 active:bg-muted/40 transition-colors"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">
                {lang === 'de' ? 'Galerie' : 'Gallery'}
              </span>
            </button>
          </div>
        )}

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORY_LABELS).map(([key, labels]) => (
              <SelectItem key={key} value={key}>
                {labels[lang]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder={lang === 'de' ? 'Beschreibung (optional)' : 'Caption (optional)'}
          className="h-11"
        />

        <Button
          className="w-full"
          onClick={handleUpload}
          disabled={!selectedFile || uploadPhoto.isPending}
        >
          <Upload className="h-4 w-4 mr-1.5" />
          {uploadPhoto.isPending
            ? (lang === 'de' ? 'Wird gespeichert...' : 'Saving...')
            : (lang === 'de' ? 'Foto speichern' : 'Save Photo')}
        </Button>
      </div>
    </div>
  );
}

function PhotoViewer({ photos, initialIndex, lang, onClose, onDelete }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const photo = photos[currentIndex];
  const [blobUrl, setBlobUrl] = useState(null);
  const [annotating, setAnnotating] = useState(false);

  useEffect(() => {
    if (photo?.local_file_blob) {
      const url = URL.createObjectURL(photo.local_file_blob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setBlobUrl(null);
  }, [photo?.local_file_blob]);

  if (!photo) return null;

  const imgSrc = blobUrl || photo.url;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onClose} className="h-11 w-11 p-0 text-white hover:bg-white/10" aria-label="Close">
          <X className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost" size="sm"
            onClick={() => setAnnotating(true)}
            className="h-11 w-11 p-0 text-white hover:bg-white/10"
            aria-label="Annotate"
          >
            <Pencil className="h-5 w-5" />
          </Button>
          <span className="text-sm text-white/70">
            {currentIndex + 1} / {photos.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(photo.id)}
          className="h-11 w-11 p-0 text-red-400 hover:bg-white/10"
          aria-label="Delete"
        >
          <Trash2 className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 flex items-center justify-center relative px-2">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={photo.caption || ''}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <ImageIcon className="h-16 w-16 text-white/30" />
        )}

        {currentIndex > 0 && (
          <button
            onClick={() => setCurrentIndex((i) => i - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50"
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-6 w-6 text-white" />
          </button>
        )}
        {currentIndex < photos.length - 1 && (
          <button
            onClick={() => setCurrentIndex((i) => i + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50"
            aria-label="Next photo"
          >
            <ChevronRight className="h-6 w-6 text-white" />
          </button>
        )}
      </div>

      <div className="px-4 py-3 bg-black/80">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-white/60 bg-white/10 px-2 py-0.5 rounded">
            {CATEGORY_LABELS[photo.category]?.[lang] || photo.category}
          </span>
          {photo.latitude && photo.longitude && (
            <span className="text-xs text-white/40 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {photo.latitude.toFixed(4)}, {photo.longitude.toFixed(4)}
            </span>
          )}
        </div>
        {photo.caption && (
          <p className="text-sm text-white/80">{photo.caption}</p>
        )}
      </div>

      {annotating && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black flex items-center justify-center text-white">Loading...</div>}>
          <PhotoAnnotator
            imageUrl={imgSrc}
            onSave={(blob) => {
              setAnnotating(false);
              // The annotated image can be uploaded as a new version
              // For now, just close the annotator
            }}
            onCancel={() => setAnnotating(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

function PhotoGridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-1 p-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="aspect-square bg-muted rounded-lg animate-pulse" />
      ))}
    </div>
  );
}
