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
  PauseCircle,
  CheckCircle2,
  History,
  Plus,
  Mail,
  Hammer,
  Settings,
  PenTool,
  Search,
  AlertTriangle,
  Info,
  ParkingCircle,
  KeyRound,
  Download,
  Eye,
  FileImage,
  File,
  FileSpreadsheet,
  Building2,
  Thermometer,
  Flame,
  Droplets,
  Wind,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { EmptyState } from '@/modules/mobile/components/empty-state';
import {
  useOrderDetail,
  useOrderStatusMutation,
  useOrderHistory,
} from '@/modules/mobile/hooks/use-order-queries';
import { useOrderDocuments, useDocumentDownload } from '@/modules/mobile/hooks/use-document-queries';
import { useInstallations } from '@/modules/mobile/hooks/use-installation-queries';
import { useNetworkStatus } from '@/modules/mobile/hooks/use-network-status';
import {
  ORDER_STATUS,
  ORDER_TYPE,
  ORDER_PRIORITY,
  VALID_STATUS_TRANSITIONS,
} from '@/modules/mobile/constants/mobile-constants';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const TABS = [
  { key: 'info', labelDe: 'Info', labelEn: 'Info' },
  { key: 'customer', labelDe: 'Kunde', labelEn: 'Customer' },
  { key: 'installations', labelDe: 'Anlage', labelEn: 'Equipment' },
  { key: 'actions', labelDe: 'Aktionen', labelEn: 'Actions' },
  { key: 'documents', labelDe: 'Dokumente', labelEn: 'Documents' },
  { key: 'history', labelDe: 'Verlauf', labelEn: 'History' },
];

const ORDER_TYPE_CONFIG = {
  [ORDER_TYPE.SERVICE_CALL]: { Icon: Wrench, label: { de: 'Störung', en: 'Service Call' } },
  [ORDER_TYPE.PROJECT_WORK]: { Icon: Hammer, label: { de: 'Projektarbeit', en: 'Project Work' } },
  [ORDER_TYPE.MAINTENANCE]: { Icon: Settings, label: { de: 'Wartung', en: 'Maintenance' } },
  [ORDER_TYPE.INSTALLATION]: { Icon: PenTool, label: { de: 'Installation', en: 'Installation' } },
  [ORDER_TYPE.INSPECTION]: { Icon: Search, label: { de: 'Inspektion', en: 'Inspection' } },
};

const PRIORITY_CONFIG = {
  [ORDER_PRIORITY.NORMAL]: { label: { de: 'Normal', en: 'Normal' }, className: 'bg-muted text-muted-foreground' },
  [ORDER_PRIORITY.HIGH]: { label: { de: 'Hoch', en: 'High' }, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  [ORDER_PRIORITY.URGENT]: { label: { de: 'Dringend', en: 'Urgent' }, className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const FILE_ICONS = {
  pdf: FileText,
  jpg: FileImage,
  jpeg: FileImage,
  png: FileImage,
  gif: FileImage,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
};

const SYSTEM_ICONS = {
  HEATING: Flame,
  COOLING: Thermometer,
  VENTILATION: Wind,
  PLUMBING: Droplets,
};

function getFileIcon(filename) {
  const ext = filename?.split('.').pop()?.toLowerCase();
  return FILE_ICONS[ext] || File;
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
          : newStatus === ORDER_STATUS.PAUSED
            ? (lang === 'de' ? 'Auftrag pausiert' : 'Order paused')
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
        <div className="px-4 py-3 border-b border-border space-y-2">
          {canTransition.includes(ORDER_STATUS.IN_PROGRESS) && (
            <button
              onClick={() => handleStatusChange(ORDER_STATUS.IN_PROGRESS)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm"
            >
              <Play className="h-4 w-4" />
              {t('mobile.order.startWork', 'Arbeit starten')}
            </button>
          )}
          {canTransition.includes(ORDER_STATUS.PAUSED) && (
            <button
              onClick={() => handleStatusChange(ORDER_STATUS.PAUSED)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-600 text-white font-medium text-sm"
            >
              <PauseCircle className="h-4 w-4" />
              {lang === 'de' ? 'Pausieren' : 'Pause'}
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

      {/* Scrollable tabs */}
      <div className="flex border-b border-border overflow-x-auto scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'shrink-0 px-4 py-3 text-sm font-medium text-center transition-colors whitespace-nowrap',
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
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {activeTab === 'info' && <OrderInfo order={order} lang={lang} t={t} />}
        {activeTab === 'customer' && <CustomerSiteTab order={order} lang={lang} />}
        {activeTab === 'installations' && <InstallationsTab order={order} lang={lang} />}
        {activeTab === 'actions' && <OrderActions orderId={id} order={order} lang={lang} t={t} />}
        {activeTab === 'documents' && <DocumentsTab orderId={id} lang={lang} isOnline={isOnline} />}
        {activeTab === 'history' && <OrderHistory history={history} lang={lang} />}
      </div>
    </div>
  );
}

function OrderInfo({ order, lang, t }) {
  const typeConfig = ORDER_TYPE_CONFIG[order.order_type];
  const priorityConfig = PRIORITY_CONFIG[order.priority];

  return (
    <div className="space-y-4">
      {/* Type & Priority badges */}
      {(typeConfig || priorityConfig) && (
        <div className="flex flex-wrap gap-2">
          {typeConfig && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-sm font-medium">
              <typeConfig.Icon className="h-4 w-4 text-muted-foreground" />
              {typeConfig.label[lang]}
            </span>
          )}
          {priorityConfig && order.priority !== ORDER_PRIORITY.NORMAL && (
            <span className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium', priorityConfig.className)}>
              <AlertTriangle className="h-4 w-4" />
              {priorityConfig.label[lang]}
            </span>
          )}
        </div>
      )}

      {/* Title & Description */}
      <section className="bg-card rounded-xl border border-border p-4">
        <h3 className="font-semibold text-sm mb-1">{order.title}</h3>
        {order.description && (
          <p className="text-sm text-muted-foreground">{order.description}</p>
        )}
      </section>

      {/* Scope of work */}
      {order.scope_of_work && (
        <section className="bg-card rounded-xl border border-border p-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {lang === 'de' ? 'Auftragsumfang' : 'Scope of Work'}
          </h4>
          <p className="text-sm">{order.scope_of_work}</p>
        </section>
      )}

      {/* Special instructions */}
      {(order.instructions || order.special_instructions) && (
        <section className="bg-card rounded-xl border border-border p-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {lang === 'de' ? 'Besondere Anweisungen' : 'Special Instructions'}
          </h4>
          <p className="text-sm text-muted-foreground italic">
            {order.special_instructions || order.instructions}
          </p>
        </section>
      )}

      {/* Schedule */}
      {order.scheduled_start && (
        <section className="bg-card rounded-xl border border-border p-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {lang === 'de' ? 'Zeitfenster' : 'Schedule'}
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

function CustomerSiteTab({ order, lang }) {
  return (
    <div className="space-y-4">
      {/* Customer */}
      <section className="bg-card rounded-xl border border-border p-4 space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {lang === 'de' ? 'Kunde' : 'Customer'}
        </h4>
        {order.customer_name && (
          <p className="text-sm font-medium">{order.customer_name}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {order.customer_phone && (
            <a
              href={`tel:${order.customer_phone}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-sm font-medium"
            >
              <Phone className="h-4 w-4" />
              {order.customer_phone}
            </a>
          )}
          {order.customer_email && (
            <a
              href={`mailto:${order.customer_email}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-sm font-medium"
            >
              <Mail className="h-4 w-4" />
              {order.customer_email}
            </a>
          )}
        </div>
      </section>

      {/* Site */}
      <section className="bg-card rounded-xl border border-border p-4 space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {lang === 'de' ? 'Standort' : 'Site'}
        </h4>
        {order.site_address && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <span>{order.site_address}</span>
          </div>
        )}
        {order.site_address && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(order.site_address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-sm font-medium"
          >
            <Navigation className="h-4 w-4" />
            {lang === 'de' ? 'Navigation starten' : 'Open in Maps'}
          </a>
        )}
        {order.site_latitude && order.site_longitude && (
          <p className="text-xs text-muted-foreground">
            GPS: {Number(order.site_latitude).toFixed(6)}, {Number(order.site_longitude).toFixed(6)}
          </p>
        )}
      </section>

      {/* Access & Parking */}
      {(order.access_instructions || order.parking_info) && (
        <section className="bg-card rounded-xl border border-border p-4 space-y-3">
          {order.access_instructions && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {lang === 'de' ? 'Zugang' : 'Access'}
                </h4>
              </div>
              <p className="text-sm">{order.access_instructions}</p>
            </div>
          )}
          {order.parking_info && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ParkingCircle className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {lang === 'de' ? 'Parkplatz' : 'Parking'}
                </h4>
              </div>
              <p className="text-sm">{order.parking_info}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function InstallationsTab({ order, lang }) {
  const siteId = order.site_id;
  const { data: installations, isLoading } = useInstallations(siteId);
  const items = Array.isArray(installations) ? installations : installations?.data || [];

  return (
    <div className="space-y-4">
      {/* Navigate to full installations page */}
      {siteId && (
        <Link href={`/installations/${siteId}`}>
          <div className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border active:bg-muted/50 transition-colors">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted">
              <Building2 className="h-5 w-5 text-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{lang === 'de' ? 'Alle Anlagen' : 'All Installations'}</p>
              <p className="text-xs text-muted-foreground">{lang === 'de' ? 'Vollständige Ansicht' : 'Full view with history'}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </Link>
      )}

      {/* Inline summary */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          variant="empty"
          title={lang === 'de' ? 'Keine Anlagen' : 'No installations'}
          description={lang === 'de' ? 'Für diesen Standort sind keine Anlagen erfasst.' : 'No installations registered for this site.'}
        />
      ) : (
        <div className="space-y-2">
          {items.map((inst) => {
            const Icon = SYSTEM_ICONS[inst.system_type] || Thermometer;
            const isWarrantyActive = inst.warranty_until && new Date(inst.warranty_until) > new Date();
            return (
              <div key={inst.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-muted shrink-0">
                    <Icon className="h-4 w-4 text-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {inst.name || inst.model || inst.system_type}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {inst.manufacturer}
                      {inst.serial_number && ` · SN: ${inst.serial_number}`}
                    </p>
                  </div>
                  {inst.warranty_until && (
                    <span className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0',
                      isWarrantyActive ? 'bg-green-500/10 text-green-700' : 'bg-muted text-muted-foreground'
                    )}>
                      {isWarrantyActive ? (lang === 'de' ? 'Garantie' : 'Warranty') : (lang === 'de' ? 'Abgelaufen' : 'Expired')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DocumentsTab({ orderId, lang, isOnline }) {
  const { data: documents, isLoading } = useOrderDocuments(orderId);
  const downloadMutation = useDocumentDownload();
  const docs = Array.isArray(documents) ? documents : documents?.items || [];

  const handleDownload = async (doc) => {
    if (!isOnline) {
      toast.error(lang === 'de' ? 'Download nur online möglich' : 'Download requires internet');
      return;
    }
    try {
      const result = await downloadMutation.mutateAsync({ orderId, docId: doc.id });
      const url = result?.url || result;
      if (url) window.open(url, '_blank');
    } catch {
      toast.error(lang === 'de' ? 'Download fehlgeschlagen' : 'Download failed');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title={lang === 'de' ? 'Keine Dokumente' : 'No documents'}
        description={lang === 'de' ? 'Diesem Auftrag sind keine Dokumente zugeordnet.' : 'No documents assigned to this order.'}
      />
    );
  }

  return (
    <div className="space-y-2">
      {docs.map((doc) => {
        const Icon = getFileIcon(doc.filename || doc.name);
        return (
          <div key={doc.id} className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted shrink-0">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{doc.filename || doc.name}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
                {doc.uploaded_at && (
                  <span>{new Date(doc.uploaded_at).toLocaleDateString(lang === 'de' ? 'de-CH' : 'en-GB')}</span>
                )}
              </div>
            </div>
            <button
              onClick={() => handleDownload(doc)}
              disabled={!isOnline}
              className="h-11 w-11 flex items-center justify-center text-muted-foreground disabled:opacity-40"
              aria-label="Download"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        );
      })}
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
            {(item.date || item.created_at) && (
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
      <div className="flex border-b border-border overflow-x-auto">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="shrink-0 h-11 w-20 bg-muted/30 animate-pulse" />
        ))}
      </div>
      <div className="px-4 py-4 space-y-4">
        <div className="h-24 bg-muted rounded-xl animate-pulse" />
        <div className="h-32 bg-muted rounded-xl animate-pulse" />
        <div className="h-16 bg-muted rounded-xl animate-pulse" />
      </div>
    </div>
  );
}
