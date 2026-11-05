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
    this.errors = [];
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') this.errors.push(message.params.exceptionDetails);
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
const profilePath = await mkdtemp(path.join(os.tmpdir(), 'updata-ui-'));
const port = await freePort();
let browser, cdp;
const checks = [];
const assert = (value, message) => { if (!value) throw new Error(message); checks.push(message); };
const fixture = {
 auth: { authenticated: true, user: { fullName: 'Alex Morgan', email: 'alex@example.com' } },
 importState: null,
 progress: { status: 'idle' }
};
try {
 browser = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profilePath}`, '--enable-unsafe-extension-debugging', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
 cdp = await CdpConnection.connect(await waitForDebugger(port));
 console.log("Chrome connected");
 const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.resolve('dist') });
 console.log("Extension loaded",id);
 const { targetId } = await cdp.send('Target.createTarget', { url: `chrome-extension://${id}/sidepanel.html` });
 console.log("Target created");
 const session = await attach(cdp, targetId);
 await cdp.send('Page.enable', {}, session);
 await cdp.send('Runtime.enable', {}, session);
 // Isolated UI contracts: no login, discovery or import request reaches a server.
 await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
 window.__fixture = ${JSON.stringify(fixture)};
 window.__messages = [];
 const listeners = [];
 chrome.runtime.onMessage.addListener = (listener) => listeners.push(listener);
 chrome.runtime.onMessage.removeListener = () => {};
 window.__emit = (message) => listeners.forEach(listener => listener(message));
 chrome.runtime.sendMessage = (message, callback) => {
   window.__messages.push(message);
   const f = window.__fixture;
   const response = message.type === 'GET_AUTH_STATE' ? {ok:true,auth:f.auth}
     : message.type === 'GET_PROGRESS' ? {ok:true,progress:f.progress}
     : message.type === 'GET_CRM_IMPORT' ? {ok:true,state:f.importState}
     : message.type === 'GET_MAPS_CONTEXT' ? {ok:true,context:{isMaps:true,query:'Hotels in Lahore',centerCoordinates:{latitude:31.5,longitude:74.3}}}
     : message.type === 'IMPORT_TO_CRM' ? {ok:true,state:{id:'import',status:'running',total:message.leadIds.length,processed:0,created:0,existing:0,failed:0,failedLeadIds:[],leadIds:message.leadIds}}
     : {ok:true};
   if (callback) queueMicrotask(() => callback(response));
   return Promise.resolve(response);
 };
 ` }, session);
 console.log('Reloading UI');
 await cdp.send('Page.reload', {}, session);
 await waitFor(session, 'document.querySelector("#business-types")'); console.log('Workspace ready');
 console.log('Seeding'); await evaluate(session, `(async () => {
 const request = indexedDB.open('lead-finder-local',1);
 const db = await new Promise(resolve => request.onsuccess = () => resolve(request.result));
 await chrome.storage.local.set({config:{businessType:'Hotel',businessTypes:['Hotel','Dentist'],location:'Lahore',radiusKm:10,maxResults:50,queryExpansion:true,enableEnrichment:false,maxPagesPerWebsite:2}});
 const tx = db.transaction(['leads','searches','settings'],'readwrite');
 const date = '2026-11-03T10:00:00.000Z';
 tx.objectStore('searches').put({id:'search',businessType:'Hotel',businessTypes:['Hotel','Dentist'],location:'Lahore',startedAt:date,status:'completed',uniqueCount:80,discoveredCount:80,exportedCount:0});
 for(let i=0;i<80;i++) tx.objectStore('leads').put({id:'lead-'+i,searchId:'search',businessName:i===0?'The Grand Lahore Hotel':'Local Business '+i,category:'Hotel',categories:['Hotel'],source:'google-maps',googleMapsUrl:'https://www.google.com/maps',sourceUrl:'https://www.google.com/maps',phone:'+92 42 1234567',website:'https://example.com',emails:[],address:'Mall Road, Lahore',city:'Lahore',country:'Pakistan',rating:4.6,reviewCount:125,distanceKm:2.4,photos:[],openingHours:[],discoveredAt:date,updatedAt:date,archived:i>=75,crmStatus:i===1?'existing':'not-imported'});
 await new Promise(resolve => tx.oncomplete=resolve); db.close();
 })()`);
 console.log('Reloading UI');
 await cdp.send('Page.reload', {}, session);
 await waitFor(session, 'document.querySelector(".type-chip")');
 const click = async (selector) => { await evaluate(session, `document.querySelector(${JSON.stringify(selector)}).click()`); await delay(100); };
 const nav = async (page) => click(`.nav-tabs button:nth-child(${page})`);
 const setInput = async (selector,value) => { await evaluate(session, `(() => { const el=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); })()`); await delay(100); };
 const screenshotDir = process.env.UI_SCREENSHOT_DIR;
 if (screenshotDir) await (await import('node:fs/promises')).mkdir(screenshotDir,{recursive:true});
 for(const width of [320,390,600,1280]) {
   await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false},session);
   for(let page=1;page<=4;page++) {
     await nav(page);
     const layout = await evaluate(session, `({overflow:document.documentElement.scrollWidth>innerWidth,heading:document.querySelector('main h2')?.textContent})`);
     assert(!layout.overflow, `${width}px / tab ${page}: no horizontal overflow`);
     if (screenshotDir) { const {data}=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},session); await (await import('node:fs/promises')).writeFile(path.join(screenshotDir,`${width}-tab-${page}.png`),Buffer.from(data,'base64')); }
   }
 }
 await nav(3);
 assert(await evaluate(session, `document.querySelectorAll('.history-lead').length===5`),'Archived businesses remain available in History');
 await nav(1);
 await click('#business-types');
 await setInput('.multi-search input','Restaurant');
 await evaluate(session, `document.querySelector('.multi-search input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
 await delay(100);
 assert(await evaluate(session, `document.querySelector('.selected-chips').textContent.includes('Restaurant')`),'Category keyboard selection adds a chip');
 await evaluate(session, `document.querySelector('.multi-search input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
 await click('.inline-action');
 assert(await evaluate(session, `document.querySelector('#location').value==='Current Maps context'`),'Current Maps context updates location');
 await click('.advanced-options summary');
 assert(await evaluate(session, `document.querySelector('.advanced-options').open`),'Advanced discovery options expand');
 await nav(2);
 await click('.row-check input');
 assert(await evaluate(session, `document.querySelectorAll('.lead-row.selected').length===1 && !document.querySelector('.lead-drawer')`),'Checkbox selects a business without opening details');
 await click('.lead-row');
 assert(await evaluate(session, `document.querySelector('.lead-drawer').contains(document.activeElement)`),'Details dialog receives focus');
 await evaluate(session, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
 await delay(100);
 assert(await evaluate(session, `!document.querySelector('.lead-drawer')`),'Escape closes business details');
 await evaluate(session, `document.querySelector('.virtual-viewport').scrollTop=4000`);
 await delay(100);
 await setInput('input[aria-label="Search leads"]','The Grand');
 assert(await evaluate(session, `document.querySelectorAll('.lead-row').length===1 && document.querySelector('.lead-row').textContent.includes('Grand')`),'Filtering a scrolled list restores the matching row');
 await setInput('input[aria-label="Search leads"]','NoSuchBusiness');
 assert(await evaluate(session, `document.querySelector('.empty-state h3').textContent==='No matching businesses'`),'Empty filter state explains how to recover');
 await setInput('input[aria-label="Search leads"]','The Grand');
 await click('.export-buttons button:last-child');
 assert(await evaluate(session, `Boolean(document.querySelector('.modal-card'))`),'Clear results opens a confirmation');
 await evaluate(session, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
 await delay(50);
 assert(await evaluate(session, `!document.querySelector('.modal-card')`),'Escape cancels clearing without changing results');
 await click('.selection-summary .primary-action');
 assert(await evaluate(session, `window.__messages.some(m=>m.type==='IMPORT_TO_CRM' && m.leadIds.length===1)`),'CRM import retains selected lead ID contract');
 for(const status of ['running','completed','partial','failed','cancelled']) {
   await evaluate(session, `window.__emit({type:'CRM_IMPORT_PROGRESS',progress:{id:'import',status:'${status}',total:14,processed:14,created:2,existing:12,failed:0,leadIds:[],failedLeadIds:[]}})`);
   await delay(50);
   assert(await evaluate(session, `Boolean(document.querySelector('.import-${status}'))`),`Confirmed import state renders: ${status}`);
 }
 await nav(1);
 await click('.view > .primary-action');
 assert(await evaluate(session, `window.__messages.some(m=>m.type==='START_DISCOVERY' && m.config.businessTypes.includes('Hotel') && m.config.selectedCenter.latitude===31.5)`),'Analyze Area preserves campaign and geographic request parameters');
 await nav(4);
 await click('.theme-switcher button:first-child');
 assert(await evaluate(session, `document.querySelector('.app-shell').classList.contains('light')`),'Light theme works');
 await nav(1);
 await click('.theme-button');
 assert(await evaluate(session, `document.querySelector('.app-shell').classList.contains('dark')`),'Dark theme works');
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:480,deviceScaleFactor:1,mobile:false},session);
 await nav(4);
 assert(await evaluate(session, `document.documentElement.scrollWidth<=innerWidth && document.scrollingElement.scrollHeight>innerHeight`),'Short side panel scrolls without horizontal overflow');
 // Check authentication and its validation controls without transmitting credentials.
 await evaluate(session, `window.__fixture.auth={authenticated:false}; window.__emit({type:'CRM_AUTH_CHANGED'})`);
 await waitFor(session,'document.querySelector("#login-password")');
 await click('.password-toggle');
 assert(await evaluate(session, `document.querySelector('#login-password').type==='text'`),'Authentication password visibility works');
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:600,deviceScaleFactor:1,mobile:false},session);
 assert(await evaluate(session, `document.documentElement.scrollWidth<=innerWidth`),'Authentication fits a 320px panel');
 assert(cdp.errors.length===0, 'No uncaught browser runtime exceptions');
 console.log(JSON.stringify({passed:checks.length,checks},null,2));
} finally {
 cdp?.close();
 if(browser && browser.exitCode===null) { const exited = new Promise(resolve=>browser.once('exit',resolve)); browser.kill(); await Promise.race([exited,delay(2000)]); if(browser.exitCode===null) { browser.kill('SIGKILL'); await Promise.race([exited,delay(1000)]); } }
 await cleanupProfile(profilePath);
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
