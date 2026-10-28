import { screen } from '@testing-library/react-native';

import type { RootScreenProps } from '@/navigation/navigationTypes';
import { renderWithProviders } from '@/test/renderWithProviders';

import { useSimConversation } from '../hooks/useSmsAgent';
import { SimSmsConversationScreen } from '../screens/SimSmsConversationScreen';

jest.mock('../hooks/useSmsAgent', () => ({
  useSimConversation: jest.fn(),
  useResolveConversation: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('../screens/SimSmsCampaignDetailScreen', () => ({ STATE_VARIANT: { awaiting_reply: 'info' } }));

it('shows every configured question, an unanswered required item, and evidence for a human request', async () => {
  jest.mocked(useSimConversation).mockReturnValue({
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
    data: {
      conversation: { lead: { name: 'Zafar Traders' }, state: 'awaiting_reply' },
      messages: [],
      answers: [],
      questionCoverage: {
        applicable: 2,
        answered: 1,
        requiredGaps: ['budget'],
        questions: [
          {
            fieldKey: 'need',
            label: 'Service needed',
            question: 'What do you need?',
            required: true,
            status: 'answered',
            rawAnswer: 'Office quote',
            normalizedValue: 'Office quote',
            confirmed: true,
          },
          {
            fieldKey: 'budget',
            label: 'Budget',
            question: 'What is your budget?',
            required: true,
            status: 'pending',
            rawAnswer: '',
            normalizedValue: null,
            confirmed: false,
          },
        ],
      },
      conversationInsights: {
        observations: [
          {
            code: 'human_requested',
            label: 'Human follow-up requested',
            evidence: 'Please ask a person to call me.',
          },
        ],
        nextSteps: ['Assign to a team member.'],
        limitation: 'Based on recorded evidence.',
      },
    },
  } as unknown as ReturnType<typeof useSimConversation>);
  await renderWithProviders(
    <SimSmsConversationScreen
      {...({
        route: {
          key: 'conversation',
          name: 'SimSmsConversation',
          params: { conversationId: 'conversation-one' },
        },
        navigation: {},
      } as unknown as RootScreenProps<'SimSmsConversation'>)}
    />,
  );
  expect(screen.getByText('Office quote')).toBeTruthy();
  expect(screen.getByText('Budget')).toBeTruthy();
  expect(screen.getByText('What is your budget?')).toBeTruthy();
  expect(screen.getByText('Please ask a person to call me.')).toBeTruthy();
  expect(screen.getByText('Assign to a team member.')).toBeTruthy();
});
