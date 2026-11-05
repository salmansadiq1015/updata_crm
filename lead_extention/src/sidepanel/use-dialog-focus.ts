import { useEffect, useRef } from 'react';

/** Keep keyboard navigation inside the active dialog and restore its trigger. */
export function useDialogFocus(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    const selector = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]';
    const controls = () => Array.from(dialog?.querySelectorAll<HTMLElement>(selector) ?? []).filter((el) => el.getClientRects().length);
    controls()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const elements = controls();
      const first = elements[0]; const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return ref;
}
