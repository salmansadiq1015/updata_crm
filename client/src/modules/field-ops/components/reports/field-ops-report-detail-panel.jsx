'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { RichTextContent } from '@/components/ui/rich-text-content';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FieldOpsReportStatusBadge } from './field-ops-report-status-badge';
import { FieldOpsRejectDialog } from './field-ops-report-action-dialog';
import { useFieldOpsReportMutations } from '@/modules/field-ops/hooks/use-field-ops-report-mutations';
import { useFieldOpsReportHistory } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';
import { CheckCircle, Clock, History, ReceiptText, XCircle, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

function Section({ title, children, className }) {
  return (
    <div className={cn('space-y-2', className)}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

function formatHours(minutes) {
  const hours = Math.round((Number(minutes || 0) / 60) * 100) / 100;
  return `${hours.toLocaleString(undefined, { maximumFractionDigits: 2 })} h`;
}

function deriveMinutes(report) {
  const explicit = Number(report?.billableMinutes || 0) + Number(report?.nonBillableMinutes || 0);
  if (explicit > 0) return explicit;
  if (!report?.arrivalTime || !report?.departureTime) return 0;
  const start = new Date(report.arrivalTime).getTime();
  const end = new Date(report.departureTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 60000);
}

export function FieldOpsReportDetailPanel({ report, orderId, open, onOpenChange, onEdit }) {
  const { t, locale: language } = useLanguage();
  const [rejectOpen, setRejectOpen] = useState(false);
  const reportId = report?._id || report?.id;
  const { data: history = [] } = useFieldOpsReportHistory(reportId);

  const { approve, reject, createInvoice } = useFieldOpsReportMutations({
    onApprove: () => onOpenChange(false),
    onReject: () => { setRejectOpen(false); onOpenChange(false); },
  });

  if (!report) return null;

  const canAct = report.status === 'SUBMITTED';
  const canInvoice = report.status === 'APPROVED';

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="!w-[50vw] !max-w-[50vw] overflow-y-auto flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <div className="flex items-center justify-between gap-3">
              <SheetTitle className="text-base">
                {language === 'de' ? 'Arbeitsbericht' : 'Work Report'}
              </SheetTitle>
              <div className="flex items-center gap-2">
                <FieldOpsReportStatusBadge status={report.status} />
                {(report.status === 'DRAFT' || report.status === 'SUBMITTED') && onEdit && (
                  <button
                    onClick={() => onEdit(report)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            <Section title={language === 'de' ? 'Zeitraum' : 'Time Period'}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">{language === 'de' ? 'Datum' : 'Date'}</p>
                  <p>{formatDate(report.reportDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">{language === 'de' ? 'Ankunft / Abfahrt' : 'Arrival / Departure'}</p>
                  <p>{report.arrivalTime ? new Date(report.arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} – {report.departureTime ? new Date(report.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                </div>
              </div>
            </Section>

            <Section title={language === 'de' ? 'Abrechnung' : 'Billing'}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border/50 px-3 py-2">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                    <Clock className="h-3 w-3" />
                    {language === 'de' ? 'Gesamt' : 'Total'}
                  </p>
                  <p className="font-medium">{formatHours(deriveMinutes(report))}</p>
                </div>
                <div className="rounded-lg border border-border/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground mb-0.5">{language === 'de' ? 'Billable / Non-billable' : 'Billable / Non-billable'}</p>
                  <p className="font-medium">{formatHours(report.billableMinutes)} / {formatHours(report.nonBillableMinutes)}</p>
                </div>
                <div className="rounded-lg border border-border/50 px-3 py-2 col-span-2">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                    <ReceiptText className="h-3 w-3" />
                    {language === 'de' ? 'Rechnung' : 'Invoice'}
                  </p>
                  <p className="font-medium">{report.invoiceId?.invoiceNumber || report.invoiceReference || '—'}</p>
                </div>
              </div>
            </Section>

            <Separator />

            {report.workPerformed && (
              <Section title={language === 'de' ? 'Durchgeführte Arbeiten' : 'Work Performed'}>
                <RichTextContent html={report.workPerformed} />
              </Section>
            )}

            {report.findings && (
              <Section title={language === 'de' ? 'Feststellungen' : 'Findings'}>
                <RichTextContent html={report.findings} />
              </Section>
            )}

            {report.nextSteps && (
              <Section title={language === 'de' ? 'Nächste Schritte' : 'Next Steps'}>
                <RichTextContent html={report.nextSteps} />
              </Section>
            )}

            {report.materialItems?.length > 0 && (
              <>
                <Separator />
                <Section title={language === 'de' ? 'Material' : 'Materials'}>
                  <div className="space-y-1.5">
                    {report.materialItems.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2">
                        <span className="truncate flex-1">{item.description}</span>
                        <span className="text-muted-foreground ml-3 shrink-0">{item.quantity} {item.unit}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              </>
            )}

            {report.customerSignature && (
              <>
                <Separator />
                <Section title={language === 'de' ? 'Kundenunterschrift' : 'Customer Signature'}>
                  <p className="text-sm text-muted-foreground">{report.customerSignerName || '—'}</p>
                  {typeof report.customerSignature === 'string' && report.customerSignature.startsWith('data:image') && (
                    <img src={report.customerSignature} alt="signature" className="max-h-24 border rounded" />
                  )}
                </Section>
              </>
            )}

            {report.technicianNotes && (
              <>
                <Separator />
                <Section title={language === 'de' ? 'Technikernotizen' : 'Technician Notes'}>
                  <RichTextContent html={report.technicianNotes} />
                </Section>
              </>
            )}

            {report.status === 'REJECTED' && report.rejectionNote && (
              <>
                <Separator />
                <Section title={language === 'de' ? 'Ablehnungsgrund' : 'Rejection Reason'}>
                  <p className="text-sm text-destructive">{report.rejectionNote}</p>
                </Section>
              </>
            )}

            {history.length > 0 && (
              <>
                <Separator />
                <Section title={language === 'de' ? 'Historie' : 'History'}>
                  <div className="space-y-2">
                    {history.slice(0, 8).map((entry) => (
                      <div key={entry._id || `${entry.eventType}-${entry.timestamp}`} className="flex items-start gap-2 text-sm">
                        <History className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{entry.eventType}</p>
                          <p className="text-xs text-muted-foreground">
                            {entry.timestamp ? new Date(entry.timestamp).toLocaleString(language === 'de' ? 'de-CH' : 'en-GB') : '—'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              </>
            )}
          </div>

          {(canAct || canInvoice) && (
            <div className="border-t px-6 py-4 flex gap-2 justify-end bg-background">
              {canAct && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRejectOpen(true)}
                    disabled={reject.isPending || approve.isPending}
                    className="text-destructive border-destructive/30 hover:bg-destructive/5"
                  >
                    <XCircle className="h-4 w-4 mr-1.5" />
                    {t('fieldOps.reports.reject', 'Reject')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => approve.mutate({ reportId, orderId })}
                    disabled={approve.isPending || reject.isPending}
                  >
                    {approve.isPending ? (
                      <span className="flex items-center gap-1.5">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        {language === 'de' ? 'Wird genehmigt...' : 'Approving...'}
                      </span>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-1.5" />
                        {t('fieldOps.reports.approve', 'Approve')}
                      </>
                    )}
                  </Button>
                </>
              )}
              {canInvoice && (
                <Button
                  size="sm"
                  onClick={() => createInvoice.mutate({ reportId, orderId })}
                  disabled={createInvoice.isPending}
                >
                  <ReceiptText className="h-4 w-4 mr-1.5" />
                  {language === 'de' ? 'Rechnung erstellen' : 'Create Invoice'}
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <FieldOpsRejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={(note) => reject.mutate({ reportId, orderId, rejectionNote: note })}
        isLoading={reject.isPending}
      />
    </>
  );
}
