'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
  Plug,
  Puzzle,
  RefreshCw,
} from 'lucide-react';
import { useExtensionConnection, type ExtensionState } from '../hooks/use-extension-connection';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  useLanguage,
  type TranslateFn,
} from './lead-ui-kit';

/**
 * The Google Chrome mark (tri-colour ring + blue centre), drawn deterministically
 * so the "Add to Chrome" button carries the familiar glyph without depending on a
 * brand icon lucide no longer ships. Decorative only.
 */
function ChromeGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <g fill="none" strokeWidth="2.8" strokeLinecap="butt">
        <path d="M5.14 9.50 A7.3 7.3 0 0 1 17.59 7.31" stroke="#EA4335" />
        <path d="M18.32 8.35 A7.3 7.3 0 0 1 14.50 18.86" stroke="#FBBC05" />
        <path d="M13.26 19.19 A7.3 7.3 0 0 1 4.81 10.73" stroke="#34A853" />
      </g>
      <circle cx="12" cy="12" r="4.3" fill="#fff" />
      <circle cx="12" cy="12" r="3.1" fill="#4285F4" />
    </svg>
  );
}

const DOT_CLASS: Record<ExtensionState, string> = {
  checking: 'bg-muted-foreground/40',
  unsupported: 'bg-muted-foreground/40',
  'not-installed': 'bg-muted-foreground/60',
  'installed-not-connected': 'bg-amber-500',
  connected: 'bg-emerald-500',
  error: 'bg-destructive',
};

function statusLabel(state: ExtensionState, busy: boolean, t: TranslateFn): string {
  if (busy && state !== 'connected') return t('leads.ext.connecting', 'Connecting…');
  switch (state) {
    case 'checking':
      return t('leads.ext.status.checking', 'Checking…');
    case 'unsupported':
      return t('leads.ext.status.unsupported', 'Not available');
    case 'not-installed':
      return t('leads.ext.status.notInstalled', 'Not installed');
    case 'installed-not-connected':
      return t('leads.ext.status.notConnected', 'Not connected');
    case 'connected':
      return t('leads.ext.status.connected', 'Connected');
    case 'error':
      return t('leads.ext.status.error', 'Connection error');
    default:
      return '';
  }
}

/** A short list item (bullet / numbered) in muted body text. */
function Step({ children }: { children: React.ReactNode }) {
  return <li className="text-[13px] leading-relaxed text-muted-foreground">{children}</li>;
}

/**
 * Lead-page entry point for the Lead Finder Chrome extension. A toolbar button
 * with a live status dot opens a dialog that carries a real "Add to Chrome"
 * flow: it links to the configured Chrome Web Store listing (never a fabricated
 * one), then lets the user connect the installed extension to their CRM account.
 * Detection is honest — it never flips to "connected" the extension cannot
 * verify, and always offers an explicit "I've installed it — Connect" action.
 */
export function ExtensionConnectCard() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [openHint, setOpenHint] = useState(false);
  const { state, status, storeUrl, published, busy, error, check, connect, disconnect } =
    useExtensionConnection(true);

  return (
    <>
      <Button
        variant="outline"
        className="h-9 gap-2"
        onClick={() => setOpen(true)}
        aria-label={t('leads.ext.open', 'Chrome extension')}
      >
        <ChromeGlyph className="h-4 w-4" />
        <span className="hidden sm:inline">{t('leads.ext.title', 'Chrome Extension')}</span>
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[state]} ${state === 'checking' ? 'animate-pulse' : ''}`}
          aria-hidden="true"
        />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-muted ring-1 ring-border">
                <ChromeGlyph className="h-5 w-5" />
              </span>
              {t('leads.ext.title', 'Chrome Extension')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'leads.ext.subtitle',
                'Capture businesses directly into your CRM while browsing Chrome.',
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {/* Status row */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2.5">
              <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                <span className={`h-2.5 w-2.5 rounded-full ${DOT_CLASS[state]}`} aria-hidden="true" />
                {statusLabel(state, busy, t)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-muted-foreground"
                onClick={() => void check()}
                disabled={busy || state === 'checking'}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${state === 'checking' ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                {t('leads.ext.refresh', 'Refresh')}
              </Button>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* What it does — shown until connected */}
            {state !== 'connected' && (
              <div className="rounded-lg border border-border p-3">
                <p className="mb-1.5 text-[13px] font-medium text-foreground">
                  {t('leads.ext.about.title', 'What the extension does')}
                </p>
                <ul className="ml-4 list-disc space-y-1">
                  <Step>{t('leads.ext.about.1', 'Collects business details exposed in your Google Maps research.')}</Step>
                  <Step>{t('leads.ext.about.2', 'Sends them to your existing CRM leads — no duplicate list.')}</Step>
                  <Step>{t('leads.ext.about.3', 'Uses your own CRM account, permissions and lead ownership.')}</Step>
                </ul>
              </div>
            )}

            {state === 'checking' && (
              <div className="flex items-center justify-center gap-2 py-2 text-[13px] text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t('leads.ext.status.checking', 'Checking…')}
              </div>
            )}

            {state === 'unsupported' && (
              <p className="text-[13px] text-muted-foreground">
                {t(
                  'leads.ext.unsupported.body',
                  'This extension runs in Chromium-based browsers (Chrome, Edge, Brave). Open the CRM in one of those to install it.',
                )}
              </p>
            )}

            {state === 'not-installed' && (
              <div className="space-y-3">
                {published ? (
                  <>
                    {/* The real "Add to Chrome" entry point → Chrome Web Store */}
                    <Button
                      asChild
                      className="group h-11 w-full justify-center gap-2.5 text-sm font-semibold shadow-sm transition-all hover:shadow"
                    >
                      <a href={storeUrl} target="_blank" rel="noopener noreferrer">
                        <ChromeGlyph className="h-5 w-5" />
                        {t('leads.ext.addToChrome', 'Add to Chrome')}
                        <ChevronRight
                          className="h-4 w-4 opacity-80 transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </a>
                    </Button>
                    <ol className="ml-4 list-decimal space-y-1">
                      <Step>{t('leads.ext.install.1', 'On the Chrome Web Store page, click “Add to Chrome”.')}</Step>
                      <Step>{t('leads.ext.install.2', 'Confirm the permissions Chrome asks for.')}</Step>
                      <Step>{t('leads.ext.install.3', 'Pin “Lead Finder” from the puzzle-piece menu in the toolbar.')}</Step>
                      <Step>{t('leads.ext.install.4', 'Come back here and click Connect.')}</Step>
                    </ol>
                  </>
                ) : (
                  // Not published yet: show an honest development install flow
                  // rather than linking to a dead Web Store listing.
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
                    <p className="text-[13px] font-medium text-foreground">
                      {t('leads.ext.dev.title', 'Not on the Chrome Web Store yet')}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {t(
                        'leads.ext.dev.body',
                        'The published listing isn’t configured yet. For now, load the packaged extension in Chrome, then connect.',
                      )}
                    </p>
                    <ol className="ml-4 mt-2 list-decimal space-y-1">
                      <Step>{t('leads.ext.dev.1', 'Open chrome://extensions and turn on Developer mode.')}</Step>
                      <Step>{t('leads.ext.dev.2', 'Click “Load unpacked” and choose the extension’s dist folder.')}</Step>
                      <Step>{t('leads.ext.dev.3', 'Pin “Lead Finder”, then use “I’ve installed it — Connect” below.')}</Step>
                    </ol>
                  </div>
                )}

                {/* Honest detection: never auto-claim installed — let the user
                    trigger a real connect once they've added it. */}
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <span className="text-[12px] text-muted-foreground">
                    {t('leads.ext.alreadyInstalled', 'Already added it in Chrome?')}
                  </span>
                  <Button size="sm" className="h-8 gap-1.5" onClick={() => void connect()} disabled={busy}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Plug className="h-3.5 w-3.5" aria-hidden="true" />}
                    {t('leads.ext.installedConnect', "I've installed it — Connect")}
                  </Button>
                </div>
              </div>
            )}

            {state === 'installed-not-connected' && (
              <div className="space-y-3">
                <p className="text-[13px] text-muted-foreground">
                  {t('leads.ext.connect.body', 'The extension is installed. Connect it to your CRM account to start importing leads.')}
                </p>
                <Button className="h-11 w-full gap-2" onClick={() => void connect()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plug className="h-4 w-4" aria-hidden="true" />}
                  {busy ? t('leads.ext.connecting', 'Connecting…') : t('leads.ext.connectButton', 'Connect to CRM')}
                </Button>
              </div>
            )}

            {state === 'error' && (
              <div className="flex flex-wrap gap-2">
                <Button className="h-10 flex-1 gap-2" onClick={() => void connect()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                  {t('leads.ext.reconnect', 'Reconnect')}
                </Button>
                <Button variant="outline" className="h-10 gap-2" onClick={() => void disconnect()} disabled={busy}>
                  {t('leads.ext.disconnect', 'Disconnect')}
                </Button>
              </div>
            )}

            {state === 'connected' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-[13px] font-medium text-emerald-700 dark:text-emerald-400">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {t('leads.ext.connectedBanner', 'Chrome Extension connected')}
                </div>
                <p className="text-[13px] text-muted-foreground">
                  {t('leads.ext.connectedReady', 'Your extension is ready to capture leads.')}
                </p>
                {status?.connection && (
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                    {status.connection.browser && (
                      <>
                        <dt>{t('leads.ext.meta.browser', 'Browser')}</dt>
                        <dd className="text-foreground">{status.connection.browser}</dd>
                      </>
                    )}
                    {status.connection.extensionVersion && (
                      <>
                        <dt>{t('leads.ext.meta.version', 'Version')}</dt>
                        <dd className="text-foreground">{status.connection.extensionVersion}</dd>
                      </>
                    )}
                  </dl>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="h-10 flex-1 gap-2" onClick={() => setOpenHint(true)}>
                    <Puzzle className="h-4 w-4" aria-hidden="true" />
                    {t('leads.ext.openExtension', 'Open Extension')}
                  </Button>
                  <Button variant="outline" className="h-10 gap-2" onClick={() => void disconnect()} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    {t('leads.ext.disconnect', 'Disconnect')}
                  </Button>
                </div>
                {openHint && (
                  <p className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {t(
                      'leads.ext.openHint',
                      'Click the Lead Finder icon in your Chrome toolbar, or press Ctrl+Shift+L, then open Google Maps to start.',
                    )}
                  </p>
                )}
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
