'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFieldOpsOrderDetail, useFieldOpsOrderReports, useFieldOpsOrderTimeEntries } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { FieldOpsOrderStatusBadge } from './field-ops-order-status-badge';
import { FieldOpsReportDetailPanel } from '@/modules/field-ops/components/reports/field-ops-report-detail-panel';
import { FieldOpsReportStatusBadge } from '@/modules/field-ops/components/reports/field-ops-report-status-badge';
import { FieldOpsPhotoGallery } from '@/modules/field-ops/components/photos/field-ops-photo-gallery';
import { FieldOpsInstallationsTable } from '@/modules/field-ops/components/installations/field-ops-installations-table';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';
import { RELEASE_STATUS_CONFIG, ACTIVITY_TYPE_LABELS } from '@/modules/field-ops/constants/field-ops-constants';
import { MapPin, Phone, Mail, FileText, Clock, Camera, Files, MessageSquare, FileCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-muted-foreground min-w-[120px] shrink-0">{label}</span>
      <span className="text-foreground/90">{value}</span>
    </div>
  );
}

function OverviewTab({ order }) {
  const { language } = useLanguage();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{language === 'de' ? 'Auftrag' : 'Order'}</h4>
        <InfoRow label={language === 'de' ? 'Auftrags-Nr.' : 'Order #'} value={order.orderNumber} />
        <InfoRow label={language === 'de' ? 'Typ' : 'Type'} value={order.orderType} />
        <InfoRow label={language === 'de' ? 'Priorität' : 'Priority'} value={order.priority} />
        <InfoRow label={language === 'de' ? 'Geplant' : 'Scheduled'} value={order.scheduledStart ? formatDate(order.scheduledStart) : undefined} />
        {order.description && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{language === 'de' ? 'Beschreibung' : 'Description'}</p>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{order.description}</p>
          </div>
        )}
      </div>
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{language === 'de' ? 'Kunde & Standort' : 'Customer & Site'}</h4>
        <InfoRow label={language === 'de' ? 'Kunde' : 'Customer'} value={order.customerName} />
        {order.customerPhone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            <a href={`tel:${order.customerPhone}`} className="text-primary hover:underline">{order.customerPhone}</a>
          </div>
        )}
        {order.customerEmail && (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <a href={`mailto:${order.customerEmail}`} className="text-primary hover:underline">{order.customerEmail}</a>
          </div>
        )}
        {order.siteAddress && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <span>{order.siteAddress}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportsTab({ orderId }) {
  const { language } = useLanguage();
  const { data: reports = [], isLoading } = useFieldOpsOrderReports(orderId);
  const [selected, setSelected] = useState(null);

  if (isLoading) return <div className="space-y-2">{[1,2].map((i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}</div>;
  if (!reports.length) return <p className="text-sm text-muted-foreground py-4">{language === 'de' ? 'Keine Berichte vorhanden.' : 'No reports yet.'}</p>;

  return (
    <>
      <div className="space-y-2">
        {reports.map((r) => (
          <button
            key={r._id}
            onClick={() => setSelected(r)}
            className="w-full flex items-center justify-between border rounded-lg px-4 py-3 hover:bg-muted/50 text-left transition-colors"
          >
            <div>
              <p className="text-sm font-medium">{formatDate(r.reportDate)}</p>
              <p className="text-xs text-muted-foreground">{r.workPerformed?.slice(0, 60)}{r.workPerformed?.length > 60 ? '…' : ''}</p>
            </div>
            <FieldOpsReportStatusBadge status={r.status} size="sm" />
          </button>
        ))}
      </div>
      <FieldOpsReportDetailPanel
        report={selected}
        orderId={orderId}
        open={!!selected}
        onOpenChange={(v) => { if (!v) setSelected(null); }}
      />
    </>
  );
}

function TimeTab({ orderId }) {
  const { language } = useLanguage();
  const { data: entries = [], isLoading } = useFieldOpsOrderTimeEntries(orderId);

  if (isLoading) return <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}</div>;
  if (!entries.length) return <p className="text-sm text-muted-foreground py-4">{language === 'de' ? 'Keine Zeiteinträge.' : 'No time entries.'}</p>;

  return (
    <div className="space-y-2">
      {entries.map((e) => {
        const min = e.netDurationMin || e.net_duration_min || 0;
        const h = Math.floor(min / 60);
        const m = min % 60;
        const act = ACTIVITY_TYPE_LABELS[e.activityType];
        const rel = RELEASE_STATUS_CONFIG[e.releaseStatus];
        return (
          <div key={e._id} className="flex items-center justify-between border rounded-lg px-4 py-3">
            <div>
              <p className="text-sm font-medium">{formatDate(e.date)}</p>
              <p className="text-xs text-muted-foreground">{act ? (language === 'de' ? act.label : act.labelEn) : e.activityType}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-mono">{h}h{m > 0 ? ` ${m}m` : ''}</p>
              {rel && <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', rel.badge)}>{language === 'de' ? rel.label : rel.labelEn}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FieldOpsOrderDetailTabs({ orderId }) {
  const { language } = useLanguage();
  const { data: order, isLoading } = useFieldOpsOrderDetail(orderId);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-4 w-64 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-4 gap-2 mt-4">
          {[1,2,3,4].map((i) => <div key={i} className="h-9 rounded-lg bg-muted animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!order) return <p className="p-6 text-muted-foreground">{language === 'de' ? 'Auftrag nicht gefunden.' : 'Order not found.'}</p>;

  const projectId = order.projectId || order.project_id;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-bold">{order.title || order.orderNumber}</h2>
            <FieldOpsOrderStatusBadge status={order.status} />
          </div>
          <p className="text-sm text-muted-foreground">{order.customerName} {order.siteAddress ? `· ${order.siteAddress}` : ''}</p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start h-9 bg-muted/50">
          <TabsTrigger value="overview" className="text-xs gap-1.5"><FileText className="h-3.5 w-3.5" />{language === 'de' ? 'Übersicht' : 'Overview'}</TabsTrigger>
          <TabsTrigger value="reports" className="text-xs gap-1.5"><FileCheck className="h-3.5 w-3.5" />{language === 'de' ? 'Berichte' : 'Reports'}</TabsTrigger>
          <TabsTrigger value="photos" className="text-xs gap-1.5"><Camera className="h-3.5 w-3.5" />{language === 'de' ? 'Fotos' : 'Photos'}</TabsTrigger>
          <TabsTrigger value="time" className="text-xs gap-1.5"><Clock className="h-3.5 w-3.5" />{language === 'de' ? 'Zeiten' : 'Time'}</TabsTrigger>
          <TabsTrigger value="installations" className="text-xs gap-1.5"><Files className="h-3.5 w-3.5" />{language === 'de' ? 'Anlagen' : 'Installations'}</TabsTrigger>
          {projectId && (
            <TabsTrigger value="chat" asChild>
              <Link href={`/field-ops/chat/${projectId}`} className="text-xs gap-1.5 flex items-center">
                <MessageSquare className="h-3.5 w-3.5" />{language === 'de' ? 'Chat' : 'Chat'}
              </Link>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-4"><OverviewTab order={order} /></TabsContent>
        <TabsContent value="reports" className="mt-4"><ReportsTab orderId={orderId} /></TabsContent>
        <TabsContent value="photos" className="mt-4"><FieldOpsPhotoGallery orderId={orderId} /></TabsContent>
        <TabsContent value="time" className="mt-4"><TimeTab orderId={orderId} /></TabsContent>
        <TabsContent value="installations" className="mt-4">
          <FieldOpsInstallationsTable siteId={order.siteId || order.site_id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
