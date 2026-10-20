/* Michi 道 — theme helpers reused from the Qotoba template */
const THEME_LIGHT = 'light';
const THEME_DARK = 'dark';
const BG_PRESETS_LIGHT = ['#FAF8F2', '#FFFDF6', '#F4E9D8', '#E8EDF2', '#F7EFE8'];
const BG_PRESETS_DARK = ['#191C20', '#232A2F', '#2B2326', '#1F3352', '#3A2E1E'];
function bgPresetsFor(theme) { return theme === THEME_DARK ? BG_PRESETS_DARK : BG_PRESETS_LIGHT; }
/* ---------------- theme & background helpers ----------------
   Background colors are user-customizable. The palette is derived
   from the chosen background: light backgrounds get dark ink, dark
   (soft, never pure black) backgrounds get light ink. Card surfaces,
   divider lines and dim tints are recomputed so every theme stays
   readable without changing the rest of the design. */
function defaultAnchorFor(theme) { return theme === THEME_DARK ? '#191C20' : '#FAF8F2'; }
// Allowed background lightness window per theme, so a light color can never
// be picked under dark theme (or vice versa).
function themeRange(theme) { return theme === THEME_DARK ? { min: 0, max: 45 } : { min: 55, max: 100 }; }
// Clamp a hex color's lightness into the window allowed by the theme.
function coerceThemeColor(hex, theme) {
  const c = hexToRgb(hex);
  const hsl = rgbToHsl(c.r, c.g, c.b);
  const range = themeRange(theme);
  const l = Math.min(range.max / 100, Math.max(range.min / 100, hsl.l));
  if (l === hsl.l) return hex;
  return hslToHex(hsl.h, hsl.s, l);
}
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function rgbToHex(r, g, b) {
  const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h, s, l };
}
function hslToHex(h, s, l) {
  h = (h % 1 + 1) % 1;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) { const v = Math.round(l * 255); return rgbToHex(v, v, v); }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const rr = hue2rgb(p, q, h + 1 / 3);
  const gg = hue2rgb(p, q, h);
  const bb = hue2rgb(p, q, h - 1 / 3);
  return rgbToHex(rr * 255, gg * 255, bb * 255);
}
function luminance(rgb) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
}
function mixRgb(a, b, t) {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}
function shadeHex(hex, t) {
  const base = hexToRgb(hex);
  const target = t >= 0 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
  const m = mixRgb(base, target, Math.abs(t));
  return rgbToHex(m.r, m.g, m.b);
}
function rgbaStr(hex, alpha) {
  const c = hexToRgb(hex);
  return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
}
function effectiveBackground(value) {
  const theme = value.theme === THEME_DARK ? THEME_DARK : THEME_LIGHT;
  const anchor = value.background || defaultAnchorFor(theme);
  const base = hexToRgb(anchor);
  const hsl = rgbToHsl(base.r, base.g, base.b);
  const shade = value.shade == null ? Math.round(hsl.l * 100) : value.shade;
  return hslToHex(hsl.h, hsl.s, shade / 100);
}
function derivePalette(bg) {
  const base = hexToRgb(bg);
  const dark = luminance(base) < 0.4;
  const ink = dark ? '#ECE8DF' : '#1F3352';
  const inkDeep = dark ? '#F6F3EC' : '#142238';
  return {
    paper: bg,
    ink,
    inkDeep,
    card: dark ? shadeHex(bg, 0.06) : '#FFFFFF',
    paperDim: shadeHex(bg, dark ? -0.05 : -0.02),
    paperLine: dark ? rgbaStr('#ECE8DF', 0.18) : 'rgba(31,51,82,0.12)'
  };
}
function applyThemeSettings(value) {
  if (typeof document === 'undefined' || !document.documentElement || !document.documentElement.style) return;
  const dark = value.theme === THEME_DARK;
  const bg = effectiveBackground(value);
  const pal = derivePalette(bg);
  const root = document.documentElement;
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  root.style.setProperty('--paper', pal.paper);
  root.style.setProperty('--ink', pal.ink);
  root.style.setProperty('--ink-deep', pal.inkDeep);
  root.style.setProperty('--paper-dim', pal.paperDim);
  root.style.setProperty('--paper-line', pal.paperLine);
  root.style.setProperty('--card', pal.card);
  if (document.body && document.body.style) document.body.style.background = pal.paper;
  const meta = document.querySelector && document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', pal.paper);
}

/* ============================================================
   Michi 道 — daily Japanese for living in Kyoto
   Vanilla JS, no build step. Renders into #app, delegated clicks.
   All scheduling / mastery / session logic lives in engine.js (pure,
   tested in tests/engine.test.js); this file is the UI + persistence
   shell around it. Content lives in data/*.json (see README.md).
   ============================================================ */
const E = window.MichiEngine;
const LS_KEY = 'michi_v1';
const PLAN = E.PLAN;
const KNOWN_BOX = E.KNOWN_BOX;

const D = { domains: [], items: [], byId: {}, flex: [], patterns: [], skipped: [] };
let S = loadState();
const V = { view: 'loading', p: {}, tab: 'all' };
let SE = null;   // active session
let SP = null;   // memory-round state
const $app = document.getElementById('app');

/* ---------- utils ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = E.today;
const addDays = E.addDays;
const shuffle = E.shuffle;
const pct = (n, d) => d ? Math.round(100 * n / d) : 0;
const hasSpeech = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
// Settings no longer carries a "drafts" flag — the curriculum is verified-only,
// with no toggle to admit unverified material (see loadData / data provenance).
function blank() { return { items: {}, days: {}, hooks: {}, settings: { theme: 'light', background: null, shade: null }, span: 0, flex: 0 }; }
function loadState() { try { const r = JSON.parse(localStorage.getItem(LS_KEY)); if (r && r.items) { const b = blank(); const s = Object.assign(b, r, { settings: Object.assign(b.settings, r.settings || {}) }); delete s.settings.drafts; return s; } } catch (e) { } return blank(); }
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { } }

/* ---------- data (verified-only load) ---------- */
async function getJson(p) { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw new Error(p); return r.json(); }
async function loadData() {
  const idx = await getJson('data/index.json');
  D.domains = idx.domains;
  const seen = new Set();
  for (const f of idx.packs) {
    try {
      const p = await getJson('data/' + f);
      for (const raw of p.items) {
        const res = E.prepareItem(raw, p, seen);
        if (res.skip) { D.skipped.push({ id: raw.id, why: res.skip }); console.warn('Skipped item', raw.id, res.skip); continue; }
        seen.add(res.item.id); D.items.push(res.item); D.byId[res.item.id] = res.item;
      }
    } catch (e) { console.warn('Pack failed', f, e); }
  }
  try { D.flex = (await getJson('data/flex.json')).prompts; } catch (e) { }
  try { D.patterns = (await getJson('data/patterns.json')).patterns; } catch (e) { }
}
const live = () => D.items;                       // already verified-only after load
const box = id => E.boxOf(S.items, id);
const isKnown = i => E.isKnown(S.items, i.id);
const isKnownId = id => E.isKnown(S.items, id);

/* ---------- spaced repetition (thin wrappers over engine) ---------- */
function grade(id, g, mode) { S.items[id] = E.gradeRecord(S.items[id], g, today(), mode); save(); }
function modeFor(i) { return E.modeFor(S.items, i.id, hasSpeech()); }
function choices(i) { return E.choices(live(), i); }
function speak(t) {
  try {
    const u = new SpeechSynthesisUtterance(String(t).replace(/〜/g, ''));
    u.lang = 'ja-JP'; u.rate = 0.85;
    const v = speechSynthesis.getVoices().find(v => /^ja/i.test((v.lang || '').replace('_', '-')));
    if (v) u.voice = v;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (e) { }
}

/* ---------- sessions ---------- */
function buildQueue(kind) {
  return E.buildSession(kind, { live: live(), items: S.items, flex: D.flex, hasSpeech: hasSpeech(), today: today() });
}
const EMPTY_MSG = {
  'nothing-learned': 'Nothing to recall yet — start with the Learn session.',
  'nothing-due': "You're all caught up — nothing is due right now. Come back later, or do a Learn session.",
  'no-flex': 'No get-unstuck drills are available yet.',
  'unknown-kind': 'That session is unavailable.'
};
function startSession(kind) {
  SP = null;
  const built = buildQueue(kind);
  if (!built.queue.length) { go('home', { empty: true, reason: built.reason }); return; }
  SE = { kind, queue: built.queue, i: 0, stats: built.stats, st: {}, cache: {}, startTs: Date.now(), est: E.estimateMinutes(built.queue) };
  go('session');
}
const cur = () => SE.queue[SE.i];
function advance() { SE.i++; SE.st = {}; render(); }
function requeue(card) { if (!card.retry) SE.queue.push(Object.assign({}, card, { retry: true })); }
function finishSession() {
  if (SE._done) return; SE._done = true;
  if (PLAN[SE.kind]) {
    const d = S.days[today()] || (S.days[today()] = { kinds: [], reviews: 0 });
    if (!d.kinds.includes(SE.kind)) d.kinds.push(SE.kind);
    d.reviews += SE.stats.total; save();
  }
}

/* ---------- views ---------- */
const TABS = [['home', '🏠', 'Today'], ['library', '📖', 'Words'], ['train', '🧠', 'Train'], ['settings', '⚙️', 'Settings']];
function go(view, p) { V.view = view; V.p = p || {}; render(); }
function render() {
  const f = { home: renderHome, library: renderLibrary, detail: renderDetail, train: renderTrain, span: renderSpanView, patterns: renderPatterns, settings: renderSettings, session: renderSession, summary: renderSummary }[V.view];
  const tabbed = ['home', 'library', 'train', 'settings'].includes(V.view);
  $app.innerHTML = (f ? f() : '<div class="screen"><p>Loading…</p></div>') + (tabbed ? `<nav class="tabbar">${TABS.map(([v, g, l]) => `<button class="tabbar-btn ${V.view === v ? 'active' : ''}" data-action="go" data-view="${v}"><span class="t-glyph">${g}</span><span class="t-label">${l}</span></button>`).join('')}</nav>` : '');
  window.scrollTo(0, 0);
  // Give the typed-answer box focus so production practice needs no extra tap.
  const ti = $app.querySelector('.type-input:not([disabled])'); if (ti) { try { ti.focus(); } catch (e) { } }
}
const topbar = (t, back) => `<div class="topbar">${back ? '<button class="back" data-action="back">‹ Back</button>' : '<span class="spacer"></span>'}<span class="title">${esc(t)}</span><span class="spacer"></span></div>`;
const sayBtn = k => `<button class="btn ghost" data-action="say" data-say="${esc(k)}" aria-label="Play audio">🔊</button>`;
const badge = i => `<span class="badge">${esc((D.domains.find(d => d.id === i.domain) || {}).name || i.domain)}</span>`;
const bar = p => `<div class="progress-track"><div class="progress-fill" style="width:${p}%"></div></div>`;

function renderHome() {
  const t = today(), day = S.days[t] || { kinds: [] }, its = live(), k = its.filter(isKnown).length;
  const week = Array.from({ length: 7 }, (_, x) => S.days[addDays(t, x - 6)] ? 1 : 0);
  const doms = D.domains.map(d => { const L = its.filter(i => i.domain === d.id), n = L.filter(isKnown).length; return L.length ? `<div style="display:flex;justify-content:space-between;font-size:.92rem;margin-top:10px"><span>${d.icon || ''} ${esc(d.name)}</span><span>${n}/${L.length}</span></div>${bar(pct(n, L.length))}` : ''; }).join('');
  const can = D.domains.flatMap(d => (d.can_do || []).filter(c => c.needs.every(id => D.byId[id])).map(c => `<div style="margin:6px 0">${c.needs.every(isKnownId) ? '✅' : '⬜'} ${esc(c.en)}</div>`)).join('');
  const tomorrow = its.filter(i => S.items[i.id] && S.items[i.id].due <= addDays(t, 1)).length;
  const emptyMsg = V.p.empty ? (EMPTY_MSG[V.p.reason] || 'Nothing to practise right now.') : '';
  const card = key => {
    const P = PLAN[key], done = day.kinds.includes(key);
    const est = E.estimateMinutes(buildQueue(key).queue);   // honest, from the real queue
    return `<button class="session-card ${P.cls} ${done ? 'done' : ''}" data-action="start" data-kind="${key}"><span class="icon">${P.icon}</span><span class="body"><div class="name">${P.name} · ~${est} min</div><div class="desc">${esc(P.desc)}</div></span>${done ? '<span class="check">✓ Done</span>' : '<span class="chev">›</span>'}</button>`;
  };
  return `<div class="screen">
    <div class="hero"><div class="eyebrow">Michi · 道</div><h1 class="greeting">こんにちは</h1>
    <p class="sub">Three short sessions beat one long one. Missed a day? Nothing is lost — just carry on.</p></div>
    ${emptyMsg ? `<p class="settings-hint">${esc(emptyMsg)}</p>` : ''}
    <div class="streak-row"><span class="streak-flame">🌱</span><div><div class="num">${week.reduce((a, b) => a + b, 0)} of 7</div><div class="label">days practised this week</div></div>
    <div class="dots">${week.map(w => `<span class="dot ${w ? 'filled' : ''}"></span>`).join('')}</div></div>
    <div class="session-cards">${['morning', 'midday', 'evening'].map(card).join('')}${card('weekly')}${card('mini')}</div>
    <div class="settings-section"><h3>Kyoto readiness</h3>
      <p class="settings-hint">${k} of ${its.length} items recalled reliably — mature in the schedule <b>and</b> produced unaided at least once (not just recognised). ${tomorrow} due by tomorrow.</p>${bar(pct(k, its.length))}${doms}</div>
    ${can ? `<div class="settings-section"><h3>I can now…</h3>${can}</div>` : ''}</div>`;
}

function renderLibrary() {
  const its = live(), tabs = [{ id: 'all', name: 'All' }].concat(D.domains);
  const L = its.filter(i => V.tab === 'all' || i.domain === V.tab);
  return `<div class="screen">${topbar('Words')}
    <div class="tab-row">${tabs.map(t => `<button class="tab ${V.tab === t.id ? 'active' : ''}" data-action="tab" data-id="${t.id}">${esc(t.name)}</button>`).join('')}</div>
    <div class="word-list">${L.map(i => `<div class="word-row" data-action="detail" data-id="${i.id}" style="cursor:pointer"><span class="kanji">${esc(i.jp)}</span><span class="info"><div class="kana">${esc(i.kana)} · ${esc(i.romaji || '')}</div><div class="meaning">${esc(i.en)}</div></span><span class="mastery">${S.items[i.id] ? (isKnown(i) ? '★' : '') + '●'.repeat(Math.min(box(i.id), 5)) : '○'}</span></div>`).join('') || '<div class="empty-state">No items.</div>'}</div></div>`;
}
function itemBody(i) {
  const parts = (i.parts || []).map(p => `<span class="chip">${esc(p.jp)} = ${esc(p.en)}</span>`).join(' ');
  const links = (i.links || []).filter(l => D.byId[l.id]).map(l => `<div class="settings-hint">↔ <b>${esc(D.byId[l.id].jp)}</b> (${esc(D.byId[l.id].en)}) — ${esc(l.rel)}</div>`).join('');
  return `<div class="prompt-card"><div class="badges">${badge(i)}</div><div class="kanji">${esc(i.jp)}</div><div class="kana">${esc(i.kana)} · ${esc(i.romaji || '')}</div><div class="meaning">${esc(i.en)}</div>
    ${i.say_when ? `<div class="settings-hint">When: ${esc(i.say_when)}</div>` : ''}${parts ? `<div style="margin-top:8px">${parts}</div>` : ''}${links}${i.note ? `<div class="settings-hint">⚠ ${esc(i.note)}</div>` : ''}</div>
    <div class="action-row">${sayBtn(i.kana)}</div>
    <p class="settings-hint">Make it yours — your own picture or story is remembered far better than mine:</p>
    <textarea class="recall-input" data-hook="${i.id}" rows="2" placeholder="e.g. a vivid image linking the sound to the meaning">${esc(S.hooks[i.id] || '')}</textarea>`;
}
function renderDetail() { const i = D.byId[V.p.id]; return `<div class="screen">${topbar(i.en, true)}${itemBody(i)}</div>`; }

function renderTrain() {
  return `<div class="screen">${topbar('Train your mind')}<div class="session-cards">
    <button class="session-card free" data-action="span-open"><span class="icon">🔢</span><span class="body"><div class="name">Memory round</div><div class="desc">Hold a growing sequence of words in your head</div></span><span class="chev">›</span></button>
    <button class="session-card evening" data-action="start" data-kind="flexdrill"><span class="icon">🔀</span><span class="body"><div class="name">Get-unstuck drill</div><div class="desc">Practise finding another way when a word is missing</div></span><span class="chev">›</span></button>
    <button class="session-card morning" data-action="go" data-view="patterns"><span class="icon">🧩</span><span class="body"><div class="name">Pattern lab</div><div class="desc">One sentence frame, many words</div></span><span class="chev">›</span></button></div>
    <p class="settings-hint">Best memory round: ${S.span || 0} · Get-unstuck wins: ${S.flex || 0}</p></div>`;
}
function renderPatterns() {
  return `<div class="screen">${topbar('Pattern lab', true)}<p class="settings-hint">Say each one aloud. Same frame, new word — that is how you build sentences without freezing.</p>
  ${D.patterns.map(p => `<div class="prompt-card"><div class="kanji" style="font-size:1.6rem">${esc(p.frame)}</div><div class="meaning">${esc(p.en)}</div>${p.fills.map(f => `<div style="margin-top:8px">${esc(f.jp)}${esc(p.frame.replace('〜', ''))} — ${esc(f.en)}</div>`).join('')}</div>`).join('') || '<div class="empty-state">No patterns yet.</div>'}</div>`;
}

/* memory round: watch a sequence of words, tap them back in order.
   Sequence length and distractors adapt to how many items are learned
   (engine.spanSetup) — no fixed 6-item requirement. */
function spanPool() { return live().filter(i => S.items[i.id]); }
function spanStart(n) {
  const sp = E.spanSetup(spanPool(), n || 3, Math.random);
  if (!sp) { SP = { phase: 'need' }; return render(); }
  SP = sp; render(); setTimeout(spanTick, 700);
}
function spanTick() {
  const s = SP, el = document.getElementById('span-show');
  if (!s || s.phase !== 'show' || !el) return;
  if (s.k >= s.seq.length) { s.phase = 'recall'; return render(); }
  el.textContent = s.seq[s.k++].kana; setTimeout(spanTick, 1100);
}
function spanBody(inSess) {
  const s = SP, cont = inSess ? '<button class="btn ghost" data-action="next">Continue →</button>' : '';
  if (!s) return `<div class="prompt-card"><div class="meaning">Watch the words appear, then tap them back in the same order. It trains working memory using the words you are learning.</div></div><div class="action-row"><button class="btn primary" data-action="span-go">Start</button>${cont}</div>`;
  if (s.phase === 'need') return `<div class="prompt-card"><div class="meaning">Learn at least ${E.SPAN_MIN} items first, then come back — the round uses the words you already know.</div></div>${cont || '<div class="action-row"><button class="btn primary" data-action="back">OK</button></div>'}`;
  if (s.phase === 'show') return `<div class="prompt-card"><div class="meaning">Remember the order (${s.n} words)</div><div class="kanji" id="span-show">…</div></div>`;
  if (s.phase === 'recall') return `<p class="settings-hint">Tap in the order shown (${s.picks.length}/${s.n})</p><div class="choice-grid">${s.grid.map(i => `<button class="choice-btn ${s.picks.includes(i.id) ? 'correct' : ''}" ${s.picks.includes(i.id) ? 'disabled' : ''} data-action="span-pick" data-id="${i.id}">${esc(i.kana)}</button>`).join('')}</div>`;
  const win = s.phase === 'win';
  return `<div class="prompt-card"><div class="kanji">${win ? '✓' : '✗'}</div><div class="meaning">${win ? `Perfect — ${s.n} in order!` : `Your span this round: ${s.n - 1}`} · Best: ${S.span}</div>${win ? '' : `<div class="settings-hint">Answer: ${s.seq.map(i => esc(i.kana)).join(' → ')}</div>`}</div>
    <div class="action-row"><button class="btn primary" data-action="span-go" data-n="${win ? Math.min(s.n + 1, E.SPAN_MAX) : Math.max(2, s.n - 1)}">${win ? 'Next: ' + Math.min(s.n + 1, E.SPAN_MAX) : 'Try again'}</button>${cont}</div>`;
}
function renderSpanView() { return `<div class="screen">${topbar('Memory round', true)}${spanBody(false)}</div>`; }

function renderSession() {
  if (SE.i >= SE.queue.length) { finishSession(); return renderSummary(); }
  const c = cur(), st = SE.st, i = c.item;
  const title = (PLAN[SE.kind] ? PLAN[SE.kind].name : 'Get-unstuck drill');
  let body = '';
  if (c.step === 'pretest') {
    body = `<div class="prompt-card"><div class="meaning">Before I teach you — do you already know this? A wrong guess still helps it stick.</div><div class="kanji">${esc(i.jp)}</div>${st.pre ? `<div class="kana">${esc(i.kana)}</div><div class="meaning">${esc(i.en)}</div>` : ''}</div>` +
      (!st.pre ? `<div class="choice-grid"><button class="choice-btn" data-action="pre" data-v="know">I know it</button><button class="choice-btn" data-action="pre" data-v="guess">I can guess</button><button class="choice-btn" data-action="pre" data-v="none">No idea</button></div>`
        : `<div class="action-row">${st.pre === 'know' ? '<button class="btn good" data-action="skip-known">I was right — skip it</button>' : ''}<button class="btn primary" data-action="next">Teach me →</button></div>`);
  } else if (c.step === 'teach') {
    body = itemBody(i) + '<div class="action-row"><button class="btn primary" data-action="next">Got it →</button></div>';
  } else if (c.step === 'quiz') {
    const tag = c.delayed ? '<div class="settings-hint">Quick check — you saw this earlier in the session.</div>' : '';
    if (c.mode === 'say') {
      body = `<div class="prompt-card"><div class="meaning">Say this in Japanese, out loud:</div><div class="kanji" style="font-size:1.5rem">${esc(i.en)}</div>${st.rev ? `<div class="kanji">${esc(i.jp)}</div><div class="kana">${esc(i.kana)} · ${esc(i.romaji || '')}</div>` : ''}</div>${tag}` +
        (!st.rev ? '<div class="action-row"><button class="btn primary" data-action="reveal">Reveal</button></div>'
          : `<div class="action-row">${sayBtn(i.kana)}<button class="btn again" data-action="grade" data-g="again">Again</button><button class="btn good" data-action="grade" data-g="good">Good</button><button class="btn easy" data-action="grade" data-g="easy">Easy</button></div><p class="settings-hint">Be honest — "Again" is what makes it stick.</p>`);
    } else if (c.mode === 'type') {
      const ty = st.typed;
      body = `<div class="prompt-card"><div class="meaning">Type this in Japanese (kana or rōmaji):</div><div class="kanji" style="font-size:1.4rem">${esc(i.en)}</div>${ty ? `<div class="kana" style="margin-top:8px">${ty.ok ? '✓ correct' : '✗ — answer:'} ${esc(i.jp)} · ${esc(i.kana)}</div>${!ty.ok && ty.input ? `<div class="settings-hint">You typed: ${esc(ty.input)}</div>` : ''}` : ''}</div>${tag}` +
        (!ty ? `<input class="recall-input type-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="type here, then Check">
          <div class="action-row"><button class="btn primary" data-action="check-type">Check</button><button class="btn ghost" data-action="skip-type">Don't know</button></div>`
          : `<div class="action-row">${sayBtn(i.kana)}<button class="btn primary" data-action="next">Next →</button></div>`);
    } else {
      const opts = SE.cache[SE.i] = SE.cache[SE.i] || choices(i);
      body = `<div class="prompt-card">${c.mode === 'listen' ? `<div class="meaning">What did you hear?</div><div class="action-row">${sayBtn(i.kana)}</div>` : `<div class="meaning">What does this mean?</div><div class="kanji">${esc(i.jp)}</div>`}${st.ans ? `<div class="kana">${esc(i.jp)} · ${esc(i.kana)}</div>` : ''}</div>${tag}
        <div class="choice-grid">${opts.map((o, x) => `<button class="choice-btn ${st.ans ? (o === i.en ? 'correct' : o === st.ans.pick ? 'incorrect' : '') : ''}" ${st.ans ? 'disabled' : ''} data-action="choice" data-x="${x}">${esc(o)}</button>`).join('')}</div>` +
        (st.ans ? '<div class="action-row"><button class="btn primary" data-action="next">Next →</button></div>' : '');
    }
  } else if (c.step === 'flex') {
    body = `<div class="prompt-card"><div class="meaning">${esc(c.f.situation_en)}</div><div class="meaning">You blank on: <b>${esc(c.f.blocked_en)}</b>.</div><div class="meaning">Say <b>anything</b> out loud that gets your meaning across: describe it, point, use simpler words, or ask for help.</div></div>` +
      (!st.rev ? '<div class="action-row"><button class="btn primary" data-action="reveal">Show ideas</button></div>'
        : `${c.f.tips.filter(id => D.byId[id]).map(id => `<div class="prompt-card"><div class="kanji" style="font-size:1.4rem">${esc(D.byId[id].jp)}</div><div class="kana">${esc(D.byId[id].kana)}</div><div class="meaning">${esc(D.byId[id].en)}</div>${sayBtn(D.byId[id].kana)}</div>`).join('')}
        <div class="action-row"><button class="btn good" data-action="flex-done" data-ok="1">I found a way</button><button class="btn ghost" data-action="flex-done" data-ok="0">I froze (that's data)</button></div>`);
  } else if (c.step === 'span') {
    body = spanBody(true);
  }
  return `<div class="screen">${topbar(title, true)}${bar(pct(SE.i, SE.queue.length))}<div class="card-stage">${body}</div></div>`;
}
function renderSummary() {
  const st = SE.stats, its = live(), k = its.filter(isKnown).length, tom = its.filter(i => S.items[i.id] && S.items[i.id].due <= addDays(today(), 1)).length;
  const actual = Math.max(1, Math.round((Date.now() - (SE.startTs || Date.now())) / 60000));
  return `<div class="screen"><div class="summary-hero"><div class="big">よくできました</div><div class="cap">Session complete</div></div>
    <div class="summary-grid"><div class="box"><div class="n">${st.newCount}</div><div class="l">new</div></div><div class="box"><div class="n">${st.total}</div><div class="l">reviewed</div></div><div class="box"><div class="n">${pct(st.correct, st.total)}%</div><div class="l">accuracy</div></div></div>
    <p class="settings-hint" style="text-align:center">Estimated ~${SE.est || '?'} min · you took ${actual} min. Reliably recalled so far: ${k} of ${its.length}. Due by tomorrow: ${tom}.</p>
    <div class="action-row"><button class="btn primary" data-action="go" data-view="home">Back to today</button></div></div>`;
}
function renderSettings() {
  const s = S.settings;
  return `<div class="screen">${topbar('Settings')}
  <div class="settings-section"><h3>Theme</h3><div class="chip-row">${['light', 'dark'].map(t => `<button class="chip ${s.theme === t ? 'on' : ''}" data-action="theme" data-t="${t}">${t}</button>`).join('')}</div></div>
  <div class="settings-section"><h3>Content</h3><p class="settings-hint">Every item shown has been checked against a listed source — there is no unverified mode. ${live().length} verified items.</p></div>
  <div class="settings-section"><h3>Backup</h3><p class="settings-hint">Your progress lives only on this device. Export a backup now and then.</p>
  <div class="action-row"><button class="btn ghost" data-action="export">Export</button><label class="btn ghost">Import<input id="imp" type="file" accept="application/json" hidden></label></div></div>
  <div class="settings-section"><h3>Reset</h3><button class="btn again" data-action="reset">Erase all progress</button></div></div>`;
}

/* ---------- events ---------- */
function submitType() {
  const c = cur(); if (!c || c.step !== 'quiz' || c.mode !== 'type' || SE.st.typed) return;
  const inp = $app.querySelector('.type-input');
  const val = inp ? inp.value : '';
  const ok = E.acceptAnswer(val, c.item);
  grade(c.item.id, ok ? 'good' : 'again', 'type'); SE.stats.total++; if (ok) SE.stats.correct++; else requeue(c);
  SE.st.typed = { input: val, ok }; render();
}
$app.addEventListener('click', e => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  const d = el.dataset, c = SE && V.view === 'session' ? cur() : null;
  switch (d.action) {
    case 'go': go(d.view); break;
    case 'tab': V.tab = d.id; render(); break;
    case 'detail': go('detail', { id: d.id }); break;
    case 'back': go(V.view === 'detail' ? 'library' : V.view === 'session' ? 'home' : (V.view === 'span' || V.view === 'patterns') ? 'train' : 'home'); break;
    case 'start': startSession(d.kind); break;
    case 'say': speak(d.say); break;
    case 'pre': SE.st.pre = d.v; render(); break;
    case 'skip-known': { const id = c.item.id; grade(id, 'easy', 'read'); SE.stats.newCount--; SE.queue = SE.queue.filter((q, x) => x <= SE.i || !(q.item && q.item.id === id)); advance(); break; }
    case 'next': advance(); break;
    case 'reveal': SE.st.rev = true; render(); break;
    case 'check-type': submitType(); break;
    case 'skip-type': { grade(c.item.id, 'again', 'type'); SE.stats.total++; requeue(c); SE.st.typed = { input: '', ok: false }; render(); break; }
    case 'choice': {
      if (SE.st.ans) break;
      const pick = SE.cache[SE.i][+d.x], ok = pick === c.item.en;
      grade(c.item.id, ok ? 'good' : 'again', c.mode); SE.stats.total++; if (ok) SE.stats.correct++; else requeue(c);
      SE.st.ans = { pick }; render(); break;
    }
    case 'grade': grade(c.item.id, d.g, c.mode); SE.stats.total++; if (d.g !== 'again') SE.stats.correct++; else requeue(c); advance(); break;
    case 'flex-done': if (d.ok === '1') S.flex++; save(); SE.stats.flex++; advance(); break;
    case 'span-open': SP = null; go('span'); break;
    case 'span-go': spanStart(d.n ? +d.n : 3); break;
    case 'span-pick': {
      if (!SP || SP.phase !== 'recall') break;
      if (SP.seq[SP.picks.length].id === d.id) { SP.picks.push(d.id); if (SP.picks.length === SP.n) { SP.phase = 'win'; S.span = Math.max(S.span || 0, SP.n); save(); } }
      else SP.phase = 'lose';
      render(); break;
    }
    case 'theme': S.settings.theme = d.t; S.settings.background = null; S.settings.shade = null; save(); applyThemeSettings(S.settings); render(); break;
    case 'export': { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' })); a.download = 'michi-backup-' + today() + '.json'; a.click(); break; }
    case 'reset': if (confirm('Erase all progress on this device?')) { S = blank(); save(); applyThemeSettings(S.settings); go('home'); } break;
  }
});
$app.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target && e.target.classList && e.target.classList.contains('type-input')) { e.preventDefault(); submitType(); }
});
$app.addEventListener('change', e => {
  if (e.target.dataset && e.target.dataset.hook) { S.hooks[e.target.dataset.hook] = e.target.value.trim(); save(); }
  if (e.target.id === 'imp' && e.target.files[0]) e.target.files[0].text().then(t => { const r = JSON.parse(t); if (!r || !r.items) throw 0; S = Object.assign(blank(), r); delete S.settings.drafts; save(); applyThemeSettings(S.settings); go('home'); }).catch(() => alert('That file is not a Michi backup.'));
});

(async () => {
  applyThemeSettings(S.settings);
  try { await loadData(); } catch (e) { $app.innerHTML = '<div class="screen"><div class="empty-state">Could not load lesson data. Check your connection and reload.</div></div>'; return; }
  go('home');
})();
