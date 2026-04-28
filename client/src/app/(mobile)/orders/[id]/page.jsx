'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Phone,
  MapPin,
  Navigation,
  FileText,
  Camera,
  Clock,
  Wrench,
  ScrollText,
  ChevronRight,
  Play,
  CheckCircle2,
  History,
  Plus,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { EmptyState } from '@/modules/mobile/components/empty-state';
import { useOrderDetail, useOrderStatusMutation, useOrderHistory } from '@/modules/mobile/hooks/use-order-queries';
import { useNetworkStatus } from '@/modules/mobile/hooks/use-network-status';
import { ORDER_STATUS, VALID_STATUS_TRANSITIONS } from '@/modules/mobile/constants/mobile-constants';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const TABS = [
  { key: 'info', labelDe: 'Info', labelEn: 'Info' },
  { key: 'actions', labelDe: 'Aktionen', labelEn: 'Actions' },
  { key: 'history', labelDe: 'Verlauf', labelEn: 'History' },
];

export default function OrderDetailPage() {
  const { id } = useParams();
  const { t, locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';
  const [activeTab, setActiveTab] = useState('info');
  const isOnline = useNetworkStatus();

  const { data: order, isLoading, isOffline } = useOrderDetail(id);
  const { data: history } = useOrderHistory(id);
  const { updateStatus } = useOrderStatusMutation();

  if (isLoading) return <OrderDetailSkeleton />;
  if (!order) {
    return (
      <>
        <MobileHeader title={t('mobile.order.detail', 'Auftragsdetails')} showBack />
        <EmptyState
          variant={isOffline ? 'offline' : 'error'}
          title="Auftrag nicht gefunden"
        />
      </>
    );
  }

  const canTransition = VALID_STATUS_TRANSITIONS[order.status] || [];

  const handleStatusChange = async (newStatus) => {
    try {
      await updateStatus(id, newStatus);
      toast.success(
        newStatus === ORDER_STATUS.IN_PROGRESS
          ? (lang === 'de' ? 'Arbeit gestartet' : 'Work started')
          : (lang === 'de' ? 'Auftrag abgeschlossen' : 'Order completed')
      );
    } catch {
      toast.error(lang === 'de' ? 'Status konnte nicht geändert werden' : 'Could not change status');
    }
  };

  return (
    <div className="flex flex-col min-h-full">
      <MobileHeader
        title={order.order_number || t('mobile.order.detail', 'Auftragsdetails')}
        showBack
      />

      {/* Status action bar */}
      {canTransition.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          {canTransition.includes(ORDER_STATUS.IN_PROGRESS) && (
            <button
              onClick={() => handleStatusChange(ORDER_STATUS.IN_PROGRESS)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm"
            >
              <Play className="h-4 w-4" />
              {t('mobile.order.startWork', 'Arbeit starten')}
            </button>
          )}
          {canTransition.includes(ORDER_STATUS.COMPLETED) && (
            <button
              onClick={() => handleStatusChange(ORDER_STATUS.COMPLETED)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-medium text-sm"
            >
              <CheckCircle2 className="h-4 w-4" />
              {t('mobile.order.complete', 'Abschliessen')}
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 py-3 text-sm font-medium text-center transition-colors',
              activeTab === tab.key
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground'
            )}
          >
            {lang === 'de' ? tab.labelDe : tab.labelEn}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 px-4 py-4">
        {activeTab === 'info' && <OrderInfo order={order} lang={lang} t={t} />}
        {activeTab === 'actions' && <OrderActions orderId={id} order={order} lang={lang} t={t} />}
        {activeTab === 'history' && <OrderHistory history={history} lang={lang} />}
      </div>
    </div>
  );
}

function OrderInfo({ order, lang, t }) {
  return (
    <div className="space-y-4">
      {/* Title & Description */}
      <section className="bg-card rounded-xl border border-border p-4">
        <h3 className="font-semibold text-sm mb-1">{order.title}</h3>
        {order.description && (
          <p className="text-sm text-muted-foreground">{order.description}</p>
        )}
        {order.instructions && (
          <p className="text-xs text-muted-foreground mt-2 italic">{order.instructions}</p>
        )}
      </section>

      {/* Customer & Site */}
      <section className="bg-card rounded-xl border border-border p-4 space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {t('mobile.order.customer', 'Kunde & Standort')}
        </h4>
        {order.customer_name && (
          <p className="text-sm font-medium">{order.customer_name}</p>
        )}
        {order.site_address && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <span>{order.site_address}</span>
          </div>
        )}
        <div className="flex gap-3">
          {order.customer_phone && (
            <a
              href={`tel:${order.customer_phone}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-sm font-medium"
            >
              <Phone className="h-4 w-4" />
              {t('mobile.order.call', 'Anrufen')}
            </a>
          )}
          {order.site_address && (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(order.site_address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-sm font-medium"
            >
              <Navigation className="h-4 w-4" />
              {t('mobile.order.navigate', 'Navigation starten')}
            </a>
          )}
        </div>
      </section>

      {/* Schedule */}
      {order.scheduled_start && (
        <section className="bg-card rounded-xl border border-border p-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Zeitfenster
          </h4>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>
              {new Date(order.scheduled_start).toLocaleString(lang === 'de' ? 'de-CH' : 'en-GB', {
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {order.scheduled_end && (
                <>
                  {' — '}
                  {new Date(order.scheduled_end).toLocaleTimeString(lang === 'de' ? 'de-CH' : 'en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </>
              )}
            </span>
          </div>
        </section>
      )}
    </div>
  );
}

function OrderActions({ orderId, order, lang, t }) {
  const actions = [
    {
      href: `/orders/${orderId}/report`,
      icon: FileText,
      label: t('mobile.report.title', 'Arbeitsbericht'),
      desc: order.has_work_report
        ? (lang === 'de' ? 'Bericht bearbeiten' : 'Edit report')
        : (lang === 'de' ? 'Bericht erstellen' : 'Create report'),
    },
    {
      href: `/orders/${orderId}/time`,
      icon: Clock,
      label: t('mobile.time.title', 'Zeiterfassung'),
      desc: lang === 'de' ? 'Zeiten erfassen' : 'Record time',
    },
    {
      href: `/orders/${orderId}/photos`,
      icon: Camera,
      label: t('mobile.photos.title', 'Fotos'),
      desc: lang === 'de' ? 'Fotos aufnehmen' : 'Take photos',
    },
    {
      href: `/orders/${orderId}/documents`,
      icon: ScrollText,
      label: t('mobile.order.documents', 'Dokumente'),
      desc: lang === 'de' ? 'Pläne & Dokumente' : 'Plans & documents',
    },
    {
      href: `/orders/${orderId}/quotation`,
      icon: Wrench,
      label: lang === 'de' ? 'Offerte' : 'Quotation',
      desc: lang === 'de' ? 'Auftragsumfang ansehen' : 'View scope',
    },
    ...(order.project_id ? [{
      href: `/orders/create?projectId=${order.project_id}`,
      icon: Plus,
      label: lang === 'de' ? 'Kleinauftrag' : 'Small Order',
      desc: lang === 'de' ? 'Kleinauftrag im Projekt erstellen' : 'Create small order in project',
    }] : []),
  ];

  return (
    <div className="space-y-2">
      {actions.map((action) => (
        <Link key={action.href} href={action.href}>
          <div className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border active:bg-muted/50 transition-colors">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted">
              <action.icon className="h-5 w-5 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{action.label}</p>
              <p className="text-xs text-muted-foreground">{action.desc}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </Link>
      ))}
    </div>
  );
}

function OrderHistory({ history, lang }) {
  const items = Array.isArray(history) ? history : history?.data || [];

  if (items.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title={lang === 'de' ? 'Kein Verlauf' : 'No history'}
        description={lang === 'de' ? 'Keine früheren Einsätze für diesen Auftrag.' : 'No previous service records for this order.'}
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={item.id || idx} className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-start justify-between mb-1">
            <p className="text-sm font-medium">{item.title || item.description || item.action}</p>
            {item.date && (
              <span className="text-xs text-muted-foreground shrink-0 ml-2">
                {new Date(item.date || item.created_at).toLocaleDateString(lang === 'de' ? 'de-CH' : 'en-GB')}
              </span>
            )}
          </div>
          {item.technician_name && (
            <p className="text-xs text-muted-foreground">{item.technician_name}</p>
          )}
          {item.notes && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.notes}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function OrderDetailSkeleton() {
  return (
    <div className="flex flex-col min-h-full">
      <div className="h-14 border-b border-border animate-pulse bg-muted/30" />
      <div className="px-4 py-4 space-y-4">
        <div className="h-24 bg-muted rounded-xl animate-pulse" />
        <div className="h-32 bg-muted rounded-xl animate-pulse" />
        <div className="h-16 bg-muted rounded-xl animate-pulse" />
      </div>
    </div>
  );
}
