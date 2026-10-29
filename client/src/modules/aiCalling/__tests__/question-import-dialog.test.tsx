// @vitest-environment jsdom
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Question, StatusRule } from '../types/ai-calling-types';

const toast = vi.hoisted(() => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('@/lib/toast', () => toast);
const { QuestionEditor } = await import('../ui/question-configuration');

const latest: { questions: Question[]; rules: StatusRule[] } = { questions: [], rules: [] };
function Harness({ initial = [] as Question[] }) {
  const [questions, setQuestions] = useState(initial);
  const [rules, setRules] = useState<StatusRule[]>([]);
  return <QuestionEditor questions={questions} onChange={q => { latest.questions = q; setQuestions(q); }} rules={rules} onImport={(q, r) => { Object.assign(latest, { questions: q, rules: r }); setQuestions(q); setRules(r); }} />;
}
const writeText = vi.fn(async () => undefined);
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); Object.assign(navigator, { clipboard: { writeText } }); });

describe('question import dialog', () => {
  it('pastes a full question list, previews it, and applies questions and rules together', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Paste questions/ }));
    const area = screen.getByRole('textbox', { name: 'Paste questions' });
    const apply = () => screen.getByRole('button', { name: /Replace with/ });
    expect((apply() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(area, { target: { value: 'Q: Pick one\nType: single_choice' } });
    expect(screen.getByText(/needs Options/)).toBeTruthy();
    expect((apply() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(area, { target: { value: 'Q: Are you the owner?\nKey: owner\nType: yes/no\n---\nQ: How many staff?\nKey: staff\nType: number\nAsk if: owner = yes\n---\nRule: qualified if staff >= 3' } });
    expect(screen.getByText('2 questions')).toBeTruthy();
    expect(screen.getByText('1 rule')).toBeTruthy();
    expect(screen.getByText('Conditional')).toBeTruthy();
    fireEvent.click(apply());
    expect(latest.questions.map(q => [q.fieldKey, q.type, q.order])).toEqual([['owner', 'boolean', 1], ['staff', 'integer', 2]]);
    expect(latest.rules).toEqual([expect.objectContaining({ action: 'mark_qualified', when: { all: [{ field: 'staff', gte: 3 }] } })]);
    expect(screen.queryByRole('textbox', { name: 'Paste questions' })).toBeNull();
    expect(screen.getByDisplayValue('How many staff?')).toBeTruthy(); // now editable in the normal editor
  });

  it('adds to existing questions by default and can copy the current questions in the format', async () => {
    render(<Harness initial={[{ fieldKey: 'full_name', label: 'Full name', text: 'What is your name?', type: 'short_text', required: true, order: 1 }]} />);
    fireEvent.click(screen.getByRole('button', { name: /Paste questions/ }));
    fireEvent.click(screen.getByRole('button', { name: /Copy current questions/ }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Key: full_name')));
    fireEvent.change(screen.getByRole('textbox', { name: 'Paste questions' }), { target: { value: '1. What is your email address?' } });
    fireEvent.click(screen.getByRole('button', { name: /Add 1 questions/ }));
    expect(latest.questions.map(q => q.type)).toEqual(['short_text', 'email']);
  });

  it('builds a copyable AI prompt from the parameters and remembers them', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Create with AI/ }));
    fireEvent.change(screen.getByPlaceholderText('Updata'), { target: { value: 'Acme Solar' } });
    fireEvent.change(screen.getByPlaceholderText('Owners of retail shops in Lahore'), { target: { value: 'Homeowners in Karachi' } });
    const prompt = screen.getByRole('textbox', { name: 'Generated AI prompt' }) as HTMLTextAreaElement;
    expect(prompt.value).toContain('Company: Acme Solar');
    expect(prompt.value).toContain('Who we are calling: Homeowners in Karachi');
    fireEvent.click(screen.getAllByRole('button', { name: /Copy prompt/ })[0]);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Company: Acme Solar')));
    expect(JSON.parse(localStorage.getItem('ai-calling:question-prompt-params')!).company).toBe('Acme Solar');
    fireEvent.click(screen.getByRole('button', { name: /Paste the AI reply/ }));
    expect(screen.getByRole('textbox', { name: 'Paste questions' })).toBeTruthy();
  });
});
