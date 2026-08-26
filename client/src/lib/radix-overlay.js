/**
 * Radix Select/Popover/Dropdown portals render outside Sheet/Dialog content.
 * Modal layers set pointer-events:none on the document, which blocks option clicks.
 * Use these helpers on dismiss handlers and pair with globals.css overlay rules.
 */

const OVERLAY_SELECTORS = [
  "[data-slot='select-trigger']",
  "[data-slot='select-content']",
  "[data-slot='select-item']",
  "[data-slot='select-item-content']",
  "[data-slot='select-viewport']",
  "[data-slot='switch']",
  "[data-slot='switch-thumb']",
  "[data-radix-select-trigger]",
  "[data-radix-select-content]",
  "[data-radix-select-viewport]",
  "[data-radix-select-item]",
  "[data-slot='dropdown-menu-content']",
  "[data-slot='dropdown-menu-item']",
  "[data-slot='dropdown-menu-sub-content']",
  "[data-slot='popover-content']",
  "[data-slot='combobox-content']",
  "[data-radix-popper-content-wrapper]",
  "[data-radix-popover-content-wrapper]",
  "[role='listbox']",
  "[role='option']",
  "[role='menu']",
  "[role='menuitem']",
  // The global "report an issue" FAB (modules/support/components/feedback-fab.jsx)
  // is a fixed-position sibling outside the Sheet/Dialog portal. Without
  // this, clicking it while a Sheet is open registers as an outside
  // pointer-down and dismisses the Sheet before its own onClick can fire.
  '.feedback-fab-ignore',
  // A second Sheet/Dialog opened on top of this one (e.g. the FAB opening
  // the support-ticket Sheet while an order/report Sheet is still open
  // underneath) auto-focuses something inside itself, which fires this
  // Sheet's onFocusOutside — that's normal modal-stacking, not a user
  // dismissing THIS Sheet, so it must never close it.
  "[data-slot='sheet-content']",
  "[data-slot='dialog-content']",
];

/**
 * @param {EventTarget | null | undefined} target
 */
export function isRadixOverlayTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return OVERLAY_SELECTORS.some((selector) => target.closest(selector));
}

function collectDismissTargets(event) {
  const targets = [event.target];
  const original = event.detail?.originalEvent?.target;
  if (original) targets.push(original);
  if (typeof document !== 'undefined' && document.activeElement) {
    targets.push(document.activeElement);
  }
  // Radix defers this check to the subsequent `click` (to distinguish a
  // genuine outside click from a text-selection drag), and by then a click
  // handler on the actual target (e.g. the feedback FAB's onClick swapping
  // its icon while capturing) may already have detached the original node
  // from the document — closest() on a detached node always misses. Re-hit-
  // test the ORIGINAL event's coordinates against the CURRENT live DOM as a
  // fallback so detachment-by-re-render can't defeat the ignore-list.
  const pointerEvent = event.detail?.originalEvent;
  if (
    typeof document !== 'undefined' &&
    pointerEvent &&
    typeof pointerEvent.clientX === 'number' &&
    typeof document.elementFromPoint === 'function'
  ) {
    const live = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY);
    if (live) targets.push(live);
  }
  return targets;
}

function isRadixSelectOpen() {
  if (typeof document === 'undefined') return false;
  return Boolean(
    document.querySelector(
      '[data-slot="select-trigger"][data-state="open"], [data-slot="select-content"][data-state="open"], [data-radix-select-content][data-state="open"]',
    ),
  );
}

/**
 * Prevent Sheet/Dialog from closing or stealing focus when interacting with portaled menus.
 * @param {CustomEvent} event
 */
export function preventDismissIfRadixOverlay(event) {
  if (isRadixSelectOpen()) {
    event.preventDefault();
    return;
  }
  if (collectDismissTargets(event).some((t) => isRadixOverlayTarget(t))) {
    event.preventDefault();
  }
}
