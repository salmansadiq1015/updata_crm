'use client';
import { useState } from 'react';
import { Plus, Trash2, RefreshCw, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BankingSelect } from './banking-controls';
import styles from './banking-workspace.module.css';
import { Label } from '@/components/ui/label';
import { useAccounts } from '../hooks/use-accounting-queries';
import { useBankMutations, useReconciliationMutations } from '../hooks/use-accounting-mutations';

export function BankAutomation({ accounts, de, canManage }) {
  const [selected, setSelected] = useState('');
  const account = accounts.find(a => a._id === selected) || accounts[0];
  return <div className="space-y-5">
    <div className={styles.automationHeader}><div><h2 className="text-lg font-semibold">{de ? 'Bankautomatisierung' : 'Banking on autopilot'}</h2><p className="mt-1 text-xs text-muted-foreground">{de ? 'Import und Zuordnungsregeln pro Bankkonto.' : 'Statement delivery and categorization rules for each bank account.'}</p></div>
      <div className={`${styles.filterField} ${styles.accountField}`}><label htmlFor="bank-automation-account" className={styles.filterLabel}>{de ? 'Bankkonto' : 'Bank account'}</label><BankingSelect id="bank-automation-account" label="Automation account" value={account?._id || ''} onValueChange={setSelected} disabled={!accounts.length} placeholder={de ? 'Konto wählen' : 'Select account'} icon={Landmark} options={accounts.map(a => ({ value: a._id, label: a.displayName }))} /></div>
    </div>
    {account ? <AutomationForm key={`${account._id}-${account.updatedAt}`} account={account} de={de} canManage={canManage} /> : <p className="rounded-xl border border-border p-8 text-sm text-muted-foreground">{de ? 'Fügen Sie zuerst ein Bankkonto hinzu.' : 'Add a bank account to configure automation.'}</p>}
  </div>;
}
function AutomationForm({ account, de, canManage }) {
  const { data: ledgerAccounts = [] } = useAccounts({ limit: 500, isActive: true });
  const { updateBankAccount, retrieveStatements } = useBankMutations();
  const { runReconciliation } = useReconciliationMutations();
  const [connectionType, setType] = useState(account.connectionType || 'MANUAL');
  const [enabled, setEnabled] = useState(Boolean(account.autoRetrieveEnabled));
  const [directory, setDirectory] = useState(account.connectionConfig?.statementDirectory || '');
  const [processed, setProcessed] = useState(account.connectionConfig?.processedDirectory || '');
  const [failed, setFailed] = useState(account.connectionConfig?.failedDirectory || '');
  const [rules, setRules] = useState((account.categoryRules || []).map(({ keyword, direction, accountId }) => ({ keyword, direction, accountId })));
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const automated = connectionType !== 'MANUAL';
  const changeRule = (index, key, value) => setRules(rows => rows.map((r, i) => i === index ? { ...r, [key]: value } : r));
  const run = async (mutation, payload) => {
    setError(''); setResult(null);
    try { const response = await mutation.mutateAsync(payload); setResult(response.data); }
    catch (err) { setError(err?.response?.data?.message || err.message); }
  };
  return <form className="space-y-5" onSubmit={async e => {
    e.preventDefault(); setError('');
    try {
      await updateBankAccount.mutateAsync({ id: account._id, data: { connectionType, autoRetrieveEnabled: automated && enabled, connectionConfig: { ...account.connectionConfig, statementDirectory: directory, processedDirectory: processed, failedDirectory: failed }, categoryRules: rules } });
    } catch (err) { setError(err?.response?.data?.message || err.message); }
  }}>
    <fieldset disabled={!canManage} className="grid min-w-0 gap-5 lg:grid-cols-2">
      <section className={`${styles.surface} space-y-5 p-5 sm:p-6`}><h3 className="text-sm font-semibold">{de ? 'Automatischer Import' : 'Automatic statement import'}</h3>
        <p className="text-xs leading-6 text-muted-foreground">{de ? 'Ihr Bankgateway muss camt.053/054-Dateien im Server-Eingangsordner ablegen. Die Anwendung öffnet keine direkte Bankverbindung.' : 'Your bank gateway must deliver camt.053/054 files to a server inbox. Retrieval reads those delivered files; a direct bank connection is not established here.'}</p>
        <div className="space-y-2"><Label htmlFor="bank-connection">{de ? 'Verbindung' : 'Delivery method'}</Label><BankingSelect id="bank-connection" label={de ? 'Verbindung' : 'Delivery method'} value={connectionType} onValueChange={setType} disabled={!canManage} options={[{ value: 'MANUAL', label: de ? 'Manueller Import' : 'Manual upload' }, { value: 'SFTP', label: 'SFTP gateway' }, { value: 'EBICS', label: 'EBICS gateway' }]} /></div>
        {automated && <>
          <div className="space-y-2"><Label htmlFor="bank-inbox">{de ? 'Server-Eingangsordner' : 'Server inbox directory'}</Label><Input id="bank-inbox" value={directory} onChange={e => setDirectory(e.target.value)} required placeholder="/bank/inbox" /></div>
          <div className="space-y-2"><Label htmlFor="bank-processed">{de ? 'Archivordner' : 'Processed directory'}</Label><Input id="bank-processed" value={processed} onChange={e => setProcessed(e.target.value)} placeholder="/bank/processed" /></div>
          <div className="space-y-2"><Label htmlFor="bank-failed">{de ? 'Fehlerordner' : 'Failed directory'}</Label><Input id="bank-failed" value={failed} onChange={e => setFailed(e.target.value)} placeholder="/bank/failed" /></div>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="mt-1 size-4 accent-primary" /><span>{de ? 'Geplanten Import aktivieren' : 'Enable scheduled retrieval'}<span className="mt-1 block text-xs text-muted-foreground">{de ? 'Prüft den Eingangsordner alle 15 Minuten bei laufendem Worker.' : 'Checks the server inbox every 15 minutes while workers are running.'}</span></span></label>
        </>}
      </section>
      <section className={`${styles.surface} space-y-5 p-5 sm:p-6`}><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{de ? 'Automatische Kategorisierung' : 'Automatic categorization'}</h3><Button type="button" size="sm" variant="outline" disabled={rules.length >= 50} onClick={() => setRules(rows => [...rows, { keyword: '', direction: 'OUT', accountId: '' }])}><Plus className="mr-1 size-3" />{de ? 'Regel' : 'Rule'}</Button></div>
        <p className="text-xs leading-6 text-muted-foreground">{de ? 'Nach dem Rechnungsabgleich werden eindeutige Regeln gebucht. Widersprüchliche Regeln bleiben zur Prüfung offen.' : 'After invoice matching, unambiguous keyword rules create ledger entries. Conflicting destinations remain open for review.'}</p>
        {!rules.length && <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs leading-6 text-muted-foreground">{de ? 'Regeln für Gebühren, Zinsen oder andere wiederkehrende Buchungstexte hinzufügen.' : 'Add rules for bank fees, interest, or other recurring transaction descriptions.'}</div>}
        {rules.map((rule, index) => <div key={index} className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex gap-2"><Input aria-label={`Rule ${index + 1} keyword`} placeholder={de ? 'Text enthält…' : 'Description contains…'} value={rule.keyword} required minLength={2} maxLength={200} onChange={e => changeRule(index, 'keyword', e.target.value)} /><Button type="button" variant="ghost" size="icon" aria-label={`Remove rule ${index + 1}`} onClick={() => setRules(rows => rows.filter((_, i) => i !== index))}><Trash2 className="size-4" /></Button></div>
          <div className="flex flex-wrap gap-2"><div className="w-36 shrink-0"><BankingSelect label={`Rule ${index + 1} direction`} value={rule.direction} onValueChange={value => changeRule(index, 'direction', value)} disabled={!canManage} options={[{ value: 'OUT', label: de ? 'Ausgang' : 'Money out' }, { value: 'IN', label: de ? 'Eingang' : 'Money in' }]} /></div><div className="min-w-[160px] flex-1"><BankingSelect required label={`Rule ${index + 1} ledger account`} value={rule.accountId} onValueChange={value => changeRule(index, 'accountId', value)} disabled={!canManage} placeholder={de ? 'Sachkonto wählen' : 'Select ledger account'} options={ledgerAccounts.map(a => ({ value: a._id, label: `${a.accountNumber} · ${a.name}` }))} /></div></div>
        </div>)}
      </section>
    </fieldset>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {result && <div role="status" className="rounded-xl border border-border bg-muted/30 p-4 text-sm"><p>{de ? 'Lauf abgeschlossen' : 'Run completed'}: {result.importedTransactions ?? result.matchedCount ?? 0} {de ? 'importiert / zugeordnet' : 'imported / matched'} · {result.categorizedCount || 0} {de ? 'kategorisiert' : 'categorized'}</p>{result.failedFiles?.map(f => <p key={f.fileName} className="mt-2 text-destructive">{f.fileName}: {f.error}</p>)}</div>}
    {canManage && <div className="flex flex-wrap gap-2"><Button type="submit" disabled={updateBankAccount.isPending}>{de ? 'Automatisierung speichern' : 'Save automation'}</Button><Button type="button" variant="outline" disabled={runReconciliation.isPending} onClick={() => run(runReconciliation, { bankAccountId: account._id })}><RefreshCw className="mr-2 size-4" />{de ? 'Gespeicherte Regeln ausführen' : 'Run saved matching rules'}</Button><Button type="button" variant="outline" disabled={!['EBICS', 'SFTP'].includes(account.connectionType) || !account.connectionConfig?.statementDirectory || retrieveStatements.isPending} onClick={() => run(retrieveStatements, { bankAccountId: account._id })}>{de ? 'Jetzt abrufen' : 'Retrieve now'}</Button></div>}
  </form>;
}
