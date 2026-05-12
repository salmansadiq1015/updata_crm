'use client';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/lib/i18n/language-context';
import { useSendEmail } from '../../hooks/useEmailMutations';

export function EmailComposeModal({ open, onClose, initialValues = {} }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ to: '', cc: '', bcc: '', subject: '', bodyHtml: '', documentId: null, sourceModule: null, sourceRecordId: null });
  const send = useSendEmail();

  useEffect(() => {
    if (open && initialValues) setForm((f) => ({ ...f, ...initialValues }));
  }, [open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSend = async () => {
    await send.mutateAsync({
      ...form,
      to:  form.to.split(',').map((s) => s.trim()).filter(Boolean),
      cc:  form.cc ? form.cc.split(',').map((s) => s.trim()).filter(Boolean) : [],
      bcc: form.bcc ? form.bcc.split(',').map((s) => s.trim()).filter(Boolean) : [],
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{t('doctpl.sendByEmail')}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div><Label>{t('doctpl.to')}</Label><Input value={form.to} onChange={set('to')} placeholder="email@example.com, ..." /></div>
          <div><Label>{t('doctpl.cc')}</Label><Input value={form.cc} onChange={set('cc')} placeholder={t('common.optional')} /></div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('doctpl.bcc')}</Label>
            <Input value={form.bcc} onChange={(e) => setForm(f => ({ ...f, bcc: e.target.value }))}
              placeholder={t('common.optional')} className="text-sm" />
          </div>
          <div><Label>{t('doctpl.subject')}</Label><Input value={form.subject} onChange={set('subject')} /></div>
          <div><Label>{t('doctpl.message')}</Label><Textarea rows={7} value={form.bodyHtml} onChange={set('bodyHtml')} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSend} disabled={send.isPending}>
            {send.isPending ? t('doctpl.sending') : t('common.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
