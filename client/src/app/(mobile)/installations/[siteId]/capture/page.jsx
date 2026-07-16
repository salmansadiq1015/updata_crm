'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Camera, Save, ScanBarcode, Upload, WifiOff, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { BarcodeScanner } from '@/modules/mobile/components/barcode-scanner';
import { useCamera } from '@/modules/mobile/hooks/use-camera';
import { useInstallationDetail } from '@/modules/mobile/hooks/use-installation-queries';
import { useInstallationMutations } from '@/modules/mobile/hooks/use-installation-mutations';
import { useNameplateOcr } from '@/modules/mobile/hooks/use-nameplate-ocr';
import { useNetworkStatus } from '@/modules/mobile/hooks/use-network-status';
import { prepareNameplateCapture } from '@/modules/mobile/lib/nameplate-utils';
import {
  FUEL_TYPE_OPTIONS,
  INSTALLATION_TYPE_OPTIONS,
  installationCaptureSchema,
  normalizeInstallationCaptureForm,
} from '@/modules/mobile/validations/installation';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function InstallationCapturePage() {
  const { siteId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const installationId = searchParams.get('installationId');
  const { locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';
  const [scannerOpen, setScannerOpen] = useState(false);
  const [nameplateCapture, setNameplateCapture] = useState(null);
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const { processPhoto, isProcessing: isProcessingPhoto } = useCamera();
  const isOnline = useNetworkStatus();
  const nameplateOcr = useNameplateOcr();

  const isEditing = Boolean(installationId);
  const { data: installation, isLoading } = useInstallationDetail(installationId);
  const { createInstallation, updateInstallation } = useInstallationMutations(siteId);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(installationCaptureSchema),
    defaultValues: defaultValues(),
  });

  useEffect(() => {
    if (!installation) return;
    reset(defaultValues(installation));
  }, [installation, reset]);

  const mutation = isEditing ? updateInstallation : createInstallation;

  const handleNameplateFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const processed = await processPhoto(file);
      const capture = await prepareNameplateCapture(file, processed);
      setNameplateCapture(capture);
      applyNameplateFields(capture.hints);

      if (isOnline) {
        try {
          const extraction = await nameplateOcr.mutateAsync({ file: capture.file, installationId });
          setNameplateCapture((current) => current
            ? { ...current, hints: { ...current.hints, ...extraction.fields, extraction } }
            : current);
          applyNameplateFields(extraction.fields);
        } catch {
          toast(
            lang === 'de'
              ? 'OCR ist nicht verfügbar. Lokale Hinweise bleiben erhalten.'
              : 'OCR is unavailable. Local hints are kept.',
            { icon: '!' },
          );
        }
      }
    } catch (error) {
      toast.error(error?.message || (lang === 'de' ? 'Typenschild konnte nicht verarbeitet werden' : 'Could not process nameplate'));
    }
  };

  const applyNameplateFields = (fields = {}) => {
    const current = getValues();
    [
      ['manufacturer', fields.manufacturer],
      ['model', fields.model],
      ['serialNumber', fields.serialNumber],
      ['powerOutputKw', fields.powerOutputKw],
      ['yearOfManufacture', fields.yearOfManufacture],
      ['fuelType', fields.fuelType],
    ].forEach(([field, value]) => {
      if (value == null || value === '' || current[field]) return;
      setValue(field, value, { shouldValidate: true, shouldDirty: true });
    });
  };

  const onSubmit = async (values) => {
    const payload = {
      ...normalizeInstallationCaptureForm(values),
      nameplateCapture,
    };
    try {
      if (isEditing) {
        await updateInstallation.mutateAsync({
          id: installationId,
          data: payload,
          baseUpdatedAt: installation?.updated_at || installation?.last_synced_at || null,
        });
      } else {
        await createInstallation.mutateAsync(payload);
      }
      toast.success(
        mutation.isOffline
          ? lang === 'de' ? 'Anlage offline gespeichert' : 'Installation saved offline'
          : lang === 'de' ? 'Anlage gespeichert' : 'Installation saved',
      );
      router.back();
    } catch (error) {
      toast.error(error?.message || (lang === 'de' ? 'Speichern fehlgeschlagen' : 'Save failed'));
    }
  };

  if (isEditing && isLoading) {
    return (
      <div className="flex min-h-full flex-col">
        <MobileHeader title={lang === 'de' ? 'Anlage laden' : 'Loading installation'} showBack />
        <div className="space-y-3 px-4 py-4">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-12 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <MobileHeader
        title={
          isEditing
            ? lang === 'de' ? 'Anlage bearbeiten' : 'Edit installation'
            : lang === 'de' ? 'Anlage erfassen' : 'Capture installation'
        }
        showBack
      />

      {mutation.isOffline && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>
            {lang === 'de'
              ? 'Offline-Modus: Änderungen werden lokal gespeichert und später synchronisiert.'
              : 'Offline mode: changes are saved locally and synced later.'}
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pb-6">
          <FormField label={lang === 'de' ? 'Typ' : 'Type'} required error={errors.type?.message}>
            <Controller
              name="type"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INSTALLATION_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {lang === 'de' ? option.de : option.en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>

          <div className="grid grid-cols-1 gap-4">
            <FormField label={lang === 'de' ? 'Hersteller' : 'Manufacturer'} required error={errors.manufacturer?.message}>
              <Input {...register('manufacturer')} className="h-11" disabled={isSubmitting} />
            </FormField>

            <FormField label={lang === 'de' ? 'Modell' : 'Model'} required error={errors.model?.message}>
              <Input {...register('model')} className="h-11" disabled={isSubmitting} />
            </FormField>
          </div>

          <FormField label={lang === 'de' ? 'Seriennummer' : 'Serial number'} error={errors.serialNumber?.message}>
            <div className="flex gap-2">
              <Input {...register('serialNumber')} className="h-11 flex-1" disabled={isSubmitting} />
              <Button
                type="button"
                variant="outline"
                className="h-11 w-11 p-0"
                onClick={() => setScannerOpen(true)}
                aria-label={lang === 'de' ? 'Seriennummer scannen' : 'Scan serial number'}
              >
                <ScanBarcode className="h-4 w-4" />
              </Button>
            </div>
          </FormField>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{lang === 'de' ? 'Typenschild' : 'Nameplate'}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {lang === 'de'
                    ? 'Foto wird komprimiert und mit der Anlage synchronisiert.'
                    : 'Photo is compressed and synced with the installation.'}
                </p>
              </div>
              {nameplateCapture && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 w-9 p-0"
                  onClick={() => setNameplateCapture(null)}
                  aria-label={lang === 'de' ? 'Typenschild entfernen' : 'Remove nameplate'}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {nameplateCapture?.thumbnail ? (
              <div className="mt-3 overflow-hidden rounded-lg border border-border bg-muted">
                <NameplatePreviewImage blob={nameplateCapture.thumbnail} />
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <CaptureButton
                  icon={Camera}
                  label={lang === 'de' ? 'Kamera' : 'Camera'}
                  disabled={isProcessingPhoto || isSubmitting}
                  onClick={() => cameraInputRef.current?.click()}
                />
                <CaptureButton
                  icon={Upload}
                  label={lang === 'de' ? 'Galerie' : 'Gallery'}
                  disabled={isProcessingPhoto || isSubmitting}
                  onClick={() => fileInputRef.current?.click()}
                />
              </div>
            )}

            {nameplateCapture?.hints?.rawText && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {lang === 'de' ? 'Lokale Hinweise' : 'Local hints'}: {nameplateCapture.hints.rawText}
              </p>
            )}
            {nameplateOcr.isPending && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {lang === 'de' ? 'OCR wird ausgeführt...' : 'Running OCR...'}
              </p>
            )}
            {nameplateCapture?.hints?.extraction?.lowConfidenceFields?.length > 0 && (
              <p className="mt-2 text-[11px] text-amber-700">
                {lang === 'de' ? 'Bitte prüfen' : 'Please verify'}: {nameplateCapture.hints.extraction.lowConfidenceFields.join(', ')}
              </p>
            )}

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleNameplateFile}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleNameplateFile}
              className="hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label={lang === 'de' ? 'Inbetriebnahme' : 'Commissioning'} error={errors.commissioningDate?.message}>
              <Input type="date" {...register('commissioningDate')} className="h-11" disabled={isSubmitting} />
            </FormField>
            <FormField label={lang === 'de' ? 'Garantie bis' : 'Warranty until'} error={errors.warrantyEndDate?.message}>
              <Input type="date" {...register('warrantyEndDate')} className="h-11" disabled={isSubmitting} />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label={lang === 'de' ? 'Leistung kW' : 'Output kW'} error={errors.powerOutputKw?.message}>
              <Input type="number" step="0.1" {...register('powerOutputKw')} className="h-11" disabled={isSubmitting} />
            </FormField>
            <FormField label={lang === 'de' ? 'Baujahr' : 'Year'} error={errors.yearOfManufacture?.message}>
              <Input type="number" {...register('yearOfManufacture')} className="h-11" disabled={isSubmitting} />
            </FormField>
          </div>

          <FormField label={lang === 'de' ? 'Brennstoff' : 'Fuel'} error={errors.fuelType?.message}>
            <Controller
              name="fuelType"
              control={control}
              render={({ field }) => (
                <Select value={field.value || ''} onValueChange={field.onChange} disabled={isSubmitting}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder={lang === 'de' ? 'Auswählen' : 'Select'} />
                  </SelectTrigger>
                  <SelectContent>
                    {FUEL_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {lang === 'de' ? option.de : option.en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>

          <FormField label={lang === 'de' ? 'Technische Notizen' : 'Technical notes'} error={errors.technicalNotes?.message}>
            <Textarea {...register('technicalNotes')} rows={4} disabled={isSubmitting} />
          </FormField>

          <Button type="submit" className="h-12 w-full" disabled={isSubmitting || mutation.isPending || isProcessingPhoto || nameplateOcr.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {mutation.isPending || isSubmitting
              ? lang === 'de' ? 'Speichern...' : 'Saving...'
              : lang === 'de' ? 'Speichern' : 'Save'}
          </Button>
        </form>
      </div>

      {scannerOpen && (
        <BarcodeScanner
          onClose={() => setScannerOpen(false)}
          onScan={(value) => {
            setValue('serialNumber', value, { shouldValidate: true, shouldDirty: true });
            setScannerOpen(false);
          }}
        />
      )}
    </div>
  );
}

function CaptureButton({ icon: Icon, label, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 text-sm font-medium text-muted-foreground transition active:bg-muted/40 disabled:opacity-60"
    >
      <Icon className="h-6 w-6" />
      {label}
    </button>
  );
}

function NameplatePreviewImage({ blob }) {
  const imageRef = useRef(null);

  useEffect(() => {
    if (!blob || !imageRef.current) return undefined;
    const url = URL.createObjectURL(blob);
    imageRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  // Local Blob preview; Next image optimization is not applicable here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={imageRef} alt="" className="max-h-48 w-full object-contain" />;
}

function defaultValues(installation = {}) {
  return {
    type: installation.system_type || 'boiler',
    manufacturer: installation.manufacturer || '',
    model: installation.model || '',
    serialNumber: installation.serial_number || '',
    commissioningDate: toDateInput(installation.commissioning_date),
    warrantyEndDate: toDateInput(installation.warranty_until),
    powerOutputKw: installation.power_output_kw ?? '',
    fuelType: installation.fuel_type || '',
    yearOfManufacture: installation.year_installed ?? '',
    technicalNotes: installation.technical_notes || installation.notes || '',
  };
}

function toDateInput(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}
