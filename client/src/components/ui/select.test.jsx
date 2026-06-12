import * as React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

beforeAll(() => {
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  }
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  }
});

function RichSelectHarness() {
  const [value, setValue] = React.useState('SERVICE_CALL');

  return (
    <Select value={value} onValueChange={setValue}>
      <SelectTrigger aria-label="Assignment type">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="SERVICE_CALL" textValue="Serviceeinsatz">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true">S</span>
            Serviceeinsatz
          </span>
        </SelectItem>
        <SelectItem value="PROJECT_WORK" textValue="Projektarbeit">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true">P</span>
            Projektarbeit
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

describe('Select', () => {
  it('cleans up rich item text after selecting and unmounting', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const { unmount } = render(<RichSelectHarness />);

      await user.click(screen.getByRole('combobox', { name: 'Assignment type' }));
      await user.click(await screen.findByRole('option', { name: 'Projektarbeit' }));

      expect(screen.getByRole('combobox', { name: 'Assignment type' })).toHaveTextContent('Projektarbeit');

      expect(() => unmount()).not.toThrow();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
