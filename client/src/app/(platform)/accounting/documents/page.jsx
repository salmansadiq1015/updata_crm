'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Download, FileSearch, Upload, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  useAccDocumentOcrResult,
  useAccDocuments,
} from '@/modules/accounting/hooks/use-accounting-queries';
import { useAccDocumentMutations } from '@/modules/accounting/hooks/use-accounting-mutations';
import { accDocService } from '@/modules/accounting/services/accounting-service';
import { cursorPageLabel, downloadResponse, formatDate, formatMoney, toDateInput } from '@/modules/accounting/utils/accounting-ui';
import { useUserDirectory } from '@/modules/users/hooks/use-user-directory';

const DOCUMENT_TYPES = [
  'SUPPLIER_INVOICE',
  'RECEIPT',
  'BANK_STATEMENT',
  'OPEN_ITEM_STATEMENT',
  'DUNNING_LETTER',
  'PAYMENT_CONFIRMATION',
  'OTHER',
];

const OCR_DOCUMENT_TYPES = new Set(['SUPPLIER_INVOICE', 'RECEIPT']);

function addNonEmpty(target, key, value) {
  if (value == null) return;
  if (typeof value === 'string' && !value.trim()) return;
  target[key] = typeof value === 'string' ? value.trim() : value;
}

function buildOcrCorrections(result) {
  const corrections = {};
  addNonEmpty(corrections, 'supplierName', result.extractedSupplierName);
  addNonEmpty(corrections, 'supplierAddress', result.extractedSupplierAddress);
  addNonEmpty(corrections, 'invoiceNumber', result.extractedInvoiceNumber);
  addNonEmpty(corrections, 'matchedSupplierId', result.matchedSupplierId);
  if (result.extractedInvoiceDate) corrections.invoiceDate = toDateInput(result.extractedInvoiceDate);
  if (result.extractedDueDate) corrections.dueDate = toDateInput(result.extractedDueDate);
  if (result.extractedTotal != null) corrections.total = Number(result.extractedTotal);
  if (result.extractedVat != null) corrections.vat = Number(result.extractedVat);
  if (Array.isArray(result.extractedLineItems) && result.extractedLineItems.length) {
    corrections.lineItems = result.extractedLineItems;
  }
  return corrections;
}

function OcrReviewDialog({ document, open, onClose, de, t }) {
  const { data: result, isLoading } = useAccDocumentOcrResult(document?._id);
  const { confirmOcr, rejectOcr } = useAccDocumentMutations();
  const [previewUrl, setPreviewUrl] = useState('');
  const corrections = result ? buildOcrCorrections(result) : {};
  const canConfirm = Object.keys(corrections).length > 0;

  useEffect(() => {
    let objectUrl = '';
    let active = true;

    async function loadPreview() {
      if (!open || !document?._id) return;
      try {
        const response = await accDocService.download(document._id);
        if (!active) return;
        objectUrl = URL.createObjectURL(response.data);
        setPreviewUrl(objectUrl);
      } catch {
        if (active) setPreviewUrl('');
      }
    }

    loadPreview();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setPreviewUrl('');
    };
  }, [document?._id, open]);

  const handleConfirm = async () => {
    if (!document?._id || !canConfirm) return;
    await confirmOcr.mutateAsync({
      id: document._id,
      data: { corrections },
    });
    onClose();
  };

  const handleReject = async () => {
    if (!document?._id) return;
    await rejectOcr.mutateAsync({
      id: document._id,
      data: { reason: t('accounting.reason.ocrRejected', 'Rejected in accounting review') },
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{de ? 'OCR pruefen' : 'Review OCR'}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : result ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="min-h-96 overflow-hidden rounded-xl border border-border bg-muted/20">
              {previewUrl && document?.mimeType === 'application/pdf' ? (
                <iframe src={`${previewUrl}#toolbar=1&view=FitH`} title={document.fileName} className="h-96 w-full border-0" />
              ) : previewUrl && document?.mimeType?.startsWith('image/') ? (
                <div className="relative h-96 w-full">
                  <Image src={previewUrl} alt={document.fileName || 'Document'} fill unoptimized className="object-contain" />
                </div>
              ) : (
                <div className="flex h-96 items-center justify-center p-6 text-center text-sm text-muted-foreground">
                  {de ? 'Keine Vorschau verfuegbar. Download zum Pruefen verwenden.' : 'No preview available. Use download to inspect the source document.'}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-border p-3">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">{de ? 'Extraktion' : 'Extraction'}</h3>
              <dl className="grid grid-cols-[8rem_1fr] gap-2 text-sm">
                <dt className="text-muted-foreground">{de ? 'Lieferant' : 'Supplier'}</dt>
                <dd className="font-medium">{result.extractedSupplierName || '-'}</dd>
                <dt className="text-muted-foreground">{de ? 'Rechnung' : 'Invoice'}</dt>
                <dd className="font-mono text-xs">{result.extractedInvoiceNumber || '-'}</dd>
                <dt className="text-muted-foreground">{de ? 'Datum' : 'Date'}</dt>
                <dd>{formatDate(result.extractedInvoiceDate)}</dd>
                <dt className="text-muted-foreground">{de ? 'Faellig' : 'Due'}</dt>
                <dd>{formatDate(result.extractedDueDate)}</dd>
                <dt className="text-muted-foreground">Total</dt>
                <dd className="font-semibold">{formatMoney(result.extractedTotal)}</dd>
                <dt className="text-muted-foreground">MWST</dt>
                <dd>{formatMoney(result.extractedVat)}</dd>
              </dl>
            </div>
            <div className="rounded-xl border border-border p-3 md:col-start-2">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">{de ? 'Qualitaet' : 'Quality'}</h3>
              <p className="text-sm">
                {de ? 'Status' : 'Status'}: <span className="font-semibold">{result.status}</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {(result.lowConfidenceFields || []).length
                  ? `${de ? 'Tiefe Sicherheit' : 'Low confidence'}: ${(result.lowConfidenceFields || []).join(', ')}`
                  : (de ? 'Keine tiefen Vertrauenswerte gemeldet.' : 'No low-confidence fields reported.')}
              </p>
              <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-muted/40 p-3 text-xs whitespace-pre-wrap">
                {result.rawText || '-'}
              </pre>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{de ? 'Noch kein OCR-Ergebnis.' : 'No OCR result yet.'}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleReject} disabled={!result || rejectOcr.isPending}>{de ? 'Ablehnen' : 'Reject'}</Button>
          <Button onClick={handleConfirm} disabled={!canConfirm || confirmOcr.isPending}>{de ? 'Bestaetigen' : 'Confirm'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignDocumentDialog({ document, documentIds, open, onClose, de }) {
  const { assignDocument, bulkAssignDocuments } = useAccDocumentMutations();
  const { data: users = [], isLoading } = useUserDirectory({ limit: 80, enabled: open });
  const [userId, setUserId] = useState('');
  const [note, setNote] = useState('');
  const ids = document?._id ? [document._id] : [...documentIds];
  const isBulk = ids.length > 1;
  const isPending = assignDocument.isPending || bulkAssignDocuments.isPending;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!userId || ids.length === 0) return;
    const payload = { userId, note };
    if (isBulk) {
      await bulkAssignDocuments.mutateAsync({ documentIds: ids, ...payload });
    } else {
      await assignDocument.mutateAsync({ id: ids[0], data: payload });
    }
    setUserId('');
    setNote('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{de ? 'Beleg zuweisen' : 'Assign Document'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {isBulk
              ? `${ids.length} ${de ? 'Belege' : 'documents'}`
              : document?.fileName}
          </p>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder={isLoading ? (de ? 'Laedt...' : 'Loading...') : (de ? 'Mitarbeiter auswaehlen' : 'Select employee')} />
            </SelectTrigger>
            <SelectContent>
              {users.map((user) => (
                <SelectItem key={user._id} value={user._id}>
                  {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user._id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="h-9"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={de ? 'Notiz optional' : 'Optional note'}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>{de ? 'Abbrechen' : 'Cancel'}</Button>
            <Button type="submit" disabled={isPending || !userId || ids.length === 0}>
              {isPending ? '...' : (de ? 'Zuweisen' : 'Assign')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AccountingDocumentsPage() {
  const { locale: language, t } = useLanguage();
  const de = language === 'de';
  const fileRef = useRef(null);
  const [documentType, setDocumentType] = useState('SUPPLIER_INVOICE');
  const [search, setSearch] = useState('');
  const [cursorStack, setCursorStack] = useState([null]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [reviewDoc, setReviewDoc] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);
  const cursor = cursorStack[cursorStack.length - 1];
  const params = {
    limit: 50,
    ...(documentType !== 'ALL' && { documentType }),
    ...(search && { search }),
    ...(cursor && { cursor }),
  };
  const { data: { items = [], pagination } = {}, isLoading } = useAccDocuments(params);
  const { uploadDocument, triggerOcr } = useAccDocumentMutations();

  const toggleSelected = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      next.has(String(id)) ? next.delete(String(id)) : next.add(String(id));
      return next;
    });
  };

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const effectiveType = documentType === 'ALL' ? 'SUPPLIER_INVOICE' : documentType;
    for (const file of files) {
      await uploadDocument.mutateAsync({ file, meta: { documentType: effectiveType } });
    }
    event.target.value = '';
  };

  const handleDownload = async (document) => {
    const response = await accDocService.download(document._id);
    downloadResponse(response, document.fileName || `accounting-document-${document._id}`);
  };

  const handleBulkDownload = async () => {
    const response = await accDocService.bulkDownload({ documentIds: [...selectedIds] });
    downloadResponse(response, `accounting-documents-${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip');
    setSelectedIds(new Set());
  };

  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{de ? 'Belegarchiv' : 'Document Archive'}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {de ? 'Buchhaltungsbelege, OCR und Zuweisungen.' : 'Accounting documents, OCR, and assignments.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input className="h-9 w-56" value={search} onChange={(event) => { setSearch(event.target.value); setCursorStack([null]); }} placeholder={de ? 'Suchen...' : 'Search...'} />
          <Select value={documentType} onValueChange={(value) => { setDocumentType(value); setCursorStack([null]); }}>
            <SelectTrigger className="h-9 w-52 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{de ? 'Alle Typen' : 'All Types'}</SelectItem>
              {DOCUMENT_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploadDocument.isPending}>
            <Upload className="h-4 w-4 mr-1.5" />
            {de ? 'Upload' : 'Upload'}
          </Button>
          <input ref={fileRef} type="file" className="hidden" multiple accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.txt" onChange={handleUpload} />
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
          <span className="text-sm font-medium">{selectedIds.size} {de ? 'Belege ausgewaehlt' : 'documents selected'}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setAssignTarget({ bulk: true })}>
              <UserPlus className="h-4 w-4 mr-1.5" />
              {de ? 'Zuweisen' : 'Assign'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleBulkDownload}>
              <Download className="h-4 w-4 mr-1.5" />
              ZIP
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 w-8" />
              <th className="px-3 py-2.5 text-left">{de ? 'Datei' : 'File'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Typ' : 'Type'}</th>
              <th className="px-3 py-2.5 text-left">OCR</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Status' : 'Status'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Erstellt' : 'Created'}</th>
              <th className="px-3 py-2.5 w-44" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, index) => (
                <tr key={index} className="border-b border-border/50">
                  {Array.from({ length: 7 }).map((__, cellIndex) => <td key={cellIndex} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>)}
                </tr>
              ))
            ) : items.map((document) => {
              const canRunOcr = OCR_DOCUMENT_TYPES.has(document.documentType);
              return (
              <tr key={document._id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="px-3 py-3"><input type="checkbox" checked={selectedIds.has(String(document._id))} onChange={() => toggleSelected(document._id)} /></td>
                <td className="px-3 py-3">
                  <p className="font-medium truncate max-w-sm">{document.fileName}</p>
                  <p className="text-xs text-muted-foreground">{document.projectReference || document.accountingCategory || '-'}</p>
                </td>
                <td className="px-3 py-3 font-mono text-xs">{document.documentType}</td>
                <td className="px-3 py-3">{document.ocrStatus || '-'}</td>
                <td className="px-3 py-3">{document.processingStatus || '-'}</td>
                <td className="px-3 py-3">{formatDate(document.createdAt)}</td>
                <td className="px-3 py-3 text-right">
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => handleDownload(document)}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => triggerOcr.mutate(document._id)}
                      disabled={!canRunOcr || triggerOcr.isPending}
                      title={canRunOcr ? 'OCR' : (de ? 'OCR fuer diesen Typ nicht verfuegbar' : 'OCR unavailable for this type')}
                    >
                      OCR
                    </Button>
                    <Button size="sm" className="h-7 px-2 text-xs" onClick={() => setReviewDoc(document)}>
                      <FileSearch className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setAssignTarget(document)}>
                      <UserPlus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
              );
            })}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">{de ? 'Keine Belege.' : 'No documents.'}</td></tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <Button size="sm" variant="outline" onClick={() => setCursorStack((current) => current.length > 1 ? current.slice(0, -1) : current)} disabled={cursorStack.length <= 1}>{de ? 'Zurueck' : 'Previous'}</Button>
          <span className="text-xs text-muted-foreground">{cursorPageLabel(cursorStack.length - 1, t)}</span>
          <Button size="sm" variant="outline" onClick={() => pagination?.nextCursor && setCursorStack((current) => [...current, pagination.nextCursor])} disabled={!pagination?.hasNext}>{de ? 'Weiter' : 'Next'}</Button>
        </div>
      </div>

      <OcrReviewDialog document={reviewDoc} open={!!reviewDoc} onClose={() => setReviewDoc(null)} de={de} t={t} />
      <AssignDocumentDialog
        document={assignTarget?.bulk ? null : assignTarget}
        documentIds={selectedIds}
        open={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        de={de}
      />
    </div>
  );
}
