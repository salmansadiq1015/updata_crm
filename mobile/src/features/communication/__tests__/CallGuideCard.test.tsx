import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { renderWithProviders } from '@/test/renderWithProviders';

import { CallGuideCard } from '../components/CallGuideCard';
import type { DraftAnswers } from '../components/QualificationEditor';
import type { QualificationField } from '../types';

const schema = [
  {
    fieldKey: 'interest',
    label: 'Interest level',
    type: 'single_choice',
    options: ['high', 'none'],
    helpText: '',
  },
  { fieldKey: 'budget', label: 'Budget', type: 'currency', options: [], helpText: '' },
  { fieldKey: 'objections', label: 'Objections', type: 'long_text', options: [], helpText: '' },
] as unknown as QualificationField[];

function Harness({ onAnswer }: { onAnswer: jest.Mock }) {
  const [answers, setAnswers] = useState<DraftAnswers>({});
  return (
    <CallGuideCard
      schema={schema}
      answers={answers}
      onAnswer={(key, answer) => {
        onAnswer(key, answer);
        setAnswers((a) => ({ ...a, [key]: answer }));
      }}
    />
  );
}

describe('CallGuideCard', () => {
  it('asks one question at a time and branches on the answer', async () => {
    const onAnswer = jest.fn();
    await renderWithProviders(<Harness onAnswer={onAnswer} />);
    expect(screen.getByText('Question 1 of 3')).toBeTruthy();
    // "No interest" makes the budget question irrelevant → straight to objections.
    fireEvent.press(screen.getByText('None'));
    expect(onAnswer).toHaveBeenCalledWith('interest', {
      value: 'none',
      status: 'answered',
      source: 'user',
      evidence: null,
    });
    expect(await screen.findByText('Question 2 of 2')).toBeTruthy();
    expect(screen.queryByText('Budget')).toBeNull();
    fireEvent.press(screen.getByText('Skip'));
    expect(await screen.findByText(/All questions covered/)).toBeTruthy();
  });
});

describe('CallGuideCard read aloud', () => {
  it('speaks the current question on-device in the app language', async () => {
    const Speech = jest.requireMock('expo-speech') as { speak: jest.Mock };
    Speech.speak.mockClear();
    await renderWithProviders(<Harness onAnswer={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Read the question aloud'));
    expect(Speech.speak).toHaveBeenCalledWith('Interest', { language: 'en' });
  });
});
