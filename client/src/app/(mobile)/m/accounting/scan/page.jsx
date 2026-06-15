'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, FileText, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { useAccountingDocumentScan } from '@/modules/mobile/hooks/use-accounting-document-scan';
import { ACCOUNTING_DOCUMENT_TYPE } from '@/modules/mobile/constants/mobile-constants';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const DOCUMENT_OPTIONS = [
  { value: ACCOUNTING_DOCUMENT_TYPE.SUPPLIER_INVOICE, de: 'Lieferantenrechnung', en: 'Supplier invoice' },
  { value: ACCOUNTING_DOCUMENT_TYPE.RECEIPT, de: 'Beleg', en: 'Receipt' },
  { value: ACCOUNTING_DOCUMENT_TYPE.OTHER, de: 'Sonstiges', en: 'Other' },
];

export default function MobileAccountingScanPage() {
  const { locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const scan = useAccountingDocumentScan();

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [documentType, setDocumentType] = useState(ACCOUNTING_DOCUMENT_TYPE.RECEIPT);
  const [projectReference, setProjectReference] = useState('');
  const [notes, setNotes] = useState('');

  const selectedLabel = useMemo(
    () => DOCUMENT_OPTIONS.find((option) => option.value === documentType)?.[lang] || documentType,
    [documentType, lang]
  );

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleFileSelect = (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;

    if (selected.size > 20 * 1024 * 1024) {
      toast.error(lang === 'de' ? 'Datei ist groesser als 20 MB' : 'File exceeds 20 MB');
      return;
    }

    setFile(selected);
    if (selected.type.startsWith('image/')) {
      const nextUrl = URL.createObjectURL(selected);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextUrl;
      });
    } else {
      setPreviewUrl(null);
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  };

  const submit = async () => {
    if (!file) {
      toast.error(lang === 'de' ? 'Bitte Dokument auswählen' : 'Please select a document');
      return;
    }

    try {
      await scan.mutateAsync({ file, documentType, projectReference, notes });
      clearFile();
      setNotes('');
      setProjectReference('');
    } catch {
      // Toast is handled by the mutation hook.
    }
  };

  return (
    <div className="flex min-h-full flex-col bg-background">
      <MobileHeader title={lang === 'de' ? 'Accounting Scan' : 'Accounting Scan'} showBack />

      <main className="flex-1 space-y-4 overflow-y-auto px-4 pb-28 pt-4">
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3">
            <CaptureButton
              icon={Camera}
              label={lang === 'de' ? 'Kamera' : 'Camera'}
              onClick={() => cameraInputRef.current?.click()}
            />
            <CaptureButton
              icon={Upload}
              label={lang === 'de' ? 'Datei' : 'File'}
              onClick={() => fileInputRef.current?.click()}
            />
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelect}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFileSelect}
          />
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          {file ? (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-lg border border-border bg-muted">
                {previewUrl ? (
                  <div className="relative h-72 w-full">
                    <Image src={previewUrl} alt="" fill sizes="100vw" unoptimized className="object-contain" />
                  </div>
                ) : (
                  <div className="flex min-h-44 flex-col items-center justify-center gap-2 text-muted-foreground">
                    <FileText className="h-10 w-10" />
                    <span className="max-w-full px-4 text-center text-sm font-medium">{file.name}</span>
                  </div>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 h-10 w-10 bg-background/90"
                  onClick={clearFile}
                  aria-label="Remove selected document"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{selectedLabel}</span>
                <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            </div>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <FileText className="h-10 w-10" />
              <p className="text-sm font-medium">
                {lang === 'de' ? 'Kein Dokument ausgewählt' : 'No document selected'}
              </p>
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <Select value={documentType} onValueChange={setDocumentType}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option[lang]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={projectReference}
            onChange={(event) => setProjectReference(event.target.value)}
            maxLength={100}
            className="h-11"
            placeholder={lang === 'de' ? 'Projekt / Auftrag (optional)' : 'Project / order (optional)'}
          />
          <Input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={500}
            className="h-11"
            placeholder={lang === 'de' ? 'Notiz (optional)' : 'Note (optional)'}
          />
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Button className="h-11 w-full" disabled={!file || scan.isPending} onClick={submit}>
          {scan.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {scan.isPending
            ? (lang === 'de' ? 'Wird gespeichert...' : 'Saving...')
            : (lang === 'de' ? 'Archivieren' : 'Archive')}
        </Button>
      </div>
    </div>
  );
}

function CaptureButton({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border',
        'bg-muted/30 text-sm font-medium transition-colors active:bg-muted'
      )}
    >
      <Icon className="h-7 w-7 text-muted-foreground" />
      {label}
    </button>
  );
}
