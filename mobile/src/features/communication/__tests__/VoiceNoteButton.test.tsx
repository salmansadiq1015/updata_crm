import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';

import { communicationApi } from '../api/communicationApi';
import { VoiceNoteButton } from '../components/VoiceNoteButton';

jest.mock('../api/communicationApi', () => ({ communicationApi: { transcribe: jest.fn() } }));
const transcribe = communicationApi.transcribe as jest.Mock;
const audio = jest.requireMock('expo-audio') as { requestRecordingPermissionsAsync: jest.Mock };

describe('VoiceNoteButton', () => {
  beforeEach(() => transcribe.mockReset());

  it('records, uploads the clip and hands back the transcript', async () => {
    transcribe.mockResolvedValue({ available: true, text: 'Wants a demo next week', confidence: 0.9 });
    const onText = jest.fn();
    await renderWithProviders(<VoiceNoteButton leadId="lead-1" onText={onText} />);
    fireEvent.press(screen.getByText('Dictate notes'));
    fireEvent.press(await screen.findByText(/Stop and transcribe/));
    await waitFor(() => expect(onText).toHaveBeenCalledWith('Wants a demo next week'));
    expect(transcribe).toHaveBeenCalledWith(
      'lead-1',
      { uri: 'file:///voice.m4a', mimeType: 'audio/mp4' },
      'en',
    );
  });

  it('says so honestly when the server has no speech-to-text', async () => {
    transcribe.mockResolvedValue({ available: false, reason: 'ai_not_configured', text: '' });
    const onText = jest.fn();
    await renderWithProviders(<VoiceNoteButton leadId="lead-1" onText={onText} />);
    fireEvent.press(screen.getByText('Dictate notes'));
    fireEvent.press(await screen.findByText(/Stop and transcribe/));
    expect(await screen.findByText(/not configured on the CRM server/)).toBeTruthy();
    expect(onText).not.toHaveBeenCalled();
  });

  it('does not record without microphone permission', async () => {
    audio.requestRecordingPermissionsAsync.mockResolvedValueOnce({ granted: false });
    await renderWithProviders(<VoiceNoteButton leadId="lead-1" onText={jest.fn()} />);
    fireEvent.press(screen.getByText('Dictate notes'));
    expect(await screen.findByText(/Microphone permission is needed/)).toBeTruthy();
    expect(screen.queryByText(/Stop and transcribe/)).toBeNull();
  });
});
