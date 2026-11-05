import EmailWorkspace from '@/modules/email/email-workspace';
export const metadata = { title: 'Email · Updata CRM' };
export default async function EmailPage({ searchParams }) {
  const params = await searchParams;
  const messageId = typeof params?.messageId === 'string' && /^[a-f0-9]{24}$/i.test(params.messageId) ? params.messageId : null;
  return <EmailWorkspace initialMessageId={messageId} />;
}
