'use client';

import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { useCIAudit } from '../../hooks/useCIQueries';

const STATUS_VARIANT = {
  passed: 'default',
  warning: 'secondary',
  failed: 'destructive',
};

function statusIcon(status) {
  if (status === 'passed') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === 'failed') return <AlertTriangle className="h-4 w-4 text-destructive" />;
  return <AlertTriangle className="h-4 w-4 text-amber-500" />;
}

export function CIAuditPanel() {
  const { t } = useLanguage();
  const { data, isLoading } = useCIAudit();
  const issues = [
    ...(data?.checks || []).filter((check) => check.status !== 'passed'),
    ...(data?.templates || []).flatMap((template) => (
      template.checks
        .filter((check) => check.status !== 'passed')
        .map((check) => ({ ...check, templateName: template.name }))
    )),
  ].slice(0, 6);

  if (isLoading) return <Skeleton className="h-32 rounded-lg" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">{t('doctpl.ci.auditTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('doctpl.ci.auditDesc')}</p>
          </div>
        </div>
        <Badge variant={STATUS_VARIANT[data?.summary?.status] || 'secondary'}>
          {t(`doctpl.ci.auditStatus.${data?.summary?.status || 'warning'}`)}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          ['doctpl.ci.auditTemplates', data?.summary?.templates ?? 0],
          ['doctpl.ci.auditAssets', data?.summary?.assets ?? 0],
          ['doctpl.ci.auditIssues', data?.summary?.issues ?? 0],
        ].map(([labelKey, value]) => (
          <div key={labelKey} className="rounded-lg border bg-background/70 px-3 py-2">
            <p className="text-lg font-semibold">{value}</p>
            <p className="text-[11px] text-muted-foreground">{t(labelKey)}</p>
          </div>
        ))}
      </div>

      {issues.length ? (
        <div className="space-y-1.5">
          {issues.map((issue) => (
            <div key={`${issue.key}-${issue.templateName || 'config'}`} className="flex gap-2 rounded-lg border px-3 py-2">
              {statusIcon(issue.status)}
              <div className="min-w-0">
                <p className="text-xs font-medium">
                  {issue.templateName ? `${issue.templateName}: ` : ''}{issue.label}
                </p>
                <p className="text-[11px] text-muted-foreground">{issue.message}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
          {t('doctpl.ci.auditClean')}
        </p>
      )}
    </div>
  );
}
