'use client';

import Link from 'next/link';
import { FileText, Settings2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { PageHeader } from '@/shared/components/page-header';
import { useTemplates } from '@/modules/doctpl/hooks/useTemplateQueries';
import { useUpdateTemplate } from '@/modules/doctpl/hooks/useTemplateMutations';

export default function AdminTemplatesPage() {
  const { t, locale } = useLanguage();
  const { data, isLoading } = useTemplates();
  const update = useUpdateTemplate();
  const templates = data?.items ?? [];
  const dateLocale = locale === 'de' ? 'de-CH' : 'en-CH';

  const toggleActive = (template) => update.mutate({
    id: template._id,
    isActive: !template.isActive,
    changeDescription: template.isActive
      ? t('doctpl.templates.deactivated')
      : t('doctpl.templates.activated'),
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          title={t('doctpl.templates.title')}
          description={t('doctpl.templates.description')}
        />
        <Link href="/admin/templates/ci">
          <Button variant="outline" className="gap-2">
            <Settings2 className="h-4 w-4" />
            {t('doctpl.templates.ciConfiguration')}
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('doctpl.templates.empty')}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <div
              key={template._id}
              className="flex flex-col gap-3 rounded-lg border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{template.name}</span>
                </div>
                <Badge variant={template.isActive ? 'default' : 'secondary'} className="shrink-0">
                  {template.isActive ? t('doctpl.templates.active') : t('doctpl.templates.inactive')}
                </Badge>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t(`doctpl.type.${template.templateType}`, template.templateType)}
                </p>
                <p className="text-xs text-muted-foreground">
                  v{template.currentVersion} - {template.updatedAt ? new Date(template.updatedAt).toLocaleDateString(dateLocale) : '-'}
                </p>
              </div>

              <div className="mt-auto flex gap-2 border-t pt-3">
                <Link href={`/admin/templates/${template._id}`} className="flex-1">
                  <Button size="sm" variant="outline" className="w-full">
                    {t('doctpl.templates.edit')}
                  </Button>
                </Link>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  title={template.isActive ? t('doctpl.templates.deactivate') : t('doctpl.templates.activate')}
                  onClick={() => toggleActive(template)}
                  disabled={update.isPending}
                >
                  {template.isActive
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
