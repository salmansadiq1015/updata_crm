import { describe, it, expect, beforeAll, vi } from 'vitest';
import { installDomGuards } from './install-dom-guards';

// Importing the module above already runs installDomGuards() once; calling it
// again proves idempotency and guarantees the guards are active for these tests.
beforeAll(() => {
  installDomGuards();
});

describe('install-dom-guards', () => {
  it('removes a genuine child normally', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);

    const returned = parent.removeChild(child);

    expect(returned).toBe(child);
    expect(parent.contains(child)).toBe(false);
  });

  it('does NOT throw when removing a node that was re-parented out (the auto-translate crash)', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);

    // Simulate an extension/translation engine moving the node elsewhere.
    const intruder = document.createElement('div');
    intruder.appendChild(child);
    expect(child.parentNode).toBe(intruder);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Native DOM would throw NotFoundError (code 8) here.
    expect(() => parent.removeChild(child)).not.toThrow();
    expect(parent.removeChild(child)).toBe(child);
    warn.mockRestore();
  });

  it('inserts before a valid reference node normally', () => {
    const parent = document.createElement('div');
    const ref = document.createElement('span');
    const node = document.createElement('b');
    parent.appendChild(ref);

    parent.insertBefore(node, ref);

    expect(parent.firstChild).toBe(node);
    expect(parent.childNodes[1]).toBe(ref);
  });

  it('does NOT throw when inserting before a reference node from a different parent; appends instead', () => {
    const parent = document.createElement('div');
    const node = document.createElement('b');

    const otherParent = document.createElement('div');
    const foreignRef = document.createElement('span');
    otherParent.appendChild(foreignRef);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Native DOM would throw NotFoundError here.
    expect(() => parent.insertBefore(node, foreignRef)).not.toThrow();
    expect(parent.contains(node)).toBe(true);
    warn.mockRestore();
  });

  it('is idempotent — repeated installs do not double-wrap', () => {
    installDomGuards();
    installDomGuards();
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);
    expect(parent.removeChild(child)).toBe(child);
  });
});
