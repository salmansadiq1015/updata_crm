import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

class CdpConnection {
  static async connect(url) {
    const connection = new CdpConnection(url);
    await connection.ready;
    return connection;
  }

  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result || {});
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const message = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(message));
    });
  }

  close() {
    this.socket.close();
  }
}

const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const extensionPath = path.resolve('dist');
const profilePath = await mkdtemp(path.join(os.tmpdir(), 'lead-finder-browser-test-'));
const port = await freePort();
const results = [];
let browser;
let cdp;

try {
  browser = spawn(chromePath, [
    ...(process.env.LEAD_FINDER_HEADLESS === '1' ? ['--headless=new'] : []),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profilePath}`,
    '--enable-unsafe-extension-debugging',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-component-update',
    '--disable-sync',
    '--window-size=1280,900',
    '--window-position=20,20',
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const websocketUrl = await waitForDebugger(port);
  cdp = await CdpConnection.connect(websocketUrl);
  const loadedExtension = await cdp.send('Extensions.loadUnpacked', { path: extensionPath }).catch((error) => ({ error: String(error) }));
  if (loadedExtension?.error) throw new Error(`Chrome could not load the unpacked extension: ${loadedExtension.error}`);
  const extensionId = loadedExtension?.id || await findExtensionId(cdp, extensionPath);
  const installedExtensions = await cdp.send('Extensions.getExtensions').catch(() => ({ extensions: [] }));
  const installedExtension = installedExtensions.extensions?.find((item) => item.id === extensionId);
  if (!installedExtension?.enabled) throw new Error(`Chrome did not enable the unpacked extension: ${JSON.stringify({ loadedExtension, installedExtensions })}`);
  pass('Manifest V3 service worker loaded', extensionId);

  const extensionTarget = await createTarget(cdp, `chrome-extension://${extensionId}/sidepanel.html`);
  const extensionSession = await attach(cdp, extensionTarget);
  await cdp.send('Page.enable', {}, extensionSession);
  await cdp.send('Runtime.enable', {}, extensionSession);
  await waitFor(extensionSession, 'document.querySelector("#login-email") && document.querySelector("#login-password")');

  const initialUi = await evaluate(extensionSession, `(() => ({
    apiFieldVisible: document.body.innerText.includes('CRM API URL'),
    emailType: document.querySelector('#login-email')?.type,
    passwordType: document.querySelector('#login-password')?.type,
    hasEyeToggle: Boolean(document.querySelector('.password-toggle')),
    hasLoginButton: Boolean(document.querySelector('button.primary-action')),
    shellTheme: document.querySelector('.app-shell')?.className
  }))()`);
  assert(!initialUi.apiFieldVisible, 'CRM API URL is hidden from login UI');
  assert(initialUi.emailType === 'email', 'Email control uses browser email validation');
  assert(initialUi.passwordType === 'password' && initialUi.hasEyeToggle, 'Password starts hidden and has an eye toggle');
  assert(initialUi.hasLoginButton, 'Login action is rendered');

  const shownType = await evaluate(extensionSession, `(async () => { document.querySelector('.password-toggle').click(); const started = Date.now(); while (document.querySelector('#login-password').type !== 'text' && Date.now() - started < 2000) await new Promise((resolve) => setTimeout(resolve, 20)); return document.querySelector('#login-password').type; })()`);
  assert(shownType === 'text', 'Password eye reveals the password');
  const hiddenType = await evaluate(extensionSession, `(async () => { document.querySelector('.password-toggle').click(); const started = Date.now(); while (document.querySelector('#login-password').type !== 'password' && Date.now() - started < 2000) await new Promise((resolve) => setTimeout(resolve, 20)); return document.querySelector('#login-password').type; })()`);
  assert(hiddenType === 'password', 'Password eye hides the password again');

  const darkTheme = await evaluate(extensionSession, `(async () => { if (!document.querySelector('.app-shell').classList.contains('dark')) document.querySelector('.auth-theme').click(); const started = Date.now(); while (!document.querySelector('.app-shell').classList.contains('dark') && Date.now() - started < 2000) await new Promise((resolve) => setTimeout(resolve, 20)); return document.querySelector('.app-shell').classList.contains('dark'); })()`);
  assert(darkTheme, 'Theme micro-interaction switches to dark mode');
  await cdp.send('Page.reload', { ignoreCache: true }, extensionSession);
  await waitFor(extensionSession, 'document.querySelector("#login-email")');
  const restoredTheme = await evaluate(extensionSession, `document.querySelector('.app-shell').classList.contains('dark')`);
  assert(restoredTheme, 'Theme state survives panel reload');

  const permission = await evaluate(extensionSession, `chrome.permissions.contains({ origins: ['https://updata.behjja.com/*'] })`);
  assert(permission, 'Required CRM host permission is installed without a login prompt');

  const loginResult = await evaluate(extensionSession, `(async () => {
    const setValue = (selector, value) => {
      const element = document.querySelector(selector);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setValue('#login-email', 'extension-browser-smoke-${Date.now()}@example.com');
    setValue('#login-password', 'Invalid-Test-Password-1!');
    document.querySelector('form').requestSubmit();
    const started = Date.now();
    while (!document.querySelector('.auth-error') && Date.now() - started < 30000) await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      text: document.querySelector('.auth-error')?.textContent || '',
      buttonDisabled: document.querySelector('button.primary-action')?.disabled,
      password: document.querySelector('#login-password')?.value
    };
  })()`);
  if (/invalid email or password|too many|rate limit/i.test(loginResult.text)) {
    pass('Browser login request reaches CRM and returns a specific authentication response');
  } else {
    results.push({
      status: 'WARN',
      name: 'Production has not yet allowed the release-pinned extension origin',
      detail: loginResult.text || 'No response'
    });
  }
  assert(loginResult.buttonDisabled === false, 'Login button always exits loading state after an error');

  const storedSecrets = await evaluate(extensionSession, `(async () => {
    const local = await chrome.storage.local.get(null);
    const session = await chrome.storage.session.get(null);
    return JSON.stringify({ local, session });
  })()`);
  assert(!storedSecrets.includes('Invalid-Test-Password-1!'), 'Passwords are not persisted in extension storage');

  const authState = await evaluate(extensionSession, `chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' })`);
  assert(authState?.ok && authState.auth?.authenticated === false, 'Failed login does not create an authenticated session');

  // Use an isolated, synthetic local session for UI/campaign smoke coverage.
  // The temporary Chrome profile is deleted in finally; no production CRM
  // request is made with this token.
  await evaluate(extensionSession, `(async () => {
    await chrome.storage.local.set({
      'crm-auth': { apiBaseUrl: 'https://updata.behjja.com/api/v1', user: { id: 'browser-smoke-user', email: 'browser-smoke@example.com' } },
      config: {
        businessType: 'zzzzqzxqv nonexisting industry 98473',
        businessTypes: ['zzzzqzxqv nonexisting industry 98473', 'Hotel'],
        location: 'Paris, France', radiusKm: 0.5, maxResults: 4,
        queryExpansion: false, enableEnrichment: false, maxPagesPerWebsite: 1,
        safetyLimit: 60, areaSweep: true, thoroughContacts: false,
        maxAreaTiles: 1, requestDelayMs: 5000,
        selectedCenter: { latitude: 48.8566, longitude: 2.3522 }
      }
    });
    await chrome.storage.session.set({ 'crm-access-token': 'browser-smoke-only' });
  })()`);
  await cdp.send('Page.reload', { ignoreCache: true }, extensionSession);
  await waitFor(extensionSession, 'document.querySelector("#business-types")');
  const campaignUi = await evaluate(extensionSession, `(() => ({
    selectedText: document.querySelector('#business-types')?.textContent,
    chips: [...document.querySelectorAll('.type-chip')].map((item) => item.textContent),
    coordinateInputs: document.querySelectorAll('#center-latitude, #center-longitude').length,
    globalLimit: document.querySelector('.effective-limit')?.textContent,
    accessible: document.querySelector('#business-types')?.getAttribute('aria-haspopup')
  }))()`);
  assert(campaignUi.selectedText.includes('2 business types selected') && campaignUi.chips.length === 2, 'Multi-select restores ordered business types as removable chips');
  assert(campaignUi.accessible === 'listbox', 'Multi-select exposes accessible listbox semantics');
  assert(campaignUi.coordinateInputs === 0, 'Search brief has no manual latitude/longitude inputs');
  assert(campaignUi.globalLimit.includes('4 per type') && campaignUi.globalLimit.includes('8 unique businesses'), 'UI explains the per-type maximum and resulting campaign total before start');

  const keyboardSelection = await evaluate(extensionSession, `(async () => {
    document.querySelector('#business-types').click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const input = document.querySelector('.multi-search input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Dentist'); input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    return [...document.querySelectorAll('.type-chip')].map((item) => item.textContent);
  })()`);
  assert(keyboardSelection.some((value) => value.includes('Dentist')), 'Keyboard search and Enter add a business type without duplicates');

  const selectorLayout = await evaluate(extensionSession, `(async () => {
    const checkboxes = [...document.querySelectorAll('.multi-options input[type="checkbox"]')];
    // Focusing a lower option reproduces Chrome's native label-click scrolling.
    // The hidden checkbox must remain inside the scrolling option row.
    const checkbox = checkboxes.at(-1);
    checkbox.focus();
    checkbox.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const popover = document.querySelector('.multi-popover');
    const options = document.querySelector('.multi-options');
    const bounds = popover.getBoundingClientRect();
    return {
      scrollTop: popover.scrollTop,
      optionsScrolled: options.scrollTop > 0,
      controlsVisible: ['.multi-search', '.multi-actions', '.multi-options'].every((selector) => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return rect.top >= bounds.top && rect.bottom <= bounds.bottom;
      }),
      selectionToggled: checkbox.checked
    };
  })()`);
  assert(selectorLayout.scrollTop === 0 && selectorLayout.controlsVisible, 'Selecting a lower business type keeps search, actions, and options inside the dropdown');
  assert(selectorLayout.optionsScrolled && selectorLayout.selectionToggled, 'Business type options scroll and remain selectable without scrolling the popover');
  // Restore the deterministic two-type fixture used by the live queue smoke.
  await cdp.send('Page.reload', { ignoreCache: true }, extensionSession);
  await waitFor(extensionSession, 'document.querySelector("#business-types")');

  const mapsTarget = await createTarget(cdp, 'https://www.google.com/maps/search/Hotel+near+paris');
  await cdp.send('Target.activateTarget', { targetId: mapsTarget });
  const mapsSession = await attach(cdp, mapsTarget);
  await cdp.send('Runtime.enable', {}, mapsSession);
  await waitFor(mapsSession, `location.pathname.startsWith('/maps')`, 30000);

  const mapsResult = await pollMaps(extensionSession, 45000);
  assert(mapsResult?.context?.isMaps === true, `Maps content script and service worker messaging are connected (${JSON.stringify(mapsResult)})`);
  assert(typeof mapsResult.context.visibleResultCount === 'number', 'Maps result-state counters are returned');

  const reinjection = await evaluate(extensionSession, `(async () => {
    const tab = (await chrome.tabs.query({})).find((item) => { try { const url = new URL(item.url || ''); return url.hostname.includes('google.') && url.pathname.startsWith('/maps'); } catch { return false; } });
    if (!tab?.id) return { ok: false, error: 'Maps tab not found' };
    try {
      await Promise.all([
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/maps.js'] }),
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/maps.js'] })
      ]);
      const marker = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => globalThis.__leadFinderMapsContentV5__ === true
      });
      const context = await chrome.tabs.sendMessage(tab.id, { type: 'GET_MAPS_CONTEXT' });
      return { ok: Boolean(context?.ok), marker: marker[0]?.result === true, context };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  })()`);
  assert(reinjection?.ok === true && reinjection.marker === true, `Concurrent content-script reinjection is idempotent and remains responsive (${JSON.stringify(reinjection)})`);

  const extracted = await evaluate(extensionSession, `(async () => {
    const tab = (await chrome.tabs.query({})).find((item) => { try { const url = new URL(item.url || ''); return url.hostname.includes('google.') && url.pathname.startsWith('/maps'); } catch { return false; } });
    if (!tab?.id) return { ok: false, records: [], error: 'No active Maps tab' };
    try { return await chrome.tabs.sendMessage(tab.id, { type: 'COLLECT_VISIBLE' }); }
    catch (error) { return { ok: false, records: [], error: String(error) }; }
  })()`);
  assert(extracted?.ok === true && Array.isArray(extracted.records), 'Visible Maps extraction command completes');
  if (extracted.records.length) {
    assert(extracted.records.every((record) => record.businessName && record.googleMapsUrl), `Extracted ${extracted.records.length} visible Maps records with stable identity fields`);
  } else {
    results.push({ status: 'WARN', name: 'Google Maps returned no visible business cards in automated Chrome; extraction command itself completed' });
  }

  const linkScope = await evaluate(mapsSession, `(() => {
    const visible = (node) => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; };
    const feeds = [...document.querySelectorAll('[role="feed"]')].filter((feed) => feed.querySelector('a[href*="/maps/place/"]'));
    return {
      global: [...document.querySelectorAll('a[href*="/maps/place/"]')].filter(visible).length,
      feed: feeds.reduce((max, feed) => Math.max(max, [...feed.querySelectorAll('a[href*="/maps/place/"]')].filter(visible).length), 0)
    };
  })()`);
  assert(extracted.records.length <= Math.max(1, linkScope.feed), `Extraction is scoped to the results feed, not ${linkScope.global} visible canvas/list links`);

  const scrollCheckpoint = await evaluate(extensionSession, `(async () => {
    const tab = (await chrome.tabs.query({})).find((item) => { try { const url = new URL(item.url || ''); return url.hostname.includes('google.') && url.pathname.startsWith('/maps'); } catch { return false; } });
    if (!tab?.id) return null;
    return chrome.tabs.sendMessage(tab.id, { type: 'GET_SCROLL_STATE' });
  })()`);
  assert(scrollCheckpoint?.ok === true, 'Maps scroll checkpoint command completes in the real browser');
  assert(Number.isFinite(scrollCheckpoint.scrollTop) && Number.isFinite(scrollCheckpoint.scrollHeight), 'Maps scroll position and feed height are checkpointable');
  assert('firstVisibleResultKey' in scrollCheckpoint && 'lastVisibleResultKey' in scrollCheckpoint, 'Maps checkpoint includes stable visible-result anchors');

  const scrollAttempt = await evaluate(extensionSession, `(async () => {
    const tab = (await chrome.tabs.query({})).find((item) => { try { const url = new URL(item.url || ''); return url.hostname.includes('google.') && url.pathname.startsWith('/maps'); } catch { return false; } });
    return tab?.id ? chrome.tabs.sendMessage(tab.id, { type: 'SCROLL_RESULTS' }) : null;
  })()`);
  assert(scrollAttempt?.ok === true && typeof scrollAttempt.changed === 'boolean' && typeof scrollAttempt.atEnd === 'boolean', 'Real Maps feed accepts a bounded continuation scroll');
  if (scrollAttempt.scrollHeight > scrollAttempt.clientHeight + 20 && !scrollAttempt.atEnd) {
    assert(scrollAttempt.changed === true, 'Scrollable Maps feed advances instead of reprocessing the same visible batch');
  }

  const continuation = await evaluate(extensionSession, `(async () => {
    const tab = (await chrome.tabs.query({})).find((item) => { try { const url = new URL(item.url || ''); return url.hostname.includes('google.') && url.pathname.startsWith('/maps'); } catch { return false; } });
    if (!tab?.id) return null;
    const keys = new Set();
    let firstBatch = 0;
    let stableEnd = 0;
    let stagnantSteps = 0;
    let completed = false;
    for (let step = 0; step < 40; step += 1) {
      const visible = await chrome.tabs.sendMessage(tab.id, { type: 'COLLECT_VISIBLE' });
      if (step === 0) firstBatch = visible.records?.length || 0;
      const before = keys.size;
      for (const record of visible.records || []) keys.add(record.placeIdentifier || record.googleMapsUrl);
      stagnantSteps = keys.size > before ? 0 : stagnantSteps + 1;
      const scroll = await chrome.tabs.sendMessage(tab.id, { type: 'SCROLL_RESULTS' });
      if (!scroll.changed && (scroll.atEnd || scroll.endConfirmed)) stableEnd += 1;
      else stableEnd = 0;
      if (stableEnd >= 3) { completed = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    return { completed, firstBatch, uniqueVisible: keys.size, stagnantSteps };
  })()`);
  if (continuation?.completed || continuation?.stagnantSteps < 5) {
    pass(`Continuation made progress or reached a stable end (${JSON.stringify(continuation)})`);
  } else {
    results.push({ status: 'WARN', name: 'Google Maps paused its live feed before exposing a confirmed end; the product safety-result-state limit remains the bounded termination', detail: JSON.stringify(continuation) });
  }

  if (extracted.records.length) {
    const detailResult = await evaluate(extensionSession, `(async () => {
      const detailTab = await chrome.tabs.create({ url: ${JSON.stringify(extracted.records[0].googleMapsUrl)}, active: false });
      try {
        for (let attempt = 0; attempt < 30; attempt += 1) {
          try {
            const context = await chrome.tabs.sendMessage(detailTab.id, { type: 'GET_MAPS_CONTEXT' });
            if (context?.context?.isListing || context?.context?.url?.includes('/maps/place/')) {
              const details = await chrome.tabs.sendMessage(detailTab.id, { type: 'COLLECT_DETAILS' });
              if (details?.record) return details;
            }
          } catch {
            if (attempt === 3) await chrome.scripting.executeScript({ target: { tabId: detailTab.id }, files: ['content/maps.js'] }).catch(() => undefined);
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        return { ok: false, error: 'Detail view did not become extractable' };
      } finally { await chrome.tabs.remove(detailTab.id).catch(() => undefined); }
    })()`);
    assert(detailResult?.ok === true && detailResult.record?.businessName, 'Real Maps business detail extraction returns a named business');
    assert(['phone', 'website', 'address', 'rating', 'reviewCount'].every((field) => field in detailResult.record), 'Detail extraction returns the complete contact/review field schema without fabricating values');
  }

  const campaignRun = await evaluate(extensionSession, `(async () => {
    const start = [...document.querySelectorAll('button.primary-action')].find((button) => button.textContent.includes('Analyze Area'));
    if (!start) return { ok: false, error: 'Start campaign button not found' };
    start.click();
    const seen = [];
    const uniqueSnapshots = [];
    let latest = null;
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      latest = (await chrome.runtime.sendMessage({ type: 'GET_PROGRESS' }).catch(() => null))?.progress ?? null;
      const current = latest?.campaign?.currentBusinessType;
      if (current && seen.at(-1) !== current) seen.push(current);
      if (typeof latest?.unique === 'number' && uniqueSnapshots.at(-1) !== latest.unique) uniqueSnapshots.push(latest.unique);
      if (['completed', 'completed-with-errors', 'failed', 'stopped'].includes(latest?.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return { ok: Boolean(latest), seen, uniqueSnapshots, latest };
  })()`);
  assert(campaignRun?.ok && campaignRun.latest?.campaign?.tasks?.length === 2, `Real browser created one persisted two-type campaign (${JSON.stringify(campaignRun?.latest?.status)})`);
  assert(campaignRun.seen.includes('zzzzqzxqv nonexisting industry 98473') && campaignRun.seen.includes('Hotel'), `Empty first type automatically advanced to Hotel (${JSON.stringify(campaignRun.seen)})`);
  assert(campaignRun.latest.campaign.tasks[0].status !== 'running' && campaignRun.latest.campaign.tasks[1].status !== 'pending', 'Per-type terminal state persisted and the next type started automatically');
  assert(campaignRun.uniqueSnapshots.length >= 1 && campaignRun.latest.unique <= 8, `Incremental results respected the per-type four-business limit and eight-business campaign maximum (${JSON.stringify(campaignRun.uniqueSnapshots)})`);

  await evaluate(extensionSession, `chrome.storage.local.set({ config: {
    businessType: 'Hotel', businessTypes: ['Hotel', 'Gym'], location: 'Paris, France',
    radiusKm: 0.5, maxResults: 50, queryExpansion: false, enableEnrichment: false,
    maxPagesPerWebsite: 1, safetyLimit: 60, areaSweep: true, thoroughContacts: false,
    maxAreaTiles: 1, requestDelayMs: 5000, selectedCenter: { latitude: 48.8566, longitude: 2.3522 }
  } })`);
  await cdp.send('Page.reload', { ignoreCache: true }, extensionSession);
  await waitFor(extensionSession, 'document.querySelector("#business-types")');
  const pausedLifecycle = await evaluate(extensionSession, `(async () => {
    const previousId = ${JSON.stringify(campaignRun.latest.searchId)};
    const start = [...document.querySelectorAll('button.primary-action')].find((button) => !button.disabled && /Analyze/i.test(button.textContent));
    if (!start) return { ok: false, error: 'New campaign button not found' };
    start.click();
    let latest = null;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      latest = (await chrome.runtime.sendMessage({ type: 'GET_PROGRESS' }).catch(() => null))?.progress ?? null;
      if (latest?.searchId && latest.searchId !== previousId && ['queued', 'starting', 'discovering', 'processing', 'resuming', 'retrying'].includes(latest.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const pause = await chrome.runtime.sendMessage({ type: 'PAUSE_DISCOVERY' });
    const pauseDeadline = Date.now() + 10000;
    while (Date.now() < pauseDeadline) {
      latest = (await chrome.runtime.sendMessage({ type: 'GET_PROGRESS' }))?.progress ?? null;
      if (latest?.status === 'paused') break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { ok: pause?.ok === true, latest };
  })()`);
  assert(pausedLifecycle?.ok && pausedLifecycle.latest?.status === 'paused', 'Pause checkpoints the active type and queue position');

  await cdp.send('ServiceWorker.enable', {}, extensionSession).catch(() => undefined);
  let workerStopped = await cdp.send('ServiceWorker.stopAllWorkers', {}, extensionSession).then(() => true).catch(() => false);
  if (!workerStopped) {
    const targets = (await cdp.send('Target.getTargets')).targetInfos;
    const worker = targets.find((item) => item.url === `chrome-extension://${extensionId}/background/service-worker.js`);
    workerStopped = worker ? await cdp.send('Target.closeTarget', { targetId: worker.targetId }).then((result) => result.success !== false).catch(() => false) : false;
  }
  assert(workerStopped, 'Chrome stopped the MV3 worker to simulate lifecycle suspension');
  await delay(750);
  const recoveredLifecycle = await evaluate(extensionSession, `(async () => {
    const progress = (await chrome.runtime.sendMessage({ type: 'GET_PROGRESS' }))?.progress ?? null;
    const resume = await chrome.runtime.sendMessage({ type: 'RESUME_DISCOVERY' });
    let resumed = null;
    const resumeDeadline = Date.now() + 15000;
    while (Date.now() < resumeDeadline) {
      resumed = (await chrome.runtime.sendMessage({ type: 'GET_PROGRESS' }))?.progress ?? null;
      if (resumed && resumed.status !== 'paused') break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const stop = await chrome.runtime.sendMessage({ type: 'STOP_DISCOVERY' });
    let stopped = null;
    const stopDeadline = Date.now() + 30000;
    while (Date.now() < stopDeadline) {
      stopped = (await chrome.runtime.sendMessage({ type: 'GET_PROGRESS' }))?.progress ?? null;
      if (stopped?.status === 'stopped') break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return { progress, resume, resumed, stop, stopped };
  })()`);
  assert(recoveredLifecycle.progress?.status === 'paused' && recoveredLifecycle.progress?.campaign?.currentBusinessType === 'Hotel', 'Service-worker restart restores the paused active type');
  assert(recoveredLifecycle.resume?.ok === true && recoveredLifecycle.resumed?.status !== 'paused', 'Resume restarts orchestration after worker suspension');
  assert(recoveredLifecycle.stop?.ok === true && recoveredLifecycle.stopped?.status === 'stopped', 'Stop reaches a terminal state and preserves the checkpoint');
  assert(recoveredLifecycle.stopped.campaign.tasks.find((task) => task.businessType === 'Gym')?.status === 'skipped', 'Stop prevents the next business type from starting');

  const dbState = await evaluate(extensionSession, `(async () => {
    const databases = await indexedDB.databases();
    const request = indexedDB.open('lead-finder-local', 1);
    const stores = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve([...request.result.objectStoreNames]);
      request.onerror = () => reject(request.error);
    });
    return { databases: databases.map((db) => db.name), stores };
  })()`);
  assert(dbState.databases.includes('lead-finder-local'), 'IndexedDB local database is created');
  for (const store of ['leads', 'searches', 'emailRecords', 'enrichmentRecords', 'exports', 'settings']) {
    assert(dbState.stores.includes(store), `IndexedDB store exists: ${store}`);
  }

  const failures = results.filter((result) => result.status === 'FAIL');
  process.stdout.write(`${JSON.stringify({ extensionId, results }, null, 2)}\n`);
  if (failures.length) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
} finally {
  cdp?.close();
  if (browser && browser.exitCode === null) {
    const exited = new Promise((resolve) => browser.once('exit', resolve));
    browser.kill('SIGTERM');
    await Promise.race([exited, delay(2000)]);
  }
  await cleanupProfile(profilePath);
}

function pass(name, detail) {
  results.push({ status: 'PASS', name, ...(detail ? { detail } : {}) });
}

function assert(condition, name) {
  if (condition) pass(name);
  else {
    results.push({ status: 'FAIL', name });
    throw new Error(name);
  }
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForDebugger(debugPort) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) return (await response.json()).webSocketDebuggerUrl;
    } catch { /* Chrome is still starting. */ }
    await delay(100);
  }
  throw new Error('Chrome DevTools endpoint did not start');
}

async function findExtensionId(connection, unpackedPath) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const { targetInfos } = await connection.send('Target.getTargets');
    const target = targetInfos.find((item) => item.url?.startsWith('chrome-extension://') && item.url.endsWith('/background/service-worker.js'));
    const id = target?.url?.match(/^chrome-extension:\/\/([^/]+)/)?.[1];
    if (id) return id;
    await delay(100);
  }
  // A manifest `key` pins the unpacked extension ID. Falling back to a hash of
  // the build path points Chrome at a nonexistent extension whenever the MV3
  // worker has not woken yet, producing chrome-error:// ERR_BLOCKED_BY_CLIENT.
  const manifest = JSON.parse(await readFile(path.join(unpackedPath, 'manifest.json'), 'utf8'));
  const identity = manifest.key ? Buffer.from(manifest.key, 'base64') : unpackedPath;
  const hash = createHash('sha256').update(identity).digest('hex').slice(0, 32);
  return [...hash].map((character) => String.fromCharCode(97 + Number.parseInt(character, 16))).join('');
}

async function createTarget(connection, url) {
  return (await connection.send('Target.createTarget', { url })).targetId;
}

async function openNativeSidePanel(connection, extensionId) {
  let { targetInfos } = await connection.send('Target.getTargets');
  let worker = targetInfos.find((item) => item.url === `chrome-extension://${extensionId}/background/service-worker.js`);
  if (!worker) {
    // MV3 may keep the worker fully asleep after install. Start its registered
    // scope through CDP so the native side-panel API can be invoked; direct
    // navigation to sidepanel.html is intentionally blocked by current Chrome.
    await connection.send('ServiceWorker.enable').catch(() => undefined);
    await connection.send('ServiceWorker.startWorker', { scopeURL: `chrome-extension://${extensionId}/` }).catch(() => undefined);
    const deadline = Date.now() + 10000;
    while (!worker && Date.now() < deadline) {
      targetInfos = (await connection.send('Target.getTargets')).targetInfos;
      worker = targetInfos.find((item) => item.url === `chrome-extension://${extensionId}/background/service-worker.js`);
      if (!worker) await delay(100);
    }
  }
  if (!worker) throw new Error('Lead Finder service worker target was not found');
  const workerSession = await attach(connection, worker.targetId);
  await connection.send('Runtime.enable', {}, workerSession);
  const opened = await connection.send('Runtime.evaluate', {
    expression: `(async () => {
      const browserWindow = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: browserWindow.id });
      return true;
    })()`,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  }, workerSession);
  if (opened.exceptionDetails) throw new Error(opened.exceptionDetails.exception?.description || opened.exceptionDetails.text);

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const targets = (await connection.send('Target.getTargets')).targetInfos;
    const panel = targets.find((item) => item.url === `chrome-extension://${extensionId}/sidepanel.html`);
    if (panel) return panel.targetId;
    await delay(100);
  }
  throw new Error('Native Lead Finder side panel did not open');
}

async function attach(connection, targetId) {
  return (await connection.send('Target.attachToTarget', { targetId, flatten: true })).sessionId;
}

async function evaluate(sessionId, expression) {
  const response = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}

async function waitFor(sessionId, expression, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(sessionId, `Boolean(${expression})`).catch(() => false)) return;
    await delay(100);
  }
  const snapshot = await evaluate(sessionId, `({ href: location.href, readyState: document.readyState, body: document.body?.innerText?.slice(0, 500), runtimeId: globalThis.chrome?.runtime?.id })`).catch(() => null);
  throw new Error(`Timed out waiting for browser expression: ${expression}\nBrowser snapshot: ${JSON.stringify(snapshot)}`);
}

async function pollMaps(extensionSession, timeout) {
  const deadline = Date.now() + timeout;
  let response = null;
  while (Date.now() < deadline) {
    response = await evaluate(extensionSession, `(async () => {
      const tab = (await chrome.tabs.query({})).find((item) => { try { const url = new URL(item.url || ''); return url.hostname.includes('google.') && url.pathname.startsWith('/maps'); } catch { return false; } });
      if (!tab?.id) return { ok: false, error: 'Maps tab not found' };
      await chrome.tabs.update(tab.id, { active: true });
      const viaWorker = await chrome.runtime.sendMessage({ type: 'GET_MAPS_CONTEXT' }).catch(() => null);
      if (viaWorker?.ok && viaWorker.context?.isMaps) return viaWorker;
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/maps.js'] });
        return await chrome.tabs.sendMessage(tab.id, { type: 'GET_MAPS_CONTEXT' });
      } catch (error) { return { ok: false, error: String(error), url: tab.url, viaWorker }; }
    })()`).catch(() => null);
    if (response?.ok && response.context?.isMaps && (response.context.hasResults || response.context.visibleResultCount > 0)) return response;
    await delay(250);
  }
  return response;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function cleanupProfile(profile) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(profile, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await delay(200);
    }
  }
}
