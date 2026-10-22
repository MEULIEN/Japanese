/* End-to-end tests in a REAL browser (installed Chrome, via puppeteer-core),
   with phone emulation. Exercises the actual app: complete workflows by
   tapping, typed answers through a real <input>, Japanese IME composition
   (Chrome DevTools Input.imeSetComposition), layout checks, the Sunday
   unlock with a shifted clock, and offline operation via the service worker.
   Limitations (reported, not hidden): emulation has no real on-screen
   keyboard, so "keyboard opens" is verified as "a focusable native text
   input receives focus from the user's tap"; voices depend on the OS.
   Run: node tests/e2e.js [--shots <dir>] */
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const puppeteer = require('puppeteer-core');
const { test, run } = require('./harness');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : null;
const SHOTS = (() => { const k = process.argv.indexOf('--shots'); return k > 0 ? process.argv[k + 1] : null; })();
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(p => p && fs.existsSync(p));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rs) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      // DATA_DIR lets the suite run against a fixture dataset (never the default).
      const f = DATA_DIR && p.startsWith('/data/') ? path.join(DATA_DIR, p.slice(6)) : path.join(ROOT, p);
      if (!(f.startsWith(ROOT) || (DATA_DIR && f.startsWith(DATA_DIR))) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end('nf'); }
      rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(f).pipe(rs);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}
const PHONES = {
  iphone: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
  small: { width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36' },
  landscape: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false, ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36' }
};

let browser, server, base;
async function page(phone, opts) {
  opts = opts || {};
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage();
  const ph = PHONES[phone || 'iphone'];
  await pg.setUserAgent(ph.ua);
  await pg.setViewport(ph);
  await pg.emulateTimezone(opts.tz || 'Asia/Tokyo');      // deterministic local time
  opts.now = opts.now || '2026-10-21T13:00:00+09:00';      // default: a Wednesday afternoon (evening open)
  const errors = [];
  pg.on('pageerror', e => errors.push(String(e)));
  pg.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  if (opts.now) await pg.evaluateOnNewDocument(iso => {   // shift the clock (weekly unlock tests)
    const off = Date.parse(iso) - Date.now(); const N = Date.now.bind(Date); const OD = Date;
    Date.now = () => N() + off;
    class D extends OD { constructor(...a) { if (!a.length) super(N() + off); else super(...a); } static now() { return N() + off; } }
    window.Date = D;
  }, opts.now);
  if (opts.state) await pg.evaluateOnNewDocument(s => { if (!localStorage.getItem('michi_v2_seeded')) { localStorage.setItem('michi_v2', s); localStorage.setItem('michi_v2_seeded', '1'); } }, JSON.stringify(opts.state));
  if (opts.v1) await pg.evaluateOnNewDocument(s => { if (!localStorage.getItem('michi_v1')) localStorage.setItem('michi_v1', s); }, JSON.stringify(opts.v1));
  await pg.goto(base + '/index.html', { waitUntil: 'load' });
  await pg.waitForFunction(() => window.__michi && document.querySelector('.act-grid'), { timeout: 15000 });
  pg.errors = errors; pg.ctx = ctx;
  return pg;
}
const shot = async (pg, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await pg.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); } };
const tapSel = async (pg, sel) => { const el = await pg.$(sel); assert.ok(el, 'missing ' + sel); await el.tap(); };

// Layout audit of the current screen.
async function layoutAudit(pg, label) {
  const r = await pg.evaluate(() => {
    const out = { overflowX: document.documentElement.scrollWidth - window.innerWidth, small: [], overlapTabbar: [] };
    const tab = document.querySelector('.tabbar');
    const tabTop = tab ? tab.getBoundingClientRect().top + window.scrollY : Infinity;
    for (const el of document.querySelectorAll('button, a, input, select, textarea, summary')) {
      const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
      if (el.closest('.table-wrap') || el.closest('.chart') || el.classList.contains('link')) continue;   // inline text links / table cells
      if (b.height < 40 && !el.closest('.tabbar')) out.small.push((el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30) + ' ' + Math.round(b.height));
    }
    const main = document.getElementById('main');
    if (tab && main) {
      const pad = parseFloat(getComputedStyle(main).paddingBottom);
      if (pad < tab.getBoundingClientRect().height) out.overlapTabbar.push('main padding ' + pad + ' < tabbar ' + tab.getBoundingClientRect().height);
    }
    return out;
  });
  assert.ok(r.overflowX <= 1, label + ': horizontal overflow ' + r.overflowX + 'px');
  assert.deepStrictEqual(r.small, [], label + ': touch targets under 40px: ' + r.small.join(' / '));
  assert.deepStrictEqual(r.overlapTabbar, [], label + ': content can hide under tab bar');
}

// Answer whatever card is on screen like a user would (correct with prob p).
async function step(pg, p, rnd) {
  const info = await pg.evaluate(() => {
    const E = window.__michi.E, c = E.current();
    const fb = !!document.querySelector('.feedback, [data-action="next"]');
    return { hasCard: !!c, ex: c && c.ex, correct: c && c.correct, answer: c && c.answer && c.answer.kana, fb, summary: !!document.querySelector('.summary'), chunks: c && c.chunks, order: c && c.order, members: c && c.members && c.members.length && E.C.byId[c.members[0]].kana, seq: c && c.seq, span: c && c.ex === 'span' };
  });
  if (info.summary || !info.hasCard) return false;
  if (await pg.$('[data-action="next"]')) { await tapSel(pg, '[data-action="next"]'); return true; }
  if (await pg.$('[data-action="ack"]')) { await tapSel(pg, '[data-action="ack"]'); return true; }
  const ok = rnd() < p;
  switch (info.ex) {
    case 'diag': case 'choice': case 'listen': case 'pick': case 'kanjipick': {
      const k = ok ? info.correct : (info.correct + 1) % 3;
      await tapSel(pg, `[data-action="choose"][data-k="${k}"]`); return true;
    }
    case 'speak':
      if (await pg.$('[data-action="reveal"]')) { await tapSel(pg, '[data-action="reveal"]'); return true; }
      await tapSel(pg, `[data-action="self"][data-v="${ok ? 'yes' : 'no'}"]`); return true;
    case 'recovery':
      if (await pg.$('[data-action="rec-done"]')) { await tapSel(pg, '[data-action="rec-done"]'); return true; }
      await tapSel(pg, '[data-action="self"][data-v="yes"]'); return true;
    case 'build': {
      for (let k = 0; k < info.chunks.length; k++) { const pos = ok ? k : info.chunks.length - 1 - k; await tapSel(pg, `[data-action="tile"][data-k="${pos}"]`); }
      await tapSel(pg, '[data-action="tile-check"]'); return true;
    }
    case 'span': {
      if (await pg.$('[data-action="span-start"]')) { await tapSel(pg, '[data-action="span-start"]'); await pg.waitForSelector('[data-action="span-pick"]', { timeout: 30000 }); }
      for (const id of info.seq) { const b = await pg.$(`[data-action="span-pick"][data-id="${id}"]:not([disabled])`); if (b) await b.tap(); }
      return true;
    }
    default: {
      // Typed answer: tap the input like a user, verify it is focused, type, submit with Enter.
      const inp = await pg.$('input.answer:not([disabled])');
      assert.ok(inp, 'typed card without an input (' + info.ex + ')');
      await inp.tap();
      const focused = await pg.evaluate(() => document.activeElement && document.activeElement.matches('input.answer'));
      assert.ok(focused, 'input not focused after tap');
      const text = info.ex === 'switch' ? (ok ? info.members : 'xyz') : (ok ? info.answer : 'まちがい');
      await pg.evaluate(() => { document.querySelector('input.answer').value = ''; });
      await pg.keyboard.sendCharacter(text);
      await pg.keyboard.press('Enter');
      await pg.waitForSelector('.feedback', { timeout: 5000 });
      return true;
    }
  }
}
async function driveSession(pg, p, max) {
  let n = 0; const rnd = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  while (n++ < (max || 400)) { if (!(await step(pg, p, rnd))) break; }
  return n;
}

/* ---------------------------------------------------------------- tests */
test('home screen: required layout, hierarchy and no layout defects (3 phone sizes)', async () => {
  for (const ph of Object.keys(PHONES)) {
    const pg = await page(ph);
    const order = await pg.$$eval('.act-grid .act', els => els.map(e => e.dataset.kind));
    assert.deepStrictEqual(order, ['morning', 'evening', 'recall', 'training', 'weekly']);
    const r = await pg.$$eval('.act-grid .act', els => els.map(e => { const b = e.getBoundingClientRect(); return [e.dataset.kind, Math.round(b.top), Math.round(b.left)]; }));
    const at = k => r.find(x => x[0] === k);
    assert.ok(at('morning')[1] < at('evening')[1] && at('evening')[1] < at('recall')[1] && at('recall')[1] === at('training')[1] && at('training')[1] < at('weekly')[1], 'Morning / Evening / [Recall Training] / Weekly');
    assert.ok(await pg.$('.act.weekly.locked') || await pg.$('.act.weekly'), 'weekly visible');
    await layoutAudit(pg, 'home ' + ph);
    await shot(pg, 'home-' + ph);
    for (const v of ['train', 'conj', 'progress', 'words']) { await tapSel(pg, `.tabbar [data-view="${v}"]`); await pg.waitForSelector('.topbar'); await layoutAudit(pg, v + ' ' + ph); await shot(pg, v + '-' + ph); }
    await tapSel(pg, '.tabbar [data-view="home"]'); await tapSel(pg, '[data-view="settings"]'); await layoutAudit(pg, 'settings ' + ph); await shot(pg, 'settings-' + ph);
    assert.deepStrictEqual(pg.errors, [], 'no JS errors: ' + pg.errors.join('\n'));
    await pg.ctx.close();
  }
});

test('fresh learner: Recall/Training/Evening are locked with a reason; Weekly locked before Sunday', async () => {
  const pg = await page('iphone', { now: '2026-10-21T09:00:00+09:00' });     // Wednesday
  for (const k of ['evening', 'recall', 'training', 'weekly']) assert.ok(await pg.$(`.act.${k}.locked`), k + ' locked');
  assert.match(await pg.$eval('.act.weekly', e => e.textContent), /Opens Sunday 25 Oct/);
  await pg.ctx.close();
});

test('full day by touch: morning → evening → recall → training, state persists across reload', async () => {
  const pg = await page('iphone', { now: '2026-10-21T12:30:00+09:00' });
  await tapSel(pg, '.act.morning'); await pg.waitForSelector('.card-stage');
  await shot(pg, 'morning-first-card');
  const n = await driveSession(pg, 0.75);
  await pg.waitForSelector('.summary'); await shot(pg, 'morning-summary');
  const st = await pg.evaluate(() => JSON.parse(localStorage.getItem('michi_v2')));
  assert.ok(Object.keys(st.memory).length >= 3, 'items introduced');
  assert.ok(st.lesson.pendingEvening, 'evening prepared');
  await layoutAudit(pg, 'summary');
  await pg.reload({ waitUntil: 'load' }); await pg.waitForSelector('.act-grid');
  assert.ok(await pg.$('.act.morning.done'), 'morning marked done after reload');
  await tapSel(pg, '.act.evening'); await pg.waitForSelector('.card-stage');
  await shot(pg, 'evening-first-card');
  const isNew = await pg.evaluate(() => window.__michi.E.session.queue.some(c => c.ex === 'teach'));
  assert.ok(!isNew, 'no teaching in the evening');
  await driveSession(pg, 0.8); await pg.waitForSelector('.summary');
  const memBefore = await pg.evaluate(() => localStorage.getItem('michi_v2') && JSON.stringify(JSON.parse(localStorage.getItem('michi_v2')).memory));
  await tapSel(pg, '[data-view="home"]'); await tapSel(pg, '.act.recall'); await tapSel(pg, '[data-action="rc-start"]'); await pg.waitForSelector('.card-stage');
  await driveSession(pg, 0.5, 25);
  await tapSel(pg, '.topbar [data-action="end"]'); await pg.waitForSelector('.summary');
  await tapSel(pg, '[data-view="home"]'); await tapSel(pg, '.act.training'); await tapSel(pg, '[data-action="train"][data-activity="mixed"][data-direction="mixed"]'); await pg.waitForSelector('.card-stage');
  await driveSession(pg, 0.5, 25); await shot(pg, 'training-card');
  await tapSel(pg, '.topbar [data-action="end"]');
  const memAfter = await pg.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('michi_v2')).memory));
  assert.strictEqual(memAfter, memBefore, 'Recall + Training did not change the official memory');
  assert.deepStrictEqual(pg.errors, [], pg.errors.join('\n'));
  await pg.ctx.close();
});

test('typing: tap focuses a real text input; IME composition + Enter does NOT submit; committed text submits', async () => {
  const pg = await page('iphone');
  // Seed a session whose current card is a typed production card.
  await pg.evaluate(() => {
    const E = window.__michi.E, C = window.__michi.C, X = window.MichiExercises;
    const it = C.items.find(i => i.use === 'say' && /^[ぁ-ん]+$/.test(i.kana) && i.kana.length >= 3);
    E.start('morning');
    const card = Object.assign({ id: 'ime-test', phase: 'learn' }, X.G.type(it, { C, scope: new Set([it.id]), rng: Math.random }));
    E.session.queue.splice(E.session.i, 0, card);
    window.__imeItem = it;
  });
  await tapSel(pg, '.tabbar [data-view="home"]');
  await tapSel(pg, '[data-action="resume"]');
  await pg.waitForSelector('input.answer');
  const attrs = await pg.$eval('input.answer', el => ({ type: el.type, lang: el.lang, inputmode: el.inputMode, enterkeyhint: el.enterKeyHint, fs: parseFloat(getComputedStyle(el).fontSize), readOnly: el.readOnly }));
  assert.deepStrictEqual([attrs.type, attrs.lang, attrs.inputmode, attrs.enterkeyhint, attrs.readOnly], ['text', 'ja', 'text', 'go', false]);
  assert.ok(attrs.fs >= 16, 'font-size ≥16px so iOS does not zoom');
  const inp = await pg.$('input.answer'); await inp.tap();
  assert.ok(await pg.evaluate(() => document.activeElement.matches('input.answer')), 'tap focuses the input');
  const kana = await pg.evaluate(() => window.__imeItem.kana);
  const cdp = await pg.target().createCDPSession();
  // Compose (unconfirmed), then press Enter while composing → must not submit.
  await cdp.send('Input.imeSetComposition', { text: kana.slice(0, 2), selectionStart: 2, selectionEnd: 2 });
  await pg.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 300));
  assert.ok(!(await pg.$('.feedback')), 'Enter during IME composition did not submit');
  // Commit the composition with the full word (as the IME would), then Enter submits.
  await cdp.send('Input.insertText', { text: kana });
  await new Promise(r => setTimeout(r, 200));            // a person can't press Enter again within milliseconds
  const val = await pg.$eval('input.answer', el => el.value);
  assert.ok(val.endsWith(kana), 'composed text is in the input: ' + val);
  await pg.evaluate(() => { const i = document.querySelector('input.answer'); i.value = window.__imeItem.kana; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await pg.keyboard.press('Enter');
  await pg.waitForSelector('.feedback', { timeout: 3000 });
  assert.match(await pg.$eval('.feedback', e => e.textContent), /Correct/);
  // Draft survives a re-render (e.g. asking for a hint).
  await shot(pg, 'typed-feedback');
  await pg.ctx.close();
});

test('typing: draft is not lost when a hint re-renders the card; small screen keeps the input and Check button visible', async () => {
  const pg = await page('small');
  await pg.evaluate(() => {
    const E = window.__michi.E, C = window.__michi.C, X = window.MichiExercises;
    const it = C.items.find(i => i.use === 'say');
    E.start('morning');
    E.session.queue.splice(E.session.i, 0, Object.assign({ id: 'draft', phase: 'learn' }, X.G.type(it, { C, scope: new Set([it.id]), rng: Math.random })));
  });
  await tapSel(pg, '.tabbar [data-view="home"]');
  await tapSel(pg, '[data-action="resume"]'); await pg.waitForSelector('input.answer');
  const inp = await pg.$('input.answer'); await inp.tap(); await pg.keyboard.sendCharacter('おみ');
  await tapSel(pg, '[data-action="hint"]');
  assert.strictEqual(await pg.$eval('input.answer', e => e.value), 'おみ', 'draft kept after re-render');
  // Simulate the on-screen keyboard taking ~45% of the height.
  await pg.setViewport(Object.assign({}, PHONES.small, { height: 310 }));
  await (await pg.$('input.answer')).tap();
  const vis = await pg.evaluate(() => { const i = document.querySelector('input.answer').getBoundingClientRect(), b = document.querySelector('.answer-form .btn.primary').getBoundingClientRect(); return { i: i.top >= 0 && i.bottom <= innerHeight, b: b.bottom <= innerHeight + 1 && b.top >= 0, ib: i.bottom, bb: b.bottom, h: innerHeight }; });
  assert.ok(vis.i, 'input visible with keyboard open ' + JSON.stringify(vis));
  await shot(pg, 'typed-small-keyboard');
  await pg.ctx.close();
});

test('weekly: locked on Saturday 23:59, unlocks at Sunday 00:00 local time without restart', async () => {
  const pg = await page('iphone', { now: '2026-10-24T23:59:40+09:00' });
  await pg.evaluate(() => { const E = window.__michi.E; E.state.settings.timeZone = 'Asia/Tokyo'; E.state.memory.f_omizu = E.state.memory.f_omizu || { intro: '2026-10-20', introKind: 'morning', skills: {} }; E.save(); });
  await pg.reload(); await pg.waitForSelector('.act-grid');
  assert.ok(await pg.$('.act.weekly.locked'), 'Saturday: locked');
  await new Promise(r => setTimeout(r, 21000));
  await pg.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await pg.waitForSelector('.act.weekly.available', { timeout: 15000 });
  await tapSel(pg, '.act.weekly'); await pg.waitForSelector('.card-stage');
  await shot(pg, 'weekly-card');
  await driveSession(pg, 0.7); await pg.waitForSelector('.summary');
  assert.match(await pg.$eval('.summary', e => e.textContent), /Weekly report/);
  await shot(pg, 'weekly-summary');
  await pg.ctx.close();
});

test('conjugation tab: tables render without overflow; group and form views open; examples come from the engine', async () => {
  const pg = await page('small');
  await tapSel(pg, '.tabbar [data-view="conj"]');
  const cells = await pg.$$eval('table.conj td', tds => tds.map(t => t.textContent));
  assert.ok(cells.includes('書かない') && cells.includes('食べない') && cells.includes('しない'), 'core negatives present');
  assert.ok(cells.includes('よくない') && cells.includes('静かじゃない'), 'adjective forms present');
  await tapSel(pg, '[data-action="conj-group"][data-id="group1"]');
  const g1 = await pg.$eval('#main', e => e.textContent);
  assert.match(g1, /帰らない/); assert.match(g1, /行って/);
  await layoutAudit(pg, 'conj group'); await shot(pg, 'conj-group1');
  await tapSel(pg, '[data-action="conj-form"][data-id="ba"]');
  const f = await pg.$eval('#main', e => e.textContent);
  assert.match(f, /どうすればいいですか/); assert.match(f, /Compare with/);
  await layoutAudit(pg, 'conj form'); await shot(pg, 'conj-form-ba');
  await pg.ctx.close();
});

test('migration in the browser: old-version progress is moved over and the old data kept', async () => {
  const v1 = { items: { f_omizu: { box: 3, due: '2026-10-23', reps: 3, lapses: 0, prod: 1 }, f_menu: { box: 2, due: '2026-10-22', reps: 2, lapses: 0, prod: 0 } }, days: { '2026-10-18': { kinds: ['morning'], reviews: 6 } }, hooks: {}, settings: { theme: 'light' }, span: 3, flex: 1 };
  const pg = await page('iphone', { v1 });
  const r = await pg.evaluate(() => ({ v2: JSON.parse(localStorage.getItem('michi_v2')), b: localStorage.getItem('michi_v1_backup'), banner: document.body.textContent.includes('moved over') }));
  assert.ok(r.v2 && r.v2.memory.f_omizu && r.v2.memory.f_omizu.skills.production);
  assert.ok(r.b, 'backup kept'); assert.ok(r.banner, 'learner told about the migration');
  await pg.ctx.close();
});

test('voices: only real installed Japanese voices are listed; sample and selection persist', async () => {
  const pg = await page('iphone');
  const voices = await pg.evaluate(async () => { await window.MichiSpeech.ready(3000); return window.MichiSpeech.listJapanese().map(v => ({ name: v.name, uri: v.uri, local: v.local })); });
  console.log('       voices seen by this Chrome:', voices.map(v => v.name + (v.local ? '' : ' (online)')).join(' | ') || 'none');
  await tapSel(pg, '[data-view="settings"]');
  const listed = await pg.$$eval('.voices .voice b', els => els.map(e => e.textContent));
  assert.deepStrictEqual(listed, voices.map(v => v.name), 'UI lists exactly the detected voices');
  assert.strictEqual(new Set(voices.map(v => v.uri)).size, voices.length, 'no duplicate entries');
  if (voices.length > 1) {
    const second = voices[1];
    await tapSel(pg, `[data-action="voice-use"][data-uri="${second.uri}"]`);
    await pg.reload(); await pg.waitForSelector('.act-grid');
    const saved = await pg.evaluate(() => JSON.parse(localStorage.getItem('michi_v2')).settings.voiceURI);
    assert.strictEqual(saved, second.uri, 'selection persisted');
  }
  await pg.ctx.close();
});

test('REGRESSION (iPhone defect): tapping Check while Japanese text is still being composed submits the answer', async () => {
  for (const ph of ['iphone', 'small']) {
    const pg = await page(ph);
    await pg.evaluate(() => {
      const E = window.__michi.E, C = window.__michi.C, X = window.MichiExercises, it = C.byId['f_omizu'];
      E.start('morning');
      E.session.queue.splice(E.session.i, 0, Object.assign({ id: 'compose-check', phase: 'learn' }, X.G.type(it, { C, scope: new Set([it.id]), rng: Math.random })));
    });
    await tapSel(pg, '.tabbar [data-view="home"]'); await tapSel(pg, '[data-action="resume"]');
    await pg.waitForSelector('input.answer');
    const auto = await pg.evaluate(() => document.activeElement && document.activeElement.matches('input.answer'));
    assert.ok(!auto, 'touch device: no programmatic focus (avoids the iOS focused-without-keyboard state)');
    await (await pg.$('.answer-zone')).tap();
    assert.ok(await pg.evaluate(() => document.activeElement.matches('input.answer')), 'tapping the answer zone focuses the real input');
    const cdp = await pg.target().createCDPSession();
    await cdp.send('Input.imeSetComposition', { text: 'おみず', selectionStart: 3, selectionEnd: 3 });   // unconfirmed (marked) text
    await tapSel(pg, '[data-action="check"]');
    await pg.waitForSelector('.feedback', { timeout: 3000 });
    assert.match(await pg.$eval('.feedback', e => e.textContent), /Correct/, ph + ': composed text was submitted and accepted');
    await pg.ctx.close();
  }
});

test('desktop: typing still auto-focuses, Enter submits, layout has no defects', async () => {
  const pg = await page('desktop');
  await layoutAudit(pg, 'desktop home');
  await pg.evaluate(() => {
    const E = window.__michi.E, C = window.__michi.C, X = window.MichiExercises, it = C.byId['f_menu'];
    E.start('morning');
    E.session.queue.splice(E.session.i, 0, Object.assign({ id: 'desk', phase: 'learn' }, X.G.type(it, { C, scope: new Set([it.id]), rng: Math.random })));
  });
  await pg.click('.tabbar [data-view="home"]'); await pg.click('[data-action="resume"]');
  await pg.waitForSelector('input.answer');
  assert.ok(await pg.evaluate(() => document.activeElement.matches('input.answer')), 'desktop: focused automatically');
  await pg.keyboard.type('menyuu'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('.feedback'); assert.match(await pg.$eval('.feedback', e => e.textContent), /Correct/);
  await shot(pg, 'desktop-typed');
  await pg.ctx.close();
});

test('settings button: visible, labelled, at least 44x44, not overlapping, on every main tab (320 / 390 / landscape / desktop)', async () => {
  for (const ph of ['small', 'iphone', 'landscape', 'desktop']) {
    const pg = await page(ph);
    for (const v of ['home', 'train', 'conj', 'progress', 'words']) {
      await pg.click(`.tabbar [data-view="${v}"]`);
      const r = await pg.$eval('.settings-btn', b => {
        const x = b.getBoundingClientRect(), t = document.querySelector('.topbar .title').getBoundingClientRect();
        const hit = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2);
        return { w: x.width, h: x.height, inView: x.left >= 0 && x.right <= innerWidth && x.top >= 0, label: b.getAttribute('aria-label'), text: b.textContent.trim(), overlapTitle: !(t.right <= x.left || t.left >= x.right || t.bottom <= x.top || t.top >= x.bottom), topmost: b.contains(hit) };
      });
      assert.ok(r.w >= 44 && r.h >= 44, `${ph}/${v}: ${r.w}x${r.h}`);
      assert.ok(r.inView && r.topmost && !r.overlapTitle, `${ph}/${v}: visible and not covered/overlapping ${JSON.stringify(r)}`);
      assert.match(r.label, /Settings/);
      if (ph !== 'small') assert.strictEqual(r.text, 'Settings', 'text label shown');
    }
    await pg.click('.settings-btn'); await pg.waitForSelector('#prio-h');
    await shot(pg, 'settings-btn-' + ph);
    await pg.ctx.close();
  }
});

test('topic priorities: choose 1, 2, 3; a 4th is refused; reorder; remove; persists after restart; changes the next lesson', async () => {
  const pg = await page('iphone');
  await tapSel(pg, '.settings-btn'); await pg.waitForSelector('#prio-h');
  const prios = () => pg.evaluate(() => JSON.parse(localStorage.getItem('michi_v2')).settings.topicPriorities);
  const ids = await pg.$$eval('[data-action="prio-add"]', els => els.map(e => e.dataset.id));
  const want = ['directions', 'health', 'home'].filter(x => ids.includes(x)).concat(ids).filter((x, i, a) => a.indexOf(x) === i).slice(0, 4);
  await tapSel(pg, `[data-action="prio-add"][data-id="${want[0]}"]`); assert.deepStrictEqual(await prios(), [want[0]], 'one');
  await tapSel(pg, `[data-action="prio-add"][data-id="${want[1]}"]`); assert.deepStrictEqual(await prios(), want.slice(0, 2), 'two');
  await tapSel(pg, `[data-action="prio-add"][data-id="${want[2]}"]`); assert.deepStrictEqual(await prios(), want.slice(0, 3), 'three');
  assert.strictEqual(await pg.$eval(`[data-action="prio-add"][data-id="${want[3]}"]`, e => e.getAttribute('aria-disabled')), 'true', '4th shown as unavailable');
  await tapSel(pg, `[data-action="prio-add"][data-id="${want[3]}"]`);
  assert.deepStrictEqual(await prios(), want.slice(0, 3), 'a 4th is refused');
  assert.match(await pg.$eval('#toast', e => e.textContent), /up to 3/);
  await layoutAudit(pg, 'settings with 3 priorities');
  await shot(pg, 'settings-priorities');
  await tapSel(pg, `[data-action="prio-up"][data-id="${want[2]}"]`);
  assert.deepStrictEqual(await prios(), [want[0], want[2], want[1]], 'reordered');
  await tapSel(pg, `[data-action="prio-remove"][data-id="${want[0]}"]`);
  assert.deepStrictEqual(await prios(), [want[2], want[1]], 'removed');
  await pg.reload({ waitUntil: 'load' }); await pg.waitForSelector('.act-grid');
  assert.deepStrictEqual(await prios(), [want[2], want[1]], 'persisted after restart');
  const sub = await pg.$eval('.act.morning .act-sub', e => e.textContent);
  assert.match(sub, /priorit/, 'morning card explains the topic choice: ' + sub);
  await tapSel(pg, '.act.morning'); await pg.waitForSelector('.card-stage');
  const t = await pg.evaluate(() => { const s = window.__michi.E.session; return { topic: s.topic, why: s.topicWhy, forTopic: s.forTopic }; });
  assert.ok((t.why === 'priority' && t.topic === want[2]) || (t.why === 'prereq' && t.forTopic === want[2]), 'lesson follows the top priority: ' + JSON.stringify(t));
  await pg.ctx.close();
});

test('evening: locked at 11:59 with "Available from 12:00", unlocks at 12:00 without a refresh', async () => {
  const pg = await page('iphone', { now: '2026-10-21T11:59:35+09:00' });
  await pg.evaluate(() => { const E = window.__michi.E; E.state.memory.f_omizu = { intro: '2026-10-21', introKind: 'morning', skills: {} }; E.state.lesson.pendingEvening = { sessionId: 'x', date: '2026-10-21', items: ['f_omizu'], status: {}, errors: {}, exUsed: {} }; E.save(); });
  await pg.reload(); await pg.waitForSelector('.act-grid');
  assert.ok(await pg.$('.act.evening.locked'), '11:59 locked');
  assert.match(await pg.$eval('.act.evening', e => e.textContent), /Available from 12:00/);
  await tapSel(pg, '.act.evening');
  assert.ok(!(await pg.$('.card-stage')), 'tapping a locked evening does not start it');
  assert.match(await pg.$eval('#toast', e => e.textContent), /12:00/);
  await shot(pg, 'evening-locked');
  const t0 = Date.now();
  await pg.waitForSelector('.act.evening.available', { timeout: 60000 });
  console.log(`       evening unlocked by itself ${Math.round((Date.now() - t0) / 1000)} s later (page clock passed 12:00), no reload`);
  await tapSel(pg, '.act.evening'); await pg.waitForSelector('.card-stage');
  assert.ok(!(await pg.evaluate(() => window.__michi.E.session.queue.some(c => c.ex === 'teach' || c.ex === 'diag'))), 'no new words in the evening');
  await pg.ctx.close();
});

test('offline: after the first visit, the app, every tab and every session type work with the network off', async () => {
  const pg = await page('iphone');
  await pg.evaluate(async () => { await navigator.serviceWorker.ready; });
  await pg.reload({ waitUntil: 'load' });
  await pg.waitForFunction(() => navigator.serviceWorker.controller, { timeout: 15000 });
  await pg.setOfflineMode(true);
  await pg.reload({ waitUntil: 'load' });
  await pg.waitForSelector('.act-grid', { timeout: 15000 });
  const items = await pg.evaluate(() => window.__michi.C.items.length);
  assert.ok(items > 0, 'curriculum loaded from cache');
  await tapSel(pg, '.act.morning'); await pg.waitForSelector('.card-stage'); await driveSession(pg, 0.8); await pg.waitForSelector('.summary');
  await tapSel(pg, '[data-view="home"]'); await tapSel(pg, '.act.recall'); await tapSel(pg, '[data-action="rc-start"]'); await pg.waitForSelector('.card-stage'); await driveSession(pg, 0.8, 10);
  await tapSel(pg, '.topbar [data-action="end"]'); await tapSel(pg, '[data-view="home"]');
  for (const v of ['train', 'conj', 'progress', 'words']) { await tapSel(pg, `.tabbar [data-view="${v}"]`); await pg.waitForSelector('.topbar'); }
  assert.deepStrictEqual(pg.errors.filter(e => !/net::ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(e)), [], pg.errors.join('\n'));
  await pg.setOfflineMode(false);
  await pg.ctx.close();
});

(async () => {
  if (!CHROME) { console.log('No Chrome/Edge found — set CHROME_PATH. Skipping browser tests.'); return; }
  server = await serve(); base = 'http://127.0.0.1:' + server.address().port;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--lang=ja-JP,en-US', '--no-first-run', '--no-default-browser-check'] });
  console.log('browser:', await browser.version(), '| server:', base);
  try { await run('e2e: real Chrome, phone emulation'); }
  finally { await browser.close(); server.close(); }
})();
