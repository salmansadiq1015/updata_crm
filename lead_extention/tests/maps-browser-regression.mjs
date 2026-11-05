import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Exercise the release content script against real Chrome layout and a recycled
// Maps-like feed. No CRM account, network requests or production writes.
const temp = await mkdtemp(path.join(os.tmpdir(), 'maps-regression-'));
try {
  const bundle = await readFile(new URL('../dist/content/maps.js', import.meta.url), 'utf8');
  // Parse as an actual classic script: minified import{...} must fail too.
  new Script(bundle, { filename: 'content/maps.js' });
  const fixture = path.join(temp, 'fixture.html');
  await writeFile(fixture, `<!doctype html><html><body>
    <div role="feed" style="height:280px;width:500px;overflow:auto;position:relative"><div id="space" style="height:5000px"></div><div id="cards"></div></div>
    <pre id="report"></pre>
    <script>
      globalThis.chrome = { runtime: { id: 'test', onMessage: { addListener(fn) { globalThis.handle = fn; } }, sendMessage: async () => {} } };
      const feed = document.querySelector('[role=feed]');
      const cards = document.querySelector('#cards');
      function render() {
        const first = Math.floor(feed.scrollTop / 100);
        cards.innerHTML = Array.from({length: Math.min(50, Math.ceil((feed.scrollTop + 280) / 100)) - first}, (_, offset) => {
          const i = first + offset;
          const metadata = ['No reviews', 'Online appointments', 'N°1', 'On-site services', 'Tech AB - Smartpartner'][i % 5];
          return '<article role="article" style="position:absolute;top:' + (i * 100) + 'px;height:100px;width:480px">'
            + '<a style="display:block" aria-label="Software Business ' + i + '" href="https://www.google.com/maps/place/Business-' + i + '?query_place_id=place-' + i + '">Software Business ' + i + '</a>'
            + '<span>' + metadata + '</span><span>Shared reception 0522 000000</span></article>';
        }).join('');
      }
      feed.addEventListener('scroll', render);
      render();
    </script>
    <script>${bundle.replace(/<\/script/gi, '<\\/script')}</script>
    <script>
      try {
        const command = (type) => { let result; handle({type}, {}, (value) => result = value); if (!result?.ok) throw Error(JSON.stringify(result)); return result; };
        const seen = new Map();
        let maxStep = 0;
        for (let round = 0; round < 40; round++) {
          for (const record of command('COLLECT_VISIBLE').records) seen.set(record.placeIdentifier, record);
          const before = feed.scrollTop;
          const state = command('SCROLL_RESULTS');
          maxStep = Math.max(maxStep, feed.scrollTop - before);
          if (state.atEnd) {
            for (const record of command('COLLECT_VISIBLE').records) seen.set(record.placeIdentifier, record);
            break;
          }
        }
        const records = [...seen.values()];
        if (records.length !== 50) throw Error('Skipped records: ' + records.length + '/50');
        if (records.some(record => record.category !== null)) throw Error('Metadata used as business category');
        if (maxStep > feed.clientHeight) throw Error('Scroll skipped a viewport');
        if (command('GET_SCROLL_STATE').endConfirmed) throw Error('Temporary bottom treated as confirmed end');
        for (const marker of ["You've reached the end of the list", 'Vous avez atteint la fin de la liste', 'Du hast das Ende der Liste erreicht', 'Has llegado al final de la lista', 'وصلت إلى نهاية القائمة']) {
          const end = document.createElement('p'); end.textContent = marker; feed.append(end);
          if (!command('GET_SCROLL_STATE').endConfirmed) throw Error('Missed localized end: ' + marker);
          end.remove();
        }
        cards.querySelector('article').insertAdjacentHTML('beforeend', '<button class="DkEaL">Add a label</button>');
        if (command('COLLECT_VISIBLE').records[0].category !== null) throw Error('Maps action was used as category');
        cards.querySelector('article').insertAdjacentHTML('beforeend', '<button data-item-id="category">Hotel</button>');
        if (command('COLLECT_VISIBLE').records[0].category !== 'Hotel') throw Error('Action obscured explicit Hotel category');
        cards.querySelector('article [data-item-id="category"]').remove();
        cards.querySelector('article').insertAdjacentHTML('beforeend', '<span class="DkEaL">Hotel</span>');
        if (command('COLLECT_VISIBLE').records[0].category !== 'Hotel') throw Error('First Maps action obscured later category');
        cards.querySelector('article').innerHTML += '<button data-item-id="category">Software company</button>';
        if (command('COLLECT_VISIBLE').records[0].category !== 'Software company') throw Error('Lost explicit category');
        document.querySelector('#report').textContent = 'MAPS_REGRESSION_PASS ' + JSON.stringify({ records: records.length, maxStep, category: 'Software company' });
      } catch (error) { document.querySelector('#report').textContent = 'MAPS_REGRESSION_FAIL ' + error.stack; }
    </script></body></html>`);
  const output = execFileSync(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-sync',
    '--disable-background-networking', `--user-data-dir=${path.join(temp, 'profile')}`,
    '--dump-dom', `file://${fixture}`,
  ], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
  const report = output.match(/<pre id="report">([^<]*)<\/pre>/)?.[1];
  assert(report?.startsWith('MAPS_REGRESSION_PASS'), report || 'Chrome did not produce a test report');
  console.log(report);
} finally {
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
