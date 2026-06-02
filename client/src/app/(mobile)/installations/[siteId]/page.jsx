'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Thermometer,
  Flame,
  Droplets,
  Wind,
  Calendar,
  ChevronRight,
  Plus,
  Pencil,
  History,
  Info,
  AlertTriangle,
  PackageSearch,
  Pin,
  Save,
  Camera,
  Loader2,
  Key,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { EmptyState } from '@/modules/mobile/components/empty-state';
import { useInstallations, useInstallationHistory, useSite } from '@/modules/mobile/hooks/use-installation-queries';
import { useCreateCrmNote, useEntityNotes, useEntityWarningMap } from '@/modules/mobile/hooks/use-crm-notes';
import { useCaptureCrmImage, useQueuedCrmImages } from '@/modules/mobile/hooks/use-crm-images';
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
  const { data: site } = useSite(siteId);

  const items = useMemo(
    () => (Array.isArray(installations) ? installations : installations?.data || []),
    [installations],
  );
  const installationIds = useMemo(() => items.map((item) => item.id).filter(Boolean), [items]);
  const { warnings: siteWarnings } = useEntityNotes('site', siteId);
  const installationWarningMap = useEntityWarningMap('installation', installationIds);
  const createNote = useCreateCrmNote();

  if (isLoading) return <InstallationsSkeleton />;

  return (
    <div className="flex flex-col min-h-full">
      <MobileHeader
        title={lang === 'de' ? 'Anlagen' : 'Installations'}
        showBack
        right={
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-lg">
              {items.length}
            </span>
            <Link
              href={`/installations/${siteId}/capture`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
              aria-label={lang === 'de' ? 'Anlage erfassen' : 'Capture installation'}
            >
              <Plus className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {site?.access_instructions && (
          <div className="px-4 pt-4">
            <AccessInstructions value={site.access_instructions} lang={lang} />
          </div>
        )}
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
            <WarningList notes={siteWarnings} lang={lang} compact={false} />
            <InlineNoteComposer
              lang={lang}
              entityType="site"
              entityId={siteId}
              createNote={createNote}
              placeholder={lang === 'de' ? 'Standortnotiz fuer das Team' : 'Site note for the team'}
            />
            {items.map((inst) => (
              <InstallationCard
                key={inst.id}
                installation={inst}
                lang={lang}
                warnings={installationWarningMap.get(inst.id) || []}
                createNote={createNote}
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

function InstallationCard({ installation, lang, warnings, createNote, expanded, onToggle }) {
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
        {warnings.length > 0 && (
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-100 px-2 text-[11px] font-semibold text-amber-800">
            {warnings.length}
          </span>
        )}
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            expanded && 'rotate-90'
          )}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border">
          <WarningList notes={warnings} lang={lang} />

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
          <InlineNoteComposer
            lang={lang}
            entityType="installation"
            entityId={installation.id}
            createNote={createNote}
            placeholder={lang === 'de' ? 'Notiz zur Anlage' : 'Installation note'}
          />
          <ImageCaptureButton lang={lang} entityType="installation" entityId={installation.id} />

          {installation.sync_status === 'CONFLICT' ? (
            <div className="space-y-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
              <div className="flex items-start gap-2 font-medium">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>
                  {lang === 'de'
                    ? 'Synchronisierungskonflikt: Diese Anlage wurde serverseitig geändert. Bitte erneut öffnen und lösen.'
                    : 'Sync conflict: this installation was changed on the server. Please reopen and resolve.'}
                </p>
              </div>
              <Link
                href={`/installations/${installation.site_id}/capture?installationId=${installation.id}`}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-red-300 bg-white text-xs font-medium text-red-800"
              >
                <Pencil className="h-3.5 w-3.5" />
                {lang === 'de' ? 'Konflikt lösen' : 'Resolve conflict'}
              </Link>
            </div>
          ) : installation.sync_status === 'PENDING_SYNC' ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              {lang === 'de' ? 'Wartet auf Synchronisierung' : 'Waiting for sync'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Link
                href={`/installations/${installation.site_id}/spare-parts?installationId=${installation.id}`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border text-xs font-medium text-foreground"
              >
                <PackageSearch className="h-3.5 w-3.5" />
                {lang === 'de' ? 'Teile' : 'Parts'}
              </Link>
              <Link
                href={`/installations/${installation.site_id}/capture?installationId=${installation.id}`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border text-xs font-medium text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
                {lang === 'de' ? 'Bearbeiten' : 'Edit'}
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AccessInstructions({ value, lang }) {
  if (!value) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
        <Key className="h-4 w-4 shrink-0" />
        {lang === 'de' ? 'Zugang' : 'Access'}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm text-amber-900">{value}</p>
    </div>
  );
}

function WarningList({ notes, lang, compact = true }) {
  if (!Array.isArray(notes) || notes.length === 0) return null;

  return (
    <div className="space-y-2">
      {notes.slice(0, compact ? 2 : 4).map((note) => {
        const title = note.category === 'access_info'
          ? (lang === 'de' ? 'Zugang' : 'Access')
          : (lang === 'de' ? 'Hinweis' : 'Warning');
        const NoteIcon = note.is_pinned ? Pin : AlertTriangle;

        return (
          <div
            key={note.id}
            className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          >
            <NoteIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">{title}</p>
              <p className="break-words">{note.text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InlineNoteComposer({ lang, entityType, entityId, createNote, placeholder }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [category, setCategory] = useState('general');
  const [isWarning, setIsWarning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isSaving) return;

    setIsSaving(true);
    setError('');
    try {
      await createNote({
        entityType,
        entityId,
        text: trimmed,
        category,
        isWarning,
        isPinned: isWarning || category === 'access_info',
      });
      setText('');
      setCategory('general');
      setIsWarning(false);
      setOpen(false);
    } catch (err) {
      setError(err?.message || (lang === 'de' ? 'Notiz konnte nicht gespeichert werden.' : 'Could not save note.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border text-xs font-medium text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        {lang === 'de' ? 'Notiz hinzufuegen' : 'Add note'}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={2000}
        rows={3}
        className="min-h-20 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        placeholder={placeholder}
      />
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <select
          value={category}
          onChange={(event) => {
            const nextCategory = event.target.value;
            setCategory(nextCategory);
            if (nextCategory === 'warning') setIsWarning(true);
          }}
          className="h-9 rounded-lg border border-border bg-background px-2 text-xs outline-none"
        >
          <option value="general">{lang === 'de' ? 'Allgemein' : 'General'}</option>
          <option value="warning">{lang === 'de' ? 'Warnung' : 'Warning'}</option>
          <option value="access_info">{lang === 'de' ? 'Zugang' : 'Access'}</option>
          <option value="technical">{lang === 'de' ? 'Technisch' : 'Technical'}</option>
        </select>
        <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs">
          <input
            type="checkbox"
            checked={isWarning}
            onChange={(event) => setIsWarning(event.target.checked)}
            className="h-3.5 w-3.5"
          />
          {lang === 'de' ? 'Warnen' : 'Warn'}
        </label>
      </div>
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 rounded-lg border border-border text-xs font-medium"
        >
          {lang === 'de' ? 'Abbrechen' : 'Cancel'}
        </button>
        <button
          type="submit"
          disabled={!text.trim() || isSaving}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {isSaving ? (lang === 'de' ? 'Speichert' : 'Saving') : lang === 'de' ? 'Speichern' : 'Save'}
        </button>
      </div>
    </form>
  );
}

function ImageCaptureButton({ lang, entityType, entityId }) {
  const captureImage = useCaptureCrmImage();
  const queued = useQueuedCrmImages(entityType, entityId);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState('');

  const onSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || isCapturing) return;

    setIsCapturing(true);
    setError('');
    try {
      await captureImage({ entityType, entityId, file, category: 'general' });
    } catch (err) {
      setError(err?.message || (lang === 'de' ? 'Bild konnte nicht erfasst werden.' : 'Could not capture image.'));
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="space-y-1">
      <label
        className={cn(
          'inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border text-xs font-medium text-foreground',
          isCapturing && 'opacity-50',
        )}
      >
        {isCapturing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Camera className="h-3.5 w-3.5" />
        )}
        {isCapturing
          ? (lang === 'de' ? 'Wird erfasst' : 'Capturing')
          : (lang === 'de' ? 'Bild erfassen' : 'Capture image')}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={isCapturing}
          onChange={onSelect}
        />
      </label>
      {queued.length > 0 && (
        <p className="text-[11px] text-amber-700">
          {lang === 'de'
            ? `${queued.length} Bild(er) warten auf Synchronisierung`
            : `${queued.length} image(s) waiting for sync`}
        </p>
      )}
      {error && <p className="text-[11px] font-medium text-red-600">{error}</p>}
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
