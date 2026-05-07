'use client';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTemplateVersions } from '../../hooks/useTemplateQueries';
import { useRevertTemplate } from '../../hooks/useTemplateMutations';

export function TemplateVersionHistory({ templateId }) {
  const { data, isLoading } = useTemplateVersions(templateId);
  const revert = useRevertTemplate();
  const items = data?.items ?? [];

  if (isLoading) return <div className="text-xs text-muted-foreground py-2">Loading versions…</div>;
  if (!items.length) return <div className="text-xs text-muted-foreground py-2">No version history yet.</div>;

  return (
    <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
      {items.map((v) => (
        <div key={v._id} className="flex items-start justify-between gap-2 rounded-lg border px-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">v{v.version}</span>
              <span className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleDateString('de-CH')}</span>
              <span className="text-xs text-muted-foreground">by {v.createdBy?.name || v.createdBy?.email || v.createdBy || '—'}</span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{v.changeDescription || 'No description'}</p>
          </div>
          <Button
            size="icon" variant="ghost" className="h-6 w-6 shrink-0"
            title={`Revert to v${v.version}`}
            disabled={revert.isPending}
            onClick={() => revert.mutate({ id: templateId, version: v.version })}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}
