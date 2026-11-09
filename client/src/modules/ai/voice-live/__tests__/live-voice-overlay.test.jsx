import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ t: (key, fallback) => (typeof fallback === 'string' ? fallback : key), locale: 'en' }),
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a> }));

// jsdom has no WebGL: the orb must fall back to its CSS rendering.
HTMLCanvasElement.prototype.getContext = () => null;

import { LiveVoiceOverlay, orbStateOf } from '../live-voice-overlay';
import { speakableOutput } from '../../utils/speakable-output';

function makeLive(overrides = {}) {
  return {
    status: 'live', activity: 'listening', muted: false, error: null,
    transcript: [], actions: [],
    toggleMute: vi.fn(), interrupt: vi.fn(), sendText: vi.fn(), getLevels: () => ({ input: 0, output: 0 }),
    ...overrides,
  };
}

function renderOverlay(liveOverrides = {}, props = {}) {
  const live = makeLive(liveOverrides);
  const handlers = { onMinimize: vi.fn(), onExpand: vi.fn(), onClose: vi.fn(), onRetry: vi.fn(), onVoiceChange: vi.fn() };
  render(<LiveVoiceOverlay live={live} minimized={false} voice="marin" {...handlers} {...props} />);
  return { live, ...handlers };
}

describe('LiveVoiceOverlay', () => {
  test('full screen: orb, state and the four controls', () => {
    const { live, onClose } = renderOverlay();
    expect(screen.getByTestId('live-voice-overlay')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('voice-orb').querySelector('canvas')).toBeNull(); // CSS fallback rendered
    expect(screen.getByTestId('voice-orb')).toHaveAttribute('data-state', 'listening');
    expect(screen.getByTestId('live-voice-status')).toHaveTextContent('Listening');
    fireEvent.click(screen.getByTestId('live-voice-mute'));
    expect(live.toggleMute).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('live-voice-end'));
    expect(onClose).toHaveBeenCalled();
    // interrupt only while the assistant speaks
    expect(screen.getByTestId('live-voice-interrupt')).toBeDisabled();
  });

  test('captions show the latest exchange; tool work is named', () => {
    renderOverlay({
      activity: 'working',
      transcript: [
        { id: 'u1', role: 'user', text: 'Create a task for Thomas', final: true },
        { id: 'a1', role: 'assistant', text: 'One moment.', final: true },
      ],
      actions: [{ id: 'c1', name: 'crm_request', args: { request: 'Create a task for Thomas' }, status: 'running' }],
    });
    expect(screen.getByTestId('voice-orb')).toHaveAttribute('data-state', 'working');
    expect(screen.getByTestId('live-voice-status')).toHaveTextContent('Working on it…');
    const captions = screen.getByTestId('live-voice-captions');
    expect(captions).toHaveTextContent('Create a task for Thomas');
    expect(captions).toHaveTextContent('One moment.');
    expect(screen.getByTestId('live-voice-action')).toHaveAttribute('data-status', 'running');
  });

  test('completed agent action shows the record link from the run output', () => {
    renderOverlay({
      actions: [{
        id: 'c1', name: 'crm_request', args: { request: 'Create task' }, status: 'completed',
        result: { status: 'completed', message: 'Task created' },
        display: { kind: 'agent_run', output: { message: 'Task created', recordType: 'task', recordId: 't1', record: { title: 'Boiler check' } } },
      }, {
        id: 'c2', name: 'create_lead', args: {}, status: 'completed',
        result: { status: 'completed' },
        display: { kind: 'record', recordType: 'lead', title: 'Alpenblick', href: '/leads?leadId=l1' },
      }],
    });
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(expect.arrayContaining(['/tasks/all/t1', '/leads?leadId=l1']));
  });

  test('typing mode sends text without leaving the conversation', () => {
    const { live } = renderOverlay();
    fireEvent.click(screen.getByTestId('live-voice-type'));
    const input = screen.getByTestId('live-voice-text-input');
    fireEvent.change(input, { target: { value: 'Show my follow-ups' } });
    fireEvent.submit(input.closest('form'));
    expect(live.sendText).toHaveBeenCalledWith('Show my follow-ups');
  });

  test('keyboard: Space toggles the mic, Escape ends', () => {
    const { live, onClose } = renderOverlay();
    fireEvent.keyDown(window, { key: ' ' });
    expect(live.toggleMute).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  test('transcript drawer lists the whole conversation', () => {
    renderOverlay({ transcript: [
      { id: 'u1', role: 'user', text: 'Hello', final: true },
      { id: 'a1', role: 'assistant', text: 'Hi Salman', final: true },
    ] });
    fireEvent.click(screen.getByTestId('live-voice-transcript-toggle'));
    const drawer = screen.getByTestId('live-voice-transcript');
    expect(drawer).toHaveTextContent('Hello');
    expect(drawer).toHaveTextContent('Hi Salman');
  });

  test('errors explain what to do and offer a retry when it can help', () => {
    const { onRetry } = renderOverlay({ status: 'error', error: 'mic_denied' });
    expect(screen.getByTestId('live-voice-captions')).toHaveTextContent(/Microphone access was blocked/);
    fireEvent.click(screen.getByTestId('live-voice-retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  test('no retry when the server is not configured', () => {
    renderOverlay({ status: 'error', error: 'unavailable' });
    expect(screen.queryByTestId('live-voice-retry')).toBeNull();
  });

  test('voice can be chosen before connecting, not mid-conversation', () => {
    const { onVoiceChange } = renderOverlay({ status: 'error', error: 'connect_failed' });
    fireEvent.click(screen.getByTestId('live-voice-voice-picker'));
    fireEvent.click(screen.getByRole('option', { name: /Cedar/ }));
    expect(onVoiceChange).toHaveBeenCalledWith('cedar');
  });

  test('voice picker is locked while live', () => {
    renderOverlay();
    expect(screen.getByTestId('live-voice-voice-picker')).toBeDisabled();
  });

  test('minimized: floating pill keeps mute, expand and end', () => {
    const live = makeLive({ activity: 'speaking' });
    const onExpand = vi.fn(); const onClose = vi.fn();
    render(<LiveVoiceOverlay live={live} minimized voice="marin" onExpand={onExpand} onClose={onClose} onMinimize={vi.fn()} onRetry={vi.fn()} onVoiceChange={vi.fn()} />);
    expect(screen.getByTestId('live-voice-mini')).toHaveTextContent('Speaking');
    expect(screen.queryByTestId('live-voice-overlay')).toBeNull();
    fireEvent.click(screen.getByTestId('live-voice-end-mini'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('orbStateOf', () => {
  test('maps connection + activity + mute to an orb state', () => {
    expect(orbStateOf({ status: 'connecting' })).toBe('connecting');
    expect(orbStateOf({ status: 'error' })).toBe('error');
    expect(orbStateOf({ status: 'live', activity: 'listening', muted: true })).toBe('muted');
    expect(orbStateOf({ status: 'live', activity: 'speaking', muted: true })).toBe('speaking');
    expect(orbStateOf({ status: 'live', activity: 'working', muted: false })).toBe('working');
  });
});

describe('speakableOutput (chat auto-speak)', () => {
  test('speaks the message, never raw JSON or ids', () => {
    expect(speakableOutput({ message: '**Task** created 65f1c2a9b3e4d5f6a7b8c9d0' })).toBe('Task created');
    expect(speakableOutput({ records: [{ a: 1 }] })).toBe('');
    expect(speakableOutput(null)).toBe('');
  });
});
