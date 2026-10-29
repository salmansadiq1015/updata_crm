// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UpdataVoiceOrb, type UpdataVoiceOrbState } from '../ui/updata-voice-orb';

const expectedLabels: Record<UpdataVoiceOrbState, string> = {
  idle: 'Voice agent is idle',
  connecting: 'Voice agent is connecting',
  listening: 'Voice agent is listening',
  speaking: 'Voice agent is speaking',
  processing: 'Voice agent is processing',
  muted: 'Microphone is muted',
  reconnecting: 'Voice agent is reconnecting',
  error: 'Voice agent is disconnected',
};

describe('UpdataVoiceOrb', () => {
  it.each(Object.entries(expectedLabels))('exposes the %s state without relying on colour', (state, label) => {
    render(<UpdataVoiceOrb state={state as UpdataVoiceOrbState} />);
    const orb = screen.getByRole('img', { name: label });
    expect(orb).toHaveAttribute('data-state', state);
  });

  it('keeps a stable layout while audio levels change', () => {
    const { rerender } = render(<UpdataVoiceOrb state="speaking" audioLevel={4} size={160} />);
    expect(screen.getByRole('img')).toHaveStyle({ width: '160px', aspectRatio: '1' });

    rerender(<UpdataVoiceOrb state="speaking" audioLevel={-3} size={160} />);
    expect(screen.getByRole('img')).toHaveStyle({ width: '160px', aspectRatio: '1' });
  });

  it('removes component motion classes when reduced motion is requested', () => {
    const { container } = render(<UpdataVoiceOrb state="speaking" audioLevel={0.8} reducedMotion />);
    expect(screen.getByRole('img')).toHaveAttribute('data-motion', 'reduced');
    expect(screen.getByRole('img')).not.toHaveAttribute('tabindex');
    expect(container.querySelector('.updata-orb-drift')).toBeNull();
    expect(container.querySelector('.updata-orb-breathe')).toBeNull();
    expect(container.querySelector('.updata-orb-slow-spin')).toBeNull();
  });

  it('makes large orbs keyboard accessible with interaction instructions', () => {
    render(<UpdataVoiceOrb size="lg" />);
    const orb = screen.getByRole('img');
    expect(orb).toHaveAttribute('tabindex', '0');
    expect(orb).toHaveAccessibleDescription(/Drag or use arrow keys to rotate/);
    expect(orb).toHaveAccessibleDescription(/Home to reset/);
  });

  it('keeps decorative avatars out of the tab order', () => {
    render(<UpdataVoiceOrb size="compact" />);
    expect(screen.getByRole('img')).not.toHaveAttribute('tabindex');
    expect(screen.getByRole('img')).toHaveAttribute('data-interactive', 'false');
  });
});
