import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { QuestionListEditor } from '@/features/aiAgent/components/QuestionListEditor';
import type { AgentQuestion } from '@/features/aiAgent/types';
import { renderWithProviders } from '@/test/renderWithProviders';

const owner: AgentQuestion = {
  fieldKey: 'owner',
  label: 'Owner',
  text: 'Are you the owner?',
  type: 'boolean',
  required: true,
  options: [],
};
let current: AgentQuestion[];
function Editor({ initial }: { initial: AgentQuestion[] }) {
  const [questions, setQuestions] = useState(initial);
  return (
    <QuestionListEditor
      campaign
      questions={questions}
      invalid={[]}
      onChange={(next) => {
        current = next;
        setQuestions(next);
      }}
    />
  );
}

it('configures custom choice types and options', async () => {
  await renderWithProviders(<Editor initial={[owner]} />);
  await fireEvent.press(screen.getByText('Edit answer settings'));
  await fireEvent.press(screen.getByText('Choose several'));
  await fireEvent.changeText(screen.getByLabelText('Options, separated by commas'), 'Repairs, Sales');
  expect(current[0]).toMatchObject({ type: 'multiple_choice', options: ['Repairs', 'Sales'] });
});

it('configures a boolean condition, reorders questions, and removes a deleted dependency', async () => {
  await renderWithProviders(
    <Editor
      initial={[owner, { ...owner, fieldKey: 'needs', label: 'Needs', type: 'short_text', required: false }]}
    />,
  );
  await fireEvent.press(screen.getAllByText('Edit answer settings')[1]!);
  await fireEvent.press(screen.getByText('Owner'));
  await fireEvent.press(screen.getByText('No'));
  expect(current[1]?.condition).toEqual({ all: [{ field: 'owner', equals: false }] });
  await fireEvent.press(screen.getByText('Move up'));
  expect(current.map((q) => q.fieldKey)).toEqual(['needs', 'owner']);
  await fireEvent.press(screen.getByLabelText('Remove question 2'));
  expect(current).toHaveLength(1);
  expect(current[0]?.condition).toBeNull();
});
