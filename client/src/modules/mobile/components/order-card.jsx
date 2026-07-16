'use client';

import Link from 'next/link';
import { MapPin, Clock, Phone, ChevronRight, Wrench, Hammer, Settings, PenTool, Search } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { ORDER_STATUS, ORDER_PRIORITY, ORDER_TYPE } from '../constants/mobile-constants';

const STATUS_STYLES = {
  [ORDER_STATUS.PLANNED]: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  [ORDER_STATUS.CONFIRMED]: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  [ORDER_STATUS.IN_PROGRESS]: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  [ORDER_STATUS.PAUSED]: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  [ORDER_STATUS.COMPLETED]: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  [ORDER_STATUS.CANCELLED]: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

const STATUS_LABELS = {
  [ORDER_STATUS.PLANNED]: { de: 'Geplant', en: 'Planned' },
  [ORDER_STATUS.CONFIRMED]: { de: 'Bestätigt', en: 'Confirmed' },
  [ORDER_STATUS.IN_PROGRESS]: { de: 'In Arbeit', en: 'In Progress' },
  [ORDER_STATUS.PAUSED]: { de: 'Pausiert', en: 'Paused' },
  [ORDER_STATUS.COMPLETED]: { de: 'Abgeschlossen', en: 'Completed' },
  [ORDER_STATUS.CANCELLED]: { de: 'Storniert', en: 'Cancelled' },
};

const PRIORITY_INDICATOR = {
  [ORDER_PRIORITY.NORMAL]: null,
  [ORDER_PRIORITY.HIGH]: 'border-l-amber-500',
  [ORDER_PRIORITY.URGENT]: 'border-l-red-500',
};

const TYPE_CONFIG = {
  [ORDER_TYPE.SERVICE_CALL]: { Icon: Wrench, label: { de: 'Störung', en: 'Service' } },
  [ORDER_TYPE.PROJECT_WORK]: { Icon: Hammer, label: { de: 'Projekt', en: 'Project' } },
  [ORDER_TYPE.MAINTENANCE]: { Icon: Settings, label: { de: 'Wartung', en: 'Maintenance' } },
  [ORDER_TYPE.INSTALLATION]: { Icon: PenTool, label: { de: 'Installation', en: 'Installation' } },
  [ORDER_TYPE.INSPECTION]: { Icon: Search, label: { de: 'Inspektion', en: 'Inspection' } },
};

export function OrderCard({ order }) {
  const { locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';

  const statusLabel = STATUS_LABELS[order.status]?.[lang] || order.status;
  const statusStyle = STATUS_STYLES[order.status] || STATUS_STYLES[ORDER_STATUS.PLANNED];
  const priorityBorder = PRIORITY_INDICATOR[order.priority];
  const typeConfig = TYPE_CONFIG[order.order_type];

  const scheduledTime = order.scheduled_start
    ? new Date(order.scheduled_start).toLocaleTimeString(lang === 'de' ? 'de-CH' : 'en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <Link href={`/orders/${order.id}`}>
      <div
        className={cn(
          'bg-card rounded-xl border border-border p-4',
          'active:bg-muted/50 transition-colors',
          'border-l-4',
          priorityBorder || 'border-l-transparent'
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-mono text-muted-foreground">
                {order.order_number}
              </span>
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold',
                  statusStyle
                )}
              >
                {statusLabel}
              </span>
              {typeConfig && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                  <typeConfig.Icon className="h-2.5 w-2.5" />
                  {typeConfig.label[lang]}
                </span>
              )}
            </div>
            <h3 className="font-medium text-sm leading-snug truncate">
              {order.title || order.customer_name}
            </h3>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {scheduledTime && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {scheduledTime}
            </span>
          )}
          {order.site_address && (
            <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
              <MapPin className="h-3 w-3 shrink-0" />
              {order.site_address}
            </span>
          )}
          {order.customer_phone && (
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {order.customer_phone}
            </span>
          )}
        </div>

        {order.has_work_report && (
          <div className="mt-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              {order.report_status === 'SUBMITTED'
                ? (lang === 'de' ? 'Bericht eingereicht' : 'Report submitted')
                : (lang === 'de' ? 'Entwurf' : 'Draft')}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
