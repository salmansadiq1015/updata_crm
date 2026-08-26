'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';

/**
 * What one agent may and may not do, as the office can read it.
 *
 * The register has always held this — the specification asks for a declared
 * agent per requirement C4 — but the screen showed only the purpose and a row
 * of action codes. An office cannot decide whether to switch an agent on when
 * "CREATE_INVOICE, DRAFT_CUSTOMER_MESSAGE" is all it is told.
 *
 * Every line comes from the register itself, so the screen cannot claim
 * something the governance layer does not enforce. The action wording and the
 * blocking reasons arrive from the server with the register, which is why a
 * code never has to be printed raw.
 */

const RISK_DOT = {
  LOW: 'bg-emerald-500',
  MEDIUM: 'bg-amber-500',
  HIGH: 'bg-orange-500',
  CRITICAL: 'bg-red-500',
};

function Line({ label, children }) {
  if (!children) return null;
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
      <span className="w-44 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1 text-xs text-foreground">{children}</div>
    </div>
  );
}

/** Plain wording joined by commas; nothing at all when the list is empty. */
function Words({ items }) {
  if (!items?.length) return null;
  return <span>{items.join(', ')}</span>;
}

export function AiAgentContract({ agent, actions = [], blockReasons = [], agentNames = {} }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  const byAction = new Map(actions.map((entry) => [entry.action, entry]));
  const byReason = new Map(blockReasons.map((entry) => [entry.reason, entry.label]));

  // An action the register names but the risk map does not know is shown by
  // its code — a gap in the vocabulary should be visible, not papered over.
  const describe = (action) => byAction.get(action) || { action, label: action, riskLevel: 'CRITICAL' };

  const allowed = (agent.allowedActions || []).map(describe);
  const forbidden = (agent.forbiddenActions || []).map(describe);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={open}
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        {open ? t('ai.agents.contract.hide', 'Weniger') : t('ai.agents.contract.show', 'Was dieser Agent darf')}
      </button>

      {open ? (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <Line label={t('ai.agents.contract.may', 'Darf')}>
            {allowed.length ? (
              <ul className="flex flex-col gap-1">
                {allowed.map((entry) => (
                  <li key={entry.action} className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${RISK_DOT[entry.riskLevel] || RISK_DOT.CRITICAL}`}
                      title={entry.riskLevel}
                    />
                    <span>{entry.label}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-muted-foreground">
                {t('ai.agents.contract.prepareOnly', 'Nichts ausführen — dieser Agent bereitet nur vor.')}
              </span>
            )}
          </Line>

          <Line label={t('ai.agents.contract.mayNot', 'Darf nicht')}>
            <Words items={forbidden.map((entry) => entry.label)} />
          </Line>
          <Line label={t('ai.agents.contract.triggers', 'Wird ausgelöst durch')}>
            <Words items={agent.triggers} />
          </Line>
          <Line label={t('ai.agents.contract.requires', 'Braucht')}>
            <Words items={agent.requiredData} />
          </Line>
          <Line label={t('ai.agents.contract.blocks', 'Blockiert, wenn')}>
            <Words items={(agent.blockReasons || []).map((reason) => byReason.get(reason) || reason)} />
          </Line>
          <Line label={t('ai.agents.contract.handsTo', 'Übergibt an')}>
            <Words items={(agent.handoffTo || []).map((key) => agentNames[key] || key)} />
          </Line>
          <Line label={t('ai.agents.contract.delivers', 'Liefert')}>
            <Words items={agent.outputTypes} />
          </Line>
        </div>
      ) : null}
    </div>
  );
}
