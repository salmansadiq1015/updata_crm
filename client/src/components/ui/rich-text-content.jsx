import { cn } from '@/lib/utils';

export function RichTextContent({ html, className }) {
  if (!html) return null;

  return (
    <div
      className={cn('prose prose-sm dark:prose-invert max-w-none', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
