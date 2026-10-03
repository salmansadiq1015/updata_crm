'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { EmailComposeModal } from '@/modules/doctpl/components/EmailComposeModal';

/**
 * Send an email from a CRM record (object, customer). Opens the compose modal
 * straight away — attaching documents is optional and happens inside it, from
 * the Anhänge section, so a plain message never has to go through a document
 * picker first.
 *
 * `attachmentScope` pre-filters that picker to the record's own documents
 * (e.g. { siteId } / { customerId }).
 */
export function EntityEmailButton({
  sourceRecordId,
  sourceModule = 'crm',
  attachmentScope = {},
  defaultTo,
  onSent,
  variant = 'outline',
  size = 'sm',
  className = 'gap-1.5',
  // Plain-message senders (e.g. a lead) opt out of the mandatory attachment.
  requireAttachment = true,
  // When set, lead template variables resolve server-side on render.
  leadId,
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <Mail className="h-3.5 w-3.5" /> {t('crm.sites.sendEmail', 'E-Mail senden')}
      </Button>

      <EmailComposeModal
        open={open}
        onClose={() => setOpen(false)}
        onSent={onSent}
        requireAttachment={requireAttachment}
        leadId={leadId}
        initialValues={{
          to: defaultTo || '',
          sourceModule,
          sourceRecordId,
          attachmentScope,
        }}
      />
    </>
  );
}
