'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Thermometer,
  Flame,
  Droplets,
  Wind,
  Calendar,
  ChevronRight,
  History,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { EmptyState } from '@/modules/mobile/components/empty-state';
import { useInstallations, useInstallationHistory } from '@/modules/mobile/hooks/use-installation-queries';
import { cn } from '@/lib/utils';

const SYSTEM_ICONS = {
  HEATING: Flame,
  COOLING: Thermometer,
  VENTILATION: Wind,
  PLUMBING: Droplets,
};

export default function InstallationsPage() {
  const { siteId } = useParams();
  const { locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';
  const [expandedId, setExpandedId] = useState(null);

  const { data: installations, isLoading, isOffline } = useInstallations(siteId);

  const items = Array.isArray(installations) ? installations : installations?.data || [];

  if (isLoading) return <InstallationsSkeleton />;

  return (
    <div className="flex flex-col min-h-full">
      <MobileHeader
        title={lang === 'de' ? 'Anlagen' : 'Installations'}
        showBack
        right={
          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-lg">
            {items.length}
          </span>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyState
              variant={isOffline ? 'offline' : 'empty'}
              title={lang === 'de' ? 'Keine Anlagen' : 'No installations'}
              description={
                lang === 'de'
                  ? 'Für diesen Standort sind keine Anlagen erfasst.'
                  : 'No installations registered for this site.'
              }
            />
          </div>
        ) : (
          <div className="px-4 py-4 space-y-3">
            {items.map((inst) => (
              <InstallationCard
                key={inst.id}
                installation={inst}
                lang={lang}
                expanded={expandedId === inst.id}
                onToggle={() =>
                  setExpandedId((prev) => (prev === inst.id ? null : inst.id))
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InstallationCard({ installation, lang, expanded, onToggle }) {
  const Icon = SYSTEM_ICONS[installation.system_type] || Thermometer;
  const isWarrantyActive =
    installation.warranty_until &&
    new Date(installation.warranty_until) > new Date();

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 active:bg-muted/50 transition-colors"
      >
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted shrink-0">
          <Icon className="h-5 w-5 text-foreground" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium truncate">
            {installation.name || installation.model || installation.system_type}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {installation.manufacturer}
            {installation.serial_number && ` · ${installation.serial_number}`}
          </p>
        </div>
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            expanded && 'rotate-90'
          )}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border">
          {/* Details grid */}
          <div className="grid grid-cols-2 gap-2">
            {installation.model && (
              <DetailItem
                label={lang === 'de' ? 'Modell' : 'Model'}
                value={installation.model}
              />
            )}
            {installation.serial_number && (
              <DetailItem
                label={lang === 'de' ? 'Seriennr.' : 'Serial No.'}
                value={installation.serial_number}
              />
            )}
            {installation.year_installed && (
              <DetailItem
                label={lang === 'de' ? 'Baujahr' : 'Year'}
                value={installation.year_installed}
              />
            )}
            {installation.capacity && (
              <DetailItem
                label={lang === 'de' ? 'Leistung' : 'Capacity'}
                value={installation.capacity}
              />
            )}
            {installation.fuel_type && (
              <DetailItem
                label={lang === 'de' ? 'Brennstoff' : 'Fuel'}
                value={installation.fuel_type}
              />
            )}
            {installation.location_in_building && (
              <DetailItem
                label={lang === 'de' ? 'Standort' : 'Location'}
                value={installation.location_in_building}
              />
            )}
          </div>

          {/* Warranty */}
          {installation.warranty_until && (
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
                isWarrantyActive
                  ? 'bg-green-500/10 text-green-700'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>
                {lang === 'de' ? 'Garantie bis' : 'Warranty until'}:{' '}
                {new Date(installation.warranty_until).toLocaleDateString(
                  lang === 'de' ? 'de-CH' : 'en-GB'
                )}
              </span>
            </div>
          )}

          {/* Next maintenance */}
          {installation.next_maintenance_date && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 rounded-lg text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>
                {lang === 'de' ? 'Nächste Wartung' : 'Next maintenance'}:{' '}
                {new Date(installation.next_maintenance_date).toLocaleDateString(
                  lang === 'de' ? 'de-CH' : 'en-GB'
                )}
              </span>
            </div>
          )}

          {/* Notes */}
          {installation.notes && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <p>{installation.notes}</p>
            </div>
          )}

          {/* Service history */}
          <InstallationHistory installationId={installation.id} lang={lang} />
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-xs font-medium">{value}</p>
    </div>
  );
}

function InstallationHistory({ installationId, lang }) {
  const { data: history, isLoading } = useInstallationHistory(installationId);
  const items = Array.isArray(history) ? history : history?.data || [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-24 bg-muted rounded animate-pulse" />
        <div className="h-12 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        {lang === 'de' ? 'Servicehistorie' : 'Service History'}
      </p>
      {items.slice(0, 5).map((item, idx) => (
        <div key={item.id || idx} className="flex items-center justify-between text-xs">
          <span className="truncate flex-1">{item.title || item.description || item.type}</span>
          <span className="text-muted-foreground shrink-0 ml-2">
            {item.date || item.created_at
              ? new Date(item.date || item.created_at).toLocaleDateString(lang === 'de' ? 'de-CH' : 'en-GB')
              : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function InstallationsSkeleton() {
  return (
    <div className="flex flex-col min-h-full">
      <div className="h-14 border-b border-border animate-pulse bg-muted/30" />
      <div className="px-4 py-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}
