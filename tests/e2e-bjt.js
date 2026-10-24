/* End-to-end tests of the BJT Training page in a REAL browser (installed
   Chrome via puppeteer-core, phone emulation).
   Speech: headless Chrome has no voices, so a fake Web Speech API with
   Japanese voices (2 female, 1 male, on-device) is injected. It records every
   utterance and fires `end` after a short delay, which lets the tests check
   the multi-speaker script, the play limit and transcript gating. Real audio
   quality and pronunciation can only be checked by ear (docs/BJT_MANUAL_TEST.md).
   Run: node tests/e2e-bjt.js [--shots <dir>] */
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const puppeteer = require('puppeteer-core');
const { test, run } = require('./harness');

const ROOT = path.join(__dirname, '..');
const SHOTS = (() => { const k = process.argv.indexOf('--shots'); return k > 0 ? process.argv[k + 1] : null; })();
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(p => p && fs.existsSync(p));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rs) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end('nf'); }
      rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(f).pipe(rs);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}
const PHONES = {
  iphone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
  small: { width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36' },
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false, ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36' }
};
// Fake speech engine (installed before any page script runs).
function fakeSpeech(withVoices) {
  const voices = withVoices ? [
    { name: 'Microsoft Haruka', lang: 'ja-JP', localService: true, voiceURI: 'haruka' },
    { name: 'Microsoft Ayumi', lang: 'ja-JP', localService: true, voiceURI: 'ayumi' },
    { name: 'Microsoft Ichiro', lang: 'ja-JP', localService: true, voiceURI: 'ichiro' }] : [];
  window.__spoken = [];
  const synth = {
    getVoices: () => voices, paused: false, speaking: false, resume() {}, addEventListener() {},
    cancel() { this._q = []; },
    speak(u) { window.__spoken.push({ text: u.text, voice: u.voice && u.voice.name, pitch: u.pitch, rate: u.rate }); setTimeout(() => u.onend && u.onend({}), 15); }
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
}

let browser, server, base;
async function page(phone, opts) {
  opts = opts || {};
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage();
  const ph = PHONES[phone || 'iphone'];
  await pg.setUserAgent(ph.ua); await pg.setViewport(ph);
  await pg.emulateTimezone('Asia/Tokyo');
  const errors = [];
  pg.on('pageerror', e => errors.push(String(e)));
  pg.on('dialog', d => d.accept());
  pg.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await pg.evaluateOnNewDocument(fakeSpeech, opts.voices !== false);
  await pg.evaluateOnNewDocument(iso => {
    const off = Date.parse(iso) - Date.now(); const N = Date.now.bind(Date); const OD = Date;
    Date.now = () => N() + off;
    class D extends OD { constructor(...a) { if (!a.length) super(N() + off); else super(...a); } static now() { return N() + off; } }
    window.Date = D;
  }, opts.now || '2026-10-26T08:30:00+09:00');
  await pg.goto(base + '/index.html', { waitUntil: 'load' });
  await pg.waitForFunction(() => window.__michi && document.querySelector('.act-grid'), { timeout: 15000 });
  pg.errors = errors; pg.ctx = ctx;
  return pg;
}
const shot = async (pg, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await pg.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); };
const tap = async (pg, sel) => { const el = await pg.$(sel); assert.ok(el, 'missing ' + sel); await el.tap(); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function layoutAudit(pg, label) {
  const r = await pg.evaluate(() => {
    const out = { overflowX: document.documentElement.scrollWidth - window.innerWidth, small: [], clipped: [] };
    for (const el of document.querySelectorAll('button, a, input, select, summary')) {
      const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
      if (el.closest('.table-wrap') || el.classList.contains('link') || el.closest('.src')) continue;
      if (b.height < 40 && !el.closest('.tabbar')) out.small.push((el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30) + ' ' + Math.round(b.height));
      if (b.right > window.innerWidth + 1 && !el.closest('.chip-row.scroll')) out.clipped.push((el.textContent || '').trim().slice(0, 30));
    }
    return out;
  });
  assert.ok(r.overflowX <= 1, label + ': horizontal overflow ' + r.overflowX + 'px');
  assert.deepStrictEqual(r.small, [], label + ': touch targets under 40px: ' + r.small.join(' / '));
  assert.deepStrictEqual(r.clipped, [], label + ': controls past the right edge: ' + r.clipped.join(' / '));
}
const run1 = (pg, fn, ...a) => pg.evaluate(fn, ...a);

test('navigation: BJT tab and Home card open the dashboard; other tabs still work; no layout defects on 3 screen sizes', async () => {
  for (const ph of ['iphone', 'small', 'desktop']) {
    const pg = await page(ph);
    assert.ok(await pg.$('.act.bjt-home'), 'home card');
    await tap(pg, '.tabbar [data-view="bjt"]');
    await pg.waitForSelector('.bjt-target');
    const txt = await run1(pg, () => document.getElementById('main').innerText);
    assert.ok(/400\+/.test(txt) && /Day 1 of 36/.test(txt) && /35 days left/.test(txt) && /Diagnostic & foundations/.test(txt), txt.slice(0, 300));
    assert.ok(/Diagnostic assessment/.test(txt) && /Insufficient data/.test(txt));
    assert.ok(!/\b[1-7]\d\d\s*(points|\/ ?800)/i.test(txt), 'no 0–800 score shown');
    await layoutAudit(pg, 'dashboard ' + ph); await shot(pg, 'bjt-dashboard-' + ph);
    for (const v of ['bjtplan', 'bjtabout']) { await tap(pg, `[data-view="${v}"]`); await pg.waitForSelector('.topbar'); await layoutAudit(pg, v + ' ' + ph); await shot(pg, v + '-' + ph); await tap(pg, '.tabbar [data-view="bjt"]'); await pg.waitForSelector('.bjt-target'); }
    for (const v of ['home', 'train', 'kanji', 'progress', 'words']) { await tap(pg, `.tabbar [data-view="${v}"]`); await pg.waitForSelector('.topbar'); }
    assert.deepStrictEqual(pg.errors, [], pg.errors.join('\n'));
    await pg.ctx.close();
  }
});

test('diagnostic by touch: listening hides transcript and spoken options until answered; audio uses distinct voices; feedback explains every option', async () => {
  const pg = await page('iphone');
  await tap(pg, '.tabbar [data-view="bjt"]'); await pg.waitForSelector('.bjt-tasks');
  await tap(pg, '.bjt-task[data-id$=":diagnostic:0"]'); await pg.waitForSelector('.card-stage');
  let sawListening = false, sawReading = false;
  for (let k = 0; k < 9; k++) {
    const info = await run1(pg, () => { const E = window.__michi.E, c = E.bjt.current(); const q = E.bjt.q(c.qid); return { part: q.part, sec: q.section, lines: (q.audio && q.audio.lines || []).map(l => l.text), opts: q.options }; });
    const page0 = await run1(pg, () => document.getElementById('main').innerText);
    if (info.part < 3) {
      sawListening = true;
      for (const l of info.lines.filter(t => t.length > 6)) assert.ok(!page0.includes(l), 'transcript hidden before answering: ' + l);
      if (['scene', 'utterance', 'listening'].includes(info.sec)) for (const o of info.opts) assert.ok(!page0.includes(o), 'spoken option hidden: ' + o);
      await run1(pg, () => { window.__spoken = []; });
      await tap(pg, '[data-action="bjt-play"]');
      await pg.waitForFunction(n => window.__spoken.length >= n, { timeout: 8000 }, info.lines.length + 1);
      await pg.waitForSelector('[data-action="bjt-play"]', { timeout: 8000 });         // playback finished
      const spoken = await run1(pg, () => window.__spoken);
      if (info.lines[0]) assert.strictEqual(spoken[0].text.replace(/\s/g, ''), info.lines[0].replace(/[〜~※（）()\s]/g, ''));
      const q = await run1(pg, () => { const E = window.__michi.E; return E.bjt.q(E.bjt.current().qid); });
      const voiceBy = {}; q.audio.lines.forEach((l, i) => { voiceBy[l.spk] = spoken[i].voice + '|' + spoken[i].pitch; });
      if (voiceBy.M1 && voiceBy.F1) assert.notStrictEqual(voiceBy.M1, voiceBy.F1, 'man and woman sound different');
      if (voiceBy.M1) assert.strictEqual(voiceBy.M1.split('|')[0], 'Microsoft Ichiro', 'male role uses the male voice');
    } else sawReading = true;
    await tap(pg, '.bjt-choice[data-k="1"]');
    await pg.waitForSelector('.feedback');
    const fb = await run1(pg, () => document.querySelector('.feedback').innerText);
    assert.ok(/Answer: \d/.test(fb) && /Why the other options are wrong/.test(fb));
    if (info.part < 3) for (const l of info.lines.filter(t => t.length > 6).slice(0, 2)) assert.ok(fb.includes(l.slice(0, 6)), 'transcript revealed after answering');
    if (k === 0) { await layoutAudit(pg, 'feedback'); await shot(pg, 'bjt-feedback'); }
    await tap(pg, '.feedback [data-action="bjt-next"]'); await sleep(50);
  }
  assert.ok(sawListening && sawReading);
  // Reload mid-session: progress persists and the session resumes at the same question.
  const before = await run1(pg, () => ({ i: window.__michi.E.bjt.session.i, n: window.__michi.E.state.bjt.responses.length }));
  await pg.reload({ waitUntil: 'load' }); await pg.waitForSelector('.act-grid');
  await tap(pg, '.tabbar [data-view="bjt"]'); await pg.waitForSelector('[data-action="bjt-resume"]');
  const after = await run1(pg, () => ({ i: window.__michi.E.bjt.session.i, n: window.__michi.E.state.bjt.responses.length }));
  assert.deepStrictEqual(after, before);
  await tap(pg, '[data-action="bjt-resume"]'); await pg.waitForSelector('.card-stage');
  assert.deepStrictEqual(pg.errors, [], pg.errors.join('\n'));
  await pg.ctx.close();
});

test('no Japanese voice: a clear warning, listening only via a transcript flagged as assisted, mock exam blocked', async () => {
  const pg = await page('small', { voices: false });
  await tap(pg, '.tabbar [data-view="bjt"]'); await pg.waitForSelector('.bjt-target');
  assert.ok(/Listening is two-thirds/.test(await run1(pg, () => document.body.innerText)));
  await run1(pg, () => window.__michi.E.bjt.start({ kind: 'listening', n: 2 }));
  await tap(pg, '[data-view="bjt"]').catch(() => {});
  await run1(pg, () => document.querySelector('[data-action="bjt-resume"]').click());
  await pg.waitForSelector('[data-action="bjt-transcript"]');
  await tap(pg, '[data-action="bjt-transcript"]'); await pg.waitForSelector('.bjt-transcript');
  await tap(pg, '.bjt-choice[data-k="0"]'); await pg.waitForSelector('.feedback');
  const r = await run1(pg, () => window.__michi.E.state.bjt.responses.slice(-1)[0]);
  assert.ok(r.assisted && r.transcript, 'flagged');
  await run1(pg, () => { window.__michi.E.bjt.discard(); });
  await tap(pg, '.topbar [data-action="bjt-end"]'); await pg.waitForSelector('.bjt-target'); await tap(pg, '[data-action="bjt-mode"][data-kind="mock"]'); await pg.waitForSelector('[data-action="bjt-mockgo"]');
  assert.ok(await run1(pg, () => document.querySelector('[data-action="bjt-mockgo"]').disabled));
  await pg.ctx.close();
});

test('mock exam: timer, no feedback during the attempt, play limit, select-then-Next, Part II interstitial, final report with review', async () => {
  const pg = await page('iphone', { now: '2026-11-19T09:00:00+09:00' });
  await tap(pg, '.tabbar [data-view="bjt"]'); await pg.waitForSelector('.bjt-target');
  await tap(pg, '[data-action="bjt-mode"][data-kind="mock"]'); await pg.waitForSelector('[data-action="bjt-mockgo"]');
  await layoutAudit(pg, 'mock setup');
  await tap(pg, '[data-action="bjt-mockgo"][data-split="1"]'); await pg.waitForSelector('.bjt-clock');
  await pg.waitForFunction(() => /⏱ 4\d:\d\d/.test(document.getElementById('bjt-timer').textContent), { timeout: 5000 });
  await tap(pg, '[data-action="bjt-play"]');
  await pg.waitForSelector('[data-action="bjt-play"][disabled]', { timeout: 8000 });     // played once → limit reached
  await tap(pg, '.bjt-choice[data-k="2"]');
  assert.ok(!(await pg.$('.feedback')), 'no feedback in exam mode');
  await tap(pg, '[data-action="bjt-commit"]');
  await shot(pg, 'bjt-mock');
  // Answer the rest of Part I quickly through the engine, then check the interstitial.
  await run1(pg, () => { const E = window.__michi.E; while (E.bjt.current() && E.bjt.current().part === 1) { E.bjt.answer({ index: 0 }); E.bjt.next(); } });
  await run1(pg, () => window.__michi.render());
  await pg.waitForSelector('[data-action="bjt-partgo"]');
  assert.ok(await pg.$('[data-action="bjt-shelve"]'), 'split mode offers a break');
  await tap(pg, '[data-action="bjt-partgo"]'); await pg.waitForSelector('.bjt-clock');
  await run1(pg, () => { const E = window.__michi.E; while (E.bjt.current()) { const c = E.bjt.current(); E.bjt.answer({ index: c.perm.indexOf(0) >= 0 ? 1 : 0, uncertain: c.part === 3 }); E.bjt.next(); } });
  await run1(pg, () => window.__michi.render());              // last question answered → report
  await pg.waitForSelector('.summary');
  const txt = await run1(pg, () => document.getElementById('main').innerText);
  assert.ok(/not a BJT score/.test(txt) && /Review: incorrect and unsure/.test(txt), txt.slice(0, 400));
  assert.strictEqual(await run1(pg, () => window.__michi.E.state.bjt.mocks.length), 1);
  await layoutAudit(pg, 'mock report'); await shot(pg, 'bjt-mock-report');
  await pg.ctx.close();
});

test('vocabulary trainer and budget chips: tasks re-size, a vocab session runs by touch', async () => {
  const pg = await page('iphone');
  await tap(pg, '.tabbar [data-view="bjt"]'); await pg.waitForSelector('.bjt-tasks');
  await tap(pg, '[data-action="bjt-budget"][data-v="20"]');
  assert.strictEqual(await run1(pg, () => window.__michi.E.bjt.budget()), 20);
  await tap(pg, '[data-action="bjt-mode"][data-kind="vocab"]'); await pg.waitForSelector('.card-stage');
  for (let k = 0; k < 6; k++) {
    if (await pg.$('[data-action="bjt-ack"]')) { await tap(pg, '[data-action="bjt-ack"]'); continue; }
    await tap(pg, '[data-action="bjt-vchoose"][data-k="0"]'); await pg.waitForSelector('.feedback'); await tap(pg, '.feedback [data-action="bjt-next"]');
  }
  assert.ok(await run1(pg, () => Object.keys(window.__michi.E.state.bjt.vocab).length > 0));
  assert.deepStrictEqual(pg.errors, [], pg.errors.join('\n'));
  await pg.ctx.close();
});

(async () => {
  if (!CHROME) { console.log('No Chrome/Edge found — set CHROME_PATH. Skipping browser tests.'); return; }
  server = await serve(); base = 'http://127.0.0.1:' + server.address().port;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--lang=ja-JP,en-US', '--no-first-run', '--no-default-browser-check'] });
  console.log('browser:', await browser.version(), '| server:', base);
  try { await run('e2e-bjt: BJT page in real Chrome, phone emulation, fake speech engine'); }
  finally { await browser.close(); server.close(); }
})();
