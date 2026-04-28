'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FieldOpsReportStatusBadge } from './field-ops-report-status-badge';
import { FieldOpsRejectDialog } from './field-ops-report-action-dialog';
import { useFieldOpsReportMutations } from '@/modules/field-ops/hooks/use-field-ops-report-mutations';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';
import { CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

function Section({ title, children, className }) {
  return (
    <div className={cn('space-y-2', className)}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

export function FieldOpsReportDetailPanel({ report, orderId, open, onOpenChange }) {
  const { t, language } = useLanguage();
  const [rejectOpen, setRejectOpen] = useState(false);

  const { approve, reject } = useFieldOpsReportMutations({
    onApprove: () => onOpenChange(false),
    onReject: () => { setRejectOpen(false); onOpenChange(false); },
  });

  if (!report) return null;

  const canAct = report.status === 'SUBMITTED';

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <div className="flex items-center justify-between gap-3">
              <SheetTitle className="text-base">
                {language === 'de' ? 'Arbeitsbericht' : 'Work Report'}
              </SheetTitle>
              <FieldOpsReportStatusBadge status={report.status} />
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

            <Separator />

            {report.workPerformed && (
              <Section title={language === 'de' ? 'Durchgeführte Arbeiten' : 'Work Performed'}>
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">{report.workPerformed}</p>
              </Section>
            )}

            {report.findings && (
              <Section title={language === 'de' ? 'Feststellungen' : 'Findings'}>
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">{report.findings}</p>
              </Section>
            )}

            {report.nextSteps && (
              <Section title={language === 'de' ? 'Nächste Schritte' : 'Next Steps'}>
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">{report.nextSteps}</p>
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
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap">{report.technicianNotes}</p>
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
          </div>

          {canAct && (
            <div className="border-t px-6 py-4 flex gap-2 justify-end bg-background">
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
                onClick={() => approve.mutate({ reportId: report._id, orderId })}
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
            </div>
          )}
        </SheetContent>
      </Sheet>

      <FieldOpsRejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={(note) => reject.mutate({ reportId: report._id, orderId, rejectionNote: note })}
        isLoading={reject.isPending}
      />
    </>
  );
}
