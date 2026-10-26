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

  it('reacts only to a bounded real audio level', () => {
    const { rerender } = render(<UpdataVoiceOrb state="speaking" audioLevel={4} size={160} />);
    expect(screen.getByRole('img')).toHaveStyle({ width: '160px', height: '160px', transform: 'scale(1.035)' });

    rerender(<UpdataVoiceOrb state="speaking" audioLevel={-3} size={160} />);
    expect(screen.getByRole('img')).toHaveStyle({ transform: 'scale(1)' });
  });

  it('removes component motion classes when reduced motion is requested', () => {
    const { container } = render(<UpdataVoiceOrb state="speaking" audioLevel={0.8} reducedMotion />);
    expect(screen.getByRole('img')).toHaveStyle({ transform: 'scale(1)' });
    expect(container.querySelector('.updata-orb-drift')).toBeNull();
    expect(container.querySelector('.updata-orb-breathe')).toBeNull();
    expect(container.querySelector('.updata-orb-slow-spin')).toBeNull();
  });
});
