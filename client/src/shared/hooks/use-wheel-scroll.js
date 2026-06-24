'use client';

import { useCallback, useRef } from 'react';

function isScrollable(el) {
  if (!el || el.scrollHeight <= el.clientHeight) return false;
  const overflowY = getComputedStyle(el).overflowY;
  return overflowY === 'auto' || overflowY === 'scroll';
}

// Returns a callback ref for a container whose mouse wheel must keep working
// while it lives inside a portaled popover opened over a modal Dialog.
//
// Radix Dialog locks background scrolling via react-remove-scroll. A popover
// portaled to <body> is a sibling of the dialog, so it counts as "background"
// and its wheel events get swallowed — lists won't scroll. We attach a
// non-passive wheel listener and drive scrollTop ourselves, which is immune to
// the lock. From the event target we walk up to the attached node to find the
// nearest scrollable element (so this works whether the ref sits on the scroll
// container itself or on a wrapper whose child scrolls). The listener is
// added/removed as the element mounts/unmounts.
export function useWheelScroll() {
  const cleanupRef = useRef(null);

  return useCallback((node) => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (!node) return;

    const onWheel = (event) => {
      let el = event.target;
      while (el && el !== node && !isScrollable(el)) {
        el = el.parentElement;
      }
      const scroller = el && isScrollable(el) ? el : (isScrollable(node) ? node : null);
      if (!scroller) return;

      event.preventDefault();
      event.stopPropagation();
      const max = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = Math.max(0, Math.min(max, scroller.scrollTop + event.deltaY));
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    cleanupRef.current = () => node.removeEventListener('wheel', onWheel);
  }, []);
}
