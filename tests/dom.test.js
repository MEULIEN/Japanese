/* Michi DOM end-to-end tests — boots the REAL app.js in jsdom, stubs fetch
   to the real data/ files, and drives sessions with dispatched clicks.
   This exercises the UI wiring (event switch, render, persistence) that the
   pure-engine tests can't. Run: node tests/dom.test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const engineSrc = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

// Serve data/*.json from disk, mimicking the app's fetch(cache:'no-cache').
function makeFetch() {
  return (url) => {
    const rel = String(url).split('?')[0];
    const file = path.join(ROOT, rel);
    return Promise.resolve({
      ok: fs.existsSync(file),
      json: () => Promise.resolve(JSON.parse(fs.readFileSync(file, 'utf8')))
    });
  };
}

function boot(initialState) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    runScripts: 'outside-only', url: 'https://example.test/'
  });
  const w = dom.window;
  w.scrollTo = () => {};
  w.fetch = makeFetch();
  w.confirm = () => true;
  if (initialState) w.localStorage.setItem('michi_v1', JSON.stringify(initialState));
  // engine.js (UMD → window.MichiEngine), then app.js (runs its load IIFE).
  w.eval(engineSrc);
  w.eval(appSrc);
  return w;
}

function app(w) { return w.document.getElementById('app'); }
function html(w) { return app(w).innerHTML; }
function click(w, selector) {
  const el = app(w).querySelector(selector);
  if (!el) throw new Error('no element for ' + selector + '\n--- current DOM ---\n' + html(w).slice(0, 400));
  el.dispatchEvent(new w.Event('click', { bubbles: true }));
  return el;
}
// Wait for the async loadData IIFE to paint the home screen.
function ready(w) {
  return new Promise((res, rej) => {
    let n = 0;
    const t = setInterval(() => {
      if (/Kyoto readiness/.test(html(w))) { clearInterval(t); res(); }
      else if (++n > 200) { clearInterval(t); rej(new Error('app never became ready:\n' + html(w).slice(0, 300))); }
    }, 5);
  });
}

// Drive whatever card is on screen one step; returns false at the summary.
function stepSession(w) {
  const h = html(w);
  if (/Session complete/.test(h)) return false;
  if (app(w).querySelector('[data-action="pre"]')) { click(w, '[data-action="pre"][data-v="none"]'); return true; }
  if (app(w).querySelector('.type-input:not([disabled])')) {
    // answer correctly using the item's kana, read from the Don't-know fallback path
    const inp = app(w).querySelector('.type-input');
    // the correct kana isn't in the DOM; type a wrong value then accept via reveal
    inp.value = 'zzz'; click(w, '[data-action="check-type"]'); return true;
  }
  const map = [
    '[data-action="skip-known"]', '[data-action="next"]', '[data-action="reveal"]',
    '[data-action="choice"]', '[data-action="grade"][data-g="good"]', '[data-action="flex-done"][data-ok="1"]'
  ];
  for (const sel of map) if (app(w).querySelector(sel)) { click(w, sel); return true; }
  // span card inside a session
  if (app(w).querySelector('[data-action="span-go"]')) { click(w, '[data-action="span-go"]'); return true; }
  if (app(w).querySelector('[data-action="next"]')) { click(w, '[data-action="next"]'); return true; }
  throw new Error('stuck — no known control:\n' + h.slice(0, 400));
}
function driveToSummary(w, max) {
  let n = 0;
  while (stepSession(w)) if (++n > (max || 400)) throw new Error('session did not complete in ' + (max || 400) + ' steps');
}

const scenarios = [];
function scenario(name, fn) { scenarios.push([name, fn]); }

scenario('fresh install loads a verified-only curriculum', async () => {
  const w = boot(); await ready(w);
  const engine = w.MichiEngine;
  assert.ok(/36|[0-9]+ verified items|recalled reliably/.test(html(w)), 'home renders readiness');
  // No draft badge, no drafts toggle anywhere.
  click(w, '[data-action="go"][data-view="settings"]');
  assert.ok(!/unverified drafts/i.test(html(w)), 'drafts toggle is gone');
  assert.ok(/verified items/.test(html(w)), 'settings states verified-only');
});

scenario('morning Learn session runs end-to-end and persists progress', async () => {
  const w = boot(); await ready(w);
  click(w, '[data-action="start"][data-kind="morning"]');
  assert.ok(/Learn/.test(html(w)) && app(w).querySelector('.card-stage'), 'entered session');
  driveToSummary(w);
  assert.ok(/Session complete/.test(html(w)), 'reached summary');
  assert.ok(/you took \d+ min/.test(html(w)), 'summary shows ACTUAL time, not just the estimate');
  const st = JSON.parse(w.localStorage.getItem('michi_v1'));
  assert.ok(Object.keys(st.items).length >= 3, 'progress persisted to localStorage');
  assert.ok(st.days[Object.keys(st.days)[0]].kinds.includes('morning'), 'day logged');
});

scenario('Bug A: Recall is NOT empty right after a morning of learning', async () => {
  const w = boot(); await ready(w);
  click(w, '[data-action="start"][data-kind="morning"]'); driveToSummary(w);
  click(w, '[data-action="go"][data-view="home"]');
  click(w, '[data-action="start"][data-kind="midday"]');
  // Must enter a session, not bounce home with the empty hint.
  assert.ok(app(w).querySelector('.card-stage'), 'Recall entered a real session (Bug A fixed)');
  assert.ok(!/Nothing to recall yet/.test(html(w)), 'no silent empty bounce');
});

scenario('Bug A: Recall on a truly fresh install shows an honest message', async () => {
  const w = boot(); await ready(w);
  click(w, '[data-action="start"][data-kind="midday"]');
  assert.ok(/Nothing to recall yet/.test(html(w)), 'honest empty-state, not a dead button');
});

scenario('Bug B: memory round works with 3 learned items (not 6)', async () => {
  // Seed exactly 3 learned items so the span pool is 3.
  const w0 = boot(); await ready(w0);
  const ids = w0.MichiEngine ? null : null;
  // discover 3 real verified ids from the library
  click(w0, '[data-action="go"][data-view="library"]');
  const rows = Array.from(app(w0).querySelectorAll('.word-row[data-id]')).slice(0, 3).map(r => r.getAttribute('data-id'));
  assert.strictEqual(rows.length, 3, 'found 3 real item ids');
  const seeded = { items: {}, days: {}, hooks: {}, settings: { theme: 'light' }, span: 0, flex: 0 };
  rows.forEach(id => { seeded.items[id] = { box: 2, due: '2020-01-01', reps: 1, lapses: 0, prod: 0 }; });

  const w = boot(seeded); await ready(w);
  click(w, '[data-action="go"][data-view="train"]');
  click(w, '[data-action="span-open"]');
  click(w, '[data-action="span-go"]');
  assert.ok(/Remember the order/.test(html(w)), 'span started with 3 items');
  assert.ok(!/Learn at least/.test(html(w)), 'no 6-item gate');
});

scenario('typed production: correct answer is accepted and counts as production', async () => {
  // Seed 2 items at box 3 and due so a midday session gives them 'type' mode.
  const probe = boot(); await ready(probe);
  click(probe, '[data-action="go"][data-view="library"]');
  const first = app(probe).querySelector('.word-row[data-id]').getAttribute('data-id');
  // read its kana from the detail view
  click(probe, '.word-row[data-id="' + first + '"]');
  const kana = app(probe).querySelector('.kana').textContent.split('·')[0].trim();

  const seeded = { items: {}, days: {}, hooks: {}, settings: { theme: 'light' }, span: 0, flex: 0 };
  seeded.items[first] = { box: 3, due: '2020-01-01', reps: 2, lapses: 0, prod: 0 };
  const w = boot(seeded); await ready(w);
  click(w, '[data-action="start"][data-kind="midday"]');
  // find the type card for our item
  let guard = 0;
  while (!app(w).querySelector('.type-input') && guard++ < 20) {
    if (/Session complete/.test(html(w))) break;
    stepSession(w);
  }
  assert.ok(app(w).querySelector('.type-input'), 'a typed-production card appeared');
  app(w).querySelector('.type-input').value = kana;
  click(w, '[data-action="check-type"]');
  assert.ok(/✓ correct/.test(html(w)), 'correct kana accepted');
  const st = JSON.parse(w.localStorage.getItem('michi_v1'));
  assert.ok((st.items[first].prod || 0) >= 1, 'production counted toward mastery');
});

(async function run() {
  let passed = 0, failed = 0;
  for (const [name, fn] of scenarios) {
    try { await fn(); passed++; console.log('  ok  ' + name); }
    catch (e) { failed++; console.log('FAIL  ' + name + '\n        ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n        ') : e)); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + scenarios.length + ' total');
  process.exit(failed ? 1 : 0);
})();
