/* End-to-end checks in WebKit (Safari's engine) via Playwright, with a
   phone-sized touch viewport. WebKit differs from Chrome in exactly the ways
   that broke typing on iPhone (e.g. tapping a button does not end an IME
   composition), so the typing paths are re-checked here.
   Limitations: this is desktop WebKit with touch emulation, not iOS Safari —
   there is no software keyboard, and IME composition is simulated with
   composition events (Playwright cannot drive a real IME in WebKit).
   Run: node tests/e2e-webkit.js */
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { webkit } = require('playwright-core');
const { test, run } = require('./harness');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
let browser, server, base;
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rs) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end(); }
      rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rs);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}
async function page(opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: opts.width || 390, height: 844 }, hasTouch: true, timezoneId: 'Asia/Tokyo',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  const pg = await ctx.newPage();
  pg.errors = []; pg.on('pageerror', e => pg.errors.push(String(e)));
  if (opts.now) await pg.addInitScript(iso => {
    const off = Date.parse(iso) - Date.now(), N = Date.now.bind(Date), OD = Date;
    Date.now = () => N() + off;
    class D extends OD { constructor(...a) { if (!a.length) super(N() + off); else super(...a); } static now() { return N() + off; } }
    window.Date = D;
  }, opts.now);
  await pg.goto(base + '/index.html');
  await pg.waitForSelector('.act-grid');
  pg.ctxRef = ctx;
  return pg;
}
async function typedCard(pg, id) {
  await pg.evaluate(id => {
    const E = window.__michi.E, C = window.__michi.C, X = window.MichiExercises, it = C.byId[id];
    E.start('morning');
    E.session.queue.splice(E.session.i, 0, Object.assign({ id: 'wk-' + id, phase: 'learn' }, X.G.type(it, { C, scope: new Set([it.id]), rng: Math.random })));
  }, id);
  await pg.tap('.tabbar [data-view="home"]'); await pg.tap('[data-action="resume"]');
  await pg.waitForSelector('input.answer');
}
const compose = (pg, text) => pg.evaluate(t => {
  const i = document.querySelector('input.answer');
  i.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
  i.value = t;
  i.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: t }));
  i.dispatchEvent(new Event('input', { bubbles: true }));
}, text);

test('WebKit: tap the answer zone → the real input is focused; typed text + Check is graded', async () => {
  const pg = await page();
  await typedCard(pg, 'f_menu');
  await pg.tap('.answer-zone');
  assert.ok(await pg.evaluate(() => document.activeElement.matches('input.answer')));
  await pg.keyboard.type('メニュー');
  await pg.tap('[data-action="check"]');
  await pg.waitForSelector('.feedback');
  assert.match(await pg.textContent('.feedback'), /Correct/);
  await pg.ctxRef.close();
});
test('WebKit REGRESSION: Check during an open composition submits (was ignored before the fix)', async () => {
  const pg = await page();
  await typedCard(pg, 'f_omizu');
  await pg.tap('.answer-zone');
  await compose(pg, 'おみず');                               // marked text, no compositionend
  await pg.tap('[data-action="check"]');
  await pg.waitForSelector('.feedback', { timeout: 3000 });
  assert.match(await pg.textContent('.feedback'), /Correct/);
  await pg.ctxRef.close();
});
test('WebKit: Enter that confirms a conversion does not submit; the next Enter does', async () => {
  const pg = await page();
  await typedCard(pg, 'f_omizu');
  await pg.tap('.answer-zone');
  await compose(pg, 'おみず');
  await pg.keyboard.press('Enter');                           // keydown while composing
  await pg.waitForTimeout(250);
  assert.ok(!(await pg.$('.feedback')), 'confirming Enter ignored');
  await pg.evaluate(() => document.querySelector('input.answer').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'おみず' })));
  await pg.waitForTimeout(150);
  await pg.keyboard.press('Enter');
  await pg.waitForSelector('.feedback', { timeout: 3000 });
  assert.match(await pg.textContent('.feedback'), /Correct/);
  await pg.ctxRef.close();
});
test('WebKit: settings button ≥44×44 and labelled at 320 px and 390 px', async () => {
  for (const width of [320, 390]) {
    const pg = await page({ width });
    const b = await pg.$eval('.settings-btn', e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, right: r.right, vw: innerWidth, label: e.getAttribute('aria-label') }; });
    assert.ok(b.w >= 44 && b.h >= 44 && b.right <= b.vw, JSON.stringify(b));
    assert.match(b.label, /Settings/);
    await pg.ctxRef.close();
  }
});
test('WebKit: evening locked at 11:59, open after 12:00 (simulated clock)', async () => {
  const seed = async pg => { await pg.evaluate(() => { const E = window.__michi.E; E.state.memory.f_omizu = { intro: '2026-10-21', introKind: 'morning', skills: {} }; E.state.lesson.pendingEvening = { sessionId: 'x', date: '2026-10-21', items: ['f_omizu'], status: {}, errors: {}, exUsed: {} }; E.save(); }); await pg.reload(); await pg.waitForSelector('.act-grid'); };
  const a = await page({ now: '2026-10-21T11:59:00+09:00' }); await seed(a);
  assert.ok(await a.$('.act.evening.locked')); await a.ctxRef.close();
  const b = await page({ now: '2026-10-21T12:00:05+09:00' }); await seed(b);
  assert.ok(await b.$('.act.evening.available')); await b.ctxRef.close();
});
test('WebKit: topic priorities — add three, fourth refused, persists after reload', async () => {
  const pg = await page();
  await pg.tap('.settings-btn'); await pg.waitForSelector('#prio-h');
  const ids = await pg.$$eval('[data-action="prio-add"]', els => els.map(e => e.dataset.id));
  for (const id of ids.slice(0, 4)) await pg.tap(`[data-action="prio-add"][data-id="${id}"]`, { force: true });   // 4th is aria-disabled
  const saved = await pg.evaluate(() => JSON.parse(localStorage.getItem('michi_v2')).settings.topicPriorities);
  assert.deepStrictEqual(saved, ids.slice(0, 3));
  await pg.reload(); await pg.waitForSelector('.act-grid');
  assert.deepStrictEqual(await pg.evaluate(() => JSON.parse(localStorage.getItem('michi_v2')).settings.topicPriorities), ids.slice(0, 3));
  assert.deepStrictEqual(pg.errors, []);
  await pg.ctxRef.close();
});

(async () => {
  try { browser = await webkit.launch(); } catch (e) { console.log('WebKit not installed (npx playwright-core install webkit) — skipping.'); return; }
  server = await serve(); base = 'http://127.0.0.1:' + server.address().port;
  console.log('browser: WebKit', browser.version());
  try { await run('e2e-webkit: Safari engine, touch viewport'); } finally { await browser.close(); server.close(); }
})();
