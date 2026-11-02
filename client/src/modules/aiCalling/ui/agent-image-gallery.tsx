'use client';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Sparkles, Trash2, Upload } from 'lucide-react';
import { callingAgentApi } from '../services/calling-agent-api';
import type { AgentImage } from '../types/ai-calling-types';
import { AgentDialog, AgentTabs, primaryClass, secondaryClass, readableError } from './calling-agent-primitives';

export function AgentImageGallery({ selectedId, onSelect, onClose, canManage = true }: { selectedId?: string | null; onSelect: (image: AgentImage) => void; onClose: () => void; canManage?: boolean }) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState(selectedId && !selectedId.startsWith('preset:') ? 'uploads' : 'premium');
  const [category, setCategory] = useState('all');
  const presets = useQuery({ queryKey: ['ai-calling', 'agent-avatar-presets'], queryFn: callingAgentApi.presets, staleTime: 60 * 60 * 1000 });
  const images = useQuery({ queryKey: ['ai-calling', 'agent-images', page], queryFn: () => callingAgentApi.images(page), enabled: tab === 'uploads' });
  const [preview, setPreview] = useState<AgentImage | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: (file: File) => callingAgentApi.uploadImage(file, setProgress),
    onSuccess: image => { setTab('uploads'); setPage(1); setPreview(image); void qc.invalidateQueries({ queryKey: ['ai-calling', 'agent-images'] }); },
    onError: e => setError(readableError(e)),
  });
  const remove = useMutation({ mutationFn: callingAgentApi.removeImage, onSuccess: () => {
    if (preview?._id === removeId) setPreview(null);
    setRemoveId(null); void qc.invalidateQueries({ queryKey: ['ai-calling', 'agent-images'] });
  }, onError: e => setError(readableError(e)) });
  return <AgentDialog title="Image gallery" description="Give your agent a face. Choose a premium portrait or an image from your private library." onClose={onClose} wide>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">JPG, PNG or WebP · up to 5 MB</p>
        <input ref={fileInput} aria-label="Upload avatar image" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e => {
          const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
          setError(null);
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('Choose a JPG, PNG or WebP image up to 5 MB.'); return; }
          setProgress(0); upload.mutate(file);
        }} />
        <button type="button" disabled={upload.isPending || !canManage} onClick={() => fileInput.current?.click()} className={secondaryClass}>{upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{upload.isPending ? `Uploading ${progress}%` : 'Upload image'}</button></div>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      <AgentTabs label="Avatar collections" value={tab} onChange={value => { setTab(value); setPreview(null); }} items={[{ value: 'premium', label: 'Premium avatars' }, { value: 'uploads', label: 'My uploads' }]}>
      {tab === 'premium' && <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 text-xs text-primary"><Sparkles className="h-4 w-4" />Crafted for your next conversation</p><div className="flex gap-1 rounded-lg border border-border p-1">{[{ value: 'all', label: 'All' }, { value: 'people', label: 'People' }, { value: 'ai', label: 'AI companions' }].map(item => <button key={item.value} type="button" aria-pressed={category === item.value} onClick={() => setCategory(item.value)} className={`rounded-md px-3 py-1.5 text-xs transition ${category === item.value ? 'bg-blue-500/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>{item.label}</button>)}</div></div>
        {presets.isLoading && <p role="status" className="text-sm text-muted-foreground">Loading premium avatars…</p>}
        {presets.isError && <p role="alert" className="text-sm text-rose-300">Premium avatars could not be loaded. <button className="underline" onClick={() => presets.refetch()}>Try again</button></p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{presets.data?.filter(image => category === 'all' || image.category === category).map(image => <button key={image._id} type="button" aria-label={`Preview ${image.name}`} aria-pressed={preview?._id === image._id} onClick={() => setPreview(image)} className={`group relative overflow-hidden rounded-xl border bg-card text-start transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-sky-400 ${preview?._id === image._id || selectedId === image._id ? 'border-sky-400 ring-1 ring-sky-400/40' : 'border-border hover:border-sky-400/50'}`}>
          <img src={image.thumbnailUrl || image.url} width={256} height={256} alt={image.name} loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
          <div className="p-3"><p className="text-sm font-medium">{image.name}</p><p className="mt-1 text-xs text-muted-foreground">{image.description}</p></div>
          {selectedId === image._id && <span className="absolute end-2 top-2 rounded-full bg-blue-600 p-1.5"><Check className="h-3 w-3" /></span>}
        </button>)}</div>
      </div>}
      {tab === 'uploads' && <div className="space-y-4">
      {images.isLoading && <p role="status" className="text-sm text-muted-foreground">Loading your images…</p>}
      {images.isError && <div role="alert" className="text-sm text-rose-300">Images could not be loaded. <button type="button" onClick={() => images.refetch()} className="underline">Try again</button></div>}
      {images.isSuccess && !images.data.data.length && <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Upload your first image to build your avatar gallery.</div>}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">{images.data?.data.map(image => <div key={image._id} className="relative">
        <button type="button" aria-label={`Preview ${image.name}`} aria-pressed={preview?._id === image._id} onClick={() => setPreview(image)} className={`aspect-square w-full overflow-hidden rounded-xl border-2 ${preview?._id === image._id || selectedId === image._id ? 'border-sky-400' : 'border-transparent'} focus-visible:outline-2 focus-visible:outline-sky-400`}><img src={image.url} alt={image.name} className="h-full w-full object-cover" /></button>
        {selectedId === image._id && <span className="absolute start-1 top-1 rounded-full bg-blue-600 p-1"><Check className="h-3 w-3" /></span>}
        {canManage && <button type="button" aria-label={`Remove ${image.name} from gallery`} onClick={() => setRemoveId(image._id)} className="absolute bottom-2 end-1 rounded-md bg-black/70 p-1.5 text-foreground hover:text-rose-300"><Trash2 className="h-3 w-3" /></button>}
      </div>)}</div>
      {images.data && images.data.pagination.pages > 1 && <div className="flex items-center justify-between text-xs text-muted-foreground"><button className={secondaryClass} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous images</button><span>Page {page} of {images.data.pagination.pages}</span><button className={secondaryClass} disabled={page >= images.data.pagination.pages} onClick={() => setPage(p => p + 1)}>Next images</button></div>}
      </div>}
      </AgentTabs>
      {removeId && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/20 p-3 text-xs text-amber-200"><span className="flex-1">Remove this image from the gallery? Existing agent avatars and campaign history retain it.</span><button className={secondaryClass} onClick={() => setRemoveId(null)}>Keep image</button><button className={secondaryClass} disabled={remove.isPending} onClick={() => remove.mutate(removeId)}>Remove image</button></div>}
      {preview && <div className="flex flex-wrap items-center gap-5 rounded-xl border border-border p-4"><img src={preview.url} width={112} height={112} alt="Avatar preview" className="h-28 w-28 rounded-xl object-cover" /><div className="min-w-0 flex-1"><p className="mb-3 text-sm font-medium">{preview.name}</p><p className="mb-3 text-xs text-muted-foreground">{preview.description || 'Your uploaded image'}</p><button className={primaryClass} onClick={() => { onSelect(preview); onClose(); }}>Use as avatar</button></div></div>}
    </div>
  </AgentDialog>;
}
