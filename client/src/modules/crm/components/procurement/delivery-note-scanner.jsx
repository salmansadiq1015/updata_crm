'use client';

import { useRef, useState } from 'react';
import { Upload, FileText, CheckCircle2, Loader2, X, AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDeliveryNoteOcr } from '@/modules/crm/hooks/use-procurement-mutations';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

const STEP_UPLOAD = 'upload';
const STEP_SCANNING = 'scanning';
const STEP_REVIEW = 'review';
const STEP_DONE = 'done';

export function DeliveryNoteScanner({ open, onOpenChange }) {
  const { t } = useLanguage();
  const tx = (key, vars) => t(`crm.procurement.${key}`, null, vars);
  const fileRef = useRef(null);

  const [step, setStep] = useState(STEP_UPLOAD);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [ocrResult, setOcrResult] = useState(null);
  const [editedItems, setEditedItems] = useState([]);

  const { upload, confirm } = useDeliveryNoteOcr({
    onConfirm: () => {
      setStep(STEP_DONE);
    },
  });

  const resetScanner = () => {
    setStep(STEP_UPLOAD);
    setFile(null);
    setJobId(null);
    setOcrResult(null);
    setEditedItems([]);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(resetScanner, 300);
  };

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragOver(false);
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleUpload = async () => {
    if (!file) return;
    setStep(STEP_SCANNING);
    const formData = new FormData();
    formData.append('file', file);
    const result = await upload.mutateAsync(formData);
    setJobId(result.jobId);
    const items = result.items || [];
    setOcrResult(result);
    setEditedItems(items.map((item) => ({ ...item })));
    setStep(STEP_REVIEW);
  };

  const handleConfirm = () => {
    if (!jobId) return;
    confirm.mutate({
      jobId,
      data: { items: editedItems },
    });
  };

  const updateEditedItem = (index, field, value) => {
    setEditedItems((prev) => prev.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-violet-500" />
            {tx('delivery.title')}
          </DialogTitle>
        </DialogHeader>

        {step === STEP_UPLOAD && (
          <div className="space-y-4">
            <div
              className={cn(
                'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer',
                dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/50 hover:bg-muted/30',
              )}
              onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-muted-foreground mb-3" />
              {file ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(0)} KB
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    {tx('delivery.drop')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{tx('delivery.fileHint')}</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(event) => handleFileSelect(event.target.files[0])}
              />
            </div>

            {file && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-3">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate flex-1">{file.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setFile(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                {tx('common.cancel')}
              </Button>
              <Button
                type="button"
                disabled={!file || upload.isPending}
                onClick={handleUpload}
                className="gap-1.5"
              >
                <Upload className="h-4 w-4" />
                {tx('actions.startScan')}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === STEP_SCANNING && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div className="text-center">
              <p className="font-medium">
                {tx('delivery.scanning')}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {tx('delivery.identifying')}
              </p>
            </div>
          </div>
        )}

        {step === STEP_REVIEW && (
          <div className="space-y-4">
            {ocrResult?.confidence && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 p-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  {tx('delivery.confidence', { percent: Math.round(ocrResult.confidence * 100) })}
                </p>
              </div>
            )}

            {editedItems.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-3">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {tx('delivery.noItems')}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_80px_80px] gap-0 px-3 py-2 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
                  <span>{tx('columns.article')}</span>
                  <span>{tx('columns.qty')}</span>
                  <span>{tx('columns.unit')}</span>
                </div>
                {editedItems.map((item, index) => (
                  <div key={index} className="grid grid-cols-[1fr_80px_80px] gap-2 px-3 py-2 border-b border-border/50 last:border-0 items-center">
                    <Input
                      value={item.name || item.partNumber || ''}
                      onChange={(event) => updateEditedItem(index, 'name', event.target.value)}
                      className="h-7 text-sm"
                    />
                    <Input
                      type="number"
                      min="0"
                      value={item.quantity || ''}
                      onChange={(event) => updateEditedItem(index, 'quantity', event.target.value)}
                      className="h-7 text-sm text-center"
                    />
                    <Input
                      value={item.unit || 'Stk'}
                      onChange={(event) => updateEditedItem(index, 'unit', event.target.value)}
                      className="h-7 text-sm text-center"
                    />
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep(STEP_UPLOAD)}>
                {tx('actions.back')}
              </Button>
              <Button
                type="button"
                disabled={confirm.isPending || editedItems.length === 0}
                onClick={handleConfirm}
                className="gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4" />
                {confirm.isPending ? tx('actions.processing') : tx('actions.confirmReceive')}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === STEP_DONE && (
          <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            </div>
            <div>
              <p className="font-semibold text-lg">
                {tx('delivery.done.title')}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {tx('delivery.done.description')}
              </p>
            </div>
            <Button onClick={handleClose}>
              {tx('actions.close')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
