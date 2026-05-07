'use client';
import { useRef } from 'react';
import { Upload, Trash2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCIAssets } from '../../hooks/useCIQueries';
import { useUploadCIAsset, useDeleteCIAsset } from '../../hooks/useCIMutations';

const ASSET_DEFS = [
  { type: 'logo_rgb',  label: 'Logo (RGB PNG)',   accept: 'image/png,image/jpeg' },
  { type: 'logo_cmyk', label: 'Logo (CMYK EPS)',  accept: '.eps,application/postscript' },
  { type: 'font_300',  label: 'Museo Sans 300 (Light)',  accept: '.ttf,.otf' },
  { type: 'font_500',  label: 'Museo Sans 500 (Medium)', accept: '.ttf,.otf' },
  { type: 'font_700',  label: 'Museo Sans 700 (Bold)',   accept: '.ttf,.otf' },
];

export function CIAssetUploader() {
  const { data: assets = [] } = useCIAssets();
  const upload = useUploadCIAsset();
  const del    = useDeleteCIAsset();
  const fileRefs = useRef({});

  const getAsset = (type) => assets.find((a) => a.assetType === type);

  const handleUpload = (type, file) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('assetType', type);
    upload.mutate(fd);
  };

  return (
    <div className="space-y-2">
      {ASSET_DEFS.map(({ type, label, accept }) => {
        const existing = getAsset(type);
        return (
          <div key={type} className="flex items-center justify-between rounded-lg border px-4 py-3 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {existing
                ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                : <Upload className="h-4 w-4 text-muted-foreground shrink-0" />}
              <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                {existing && <p className="text-xs text-muted-foreground truncate">{existing.fileName}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                ref={(el) => { fileRefs.current[type] = el; }}
                type="file" accept={accept} className="hidden"
                onChange={(e) => { if (e.target.files[0]) handleUpload(type, e.target.files[0]); }}
              />
              <Button size="sm" variant="outline" onClick={() => fileRefs.current[type]?.click()}>
                {existing ? 'Replace' : 'Upload'}
              </Button>
              {existing && (
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => del.mutate(existing._id)}>
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
