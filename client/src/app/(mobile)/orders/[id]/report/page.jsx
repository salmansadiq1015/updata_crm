'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Save,
  Send,
  Clock,
  FileText,
  Wrench,
  StickyNote,
  Package,
  Pen,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react';
import { SignaturePad } from '@/modules/mobile/components/signature-pad';
import { useLanguage } from '@/lib/i18n/language-context';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { EmptyState } from '@/modules/mobile/components/empty-state';
import { MaterialSearch } from '@/modules/mobile/components/material-search';
import { useReportMutations } from '@/modules/mobile/hooks/use-report-mutations';
import { useOrderReports } from '@/modules/mobile/hooks/use-report-queries';
import { useOrderDetail } from '@/modules/mobile/hooks/use-order-queries';
import { useNetworkStatus } from '@/modules/mobile/hooks/use-network-status';
import { createReportSchema } from '@/modules/mobile/validations/report';
import { REPORT_STATUS } from '@/modules/mobile/constants/mobile-constants';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { sanitizeHtml } from '@/modules/mobile/lib/sanitize';
import { FormField, FormSection } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

function toDatetimeLocal(date) {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateLocal(date) {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const SECTIONS = [
  { key: 'time', icon: Clock, labelDe: 'Zeit & Datum', labelEn: 'Time & Date' },
  { key: 'work', icon: FileText, labelDe: 'Ausgeführte Arbeiten', labelEn: 'Work Performed' },
  { key: 'findings', icon: AlertCircle, labelDe: 'Befund & Nächste Schritte', labelEn: 'Findings & Next Steps' },
  { key: 'materials', icon: Package, labelDe: 'Material', labelEn: 'Materials' },
  { key: 'notes', icon: StickyNote, labelDe: 'Notizen', labelEn: 'Notes' },
  { key: 'signature', icon: Pen, labelDe: 'Unterschrift', labelEn: 'Signature' },
];

export default function ReportPage() {
  const { id: orderId } = useParams();
  const router = useRouter();
  const { t, locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';
  const isOnline = useNetworkStatus();

  const { data: order } = useOrderDetail(orderId);
  const { data: reports, isLoading: reportsLoading } = useOrderReports(orderId);
  const { createReport, updateReport, submitReport } = useReportMutations(orderId);

  const existingReport = Array.isArray(reports) ? reports[0] : null;
  const isSubmitted = existingReport?.status === REPORT_STATUS.SUBMITTED || existingReport?.status === REPORT_STATUS.APPROVED;

  const [expandedSections, setExpandedSections] = useState(['time', 'work']);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({
    resolver: zodResolver(createReportSchema),
    defaultValues: {
      reportDate: new Date(),
      arrivalTime: new Date(),
      departureTime: new Date(),
      workPerformed: '',
      findings: '',
      nextSteps: '',
      followUpNeeded: false,
      technicianNotes: '',
      customerSignature: '',
      customerSignerName: '',
      materialItems: [],
    },
  });

  useEffect(() => {
    if (existingReport) {
      reset({
        reportDate: existingReport.report_date ? new Date(existingReport.report_date) : new Date(),
        arrivalTime: existingReport.arrival_time ? new Date(existingReport.arrival_time) : new Date(),
        departureTime: existingReport.departure_time ? new Date(existingReport.departure_time) : new Date(),
        workPerformed: existingReport.work_performed || '',
        findings: existingReport.findings || '',
        nextSteps: existingReport.next_steps || '',
        followUpNeeded: existingReport.follow_up_needed || false,
        technicianNotes: existingReport.technician_notes || '',
        customerSignature: existingReport.customer_signature || '',
        customerSignerName: existingReport.customer_signer_name || '',
        materialItems: existingReport.material_items || [],
      });
    }
  }, [existingReport, reset]);

  const toggleSection = (key) => {
    setExpandedSections((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const onSaveDraft = async (data) => {
    try {
      const payload = {
        reportDate: data.reportDate.toISOString(),
        arrivalTime: data.arrivalTime.toISOString(),
        departureTime: data.departureTime.toISOString(),
        workPerformed: data.workPerformed,
        findings: data.findings || '',
        nextSteps: data.nextSteps || '',
        followUpNeeded: data.followUpNeeded,
        technicianNotes: data.technicianNotes || '',
        customerSignature: data.customerSignature || '',
        customerSignerName: data.customerSignerName || '',
        materialItems: data.materialItems || [],
      };

      if (existingReport) {
        await updateReport.mutateAsync({ reportId: existingReport.id, data: payload });
      } else {
        await createReport.mutateAsync(payload);
      }
    } catch {
      // toast handled by mutation
    }
  };

  const onSubmitReport = async () => {
    if (!existingReport?.id) {
      toast.error(lang === 'de' ? 'Bitte zuerst speichern' : 'Please save first');
      return;
    }
    if (!isOnline) {
      toast.error(lang === 'de' ? 'Einreichen nur online möglich' : 'Submit requires internet');
      return;
    }
    try {
      await submitReport.mutateAsync(existingReport.id);
      setShowSubmitConfirm(false);
      router.push(`/orders/${orderId}`);
    } catch {
      // toast handled by mutation
    }
  };

  const materialItems = watch('materialItems');

  if (reportsLoading) return <ReportSkeleton />;

  return (
    <div className="flex flex-col min-h-full">
      <MobileHeader
        title={t('mobile.report.title', 'Arbeitsbericht')}
        showBack
        right={
          existingReport?.status === REPORT_STATUS.DRAFT && (
            <span className="text-xs font-medium text-amber-500 bg-amber-500/10 px-2 py-1 rounded-lg">
              {lang === 'de' ? 'Entwurf' : 'Draft'}
            </span>
          )
        }
      />

      {isSubmitted ? (
        <SubmittedView report={existingReport} lang={lang} />
      ) : (
        <form
          onSubmit={handleSubmit(onSaveDraft)}
          className="flex-1 flex flex-col"
        >
          <div className="flex-1 overflow-y-auto pb-32">
            {/* Order context */}
            {order && (
              <div className="px-4 py-3 bg-muted/30 border-b border-border">
                <p className="text-sm font-medium">{order.order_number}</p>
                <p className="text-xs text-muted-foreground truncate">{order.title}</p>
              </div>
            )}

            <div className="px-4 py-4 space-y-2">
              {SECTIONS.map((section) => {
                const isExpanded = expandedSections.includes(section.key);
                const Icon = section.icon;
                const sectionHasErrors = getSectionErrors(section.key, errors);

                return (
                  <div
                    key={section.key}
                    className={cn(
                      'border border-border rounded-xl overflow-hidden transition-colors',
                      sectionHasErrors && 'border-destructive/50'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSection(section.key)}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-card active:bg-muted/50 transition-colors"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 text-left text-sm font-medium">
                        {lang === 'de' ? section.labelDe : section.labelEn}
                      </span>
                      {sectionHasErrors && (
                        <span className="h-2 w-2 rounded-full bg-destructive" />
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 space-y-4 bg-card">
                        {section.key === 'time' && (
                          <TimeSection
                            control={control}
                            errors={errors}
                            lang={lang}
                            disabled={isSubmitting}
                          />
                        )}
                        {section.key === 'work' && (
                          <WorkSection
                            control={control}
                            errors={errors}
                            lang={lang}
                            disabled={isSubmitting}
                          />
                        )}
                        {section.key === 'findings' && (
                          <FindingsSection
                            control={control}
                            register={register}
                            errors={errors}
                            lang={lang}
                            disabled={isSubmitting}
                          />
                        )}
                        {section.key === 'materials' && (
                          <Controller
                            name="materialItems"
                            control={control}
                            render={({ field }) => (
                              <MaterialSearch
                                items={field.value || []}
                                onChange={field.onChange}
                                disabled={isSubmitting}
                              />
                            )}
                          />
                        )}
                        {section.key === 'notes' && (
                          <NotesSection
                            control={control}
                            errors={errors}
                            lang={lang}
                            disabled={isSubmitting}
                          />
                        )}
                        {section.key === 'signature' && (
                          <SignatureSection
                            register={register}
                            control={control}
                            errors={errors}
                            lang={lang}
                            disabled={isSubmitting}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom action bar */}
          <div className="fixed bottom-16 left-0 right-0 bg-background border-t border-border px-4 py-3 flex gap-2 z-30">
            <Button
              type="submit"
              variant="outline"
              className="flex-1"
              disabled={isSubmitting || createReport.isPending || updateReport.isPending}
            >
              <Save className="h-4 w-4 mr-1.5" />
              {lang === 'de' ? 'Entwurf speichern' : 'Save Draft'}
            </Button>
            {existingReport && (
              <Button
                type="button"
                className="flex-1"
                disabled={!isOnline || isSubmitting || submitReport.isPending || isDirty}
                onClick={() => setShowSubmitConfirm(true)}
              >
                <Send className="h-4 w-4 mr-1.5" />
                {lang === 'de' ? 'Einreichen' : 'Submit'}
              </Button>
            )}
          </div>
        </form>
      )}

      {/* Submit confirmation overlay */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
          <div className="w-full max-w-lg bg-background rounded-t-2xl p-6 space-y-4 animate-in slide-in-from-bottom duration-200">
            <h3 className="text-lg font-semibold">
              {lang === 'de' ? 'Bericht einreichen?' : 'Submit report?'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {lang === 'de'
                ? 'Nach dem Einreichen kann der Bericht nicht mehr bearbeitet werden. Zeiteinträge werden automatisch freigegeben.'
                : 'After submission, the report cannot be edited. Time entries will be automatically released.'}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowSubmitConfirm(false)}
              >
                {lang === 'de' ? 'Abbrechen' : 'Cancel'}
              </Button>
              <Button
                className="flex-1"
                onClick={onSubmitReport}
                disabled={submitReport.isPending}
              >
                <Send className="h-4 w-4 mr-1.5" />
                {lang === 'de' ? 'Einreichen' : 'Submit'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TimeSection({ control, errors, lang, disabled }) {
  return (
    <div className="space-y-3">
      <FormField
        label={lang === 'de' ? 'Berichtsdatum' : 'Report Date'}
        required
        error={errors.reportDate?.message}
      >
        <Controller
          name="reportDate"
          control={control}
          render={({ field }) => (
            <Input
              type="date"
              value={toDateLocal(field.value)}
              onChange={(e) => field.onChange(new Date(e.target.value))}
              disabled={disabled}
              className="h-11"
            />
          )}
        />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField
          label={lang === 'de' ? 'Ankunft' : 'Arrival'}
          required
          error={errors.arrivalTime?.message}
        >
          <Controller
            name="arrivalTime"
            control={control}
            render={({ field }) => (
              <Input
                type="datetime-local"
                value={toDatetimeLocal(field.value)}
                onChange={(e) => field.onChange(new Date(e.target.value))}
                disabled={disabled}
                className="h-11"
              />
            )}
          />
        </FormField>
        <FormField
          label={lang === 'de' ? 'Abfahrt' : 'Departure'}
          required
          error={errors.departureTime?.message}
        >
          <Controller
            name="departureTime"
            control={control}
            render={({ field }) => (
              <Input
                type="datetime-local"
                value={toDatetimeLocal(field.value)}
                onChange={(e) => field.onChange(new Date(e.target.value))}
                disabled={disabled}
                className="h-11"
              />
            )}
          />
        </FormField>
      </div>
    </div>
  );
}

function WorkSection({ control, errors, lang, disabled }) {
  return (
    <FormField
      label={lang === 'de' ? 'Ausgeführte Arbeiten' : 'Work Performed'}
      required
      error={errors.workPerformed?.message}
    >
      <Controller
        name="workPerformed"
        control={control}
        render={({ field }) => (
          <RichTextEditor
            value={field.value}
            onChange={field.onChange}
            placeholder={
              lang === 'de'
                ? 'Beschreiben Sie die durchgeführten Arbeiten...'
                : 'Describe the work performed...'
            }
            maxLength={5000}
            minHeight={160}
            disabled={disabled}
            error={!!errors.workPerformed}
          />
        )}
      />
    </FormField>
  );
}

function FindingsSection({ control, register, errors, lang, disabled }) {
  return (
    <div className="space-y-4">
      <FormField
        label={lang === 'de' ? 'Befund' : 'Findings'}
        error={errors.findings?.message}
      >
        <Controller
          name="findings"
          control={control}
          render={({ field }) => (
            <RichTextEditor
              value={field.value}
              onChange={field.onChange}
              placeholder={
                lang === 'de'
                  ? 'Festgestellte Befunde und Zustand der Anlage...'
                  : 'Findings and condition of the system...'
              }
              maxLength={5000}
              minHeight={120}
              disabled={disabled}
              error={!!errors.findings}
            />
          )}
        />
      </FormField>

      <FormField
        label={lang === 'de' ? 'Nächste Schritte' : 'Next Steps'}
        error={errors.nextSteps?.message}
      >
        <Controller
          name="nextSteps"
          control={control}
          render={({ field }) => (
            <RichTextEditor
              value={field.value}
              onChange={field.onChange}
              placeholder={
                lang === 'de'
                  ? 'Empfohlene nächste Schritte und Massnahmen...'
                  : 'Recommended next steps and measures...'
              }
              maxLength={5000}
              minHeight={120}
              disabled={disabled}
              error={!!errors.nextSteps}
            />
          )}
        />
      </FormField>

      <label className="flex items-center gap-3 py-2">
        <input
          type="checkbox"
          {...register('followUpNeeded')}
          disabled={disabled}
          className="h-5 w-5 rounded border-border text-primary focus:ring-primary"
        />
        <span className="text-sm font-medium">
          {lang === 'de' ? 'Nachfolgebesuch erforderlich' : 'Follow-up visit needed'}
        </span>
      </label>
    </div>
  );
}

function NotesSection({ control, errors, lang, disabled }) {
  return (
    <FormField
      label={lang === 'de' ? 'Interne Notizen' : 'Internal Notes'}
      description={
        lang === 'de'
          ? 'Nur intern sichtbar, nicht im Kundenbericht'
          : 'Internal only, not shown to customer'
      }
      error={errors.technicianNotes?.message}
    >
      <Controller
        name="technicianNotes"
        control={control}
        render={({ field }) => (
          <RichTextEditor
            value={field.value}
            onChange={field.onChange}
            placeholder={
              lang === 'de'
                ? 'Interne Notizen für das Team...'
                : 'Internal notes for the team...'
            }
            maxLength={5000}
            minHeight={120}
            disabled={disabled}
            error={!!errors.technicianNotes}
          />
        )}
      />
    </FormField>
  );
}

function SignatureSection({ register, control, errors, lang, disabled }) {
  return (
    <div className="space-y-4">
      <FormField
        label={lang === 'de' ? 'Name des Unterzeichners' : 'Signer Name'}
        error={errors.customerSignerName?.message}
      >
        <Input
          {...register('customerSignerName')}
          placeholder={lang === 'de' ? 'Name des Kunden' : 'Customer name'}
          className="h-11"
          disabled={disabled}
        />
      </FormField>

      <FormField label={lang === 'de' ? 'Unterschrift' : 'Signature'}>
        <Controller
          name="customerSignature"
          control={control}
          render={({ field }) => (
            <SignaturePad
              value={field.value}
              onChange={field.onChange}
              disabled={disabled}
            />
          )}
        />
      </FormField>
    </div>
  );
}

function SubmittedView({ report, lang }) {
  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center gap-2 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl">
        <FileText className="h-5 w-5 text-green-600" />
        <div>
          <p className="text-sm font-medium text-green-700">
            {lang === 'de' ? 'Bericht eingereicht' : 'Report submitted'}
          </p>
          {report.submitted_at && (
            <p className="text-xs text-green-600">
              {new Date(report.submitted_at).toLocaleString(lang === 'de' ? 'de-CH' : 'en-GB')}
            </p>
          )}
        </div>
      </div>

      {report.work_performed && (
        <section className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {lang === 'de' ? 'Ausgeführte Arbeiten' : 'Work Performed'}
          </h4>
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(report.work_performed) }}
          />
        </section>
      )}

      {report.findings && (
        <section className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {lang === 'de' ? 'Befund' : 'Findings'}
          </h4>
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(report.findings) }}
          />
        </section>
      )}

      {report.next_steps && (
        <section className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {lang === 'de' ? 'Nächste Schritte' : 'Next Steps'}
          </h4>
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(report.next_steps) }}
          />
        </section>
      )}
    </div>
  );
}

function getSectionErrors(sectionKey, errors) {
  switch (sectionKey) {
    case 'time':
      return !!(errors.reportDate || errors.arrivalTime || errors.departureTime);
    case 'work':
      return !!errors.workPerformed;
    case 'findings':
      return !!(errors.findings || errors.nextSteps);
    case 'materials':
      return !!errors.materialItems;
    case 'notes':
      return !!errors.technicianNotes;
    case 'signature':
      return !!(errors.customerSignature || errors.customerSignerName);
    default:
      return false;
  }
}

function ReportSkeleton() {
  return (
    <div className="flex flex-col min-h-full">
      <div className="h-14 border-b border-border animate-pulse bg-muted/30" />
      <div className="px-4 py-4 space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}
