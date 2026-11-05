import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ChatInput } from '../components/chat-input';
vi.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => ({ t: (key, fallback) => fallback || key }) }));
vi.mock('../hooks/use-chat-typing', () => ({ useChatTyping: () => ({ onKeystroke: vi.fn() }) }));
vi.mock('../hooks/use-chat-mentions', () => ({ useChatMentions: () => ({ suggestions: [], registerMention: vi.fn(), getMentionIds: () => [], clearMentions: vi.fn() }) }));
vi.mock('../hooks/use-chat-attachment-upload', () => ({ useChatAttachmentUpload: () => ({ uploadAttachment: vi.fn(), uploadProgress: null, uploadError: '', setUploadError: vi.fn(), clearUploadState: vi.fn() }) }));
vi.mock('../components/chat-emoji-picker', () => ({ ChatEmojiPicker: () => null }));
vi.mock('../components/chat-audio-recorder', () => ({ ChatAudioRecorder: () => null }));
beforeEach(() => sessionStorage.clear());
afterEach(cleanup);
const props = { roomId: 'room-a', currentUserId: 'user-a', room: { members: [] } };
describe('chat draft delivery', () => {
  test('failed sends retain the draft and reuse the idempotency key on retry', async () => {
    const onSend = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<ChatInput {...props} onSend={onSend} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Please review this proposal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(input).toHaveValue('Please review this proposal');
    expect(sessionStorage.getItem('chat-draft:user-a:room-a')).toBe('Please review this proposal');
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(input).toHaveValue(''));
    expect(onSend.mock.calls[0][0].clientMessageId).toBe(onSend.mock.calls[1][0].clientMessageId);
  });
  test('drafts survive navigation and remain isolated by user and room', () => {
    const view = render(<ChatInput {...props} onSend={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Saved draft' } });
    view.unmount();
    const other = render(<ChatInput {...props} roomId="room-b" onSend={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue(''); other.unmount();
    render(<ChatInput {...props} onSend={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('Saved draft');
  });
  test('editing an existing message preserves the unsent conversation draft', async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    const view = render(<ChatInput {...props} onSend={onSend} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Unsent draft' } });
    view.rerender(<ChatInput {...props} editTarget={{ _id: 'old', content: 'Old content' }} onSend={onSend} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Edited content' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    view.rerender(<ChatInput {...props} onSend={onSend} />);
    expect(screen.getByRole('textbox')).toHaveValue('Unsent draft');
  });
  test('IME composition and Shift+Enter do not submit messages', () => {
    const onSend = vi.fn(); render(<ChatInput {...props} onSend={onSend} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'こんにちは' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });
  test('rapid submissions send once while the first request is pending', async () => {
    let finish; const onSend = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    render(<ChatInput {...props} onSend={onSend} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'One message' } });
    const send = screen.getByRole('button', { name: 'Send message' });
    fireEvent.click(send); fireEvent.click(send); expect(onSend).toHaveBeenCalledTimes(1);
    finish(true); await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
  });
});
