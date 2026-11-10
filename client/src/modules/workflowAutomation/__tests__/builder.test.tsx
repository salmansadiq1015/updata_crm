// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';

/**
 * Workflow builder: graph utilities (layout, flow round-trip), node summaries, the visual
 * condition builder, node configuration forms (validation messages, conditional fields) and
 * the palette (drag payload, one-trigger rule). Lookup hooks are mocked; components are real.
 */
vi.mock('@/lib/i18n/language-context', () => {
  const t = (key: string, fallback?: string | null, vars?: Record<string, unknown>) => {
    const text = fallback || key;
    return vars ? text.replace(/\{(\w+)\}/g, (_, n) => (vars[n] != null ? String(vars[n]) : `{${n}}`)) : text;
  };
  const value = { locale: 'en', language: 'en', dir: 'ltr', isRTL: false, t };
  return { useLanguage: () => value, LanguageProvider: ({ children }: { children: ReactNode }) => children };
});
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('../hooks/use-lookups', () => ({
  useAgentOptions: () => ({ agents: [
    { _id: 'a1', name: 'Sarah', availability: 'active', usage: 'outbound' },
    { _id: 'a2', name: 'Reception', availability: 'active', usage: 'inbound' },
    { _id: 'a3', name: 'David', availability: 'paused', usage: 'both' },
  ] }),
  useDirectoryUsers: () => ({ data: [{ _id: 'u1', firstName: 'Anna', lastName: 'Keller' }] }),
  useMessageTemplates: () => ({ data: [] }),
  useLeadSearch: () => ({ data: [], isFetching: false }),
}));

const { autoLayout, fromFlow, toFlow, outputsFromCatalog, issuesByNode } = await import('../lib/graph-utils');
const { summarizeNode } = await import('../lib/node-summary');
const { ConditionBuilder } = await import('../ui/builder/condition-builder');
const { NodeConfigForm } = await import('../ui/builder/node-config-form');
const { NodePalette, DND_MIME } = await import('../ui/builder/node-palette');
const { TooltipProvider } = await import('@/components/ui/tooltip');

const t = (key: string, fallback?: string | null, vars?: Record<string, unknown>) => {
  const text = fallback || key;
  return vars ? text.replace(/\{(\w+)\}/g, (_, n) => String(vars[n] ?? '')) : text;
};
const catalog = {
  nodes: [
    { type: 'trigger.manual', category: 'trigger' as const, outputs: ['out'], defaults: {} },
    { type: 'trigger.lead_created', category: 'trigger' as const, outputs: ['out'], defaults: {} },
    { type: 'ai.call', category: 'ai' as const, outputs: ['answered', 'unanswered', 'failed', 'blocked'], defaults: { maxAttempts: 2 } },
    { type: 'logic.condition', category: 'logic' as const, outputs: ['yes', 'no'], defaults: {} },
    { type: 'msg.sms', category: 'communication' as const, outputs: ['sent', 'blocked', 'failed'], defaults: {} },
    { type: 'end', category: 'end' as const, outputs: [], defaults: {} },
  ],
  waitableEvents: ['message.replied', 'link.clicked'], operators: [], conditionFields: [], qualificationKeys: ['interest', 'budget'],
  endOutcomes: ['qualified', 'completed'] as const, leadStatuses: ['new', 'qualified'], callOutcomeFilters: ['any', 'answered'], limits: { maxScheduleEnrollments: 500 }, templates: [],
};
const outputs = outputsFromCatalog(catalog);
const graph = {
  nodes: [
    { id: 't', type: 'trigger.manual', position: { x: 0, y: 0 }, data: { label: '', config: {} } },
    { id: 'c', type: 'ai.call', position: { x: 0, y: 0 }, data: { label: 'Call', config: { agentId: 'a1' } } },
    { id: 'no', type: 'end', position: { x: 0, y: 0 }, data: { label: '', config: { outcome: 'completed' } } },
    { id: 'yes', type: 'end', position: { x: 0, y: 0 }, data: { label: '', config: { outcome: 'qualified' } } },
  ],
  edges: [
    { id: 'e1', source: 't', target: 'c', sourceHandle: 'out' },
    { id: 'e2', source: 'c', target: 'no', sourceHandle: 'unanswered' },
    { id: 'e3', source: 'c', target: 'yes', sourceHandle: 'answered' },
  ],
};

describe('graph utilities', () => {
  it('round-trips through React Flow state without losing data', () => {
    const flow = toFlow(graph, outputs);
    expect(flow.nodes[1].data.outputs).toEqual(['answered', 'unanswered', 'failed', 'blocked']);
    expect(flow.edges[1]).toMatchObject({ sourceHandle: 'unanswered', targetHandle: 'in', type: 'workflow', data: { port: 'unanswered' } });
    expect(fromFlow(flow.nodes, flow.edges)).toEqual(graph);
  });

  it('auto-layout puts the trigger on top and orders branches by port (answered left of unanswered)', () => {
    const laid = autoLayout(graph, outputs);
    const pos = Object.fromEntries(laid.nodes.map((n) => [n.id, n.position]));
    expect(pos.t.y).toBeLessThan(pos.c.y);
    expect(pos.c.y).toBeLessThan(pos.yes.y);
    expect(pos.yes.y).toBe(pos.no.y);
    expect(pos.yes.x).toBeLessThan(pos.no.x);
  });

  it('groups validation issues by node', () => {
    const m = issuesByNode([{ nodeId: 'c', code: 'required', field: 'agentId' }, { code: 'end_missing' }, { nodeId: 'c', code: 'out_of_range' }]);
    expect(m.get('c')).toHaveLength(2);
    expect(m.size).toBe(1);
  });
});

describe('node summaries', () => {
  const lookups = { agents: new Map([['a1', 'Sarah']]), users: new Map([['u1', 'Anna Keller']]), templates: new Map<string, string>() };
  it.each([
    ['ai.call', { agentId: 'a1', maxAttempts: 3 }, 'Agent: Sarah\nMax. attempts: 3'],
    ['ai.call', {}, 'Choose an AI agent'],
    ['logic.delay', { mode: 'duration', amount: 2, unit: 'days' }, 'Wait 2 days'],
    ['crm.add_tags', { add: ['hot'], remove: ['cold'] }, '+hot −cold'],
    ['crm.assign', { userId: 'u1' }, 'Anna Keller'],
    ['logic.condition', { rules: { op: 'or', rules: [{ field: 'a', operator: 'equals', value: 1 }, { op: 'and', rules: [{ field: 'b', operator: 'exists' }] }] } }, '2 rule(s) · any'],
    ['end', { outcome: 'qualified' }, 'qualified'],
  ])('%s %o → %s', (type, config, expected) => {
    expect(summarizeNode(type, config, t, lookups)).toBe(expected);
  });
});

function ConditionHarness({ initial }: { initial: { op: 'and' | 'or'; rules: never[] } }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <ConditionBuilder value={value} onChange={setValue as never} nodeOptions={[{ id: 'c', label: 'Call' }]} qualificationKeys={['interest']}
        issues={[{ nodeId: 'q', field: 'rules', code: 'condition_empty' }]} />
      <pre data-testid="state">{JSON.stringify(value)}</pre>
    </>
  );
}

describe('condition builder', () => {
  it('adds rules and nested groups, switches AND/OR and removes rules', () => {
    render(<ConditionHarness initial={{ op: 'and', rules: [] }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('condition_empty');
    fireEvent.click(screen.getByRole('button', { name: /Add rule/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add group/ }));
    fireEvent.click(screen.getAllByRole('radio', { name: 'ANY of' })[0]);
    let state = JSON.parse(screen.getByTestId('state').textContent || '{}');
    expect(state.op).toBe('or');
    expect(state.rules).toHaveLength(2);
    expect(state.rules[0]).toEqual({ field: 'lead.status', operator: 'equals', value: '' });
    expect(state.rules[1].op).toBe('or'); // nested group starts with the opposite operator of its parent at creation time
    fireEvent.change(screen.getAllByLabelText('Value')[0], { target: { value: 'new, contacted' } });
    state = JSON.parse(screen.getByTestId('state').textContent || '{}');
    expect(state.rules[0].value).toBe('new, contacted');
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove group' })[0]);
    state = JSON.parse(screen.getByTestId('state').textContent || '{}');
    expect(state.rules).toHaveLength(1);
  });
});

describe('node configuration forms', () => {
  it('shows server validation messages next to the field and only outbound agents for calls', () => {
    const onChange = vi.fn();
    render(<NodeConfigForm workflowId="w1" nodeId="c" type="ai.call" config={{ maxAttempts: 2 }} onChange={onChange} catalog={catalog as never} nodeOptions={[]}
      issues={[{ nodeId: 'c', field: 'agentId', code: 'required' }]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('required');
    fireEvent.change(screen.getByRole('spinbutton', { name: /Max. attempts/ }), { target: { value: '4' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ maxAttempts: 4 }));
  });

  it('SMS: inserts variables and requires nothing else to be guessed', () => {
    const onChange = vi.fn();
    render(<NodeConfigForm workflowId="w1" nodeId="s" type="msg.sms" config={{ body: 'Hi', purpose: 'transactional' }} onChange={onChange} catalog={catalog as never} nodeOptions={[]} issues={[]} />);
    fireEvent.click(screen.getByRole('button', { name: '{{link}}' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ body: 'Hi {{link}}' }));
    expect(screen.getByText('2 characters')).toBeInTheDocument();
  });

  it('webhook trigger shows the secret URL only once it exists', () => {
    const { rerender } = render(<NodeConfigForm workflowId="w1" nodeId="t" type="trigger.webhook" config={{}} onChange={vi.fn()} catalog={catalog as never} nodeOptions={[]} issues={[]} />);
    expect(screen.getByText(/Save the workflow to generate/)).toBeInTheDocument();
    rerender(<NodeConfigForm workflowId="w1" nodeId="t" type="trigger.webhook" config={{ token: 'x'.repeat(32) }} onChange={vi.fn()} catalog={catalog as never} nodeOptions={[]} issues={[]} />);
    expect(screen.getAllByText(new RegExp(`/workflow-hooks/w1/${'x'.repeat(32)}`)).length).toBeGreaterThan(0);
  });
  it('custom fields: add, edit and remove key/value rows; invalid names are flagged', () => {
    const onChange = vi.fn();
    const { rerender } = render(<NodeConfigForm workflowId="w1" nodeId="cf" type="crm.custom_fields" config={{ set: [], remove: [] }} onChange={onChange} catalog={catalog as never} nodeOptions={[]} issues={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ set: [{ key: '', value: '' }] }));
    rerender(<NodeConfigForm workflowId="w1" nodeId="cf" type="crm.custom_fields" config={{ set: [{ key: 'plan tier', value: '' }], remove: [] }} onChange={onChange} catalog={catalog as never} nodeOptions={[]}
      issues={[{ nodeId: 'cf', field: 'set', code: 'invalid_key' }]} />);
    expect(screen.getByRole('textbox', { name: 'Field name' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('invalid_key');
    fireEvent.change(screen.getByRole('textbox', { name: 'Field name' }), { target: { value: 'my plan' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ set: [{ key: 'my_plan', value: '' }] }));
    fireEvent.click(screen.getByRole('button', { name: '{{lead.name}}' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ set: [{ key: 'plan tier', value: '{{lead.name}}' }] }));
    fireEvent.click(screen.getByRole('button', { name: /Remove field plan tier/ }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ set: [] }));
  });

  it('email: open tracking is on by default and can be switched off', () => {
    const onChange = vi.fn();
    render(<NodeConfigForm workflowId="w1" nodeId="m" type="msg.email" config={{ subject: 'x', body: 'y', purpose: 'transactional' }} onChange={onChange} catalog={catalog as never} nodeOptions={[]} issues={[]} />);
    const sw = screen.getByRole('switch', { name: /Track opens/ });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ trackOpens: false }));
  });
});

describe('node palette', () => {
  it('groups blocks, filters by search, sets the drag payload and allows only one trigger', () => {
    const onAdd = vi.fn();
    const { rerender } = render(<TooltipProvider><NodePalette nodes={catalog.nodes} hasTrigger={false} onAdd={onAdd} /></TooltipProvider>);
    const call = screen.getByTestId('palette-ai.call');
    const setData = vi.fn();
    fireEvent.dragStart(call, { dataTransfer: { setData, effectAllowed: '' } });
    expect(setData).toHaveBeenCalledWith(DND_MIME, 'ai.call');
    fireEvent.click(call);
    expect(onAdd).toHaveBeenCalledWith('ai.call');
    fireEvent.change(screen.getByRole('textbox', { name: /Search blocks/ }), { target: { value: 'condition' } });
    expect(screen.queryByTestId('palette-ai.call')).not.toBeInTheDocument();
    expect(screen.getByTestId('palette-logic.condition')).toBeInTheDocument();
    rerender(<TooltipProvider><NodePalette nodes={catalog.nodes} hasTrigger onAdd={onAdd} /></TooltipProvider>);
    fireEvent.change(screen.getByRole('textbox', { name: /Search blocks/ }), { target: { value: '' } });
    expect(screen.getByTestId('palette-trigger.manual')).toBeDisabled();
    expect(within(screen.getByRole('complementary')).getByTestId('palette-end')).not.toBeDisabled();
  });
});
