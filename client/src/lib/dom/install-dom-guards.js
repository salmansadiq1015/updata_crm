'use client';

/**
 * Harden React against `NotFoundError: Failed to execute 'removeChild' /
 * 'insertBefore' on 'Node'` crashes caused by external DOM mutation.
 *
 * Browser auto-translation (Chrome / Google Translate), Grammarly, and similar
 * extensions replace or re-parent text nodes that React is still tracking in its
 * fiber tree. When React later unmounts or re-orders that subtree it calls
 * `parent.removeChild(node)` / `parent.insertBefore(node, ref)` against a node
 * that is no longer a child of `parent`, the DOM throws `NotFoundError` (code 8),
 * and the entire React subtree falls into the global error boundary.
 *
 * This is a long-standing React issue (facebook/react#11538). The recommended
 * remedy is to make these two Node methods no-op gracefully in the exact
 * mismatch case, so React's reconciliation survives instead of crashing the app.
 *
 * The patch is:
 *  - idempotent (safe across HMR / double-invocation),
 *  - a strict superset of native behaviour — it only changes the outcome when
 *    the node is genuinely not a child, where the native call would have thrown.
 */
export function installDomGuards() {
  if (typeof window === 'undefined' || typeof Node === 'undefined' || !Node.prototype) {
    return;
  }
  if (window.__mbReactDomGuardsInstalled) {
    return;
  }
  window.__mbReactDomGuardsInstalled = true;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function removeChild(child) {
    if (child && child.parentNode !== this) {
      // The node was already detached/re-parented by an external agent
      // (translation, extension). Return it instead of throwing NotFoundError.
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(
          '[dom-guard] Suppressed removeChild on a node that is no longer a child of the target parent.',
          { child, parent: this },
        );
      }
      return child;
    }
    return originalRemoveChild.apply(this, arguments);
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function insertBefore(newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      // The reference node was moved out from under us; append instead of
      // throwing NotFoundError so React can keep reconciling.
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(
          '[dom-guard] Suppressed insertBefore against a reference node from a different parent; appending instead.',
          { newNode, referenceNode, parent: this },
        );
      }
      return originalInsertBefore.call(this, newNode, null);
    }
    return originalInsertBefore.apply(this, arguments);
  };
}

// Run on import so the guards are in place before React's first commit on the
// client. This module is only ever imported from a client boundary.
installDomGuards();
