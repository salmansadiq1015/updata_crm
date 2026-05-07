'use client';
import Link from 'next/link';
import { Settings2, FileText, ToggleLeft, ToggleRight } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTemplates } from '@/modules/doctpl/hooks/useTemplateQueries';
import { useUpdateTemplate } from '@/modules/doctpl/hooks/useTemplateMutations';

const TYPE_LABELS = {
  quotation: 'Quotation', order_confirmation: 'Order Confirmation',
  invoice_standard: 'Invoice', invoice_advance: 'Advance Invoice',
  invoice_final: 'Final Invoice', cover_letter: 'Cover Letter',
  service_report: 'Service Report', inspection_certificate: 'Inspection Certificate',
};

export default function AdminTemplatesPage() {
  const { data, isLoading } = useTemplates();
  const update = useUpdateTemplate();
  const templates = data?.items ?? [];

  const toggleActive = (t) => update.mutate({
    id: t._id,
    isActive: !t.isActive,
    changeDescription: `${t.isActive ? 'Deactivated' : 'Activated'} template`,
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          title="Document Templates"
          description="Manage PDF templates for all document types"
        />
        <Link href="/admin/templates/ci">
          <Button variant="outline" className="gap-2">
            <Settings2 className="h-4 w-4" />CI Configuration
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No templates found. Run the seed script to initialise defaults.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <div key={t._id} className="rounded-xl border bg-card p-5 flex flex-col gap-3 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium text-sm truncate">{t.name}</span>
                </div>
                <Badge variant={t.isActive ? 'default' : 'secondary'} className="shrink-0">
                  {t.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{TYPE_LABELS[t.templateType] || t.templateType}</p>
              <p className="text-xs text-muted-foreground">
                v{t.currentVersion} · {t.updatedAt ? new Date(t.updatedAt).toLocaleDateString('de-CH') : '—'}
              </p>
              <div className="flex gap-2 mt-auto pt-3 border-t">
                <Link href={`/admin/templates/${t._id}`} className="flex-1">
                  <Button size="sm" variant="outline" className="w-full">Edit</Button>
                </Link>
                <Button
                  size="icon" variant="ghost" className="h-8 w-8"
                  title={t.isActive ? 'Deactivate' : 'Activate'}
                  onClick={() => toggleActive(t)}
                >
                  {t.isActive
                    ? <ToggleRight className="h-4 w-4 text-green-500" />
                    : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
