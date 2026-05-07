'use client';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSendEmail } from '../../hooks/useEmailMutations';

export function EmailComposeModal({ open, onClose, initialValues = {} }) {
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
        <DialogHeader><DialogTitle>Send by Email</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div><Label>To</Label><Input value={form.to} onChange={set('to')} placeholder="email@example.com, ..." /></div>
          <div><Label>CC</Label><Input value={form.cc} onChange={set('cc')} placeholder="optional" /></div>
          <div className="flex flex-col gap-1.5">
            <Label>BCC</Label>
            <Input value={form.bcc} onChange={(e) => setForm(f => ({ ...f, bcc: e.target.value }))}
              placeholder="optional" className="text-sm" />
          </div>
          <div><Label>Subject</Label><Input value={form.subject} onChange={set('subject')} /></div>
          <div><Label>Message</Label><Textarea rows={7} value={form.bodyHtml} onChange={set('bodyHtml')} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={send.isPending}>
            {send.isPending ? 'Sending…' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
