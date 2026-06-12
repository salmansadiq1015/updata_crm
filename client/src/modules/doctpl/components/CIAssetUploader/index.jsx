'use client';

import { useRef } from 'react';
import { CheckCircle2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { useCIAssets } from '../../hooks/useCIQueries';
import { useDeleteCIAsset, useUploadCIAsset } from '../../hooks/useCIMutations';

const ASSET_DEFS = [
  { type: 'logo_png', label: 'Logo (PNG)', accept: 'image/png' },
  { type: 'logo_rgb', label: 'Logo (RGB PNG/JPEG)', accept: 'image/png,image/jpeg' },
  { type: 'logo_cmyk', label: 'Logo (CMYK EPS)', accept: '.eps,application/postscript,image/x-eps' },
  { type: 'font_300', label: 'Museo Sans 300 (Light)', accept: '.ttf,.otf,font/ttf,font/otf' },
  { type: 'font_500', label: 'Museo Sans 500 (Medium)', accept: '.ttf,.otf,font/ttf,font/otf' },
  { type: 'font_700', label: 'Museo Sans 700 (Bold)', accept: '.ttf,.otf,font/ttf,font/otf' },
];

export function CIAssetUploader() {
  const { t } = useLanguage();
  const { data: assets = [] } = useCIAssets();
  const upload = useUploadCIAsset();
  const del = useDeleteCIAsset();
  const fileRefs = useRef({});

  const getAsset = (type) => assets.find((asset) => asset.assetType === type);

  const handleUpload = (type, file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('assetType', type);
    upload.mutate(formData);
  };

  return (
    <div className="space-y-2">
      {ASSET_DEFS.map(({ type, label, accept }) => {
        const existing = getAsset(type);
        return (
          <div key={type} className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              {existing
                ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                : <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                {existing && <p className="truncate text-xs text-muted-foreground">{existing.fileName}</p>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <input
                ref={(element) => { fileRefs.current[type] = element; }}
                type="file"
                accept={accept}
                className="hidden"
                onChange={(event) => {
                  if (event.target.files?.[0]) handleUpload(type, event.target.files[0]);
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileRefs.current[type]?.click()}
                disabled={upload.isPending}
              >
                {existing ? t('doctpl.ci.replace') : t('doctpl.ci.upload')}
              </Button>
              {existing && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive"
                  onClick={() => del.mutate(existing._id)}
                  disabled={del.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
