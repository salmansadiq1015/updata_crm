'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { widgetService } from '@/modules/integrations/services/widget-service';
import { queryKeys } from '@/lib/query/keys';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { EmptyState } from '@/shared/components/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { showSuccess, showError } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  ChevronRight, Mail, Phone, MapPin, User, Calendar, Hash,
  CheckCircle2, Globe, Paperclip, Shield, Info,
} from 'lucide-react';
import {
  REQUEST_TYPE_META, PROCESSING_STATUS_META,
} from '@/modules/integrations/constants/widget-constants';

export function WidgetSubmissionDetail() {
  const { id } = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('integrations:widget:manage');

  const { data: submission, isLoading } = useQuery({
    queryKey: queryKeys.integrations.widget.submissionDetail(id),
    queryFn: () => widgetService.getSubmission(id),
    enabled: !!id,
  });

  const processMut = useMutation({
    mutationFn: (body) => widgetService.markProcessed(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.integrations.widget.submissionDetail(id) });
      qc.invalidateQueries({ queryKey: ['integrations', 'widget', 'submissions'] });
      showSuccess('Als bearbeitet markiert');
    },
    onError: (err) => showError(err.message),
  });

  if (isLoading) return <DetailSkeleton />;
  if (!submission) return <EmptyState title="Anfrage nicht gefunden" description="Die angeforderte Anfrage existiert nicht." />;

  const typeMeta = REQUEST_TYPE_META[submission.requestType] || REQUEST_TYPE_META.other;
  const statusMeta = PROCESSING_STATUS_META[submission.processingStatus] || PROCESSING_STATUS_META.pending;
  const TypeIcon = typeMeta.icon;
  const StatusIcon = statusMeta.icon;

  const fullAddress = [
    submission.contactAddress?.street,
    [submission.contactAddress?.zip, submission.contactAddress?.city].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');

  const isPending = submission.processingStatus === 'pending';

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/admin/integrations/widget/submissions" className="hover:text-foreground transition-colors">
          Widget-Anfragen
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium truncate">
          {submission.referenceNumber || submission.contactName}
        </span>
      </nav>

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-theme-sm">
        <div className="flex items-start gap-4 flex-wrap">
          <div className={cn('h-14 w-14 shrink-0 rounded-xl flex items-center justify-center ring-1', typeMeta.bg, 'ring-border')}>
            <TypeIcon className={cn('h-7 w-7', typeMeta.color)} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-xl font-bold tracking-tight">{submission.contactName}</h1>
              <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full', typeMeta.bg, typeMeta.color)}>
                <TypeIcon className="h-3 w-3" /> {typeMeta.label}
              </span>
              <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full', statusMeta.bg, statusMeta.color)}>
                <StatusIcon className="h-3 w-3" /> {statusMeta.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground font-mono">{submission.referenceNumber}</p>
          </div>

          <div className="flex items-center gap-2">
            {canManage && isPending && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => processMut.mutate({})}
                disabled={processMut.isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Als bearbeitet markieren
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Beschreibung</h3>
              </div>
              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                {submission.description}
              </p>
              {submission.preferredWindow && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Wunschtermin
                    </p>
                    <p className="text-sm">{submission.preferredWindow}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {submission.attachments?.length > 0 && (
            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Anhänge ({submission.attachments.length})</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {submission.attachments.map((att, i) => (
                    <div key={i} className="rounded-lg border border-border bg-muted/30 overflow-hidden aspect-square">
                      {att.url ? (
                        <img src={att.url} alt={att.filename || ''} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <Paperclip className="h-6 w-6 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-1">
              <SidebarRow icon={Mail} iconBg="bg-sky-500/10" iconColor="text-sky-500" label="E-Mail" value={submission.contactEmail} href={`mailto:${submission.contactEmail}`} />
              <SidebarRow icon={Phone} iconBg="bg-emerald-500/10" iconColor="text-emerald-500" label="Telefon" value={submission.contactPhone} href={submission.contactPhone ? `tel:${submission.contactPhone}` : null} />
              <SidebarRow icon={MapPin} iconBg="bg-amber-500/10" iconColor="text-amber-500" label="Adresse" value={fullAddress} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-1">
              <SidebarRow
                icon={Calendar}
                iconBg="bg-brand-500/10"
                iconColor="text-brand-500"
                label="Eingegangen"
                value={submission.createdAt ? new Date(submission.createdAt).toLocaleString('de-CH') : null}
              />
              {submission.processedAt && (
                <SidebarRow
                  icon={CheckCircle2}
                  iconBg="bg-emerald-500/10"
                  iconColor="text-emerald-500"
                  label="Bearbeitet"
                  value={new Date(submission.processedAt).toLocaleString('de-CH')}
                />
              )}
              <SidebarRow
                icon={Globe}
                iconBg="bg-sky-500/10"
                iconColor="text-sky-500"
                label="Sprache"
                value={submission.language?.toUpperCase()}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-1">
              <SidebarRow
                icon={Shield}
                iconBg="bg-slate-500/10"
                iconColor="text-slate-500"
                label="CAPTCHA-Score"
                value={submission.captchaScore != null ? submission.captchaScore.toFixed(2) : '—'}
              />
              <SidebarRow
                icon={Hash}
                iconBg="bg-slate-500/10"
                iconColor="text-slate-500"
                label="IP-Adresse"
                value={submission.ipAddress}
                mono
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SidebarRow({ icon: Icon, iconBg, iconColor, label, value, href, mono }) {
  const content = (
    <div className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/30 transition-colors">
      <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
        <Icon className={cn('h-3.5 w-3.5', iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">{label}</p>
        <p className={cn('text-sm font-medium truncate', mono && 'font-mono text-xs', !value && 'text-muted-foreground/40')}>
          {value || '—'}
        </p>
      </div>
    </div>
  );
  if (href && value) return <a href={href} className="block">{content}</a>;
  return content;
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-64" />
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex gap-4">
          <Skeleton className="h-14 w-14 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><Skeleton className="h-64 w-full rounded-xl" /></div>
        <div className="space-y-4"><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>
      </div>
    </div>
  );
}
