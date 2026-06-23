'use client';

import { useMemo, useState } from 'react';
import { Eye, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { DocumentPreviewDrawer } from '../DocumentPreviewDrawer';
import { useTemplateVersionComparison, useTemplateVersions } from '../../hooks/useTemplateQueries';
import { usePreviewTemplateVersion, useRevertTemplate } from '../../hooks/useTemplateMutations';
import { formatSwissDate } from '../../utils/localization';

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string') return value.replace(/<[^>]*>/g, '').slice(0, 120);
  return JSON.stringify(value).slice(0, 120);
}

export function TemplateVersionHistory({ templateId, expectedVersion, canRevert = true }) {
  const { t, locale } = useLanguage();
  const { data, isLoading } = useTemplateVersions(templateId);
  const revert = useRevertTemplate();
  const previewVersion = usePreviewTemplateVersion();
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [preview, setPreview] = useState(null);
  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const currentVersion = useMemo(
    () => items.find((item) => item.isCurrent)?.version || Math.max(0, ...items.map((item) => Number(item.version || 0))),
    [items],
  );
  const comparisonParams = useMemo(() => (
    selectedVersion && currentVersion && selectedVersion !== currentVersion
      ? { fromVersion: selectedVersion, toVersion: currentVersion }
      : null
  ), [currentVersion, selectedVersion]);
  const comparison = useTemplateVersionComparison(templateId, comparisonParams, !!comparisonParams);

  const handlePreview = async (version) => {
    const response = await previewVersion.mutateAsync({
      id: templateId,
      version,
      sampleData: {},
      language: locale || 'de',
    });
    setPreview({
      url: response?.data?.downloadUrl,
      fileName: `template_v${version}.pdf`,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t('doctpl.version.loading')}
      </div>
    );
  }

  if (!items.length) {
    return <div className="text-xs text-muted-foreground py-3">{t('doctpl.version.empty')}</div>;
  }

  return (
    <>
      <div className="space-y-3">
        <div className="space-y-1.5 max-h-[42vh] overflow-y-auto pr-1">
        {items.map((version) => {
          const isCurrent = version.isCurrent || Number(version.version) === Number(currentVersion);
          return (
            <div key={version._id} className="rounded-lg border border-border/70 bg-background/70 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">v{version.version}</span>
                    {isCurrent && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {t('doctpl.version.current')}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatSwissDate(version.createdAt, locale)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {version.changeDescription || t('doctpl.version.noDescription')}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {t('doctpl.version.by', null, {
                      value: version.createdBy?.name || version.createdBy?.email || version.createdBy || '-',
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title={t('doctpl.version.preview', 'Preview v{value}', { value: version.version })}
                    disabled={previewVersion.isPending}
                    onClick={() => handlePreview(version.version)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  {!isCurrent && (
                    <Button
                      size="sm"
                      variant={selectedVersion === version.version ? 'default' : 'outline'}
                      className="h-7 px-2 text-xs"
                      onClick={() => setSelectedVersion(version.version)}
                    >
                      {t('doctpl.version.compare')}
                    </Button>
                  )}
                  {canRevert && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title={t('doctpl.version.revertTo', null, { value: version.version })}
                      disabled={isCurrent || revert.isPending}
                      onClick={() => revert.mutate({ id: templateId, version: version.version, expectedVersion })}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        </div>

        {comparisonParams && (
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">
              {t('doctpl.version.compareTitle', null, {
                from: comparisonParams.fromVersion,
                to: comparisonParams.toVersion,
              })}
            </p>
            {comparison.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          {!comparison.isFetching && !comparison.data?.changes?.length ? (
            <p className="text-xs text-muted-foreground">{t('doctpl.version.noChanges')}</p>
          ) : (
            <div className="space-y-1.5">
              {(comparison.data?.changes || []).slice(0, 8).map((change) => (
                <div key={`${change.path}-${change.type}`} className="rounded-md bg-background/80 px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px]">{change.path}</span>
                    <span className="text-[10px] uppercase text-muted-foreground">{change.type}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                    {formatValue(change.before)} {'->'} {formatValue(change.after)}
                  </p>
                </div>
              ))}
              {(comparison.data?.changes?.length || 0) > 8 && (
                <p className="text-[11px] text-muted-foreground">
                  {t('doctpl.version.moreChanges', null, { value: comparison.data.changes.length - 8 })}
                </p>
              )}
            </div>
          )}
          </div>
        )}
      </div>
      <DocumentPreviewDrawer
        open={!!preview}
        url={preview?.url}
        fileName={preview?.fileName}
        onClose={() => setPreview(null)}
      />
    </>
  );
}
