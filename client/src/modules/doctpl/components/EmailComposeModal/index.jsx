'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/lib/i18n/language-context';
import { useSendEmail } from '../../hooks/useEmailMutations';

const DEFAULT_FORM = {
  to: '',
  cc: '',
  bcc: '',
  subject: '',
  bodyHtml: '',
  documentId: null,
  documentIds: [],
  sourceModule: null,
  sourceRecordId: null,
};

function normalizeRecipients(value) {
  if (Array.isArray(value)) return value.join(', ');
  return value || '';
}

function toRecipientList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildInitialForm(initialValues = {}) {
  return {
    ...DEFAULT_FORM,
    ...initialValues,
    to: normalizeRecipients(initialValues.to),
    cc: normalizeRecipients(initialValues.cc),
    bcc: normalizeRecipients(initialValues.bcc),
  };
}

function EmailComposeForm({ initialValues, onClose }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(() => buildInitialForm(initialValues));
  const send = useSendEmail();

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const handleSend = async () => {
    await send.mutateAsync({
      ...form,
      to: toRecipientList(form.to),
      cc: toRecipientList(form.cc),
      bcc: toRecipientList(form.bcc),
    });
    onClose();
  };

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>{t('doctpl.sendByEmail')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-1">
        <div>
          <Label>{t('doctpl.to')}</Label>
          <Input value={form.to} onChange={set('to')} placeholder="email@example.com, ..." />
        </div>
        <div>
          <Label>{t('doctpl.cc')}</Label>
          <Input value={form.cc} onChange={set('cc')} placeholder={t('common.optional')} />
        </div>
        <div>
          <Label>{t('doctpl.bcc')}</Label>
          <Input value={form.bcc} onChange={set('bcc')} placeholder={t('common.optional')} className="text-sm" />
        </div>
        <div>
          <Label>{t('doctpl.subject')}</Label>
          <Input value={form.subject} onChange={set('subject')} />
        </div>
        <div>
          <Label>{t('doctpl.message')}</Label>
          <Textarea rows={7} value={form.bodyHtml} onChange={set('bodyHtml')} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={handleSend} disabled={send.isPending || !toRecipientList(form.to).length}>
          {send.isPending ? t('doctpl.sending') : t('common.send')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function EmailComposeModal({ open, onClose, initialValues = {} }) {
  const formKey = `${initialValues.documentId || ''}:${initialValues.subject || ''}:${initialValues.to || ''}`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {open && <EmailComposeForm key={formKey} initialValues={initialValues} onClose={onClose} />}
    </Dialog>
  );
}
