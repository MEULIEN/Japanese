/* ============================================================
   Michi 道 — UI shell (vanilla JS, no build step)
   ------------------------------------------------------------
   Renders into #app. All learning logic lives in the tested modules
   (engine/planner/store/…); this file only displays cards and passes the
   learner's responses to MichiEngine.

   Mobile text input (the "keyboard does not appear" defect):
   • Answers are typed into a real <input> inside a <form>; it is focused
     synchronously inside the tap that shows the card (iOS only opens the
     keyboard for focus() made during a user gesture) and is never
     re-created while the learner is typing — the draft survives any
     re-render.
   • Enter is ignored while an IME composition is active (isComposing /
     keyCode 229 / compositionstart…end), so confirming kana→kanji
     conversion never submits a half-typed answer.
   • lang="ja", enterkeyhint, 16px+ font (no iOS zoom), and the input is
     scrolled into view when the on-screen keyboard resizes the viewport.
   ============================================================ */
(function () {
  'use strict';
  const ENG = window.MichiEngine, CUR = window.MichiCurriculum, CAL = window.MichiCalendar, CJ = window.MichiConjugate;
  const KJ = window.MichiKanji, X = window.MichiExercises, PR = window.MichiProgress, SP = window.MichiSpeech, SRS = window.MichiSRS, PL = window.MichiPlanner, K = window.MichiKana;
  const $app = document.getElementById('app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (n, d) => d ? Math.round(100 * n / d) : 0;

  let E = null, C = null, CONJ = null, REC = null, KDATA = null;
  const V = { view: 'loading', p: {}, ui: {} };      // ui: per-card transient state
  const TABS = [['home', '今', 'Today'], ['train', '練', 'Train'], ['kanji', '字', 'Kanji'], ['conj', '活', 'Conjugate'], ['progress', '進', 'Progress'], ['words', '語', 'Words']];

  /* ---------- theme (kept from the original app) ---------- */
  function applyTheme(s) {
    const dark = s.theme === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#191C20' : '#FAF8F2');
  }

  /* ---------- speech ---------- */
  const audioOk = () => SP.status(E && E.state.settings.voiceURI).ok;
  function say(text, slow) {
    const s = E.state.settings;
    const ok = SP.speak(text, { uri: s.voiceURI, rate: (s.voiceRate || 1) * (slow ? 0.75 : 1) });
    if (!ok) toast(SP.status(s.voiceURI).reason || 'Audio unavailable');
  }

  /* ---------- small UI helpers ---------- */
  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast show';
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = 'toast'; }, 2600);
  }
  const btn = (label, action, cls, extra) => `<button type="button" class="btn ${cls || ''}" data-action="${action}" ${extra || ''}>${label}</button>`;
  const audioBtn = (text, label) => audioOk() ? `<button type="button" class="btn ghost audio" data-action="say" data-say="${esc(text)}" aria-label="Play audio">🔊 ${label || ''}</button><button type="button" class="btn ghost audio slow" data-action="say" data-slow="1" data-say="${esc(text)}" aria-label="Play slowly">🐢</button>` : '';
  // Settings: a labelled gear button (≥44×44 px), placed top-right on every
  // main screen so it is always in the same, findable place.
  const GEAR = '<svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6a.5.5 0 0 0 .1-.6l-2-3.5a.5.5 0 0 0-.6-.2l-2.5 1a7.4 7.4 0 0 0-1.7-1l-.4-2.6a.5.5 0 0 0-.5-.4h-4a.5.5 0 0 0-.5.4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.2l-2 3.5a.5.5 0 0 0 .1.6L4.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.1.6l2 3.5c.1.2.4.3.6.2l2.5-1c.5.4 1.1.7 1.7 1l.4 2.6c0 .2.2.4.5.4h4c.3 0 .5-.2.5-.4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1c.2.1.5 0 .6-.2l2-3.5a.5.5 0 0 0-.1-.6L19.4 13ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"/></svg>';
  const settingsBtn = () => `<button type="button" class="settings-btn" data-action="go" data-view="settings" aria-label="Settings (設定)">${GEAR}<span class="sb-label">Settings</span></button>`;
  const topbar = (title, back, right) => `<header class="topbar">${back ? `<button type="button" class="back" data-action="${back}" aria-label="Back">‹</button>` : '<span class="spacer"></span>'}<h1 class="title">${esc(title)}</h1>${right || '<span class="spacer"></span>'}</header>`;
  const item = id => C.byId[id];
  const speechOf = it => X.speechText(it);
  const romaji = it => E.state.settings.showRomaji && it.romaji ? ` · ${esc(it.romaji)}` : '';
  const topicName = id => (C.topicById[id] || {}).name || id;
  const fmtDate = d => CAL.pretty(d);
  function srcLabel(src) {
    if (!src) return '';
    if (typeof src === 'string') return esc(src);
    const name = esc(src.name || src.type);
    const link = src.url ? ` <a href="${esc(src.url)}" target="_blank" rel="noopener">${src.id ? '#' + esc(src.id) : 'link'}</a>` : '';
    return name + link + (src.license ? ' · ' + esc(src.license) : '');
  }

  /* ---------- routing ---------- */
  function go(view, p) { V.view = view; V.p = p || {}; V.ui = {}; render(); window.scrollTo(0, 0); }
  function render() {
    const views = { kanji: renderKanji, radical: renderRadical, ksession: renderKSession, ksummary: renderKSummary, home: renderHome, train: renderTrain, conj: renderConj, conjGroup: renderConjGroup, conjForm: renderConjForm, progress: renderProgress, words: renderWords, word: renderWord, settings: renderSettings, recallSetup: renderRecallSetup, session: renderSession, summary: renderSummary, patterns: renderPatterns };
    const f = views[V.view];
    const tabbed = ['home', 'train', 'kanji', 'radical', 'conj', 'progress', 'words', 'settings', 'conjGroup', 'conjForm', 'word', 'recallSetup', 'patterns'].includes(V.view);
    const active = { radical: 'kanji', conjGroup: 'conj', conjForm: 'conj', word: 'words', recallSetup: 'home', settings: 'home', patterns: 'train' }[V.view] || V.view;
    $app.innerHTML = `<main class="screen ${tabbed ? 'with-tabs' : ''}" id="main">${f ? f() : '<p class="muted">Loading…</p>'}</main>` +
      (tabbed ? `<nav class="tabbar" aria-label="Main">${TABS.map(([v, g, l]) => `<button type="button" class="tabbar-btn ${active === v ? 'active' : ''}" data-action="go" data-view="${v}" ${active === v ? 'aria-current="page"' : ''}><span class="t-glyph" aria-hidden="true">${g}</span><span class="t-label">${l}</span></button>`).join('')}</nav>` : '');
    afterRender();
  }
  // Focus management after every render.
  // Touch devices: NO programmatic focus on the answer box. On iPhones a
  // focus() call can leave the field focused without showing the keyboard,
  // after which tapping the (already focused) field may do nothing. The
  // learner taps the large answer zone instead; that native tap always opens
  // the keyboard (see also the touchend handler for the refocus case).
  // Desktop/keyboard: focus immediately so typing can start at once.
  const TOUCH = !!(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);
  function afterRender() {
    composing = false;
    const inp = $app.querySelector('input.answer:not([disabled])');
    if (inp) {
      if (V.ui.draft != null && inp.value !== V.ui.draft) inp.value = V.ui.draft;
      if (!TOUCH) { try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); } keepVisible(inp); }
    } else if (!TOUCH) {
      const next = $app.querySelector('[data-autofocus]');
      if (next) try { next.focus({ preventScroll: true }); } catch (e) { }
    }
    if (E && E.state.settings.typingDebug) kbdShow();
  }
  function keepVisible(el) {
    // Bring the question AND the answer box into view above the keyboard.
    const stage = el.closest('.card-stage') || el;
    try { stage.scrollIntoView({ block: 'start', behavior: 'auto' }); } catch (e) { }
    const vv = window.visualViewport;
    if (vv) {
      const r = el.getBoundingClientRect();
      const bottom = vv.offsetTop + vv.height;
      if (r.bottom + 70 > bottom) window.scrollBy(0, r.bottom + 70 - bottom);
    }
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      const a = document.activeElement;
      if (a && a.matches && a.matches('input.answer, textarea')) keepVisible(a);
      document.documentElement.style.setProperty('--vvh', window.visualViewport.height + 'px');
    });
  }

  /* ============================================================
     HOME
     ============================================================ */
  function renderHome() {
    const av = E.availability();
    const today = E.today();
    const st = E.state;
    const resumable = E.session && !E.session.finished;
    const days7 = Array.from({ length: 7 }, (_, k) => CAL.addDays(today, k - 6));
    const practised = days7.filter(d => st.sessions.some(s => s.date === d)).length;
    const dueNow = PL.skillStates(E.ctx()).filter(s => s.due).length;
    const topic = av.morning.topic ? C.topicById[av.morning.topic] : null;
    const card = (kind, title, sub, a, big) => {
      const state = a.state, rec = av.recommended === kind;
      const badge = state === 'done' ? '<span class="pill done">✓ Done today</span>' : state === 'locked' ? `<span class="pill locked">🔒 ${a.timeLocked ? 'From ' + esc(a.opensAt) : 'Locked'}</span>` : rec ? '<span class="pill rec">Recommended</span>' : '<span class="pill">Available</span>';
      const disabled = state === 'locked';
      return `<button type="button" class="act ${big ? 'big' : ''} ${kind} ${state} ${rec ? 'rec' : ''}" data-action="start" data-kind="${kind}" ${disabled ? 'aria-disabled="true"' : ''}>
        <span class="act-head"><span class="act-title">${title}</span>${badge}</span>
        <span class="act-sub">${sub}</span></button>`;
    };
    const mins = st.settings.minutes;
    const wk = av.weekly.status;
    const weeklySub = av.weekly.state === 'locked' ? `Opens ${fmtDate(wk.unlocks)}${wk.daysUntil ? ' · in ' + wk.daysUntil + ' day' + (wk.daysUntil > 1 ? 's' : '') : ''}. A full assessment of the week.`
      : av.weekly.state === 'done' ? `Done. Next one opens ${fmtDate(wk.unlocks)}.`
        : `${wk.catchUp ? 'Catch-up for ' + fmtDate(wk.key) + '. ' : ''}~${mins.weekly} min · everything from this week, all skills, real situations.`;
    const why = topicWhyText(av.morning);
    const morningSub = av.morning.state === 'locked' ? esc(av.morning.reason) : topic ? `${topic.icon || ''} ${esc(topic.name)}${why ? ` <span class="why">· ${esc(why)}</span>` : ''}<br>~${mins.morning} min · quick check, then new words` : `~${mins.morning} min · review (all topics introduced)`;
    const eveningSub = av.evening.state === 'locked' ? (av.evening.timeLocked ? `Available from ${esc(av.evening.opensAt)} · in ${esc(E.eveningClock().waitText)}. Reviews this morning’s words — no new words.` : esc(av.evening.reason)) : st.lesson.pendingEvening ? `~${mins.evening} min · use this morning’s words in new ways · no new words` : `~${mins.evening} min · due reviews (no new words)`;
    return `${topbar('Michi 道', null, settingsBtn())}
      <section class="hero"><div class="date">${esc(fmtDate(today))}</div>
        <p class="muted">${practised} of the last 7 days practised · ${dueNow} skill check${dueNow === 1 ? '' : 's'} due</p></section>
      ${resumable ? `<div class="banner">You have an unfinished ${esc(E.session.kind)} session. ${btn('Resume', 'resume', 'primary small')} ${btn('Discard', 'discard', 'ghost small')}</div>` : ''}
      ${E.loadNotes.includes('recovered-from-previous-copy') ? '<div class="banner warn">Your saved progress was damaged; the previous copy was restored automatically.</div>' : ''}
      ${E.migrated ? '<div class="banner">Your progress from the old version was moved over. A backup of the old data is kept (Settings → Backup).</div>' : ''}
      ${V.p.msg ? `<div class="banner">${esc(V.p.msg)}</div>` : ''}
      <div class="act-grid">
        ${card('morning', 'Daily Morning', morningSub, av.morning, true)}
        ${card('evening', 'Daily Evening', eveningSub, av.evening, true)}
        <div class="act-row">
          ${card('recall', 'Recall', 'Practise what you forget. Doesn’t change your schedule.', av.recall)}
          ${card('training', 'Training', 'Memory, speaking & getting unstuck.', av.training)}
        </div>
        ${card('weekly', 'Weekly', weeklySub, av.weekly)}
      </div>
      ${!audioOk() ? `<p class="hint">🔇 ${esc(SP.status(st.settings.voiceURI).reason || '')} Listening exercises are replaced by reading ones until a voice is available. <a href="#" data-action="go" data-view="settings">Voice settings</a></p>` : ''}`;
  }

  // Why this morning's topic was chosen — plain words, no scores.
  function topicWhyText(m) {
    if (!m || !m.why) return '';
    const n = id => (C.topicById[id] || {}).name || id;
    return { priority: 'one of your priority topics', prereq: 'needed before ' + n(m.forTopic) + ' (your priority)', balance: 'outside your priorities, to keep learning broad', carry: 'finishing last lesson', chosen: '' }[m.why] || '';
  }
  /* ---------- starting sessions ---------- */
  const EMPTY = {
    'nothing-learned': 'Nothing to practise yet — start with a Daily Morning lesson.',
    'nothing-to-do': 'Nothing is due right now. Well done — try Recall or Training, or come back later.',
    'empty-filter': 'No learned items match that choice yet. Try “Mixed”.',
    'locked': 'The weekly assessment opens on Sunday.',
    'unknown-kind': 'That activity is unavailable.'
  };
  function start(kind, opts) {
    if (kind === 'recall' && !opts) return go('recallSetup');
    if (kind === 'training' && !opts) return go('train');
    const r = E.start(kind, opts);
    if (r.error) {
      if (r.error === 'locked') return toast('Weekly opens ' + fmtDate(r.status.unlocks));
      if (r.error === 'evening-locked') return toast('Daily Evening opens at ' + r.opensAt + ' (in ' + r.waitText + ').');
      return go(V.view === 'session' ? 'home' : V.view, Object.assign({}, V.p, { msg: EMPTY[r.error] || 'Nothing to do right now.' }));
    }
    V.ui = {};
    go('session');
  }

  /* ============================================================
     SESSION
     ============================================================ */
  const KIND_TITLE = { morning: 'Daily Morning', evening: 'Daily Evening', weekly: 'Weekly assessment', recall: 'Recall', training: 'Training' };
  const PHASE_NOTE = { diag: 'Quick check — do you already know this? (Unknown is fine: it decides what I teach.)', review: 'Review', delayed: 'From earlier in this lesson — no hints this time', retry: 'Another go, a different way', consolidate: 'From this morning', reinforce: 'You knew this — quick confirmation', assess: '', scenario: 'Real-life situation', practice: '' };

  function renderSession() {
    const s = E.session;
    const c = s && E.current();
    if (!s) return '<p>Nothing running.</p>';
    if (!c) { finish(); return renderSummary(); }
    const scheduled = PL.isScheduled(s);
    const total = s.queue.length;
    const progress = scheduled ? `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${s.i}"><div style="width:${pct(s.i, total)}%"></div></div>` : `<div class="practice-meta">${s.stats.n} answered · ${s.stats.ok} right · practice only — your schedule is unchanged</div>`;
    const right = `<button type="button" class="icon-btn" data-action="end" aria-label="${scheduled ? 'Finish later' : 'End practice'}">${scheduled ? 'Finish later' : 'End'}</button>`;
    const note = PHASE_NOTE[c.phase] ? `<p class="phase">${esc(PHASE_NOTE[c.phase])}</p>` : '';
    const tools = s.kind === 'training' ? trainingTools(s) : '';
    return `${topbar(KIND_TITLE[s.kind] || s.kind, 'end', right)}${progress}${tools}${note}<section class="card-stage" aria-live="polite">${cardBody(c, s)}</section>`;
  }
  function trainingTools(s) {
    const acts = [['mixed', 'Mixed'], ['span', 'Memory span'], ['switch', 'Category switch'], ['recovery', 'Get unstuck'], ['reconstruct', 'Rebuild later']];
    const dirs = [['mixed', 'Any'], ['produce', 'Say it'], ['listen', 'Listening'], ['kanji', 'Kanji'], ['conjugation', 'Conjugation'], ['context', 'Sentences']];
    const a = s.opts.activity, d = s.opts.direction;
    return `<div class="chip-row scroll" role="group" aria-label="Exercise type">${acts.map(([k, l]) => `<button type="button" class="chip ${a === k && (k !== 'mixed' || d === 'mixed') ? 'on' : ''}" data-action="train-switch" data-activity="${k}" data-direction="mixed">${l}</button>`).join('')}${dirs.slice(1).map(([k, l]) => `<button type="button" class="chip ${a === 'mixed' && d === k ? 'on' : ''}" data-action="train-switch" data-activity="mixed" data-direction="${k}">${l}</button>`).join('')}</div>`;
  }

  function feedbackBlock(c, res, extra) {
    const it = c.item ? item(c.item) : null;
    const cls = res.verdict === 'correct' ? 'good' : res.verdict === 'near' ? 'near' : 'bad';
    const head = res.verdict === 'correct' ? (res.kind === 'alt' ? '✓ Correct (alternative answer)' : '✓ Correct') : res.verdict === 'near' ? (res.kind === 'self' ? '◐ Partly' : '◐ Almost') : res.kind === 'dont-know' ? 'Here it is' : res.kind === 'self' ? 'That’s useful to know' : '✗ Not quite';
    const ans = c.answer ? `<div class="answer-jp" lang="ja">${esc(c.answer.jp)}</div>${c.answer.kana !== c.answer.jp ? `<div class="answer-kana" lang="ja">${esc(c.answer.kana)}</div>` : ''}` : '';
    const formNote = res.kind === 'wrong-form' ? `<p>You wrote the <b>${esc(X.FORM_CUES[res.matched] || res.matched)}</b> form. Asked for: <b>${esc(c.cue)}</b>.</p>` : '';
    const chose = res.chose && c.ex !== 'pick' && c.ex !== 'kanjipick' ? (() => { const other = C.items.find(x => x.en === res.chose); return other ? `<p class="muted">You chose “${esc(res.chose)}” — that is <span lang="ja">${esc(other.jp)}</span>.</p>` : ''; })() : '';
    const meaning = it ? `<p class="muted"><span lang="ja">${esc(it.jp)}</span> (${esc(it.kana)}${romaji(it)}) = ${esc(it.en)}</p>` : '';
    return `<div class="feedback ${cls}" role="status"><div class="fb-head">${head}</div>${ans}${res.note ? `<p>${esc(res.note)}</p>` : ''}${formNote}${chose}${meaning}${extra || ''}
      <div class="row">${it ? audioBtn(c.answer ? c.answer.jp : speechOf(it)) : ''}${btn('Continue →', 'next', 'primary', 'data-autofocus')}</div></div>`;
  }

  function cardBody(c, s) {
    const u = V.ui, it = c.item ? item(c.item) : null;
    switch (c.ex) {
      case 'teach': return teachCard(it);
      case 'teachpattern': return teachPatternCard(C.grammarById[c.pattern]);
      case 'study': return `<div class="prompt"><p class="muted">Remember this sentence — you will rebuild it in a moment.</p><div class="big-jp" lang="ja">${esc(c.sentence)}</div><p>${esc(c.prompt)}</p>${audioBtn(c.sentence)}</div><div class="row">${btn('I’ve got it →', 'ack', 'primary', 'data-autofocus')}</div>`;
      case 'diag': case 'choice': case 'listen': case 'pick': case 'kanjipick': return choiceCard(c, it, u);
      case 'speak': return speakCard(c, it, u);
      case 'build': return buildCard(c, u);
      case 'span': return spanCard(c, u);
      case 'switch': return switchCard(c, u);
      case 'recovery': return recoveryCard(c, u);
      default: return typedCard(c, it, u);
    }
  }

  function exampleList(it) {
    if (!it.examples || !it.examples.length) return '';
    return `<div class="examples">${it.examples.map(e => `<div class="ex"><div lang="ja">${esc(e.jp)} ${audioOk() ? `<button type="button" class="link" data-action="say" data-say="${esc(e.jp)}" aria-label="Play example">🔊</button>` : ''}</div><div class="muted">${esc(e.en)}</div><div class="src">${srcLabel(e.source)}</div></div>`).join('')}</div>`;
  }
  function formsPreview(it) {
    if (!(it.verb_class || it.adj_class)) return '';
    const forms = it.verb_class ? ['masu', 'masen', 'mashita', 'te'] : ['polite', 'neg', 'past'];
    const grp = { group1: 'Group 1 (godan)', group2: 'Group 2 (ichidan)', irregular: 'Irregular', i: 'い-adjective', na: 'な-adjective' }[CJ.groupOf(it)];
    return `<div class="forms-mini"><div class="muted">${grp}</div>${forms.map(f => { const r = CJ.conjugate(it, f); return r ? `<span class="chip static"><span lang="ja">${esc(r.jp)}</span> <small>${esc(X.FORM_CUES[f])}</small></span>` : ''; }).join('')}</div>`;
  }
  function teachCard(it) {
    const links = (it.links || []).map(l => `<div class="muted">↔ <span lang="ja">${esc(item(l.id).jp)}</span> ${esc(item(l.id).en)} — ${esc(l.rel)}</div>`).join('');
    return `<div class="prompt teach"><div class="tag">${esc(topicName(it.topic))}${it.register ? ' · ' + esc(it.register) : ''}${it.use === 'hear' ? ' · to understand' : it.use === 'read' ? ' · to read' : ''}</div>
      <div class="big-jp" lang="ja">${esc(it.jp)}</div><div class="kana" lang="ja">${esc(it.kana)}${romaji(it)}</div>
      <div class="meaning">${esc(it.en)}</div>${audioBtn(speechOf(it))}
      ${it.say_when ? `<p class="when">When: ${esc(it.say_when)}</p>` : ''}${it.note ? `<p class="note">⚠ ${esc(it.note)}</p>` : ''}
      ${formsPreview(it)}${exampleList(it)}${links}
      <label class="hook">Your own memory hook (optional — your own image sticks best)<textarea data-hook="${esc(it.id)}" rows="2">${esc(E.state.hooks[it.id] || '')}</textarea></label></div>
      <div class="row">${btn('Got it →', 'ack', 'primary', 'data-autofocus')}</div>`;
  }
  function teachPatternCard(p) {
    if (!p) return `<div class="row">${btn('Continue →', 'ack', 'primary', 'data-autofocus')}</div>`;
    const ex = (p.sources || []).filter(s => s.type === 'usage').slice(0, 2);
    return `<div class="prompt teach"><div class="tag">New sentence pattern · ${esc(p.register || '')}</div><div class="big-jp" lang="ja">${esc(p.frame)}</div>
      <div class="meaning">${esc(p.en.replace(/\{(\w+)\}/g, '…'))}</div><p>${esc(p.explain || '')}</p>
      ${ex.map(e => `<div class="ex"><div lang="ja">${esc(e.text)} ${audioOk() ? `<button type="button" class="link" data-action="say" data-say="${esc(e.text)}" aria-label="Play">🔊</button>` : ''}</div><div class="muted">${esc(e.translation)}</div><div class="src">${srcLabel(e)}</div></div>`).join('')}</div>
      <div class="row">${btn('Got it →', 'ack', 'primary', 'data-autofocus')}</div>`;
  }

  function choiceCard(c, it, u) {
    let prompt;
    if (c.ex === 'listen' || (c.ex === 'diag' && c.audio && it.use === 'hear')) prompt = `<p class="q">What does this mean?</p><div class="row center">${audioBtn(c.audio || speechOf(it), 'Play')}</div>`;
    else if (c.ex === 'pick') prompt = `<p class="q">Which Japanese means…</p><div class="big-en">${esc(c.prompt)}</div>`;
    else if (c.ex === 'kanjipick') prompt = `<p class="q">Which is written…</p><div class="big-jp" lang="ja">${esc(c.prompt)}</div><p class="muted">(${esc(c.meaning)})</p>`;
    else prompt = `<p class="q">${c.ex === 'diag' ? 'Do you know what this means?' : 'What does this mean?'}</p><div class="big-jp" lang="ja">${esc(it.jp)}</div>${c.ex === 'diag' && c.audio ? audioBtn(c.audio) : ''}`;
    const res = u.res;
    const jpOpts = c.ex === 'pick' || c.ex === 'kanjipick';
    const opts = c.options.map((o, k) => {
      const state = res ? (k === c.correct ? 'correct' : k === u.pick ? 'incorrect' : '') : '';
      return `<button type="button" class="choice ${state}" data-action="choose" data-k="${k}" ${res ? 'disabled' : ''} ${jpOpts ? 'lang="ja"' : ''}>${esc(o)}</button>`;
    }).join('');
    const dk = !res ? `<button type="button" class="choice dk" data-action="dontknow">I don’t know</button>` : '';
    return `<div class="prompt">${prompt}</div><div class="choices">${opts}${dk}</div>${res ? feedbackBlock(c, res) : ''}`;
  }

  function hintText(c, level) {
    const a = c.answer; if (!a) return '';
    const k = a.kana;
    if (level === 1) return `Starts with 「${k[0]}」 · ${[...k].length} kana`;
    return `${[...k].map((ch, i) => i % 2 === 0 ? ch : '・').join('')}`;
  }
  // The answer box: a real text input inside a big <label>, so a tap anywhere
  // on the zone is a native tap on the field (opens the phone keyboard).
  function answerInput(res) {
    return `<label class="answer-zone" for="ans"><span class="zone-hint">${res ? 'Your answer' : TOUCH ? 'Tap here to type your answer ⌨' : 'Your answer'}</span>
        <input id="ans" class="answer" name="answer" type="text" lang="ja" inputmode="text" enterkeyhint="go" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="かな / kanji / rōmaji" ${res ? 'disabled' : ''} value="${esc(V.ui.draft || '')}"></label>`;
  }
  function typedCard(c, it, u) {
    const res = u.res;
    let q;
    switch (c.ex) {
      case 'reading': q = `<p class="q">How do you read this?</p><div class="big-jp" lang="ja">${esc(c.prompt)}</div><p class="muted">Type the reading in kana or rōmaji.</p>`; break;
      case 'form': q = `<p class="q">Make this form</p><div class="big-jp" lang="ja">${esc(c.prompt)}</div><div class="cue">→ ${esc(c.cue)}</div>`; break;
      case 'cloze': q = `<p class="q">Fill the gap</p><div class="sentence" lang="ja">${esc(c.sentence)}</div><p class="muted">${esc(c.translation)}</p>`; break;
      case 'pattern': q = `<p class="q">Say it in Japanese (${esc(c.register || 'polite')})</p><div class="big-en">${esc(c.prompt)}</div>`; break;
      case 'switch': q = ''; break;
      default: q = `<p class="q">${c.phase === 'diag' ? 'Can you say this in Japanese?' : 'How do you say…'}</p><div class="big-en">${esc(c.prompt)}</div>${c.hint ? `<p class="muted">${esc(c.hint)}</p>` : ''}`;
    }
    const hintLvl = u.hint || 0;
    const hints = hintLvl ? `<p class="hint-line">💡 ${esc(hintText(c, hintLvl))}</p>` : '';
    const form = `<form class="answer-form" data-form="typed" autocomplete="off" novalidate>
        ${answerInput(res)}
        ${res ? '' : `<div class="row">${btn('Check', 'check', 'primary')}${c.phase !== 'delayed' && c.phase !== 'diag' && c.phase !== 'assess' && hintLvl < 2 ? btn('Hint', 'hint', 'ghost') : ''}${btn('I don’t know', 'dontknow', 'ghost')}</div>`}
      </form>${kbdLogBox()}`;
    return `<div class="prompt">${q}${hints}</div>${form}${res ? feedbackBlock(c, res, u.typed ? `<p class="muted">You typed: <span lang="ja">${esc(u.typed)}</span></p>` : '') : ''}`;
  }

  function speakCard(c, it, u) {
    if (!u.revealed) return `<div class="prompt"><p class="q">Say it out loud</p><div class="big-en">${esc(c.prompt)}</div>${c.hint ? `<p class="muted">${esc(c.hint)}</p>` : ''}<p class="muted">Actually speak — even a whisper counts. Then check yourself.</p></div><div class="row">${btn('Show the answer', 'reveal', 'primary', 'data-autofocus')}</div>`;
    if (u.res) return `<div class="prompt"><div class="big-jp" lang="ja">${esc(it.jp)}</div><div class="kana" lang="ja">${esc(it.kana)}${romaji(it)}</div></div>${feedbackBlock(c, u.res)}`;
    return `<div class="prompt"><div class="big-jp" lang="ja">${esc(it.jp)}</div><div class="kana" lang="ja">${esc(it.kana)}${romaji(it)}</div>${audioBtn(c.audio)}<p class="q">How did it go? (You judge — the app can’t hear you.)</p></div>
      <div class="choices">${btn('Said it without help', 'self', 'choice good', 'data-v="yes"')}${btn('Partly / slowly', 'self', 'choice near', 'data-v="partly"')}${btn('Couldn’t', 'self', 'choice bad', 'data-v="no"')}</div>`;
  }

  function buildCard(c, u) {
    const seq = u.seq || [];
    const res = u.res;
    const tiles = c.order.map(k => `<button type="button" class="tile" data-action="tile" data-k="${k}" ${seq.includes(k) || res ? 'disabled' : ''} lang="ja">${esc(c.chunks[k])}</button>`).join('');
    return `<div class="prompt"><p class="q">Build the sentence</p><div class="big-en">${esc(c.prompt)}</div>
      <div class="built" lang="ja" aria-live="polite">${seq.map(k => esc(c.chunks[k])).join('') || '<span class="muted">tap the pieces in order</span>'}</div></div>
      <div class="tiles">${tiles}</div>
      ${res ? feedbackBlock(c, res) : `<div class="row">${btn('Undo', 'tile-undo', 'ghost')}${btn('Check', 'tile-check', 'primary', seq.length === c.chunks.length ? 'data-autofocus' : 'disabled')}</div>`}`;
  }

  function spanCard(c, u) {
    const words = c.seq.map(id => item(id));
    if (!u.phase) return `<div class="prompt"><p class="q">Memory span · ${c.n} words</p><p class="muted">Watch the words appear one at a time, then tap them back in the same order. Length adapts: it grows after a success and shrinks after a miss.</p></div><div class="row">${btn('Start', 'span-start', 'primary', 'data-autofocus')}</div>`;
    if (u.phase === 'show') return `<div class="prompt"><p class="muted">Remember the order (${u.k + 1} / ${c.n})</p><div class="big-jp" lang="ja" id="span-word">${esc(words[u.k].jp)}</div></div>`;
    const picks = u.picks || [];
    if (u.phase === 'recall') return `<div class="prompt"><p class="q">Tap them in order (${picks.length}/${c.n})</p></div><div class="choices grid3">${c.grid.map(id => `<button type="button" class="choice ${picks.includes(id) ? 'correct' : ''}" data-action="span-pick" data-id="${esc(id)}" ${picks.includes(id) ? 'disabled' : ''} lang="ja">${esc(item(id).jp)}</button>`).join('')}</div>`;
    return `<div class="prompt">${u.won ? `<p class="fb-head good">✓ All ${c.n} in order</p>` : `<p class="fb-head">The order was:</p>`}<div lang="ja">${words.map(w => esc(w.jp)).join(' → ')}</div><p class="muted">${words.map(w => esc(w.en)).join(' · ')}</p><p class="muted">Best ever: ${E.state.train.spanBest || 0}. (This measures this game, not your general memory.)</p></div><div class="row">${btn('Continue →', 'next', 'primary', 'data-autofocus')}</div>`;
  }

  function switchCard(c, u) {
    const catName = { food: 'a food', drink: 'a drink', place: 'a place', destination: 'somewhere you can go', thing: 'an object', person: 'a person', time: 'a time word', orderable: 'something you can order', shop_item: 'something you can buy', transport: 'a kind of transport', activity: 'an activity', hobby: 'a hobby' }[c.category] || c.category;
    const res = u.res;
    const form = `<form class="answer-form" data-form="typed" autocomplete="off" novalidate>${answerInput(res)}
      ${res ? '' : `<div class="row">${btn('Check', 'check', 'primary')}${btn('Pass', 'dontknow', 'ghost')}</div>`}</form>${kbdLogBox()}`;
    const ok = res && res.matched ? item(res.matched) : null;
    const examples = c.members.slice(0, 4).map(id => item(id)).filter(Boolean);
    return `<div class="prompt"><p class="q">Quick! Name ${esc(catName)} in Japanese</p><p class="muted">Categories alternate — switching is the point.</p></div>${form}
      ${res ? `<div class="feedback ${res.verdict === 'correct' ? 'good' : 'bad'}"><div class="fb-head">${res.verdict === 'correct' ? '✓ ' + esc(ok.jp) + ' — ' + esc(ok.en) : 'Some you know:'}</div>${res.verdict === 'correct' ? '' : examples.map(x => `<div lang="ja">${esc(x.jp)} <span class="muted">${esc(x.en)}</span></div>`).join('')}<div class="row">${btn('Continue →', 'next', 'primary', 'data-autofocus')}</div></div>` : ''}`;
  }

  function recoveryCard(c, u) {
    const p = REC.prompts.find(x => x.id === c.prompt);
    if (!p) return `<div class="row">${btn('Continue →', 'next', 'primary')}</div>`;
    const lvl = u.hint || 0;
    const words = p.wordData || [];
    const hints = [];
    if (lvl >= 1) hints.push(`<li>Try: ${esc(p.strategies.map(s => STRAT[s] || s).join(' · '))}</li>`);
    if (lvl >= 2 && words.length) hints.push(`<li>Words that help: ${words.map(w => `<span lang="ja">${esc(w.jp)}</span> (${esc(w.en)})`).join(' · ')}</li>`);
    if (lvl >= 3 && p.models.length) hints.push(`<li>One way: <span lang="ja">${esc(p.models[0].jp)}</span> — ${esc(p.models[0].en)}</li>`);
    if (u.done) {
      const found = detectStrategies(u.text || '');
      return `<div class="prompt"><p class="q">${esc(p.goal)}</p>${u.text ? `<p>You said: <span lang="ja">${esc(u.text)}</span></p><p class="muted">Strategies spotted: ${found.length ? found.map(f => esc(STRAT[f] || f)).join(', ') : 'none detected (that doesn’t mean it failed — the app can only spot describing words, not judge meaning)'}.</p>` : ''}
        ${p.target ? `<p>The word you were missing: <b lang="ja">${esc(p.target.jp)}</b> (${esc(p.target.kana)}) — ${esc(p.target.en)}</p>` : ''}
        <div class="examples">${p.models.map(m => `<div class="ex"><div lang="ja">${esc(m.jp)} ${audioOk() ? `<button type="button" class="link" data-action="say" data-say="${esc(m.jp)}">🔊</button>` : ''}</div><div class="muted">${esc(m.en)}</div></div>`).join('')}</div>
        <p class="src">${p.sources.map(srcLabel).join(' · ')}</p>
        ${u.res ? '' : '<p class="q">Would a patient listener have understood you?</p>'}</div>
        ${u.res ? `<div class="row">${btn('Continue →', 'next', 'primary', 'data-autofocus')}</div>` : `<div class="choices">${btn('Yes', 'self', 'choice good', 'data-v="yes"')}${btn('Partly', 'self', 'choice near', 'data-v="partly"')}${btn('No', 'self', 'choice bad', 'data-v="no"')}</div>`}`;
    }
    return `<div class="prompt"><div class="tag">Get unstuck · ${esc(p.type)}</div><p>${esc(p.situation)}</p>
      ${p.question ? `<div class="big-jp" lang="ja">${esc(p.question.jp)}</div>${audioBtn(p.question.jp)}<details><summary>Meaning</summary>${esc(p.question.en)}</details>` : ''}
      <p class="q">${esc(p.goal)}</p><p class="muted">Say it out loud${p.target ? ' without the missing word' : ''}. Optionally type what you said.</p>
      ${hints.length ? `<ul class="hints">${hints.join('')}</ul>` : ''}
      <label class="sr-only" for="rec-text">What you said</label><textarea id="rec-text" rows="2" lang="ja" data-rec placeholder="(optional) type what you said">${esc(u.text || '')}</textarea></div>
      <div class="row">${lvl < 3 ? btn(lvl ? 'More help' : 'Help me', 'hint', 'ghost') : ''}${btn('Done', 'rec-done', 'primary')}</div>`;
  }
  const STRAT = { function: 'what it’s for', category: 'what kind of thing', place: 'what place', person: 'who', appearance: 'what it looks like', comparison: 'what it’s like', ask: 'ask for the word', clarify: 'ask to repeat / slow down', confirm: 'check your guess' };
  function detectStrategies(text) {
    const m = REC.markers || {};
    return Object.keys(m).filter(k => m[k].some(w => text.includes(w)));
  }

  /* ---------- answering ---------- */
  function answer(response, meta) {
    const c = E.current(); if (!c || V.ui.res) return;
    const out = E.answer(response, Object.assign({ hint: V.ui.hint || 0 }, meta || {}));
    if (out && out.result) { V.ui.res = out.result; render(); }
    else next();
  }
  function next() {
    E.next(); V.ui = {};
    if (!E.current()) return finish();
    render();
    window.scrollTo(0, 0);
  }
  function finish() {
    const sum = E.finish();
    V.view = 'summary'; V.p = { sum }; V.ui = {};
    render();
  }

  /* ---------- span animation ---------- */
  function spanRun(c) {
    V.ui.phase = 'show'; V.ui.k = 0; render();
    const tick = () => {
      if (V.view !== 'session' || E.current() !== c || V.ui.phase !== 'show') return;
      if (V.ui.k + 1 >= c.n) { V.ui.phase = 'recall'; V.ui.picks = []; render(); return; }
      V.ui.k++; render(); setTimeout(tick, 1300);
    };
    setTimeout(tick, 1300);
  }

  /* ============================================================
     SUMMARY
     ============================================================ */
  function nameList(ids) { return ids.length ? ids.map(id => item(id)).filter(Boolean).map(it => `<span class="chip static" lang="ja" title="${esc(it.en)}">${esc(it.jp)}</span>`).join(' ') : '<span class="muted">—</span>'; }
  function renderSummary() {
    const sum = V.p.sum || (E.session && E.session.summary);
    if (!sum) return '<p>Done.</p>';
    const scheduled = PL.SCHEDULED.includes(sum.kind);
    const nextDays = Object.entries((sum.next && sum.next.byDate) || {}).sort().map(([d, n]) => `${n} on ${fmtDate(d)}`).join(', ');
    const report = sum.kind === 'weekly' && E.state.weekly[E.session && E.session.weekKey];
    const rep = report ? weeklyReportHTML(report) : '';
    const time = `${sum.minutes} min (you planned ~${sum.budgetMin || '—'})`;
    return `${topbar(KIND_TITLE[sum.kind] + ' — done')}
      <section class="summary">
        <div class="stat-row"><div><b>${sum.graded}</b><span>answered</span></div><div><b>${sum.graded ? pct(sum.correct, sum.graded) + '%' : '—'}</b><span>correct</span></div><div><b>${sum.minutes}</b><span>minutes</span></div></div>
        ${sum.kind === 'morning' && sum.topic ? `<p class="muted">Topic: ${esc(topicName(sum.topic))}${sum.topic2 ? ' + ' + esc(topicName(sum.topic2)) + ' (the first topic had only a few words left)' : ''}${topicWhyText({ why: sum.topicWhy, forTopic: sum.forTopic }) ? ' — ' + esc(topicWhyText({ why: sum.topicWhy, forTopic: sum.forTopic })) : ''}.</p>` : ''}
        ${sum.kind === 'morning' ? (() => { const fresh = sum.introduced.filter(id => !sum.knownBefore.includes(id)); return `<h3>New today (${fresh.length})</h3>${nameList(fresh)}${sum.knownBefore.length ? `<h3>Already knew (${sum.knownBefore.length})</h3><p class="muted">Shown by the quick check — recognised <i>and</i> produced unaided.</p>${nameList(sum.knownBefore)}` : ''}`; })() : ''}
        ${scheduled ? `<h3>Recalled on your own</h3>${nameList(sum.independent)}
        <h3>Needed help</h3>${nameList(sum.assisted)}` : `<p class="muted">Practice only — your review schedule and mastery are unchanged.</p>`}
        ${sum.errors.length ? `<h3>Worth more practice</h3><ul class="plain">${dedupeErrors(sum.errors).map(e => `<li><span lang="ja">${esc(item(e.item).jp)}</span> — ${esc(ERRK[e.kind] || 'missed')} (${esc((CUR.SKILLS[e.skill] || {}).name || e.skill)})</li>`).join('')}</ul>` : ''}
        ${sum.carry && sum.carry.length ? `<h3>Carried to the next morning</h3><p class="muted">Not reached this time — nothing is marked learned that you didn’t practise.</p>${nameList(sum.carry)}` : ''}
        ${rep}
        ${scheduled ? `<h3>What comes next</h3><p>${nextDays ? 'Coming up in the next two days: ' + esc(nextDays) + '. ' : ''}${esc(((sum.next && sum.next.reasons) || []).map(r => r + '. ').join(''))}${sum.kind === 'morning' ? 'This evening: use today’s words in new ways (no new words).' : ''}</p>` : ''}
        <p class="muted">Time: ${esc(time)}</p>
      </section>
      <div class="row">${btn('Back to today', 'go', 'primary', 'data-view="home" data-autofocus')}${sum.kind !== 'weekly' ? btn('Progress', 'go', 'ghost', 'data-view="progress"') : ''}</div>`;
  }
  const ERRK = { 'wrong-form': 'wrong form', 'dont-know': 'didn’t recall', 'wrong-choice': 'mixed up', wrong: 'wrong answer', order: 'word order', typo: 'typo', self: 'couldn’t say it' };
  function dedupeErrors(errs) { const seen = new Set(); return errs.filter(e => { const k = e.item + e.skill; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12); }
  function weeklyReportHTML(r) {
    const cls = r.classes;
    const row = (label, ids, note) => `<div class="wk-row"><div class="wk-label">${label} <b>${ids.length}</b></div><div>${nameList(ids)}</div>${note ? `<p class="muted">${note}</p>` : ''}</div>`;
    return `<h3>Weekly report</h3>
      ${row('Durable — recalled on your own', cls.durable)}
      ${row('Familiar — recognised, not yet produced', cls.familiar, 'You know these when you see them; production comes next.')}
      ${row('Context-limited — alone yes, in a sentence not yet', cls.contextLimited)}
      ${row('Slipping — known before, missed now', cls.deteriorated, 'These come back sooner in your schedule.')}
      ${row('Needs practice', cls.needsPractice)}
      ${Object.keys(r.milestones).length ? `<h3>Real-life checks</h3>${Object.entries(r.milestones).map(([id, m]) => `<p>${esc((C.milestoneById[id] || {}).name || id)}: ${m.ok}/${m.of} ${m.ok === m.of ? '✓ passed' : ''}</p>`).join('')}` : ''}
      <h3>Plan for next week</h3><p>${r.focus.length ? 'Focus on: ' + nameList(r.focus) + '. They are prioritised automatically in your mornings and evenings; Recall lets you drill them now.' : 'Keep going — nothing urgent.'}</p>
      ${r.untested.length ? `<p class="muted">Not tested this time (time ran out): ${r.untested.length} items — they are first in line next week.</p>` : ''}`;
  }

  /* ============================================================
     RECALL setup
     ============================================================ */
  function renderRecallSetup() {
    const u = V.ui;
    u.focus = u.focus || 'weak'; u.direction = u.direction || 'mixed';
    const topics = C.topics.filter(t => (C.byTopic[t.id] || []).some(i => E.state.memory[i.id]));
    const dirs = [['mixed', 'Mixed'], ['meaning', 'Japanese → meaning'], ['produce', 'Meaning → Japanese'], ['kanji', 'Kanji → reading'], ['spelling', 'Reading → kanji'], ['listen', 'Listening'], ['intent', 'Say what you mean'], ['context', 'In context'], ['conjugation', 'Conjugation'], ['explain', 'Explain it simply']];
    return `${topbar('Recall', 'home')}
      <p class="lead">Independent practice of what you find hard. It is recorded separately and <b>never changes</b> your review schedule or mastery.</p>
      <h3>What to focus on</h3><div class="chip-row wrap">
        ${[['weak', 'Weakest first'], ['mixed', 'Everything mixed']].map(([k, l]) => `<button type="button" class="chip ${u.focus === k && !u.topic ? 'on' : ''}" data-action="rc-focus" data-v="${k}">${l}</button>`).join('')}
        ${topics.map(t => `<button type="button" class="chip ${u.topic === t.id ? 'on' : ''}" data-action="rc-topic" data-v="${t.id}">${esc(t.icon || '')} ${esc(t.name)}</button>`).join('')}</div>
      <h3>Direction</h3><div class="chip-row wrap">${dirs.map(([k, l]) => `<button type="button" class="chip ${u.direction === k ? 'on' : ''}" data-action="rc-dir" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="row">${btn('Start', 'rc-start', 'primary', 'data-autofocus')}</div>`;
  }

  /* ============================================================
     TRAIN hub
     ============================================================ */
  function renderTrain() {
    const t = E.state.train, any = Object.keys(E.state.memory).length > 0;
    const tile = (act, dir, title, desc) => `<button type="button" class="act" data-action="train" data-activity="${act}" data-direction="${dir}" ${any ? '' : 'aria-disabled="true"'}><span class="act-head"><span class="act-title">${title}</span></span><span class="act-sub">${desc}</span></button>`;
    return `${topbar('Training', null, settingsBtn())}
      <p class="lead">Open-ended practice with words you have already met. Pause or switch any time. Like Recall, it never changes your schedule.</p>
      ${any ? '' : '<div class="banner">Training opens after your first morning lesson.</div>'}
      <div class="act-grid">
        ${tile('mixed', 'mixed', 'Mixed practice', 'Adapts to you; rotates reading, listening, typing, speaking, sentences.')}
        ${tile('recovery', 'mixed', 'Get unstuck', 'When a word won’t come: describe it, ask, check — graduated hints.')}
        ${tile('mixed', 'produce', 'Rapid recall', 'Meaning → Japanese. Aim to beat your own usual time.')}
        ${tile('mixed', 'conjugation', 'Conjugation', 'Forms of the verbs and adjectives you know.')}
        ${tile('mixed', 'listen', 'Listening', 'Hear it, understand it.')}
        ${tile('mixed', 'context', 'Sentences', 'Build and complete real sentences.')}
        ${tile('span', 'mixed', 'Memory span', 'Hold a growing sequence of Japanese words.')}
        ${tile('switch', 'mixed', 'Category switch', 'Alternate categories fast: a food, a place…')}
        ${tile('reconstruct', 'mixed', 'Rebuild later', 'Study a sentence, do something else, rebuild it.')}
      </div>
      <div class="row">${btn('Pattern library', 'go', 'ghost', 'data-view="patterns"')}</div>
      <p class="muted">Best memory span ${t.spanBest || 0} · get-unstuck: ${t.recoveryWins}/${t.recoveryTries} understood (self-rated). Game scores show practice on these tasks, not general intelligence.</p>`;
  }
  function renderPatterns() {
    const seen = new Set(E.state.lesson.patternsSeen || []);
    return `${topbar('Sentence patterns', 'go-train')}<p class="lead">Patterns are introduced in morning lessons; ones you have met are marked ✓.</p>
      ${C.grammar.filter(p => !p.altOnly).map(p => `<div class="prompt"><div class="big-jp small" lang="ja">${esc(p.frame)} ${seen.has(p.id) ? '✓' : ''}</div><div class="meaning">${esc(p.en.replace(/\{(\w+)\}/g, '…'))}</div><p>${esc(p.explain)}</p>${p.sources.filter(s => s.type === 'usage').slice(0, 1).map(s => `<div class="ex"><span lang="ja">${esc(s.text)}</span> — <span class="muted">${esc(s.translation)}</span></div>`).join('')}<p class="src">${p.sources.map(srcLabel).join(' · ')}</p></div>`).join('')}`;
  }

  /* ============================================================
     CONJUGATION
     ============================================================ */
  const lemmaWord = jp => { const l = CONJ.lemmas[jp]; if (!l) return null; const it = C.items.find(i => i.jp === jp && (i.verb_class || i.adj_class)); return Object.assign({ jp }, l, it ? { verb_class: it.verb_class, adj_class: it.adj_class, id: it.id, en: it.en } : {}); };
  const formsOf = kind => CONJ.forms.filter(f => f.kind === kind && !f.hidden);
  function conjCell(w, f) {
    try { const r = CJ.conjugate(w, f); return r ? `<span lang="ja">${esc(r.jp)}</span>` : '—'; } catch (e) { return '—'; }
  }
  function renderConj() {
    const vg = CONJ.groups.filter(g => g.kind === 'verb'), ag = CONJ.groups.filter(g => g.kind === 'adj');
    const vw = vg.map(g => lemmaWord(g.table_lemma)), aw = [lemmaWord('高い'), lemmaWord('いい'), lemmaWord('静か')];
    const cats = CONJ.categories.filter(c => c.id !== 'adj');
    const table = (forms, words, heads) => `<div class="table-wrap" tabindex="0" role="region" aria-label="Conjugation table"><table class="conj"><thead><tr><th scope="col">Form</th>${heads.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>
      ${forms.map(f => `<tr><th scope="row"><button type="button" class="link" data-action="conj-form" data-id="${f.id}" data-kind="${f.kind}">${esc(f.name)}</button>${f.warning ? ' <span title="Use with care">⚠</span>' : ''}</th>${words.map(w => `<td>${conjCell(w, f.id)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    return `${topbar('Conjugation', null, settingsBtn())}
      <p class="lead">Tap a group for its rules and examples, or a form to learn what it means and when to use it. Every form shown is generated by one tested rule set.</p>
      <h3>Groups</h3><div class="chip-row wrap">${CONJ.groups.map(g => `<button type="button" class="chip" data-action="conj-group" data-id="${g.id}">${esc(g.name)} <small lang="ja">${esc(g.jp)}</small></button>`).join('')}</div>
      ${cats.map(c => `<h3>${esc(c.name)}</h3>${table(formsOf('verb').filter(f => f.cat === c.id), vw, vg.map(g => `${esc(g.name.replace(' verbs', ''))}<br><span lang="ja">${esc(g.table_lemma)}</span>`))}`).join('')}
      <h3>Adjectives</h3>${table(formsOf('adj'), aw, ['い-adj<br><span lang="ja">高い</span>', 'いい<br><span lang="ja">(よい)</span>', 'な-adj<br><span lang="ja">静か</span>'])}
      <div class="row">${btn('Practise conjugation', 'train', 'primary', 'data-activity="mixed" data-direction="conjugation"')}</div>
      <p class="src">Sources: ${Object.values(CONJ.sources).map(srcLabel).join(' · ')}</p>`;
  }
  function renderConjGroup() {
    const g = CONJ.groups.find(x => x.id === V.p.id);
    const forms = formsOf(g.kind).filter(f => f.core);
    const block = (lemmas, title, note) => {
      const ws = lemmas.map(lemmaWord).filter(Boolean);
      return `<div class="prompt"><div class="tag">${title}</div>${note ? `<p class="note">${esc(note)}</p>` : ''}<div class="table-wrap" tabindex="0"><table class="conj"><thead><tr><th>Form</th>${ws.map(w => `<th lang="ja">${esc(w.jp)}${w.en ? `<br><small>${esc(w.en)}</small>` : ''}</th>`).join('')}</tr></thead><tbody>
        ${forms.map(f => `<tr><th scope="row"><button type="button" class="link" data-action="conj-form" data-id="${f.id}" data-kind="${f.kind}">${esc(f.name)}</button></th>${ws.map(w => `<td>${conjCell(w, f.id)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
    };
    // Group 1 る-verbs from the curriculum that look like Group 2 (stem in い/え sound).
    let lookalikes = '';
    if (g.id === 'group1') {
      const lk = C.items.filter(i => i.verb_class === 'godan' && /る$/.test(i.kana) && /[いきしちにひみりぎじびぴえけせてねへめれげぜでべぺ]る$/.test(i.kana));
      if (lk.length) lookalikes = `<h3>Group 1 verbs in your curriculum that look like Group 2</h3><p>${lk.map(i => `<span class="chip static" lang="ja">${esc(i.jp)} → ${esc(CJ.conjugate(i, 'nai').jp)}</span>`).join(' ')}</p>`;
    }
    return `${topbar(g.name, 'go-conj')}<p class="lead"><span lang="ja">${esc(g.jp)}</span> — ${esc(g.summary)}</p><p>${esc(g.how)}</p>
      ${g.warning ? `<p class="note">⚠ ${esc(g.warning)}</p>` : ''}
      ${g.te_rules ? `<h3>て / た sound changes</h3><div class="table-wrap"><table class="conj"><thead><tr><th>Ending</th><th>て</th><th>た</th></tr></thead><tbody>${g.te_rules.map(r => `<tr><td lang="ja">${esc(r.endings)}</td><td lang="ja">${esc(r.te)}</td><td lang="ja">${esc(r.ta)}${r.note ? `<br><small>${esc(r.note)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <h3>By ending</h3>${g.patterns.map(p => block(p.lemmas, (p.kana ? p.kana + ' ' : '') + '(' + p.ending + ')', p.note)).join('')}
      ${g.exceptions.length ? `<h3>Exceptions</h3><ul class="plain">${g.exceptions.map(x => `<li><b lang="ja">${esc(x.lemma)}</b> — ${esc(x.note)}</li>`).join('')}</ul>` : ''}
      ${lookalikes}
      <p class="src">${g.sources.map(id => srcLabel(CONJ.sources[id])).join(' · ')}</p>`;
  }
  function renderConjForm() {
    const f = CONJ.forms.find(x => x.id === V.p.id && x.kind === V.p.kind);
    const exs = (f.examples || []).map(e => {
      const w = lemmaWord(e.v.lemma); let r = null;
      try { r = CJ.realize({ lemma: w, form: e.v.form, then: e.v.then }); } catch (er) { r = null; }
      if (!r) return '';
      const jp = e.jp.replace('{v}', r.jp);
      return `<div class="ex"><div lang="ja">${esc(jp)} ${audioOk() ? `<button type="button" class="link" data-action="say" data-say="${esc(jp)}">🔊</button>` : ''}</div><div class="muted">${esc(e.en)}</div><div class="src">Constructed example (reviewed against the cited reference)</div></div>`;
    }).join('');
    const groups = f.kind === 'verb' ? [['group1', 'Group 1'], ['group2', 'Group 2'], ['irregular', 'Irregular']] : [['i', 'い-adjectives'], ['na', 'な-adjectives']];
    const contrast = (f.contrast || []).map(id => CONJ.forms.find(x => x.id === id && x.kind === f.kind)).filter(Boolean);
    const alt = [f.polite_alt && ['Polite version', f.polite_alt], f.casual_alt && ['Casual version', f.casual_alt]].filter(Boolean);
    return `${topbar(f.name, 'go-conj')}
      <p class="lead"><span lang="ja">${esc(f.label)}</span> · <i>${esc(f.register)}</i></p>
      ${f.warning ? `<div class="banner warn">⚠ ${esc(f.warning)}</div>` : ''}
      <h3>What it says</h3><p>${esc(f.means)}</p>
      ${f.use ? `<h3>When to use it</h3><p>${esc(f.use)}</p>` : ''}
      <h3>How to make it</h3><ul class="plain">${groups.filter(([k]) => f.build[k]).map(([k, l]) => `<li><b>${l}:</b> <span lang="ja">${esc(f.build[k])}</span></li>`).join('')}</ul>
      ${exs ? `<h3>Examples</h3>${exs}` : ''}
      ${(f.mistakes || []).length ? `<h3>Common mistakes</h3><ul class="plain">${f.mistakes.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
      ${alt.length ? `<h3>Register</h3><p>${alt.map(([l, id]) => { const x = CONJ.forms.find(y => y.id === id && y.kind === f.kind); return x ? `${l}: <button type="button" class="link" data-action="conj-form" data-id="${x.id}" data-kind="${x.kind}">${esc(x.name)}</button>` : ''; }).join(' · ')}</p>` : ''}
      ${contrast.length ? `<h3>Compare with</h3><div class="chip-row wrap">${contrast.map(x => `<button type="button" class="chip" data-action="conj-form" data-id="${x.id}" data-kind="${x.kind}">${esc(x.name)}</button>`).join('')}</div>` : ''}
      <p class="src">${(f.sources || []).map(id => srcLabel(CONJ.sources[id])).join(' · ')}</p>`;
  }


  /* ============================================================
     KANJI — radicals page with its own daily lesson
     ============================================================ */
  const POS_EN = { 'へん': 'left side', 'つくり': 'right side', 'かんむり': 'top', 'あし': 'bottom', 'たれ': 'top-left', 'にょう': 'bottom-left wrap', 'かまえ': 'enclosure' };
  const posText = p => p ? p.split(/[,、]\s*/).map(x => x + (POS_EN[x] ? ' (' + POS_EN[x] + ')' : '')).join(', ') : '';
  const kunText = k => { const [a, b] = k.replace(/^-|-$/g, '').split('.'); return b ? a + '(' + b + ')' : a; };
  const typeBadge = s => s.type === 'on' ? '<span class="rt on">音 on</span>' : s.type === 'kun' ? '<span class="rt kun">訓 kun</span>' : '<span class="rt sp">special</span>';
  function hl(word, ch) { return esc(word).split(esc(ch)).join(`<mark>${esc(ch)}</mark>`); }
  function sampleRow(s, ch) {
    const how = s.type === 'special' ? 'whole-word reading' : `${esc(ch)} = <b lang="ja">${esc(s.reading)}</b>`;
    return `<li class="ksample"><span class="kw" lang="ja">${hl(s.jp, ch)}</span> <span class="muted" lang="ja">${esc(s.kana)}</span> ${typeBadge(s)}${s.met ? ' <span class="pill done" title="met in your lessons">★ met</span>' : ''}
      <div class="ksub">${how} · ${esc(s.en)}${s.ext ? ' <span class="src">(example: Kanji alive)</span>' : ''} ${audioOk() ? `<button type="button" class="link" data-action="say" data-say="${esc(s.jp)}" aria-label="Play">🔊</button>` : ''}</div></li>`;
  }
  function kanjiBlock(ch, max) {
    const k = KDATA.kanji[ch]; if (!k) return '';
    const sm = KJ.samplesFor(E.KI, ch, E.state).slice(0, max || 6);
    const on = sm.filter(x => x.type === 'on').length, kun = sm.filter(x => x.type === 'kun').length;
    return `<div class="kblock"><div class="kbig" lang="ja">${esc(ch)}</div><div class="kinfo">
      <div><span class="rt on">音</span> <span lang="ja">${k.on.map(esc).join('・') || '—'}</span></div>
      <div><span class="rt kun">訓</span> <span lang="ja">${k.kun.map(x => esc(kunText(x))).join('・') || '—'}</span></div>
      <div class="muted">${esc(k.meanings.slice(0, 3).join(', '))}${k.jlpt ? ' · JLPT N' + k.jlpt : ''}</div></div>
      <ul class="plain ksamples">${sm.map(x => sampleRow(x, ch)).join('')}</ul>
      ${on + kun ? `<p class="muted small">In these words: ${on} on-yomi · ${kun} kun-yomi.</p>` : ''}</div>`;
  }
  function radicalHead(r) {
    const vars = r.variants.filter(v => v.form || v.name);
    return `<div class="rhead"><div class="rbig" lang="ja">${esc(r.form)}</div><div>
      <div class="meaning">${esc(r.meaning)}</div>
      <div lang="ja"><b>${esc(r.name || '')}</b> <span class="muted">${esc(r.nameRomaji || '')}${r.position ? ' · ' + esc(posText(r.position)) : ''}</span></div>
      ${vars.map(v => `<div class="rvar"><span class="rvform" lang="ja">${esc(v.form || '·')}</span> <b lang="ja">${esc(v.name || '')}</b> <span class="muted">${esc(v.nameRomaji || '')}${v.position ? ' · ' + esc(posText(v.position)) : ''}</span></div>`).join('')}
      ${r.readings ? `<div class="muted">As a kanji: 音 <span lang="ja">${r.readings.on.map(esc).join('・') || '—'}</span> · 訓 <span lang="ja">${r.readings.kun.map(x => esc(kunText(x))).join('・') || '—'}</span></div>` : ''}
      <div class="muted small">Radical no. ${r.num} · files ${r.members.length} kanji you will meet</div></div></div>`;
  }
  function ruleCard(open) {
    const R = KDATA.rule;
    return `<details class="rule" ${open ? 'open' : ''}><summary>How is a kanji read? (音読み / 訓読み)</summary><ul class="plain">
      <li><span class="rt on">音 on</span> ${esc(R.on)}</li><li><span class="rt kun">訓 kun</span> ${esc(R.kun)}</li><li>${esc(R.changes)}</li><li><span class="rt sp">special</span> ${esc(R.special)}</li></ul>
      <p class="src">${srcLabel(KDATA.sources.rule)}</p></details>`;
  }
  function renderKanji() {
    if (!KDATA || !E.kanji.ready()) return `${topbar('Kanji', null, settingsBtn())}<p class="banner warn">Kanji data could not be loaded.</p>`;
    const pr = E.kanji.progress();
    const ks = E.state.kanji;
    const resum = E.kanji.session && !E.kanji.session.finished;
    const next = E.KI.radicals.filter(r => !ks.memory['r:' + r.num]).slice(0, 3);
    const learned = r => ks.memory['r:' + r.num];
    const lessonSub = pr.doneToday ? `Done for today${pr.due ? ' · ' + pr.due + ' review' + (pr.due > 1 ? 's' : '') + ' still due — you can do another round' : ''}.`
      : `~${E.state.settings.minutes.kanji} min · ${pr.due ? pr.due + ' review' + (pr.due > 1 ? 's' : '') + ' · ' : ''}${next.length ? 'next: ' + next.map(r => `<span lang="ja">${esc(r.form)}</span> ${esc(r.name)}`).join(', ') : 'all radicals introduced'}`;
    return `${topbar('Kanji 字', null, settingsBtn())}
      <p class="lead">Radicals (部首) are the building blocks kanji are sorted by. Learning them — and how each kanji is read — makes new kanji far less random. This page has its own daily lesson; it never changes your vocabulary schedule.</p>
      ${resum ? `<div class="banner">Unfinished radical lesson. ${btn('Resume', 'k-resume', 'primary small')}</div>` : ''}
      <button type="button" class="act big kanji ${pr.doneToday ? 'done' : 'rec'}" data-action="k-start"><span class="act-head"><span class="act-title">Today’s radicals</span>${pr.doneToday ? '<span class="pill done">✓ Done today</span>' : '<span class="pill rec">Daily lesson</span>'}</span><span class="act-sub">${lessonSub}</span></button>
      <div class="stat-grid three"><div class="stat"><b>${pr.introduced}/${pr.total}</b><span>radicals met</span></div><div class="stat"><b>${pr.strong}</b><span>recalled on your own</span></div><div class="stat"><b>${pr.kanjiSeen}</b><span>kanji practised</span></div></div>
      ${ruleCard(false)}
      <h3>All radicals (in teaching order)</h3>
      <div class="rgrid">${E.KI.radicals.map(r => `<button type="button" class="rcell ${learned(r) ? 'learned' : ''}" data-action="radical" data-num="${r.num}" aria-label="${esc(r.form)} ${esc(r.name)}: ${esc(r.meaning)}"><span class="rf" lang="ja">${esc(r.form)}</span><span class="rn" lang="ja">${esc(r.name)}</span>${learned(r) ? '<span class="rl">✓</span>' : ''}</button>`).join('')}</div>
      <p class="src">Data: ${[KDATA.sources.kanjidic, KDATA.sources.radicals, KDATA.sources.examples].map(srcLabel).join(' · ')}</p>`;
  }
  function renderRadical() {
    const r = E.KI.byNum[V.p.num]; if (!r) return '<p>Unknown radical.</p>';
    const mem = KJ.membersFor(E.KI, r, E.state);
    return `${topbar(r.form + ' ' + r.name, 'go-kanji')}${radicalHead(r)}${ruleCard(false)}
      <h3>Kanji with this radical (${mem.length})</h3><p class="muted">Words you have met in lessons come first (★).</p>
      ${mem.map(ch => kanjiBlock(ch, 6)).join('')}`;
  }
  /* lesson runner */
  function renderKSession() {
    const s = E.kanji.session, c = E.kanji.current();
    if (!s) return '<p>No lesson running.</p>';
    if (!c) { kFinish(); return renderKSummary(); }
    const u = V.ui;
    const prog = `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${s.queue.length}" aria-valuenow="${s.i}"><div style="width:${pct(s.i, s.queue.length)}%"></div></div>`;
    const note = { review: 'Review', delayed: 'From earlier in this lesson', retry: 'Another go' }[c.phase];
    return `${topbar('Today’s radicals', 'k-end', '<button type="button" class="icon-btn" data-action="k-end">Finish later</button>')}${prog}${note ? `<p class="phase">${note}</p>` : ''}<section class="card-stage">${kCard(c, u)}</section>`;
  }
  function kCard(c, u) {
    const r = c.rad ? E.KI.byNum[c.rad] : null;
    if (c.ex === 'kteach') {
      const mem = KJ.membersFor(E.KI, r, E.state);
      return `<div class="prompt teach"><div class="tag">New radical</div>${radicalHead(r)}</div>${ruleCard(!E.state.kanji.sessions.length)}
        <h3>Kanji with ${esc(r.form)}</h3>${mem.slice(0, 4).map(ch => kanjiBlock(ch, 3)).join('')}${mem.length > 4 ? `<p class="muted">+ ${mem.length - 4} more on the radical’s page.</p>` : ''}
        <div class="row">${btn('Got it →', 'k-ack', 'primary', 'data-autofocus')}</div>`;
    }
    let q;
    if (c.ex === 'rmeaning') q = `<p class="q">What does this radical mean?</p><div class="rbig" lang="ja">${esc(KJ.radLabel(r))}</div>`;
    else if (c.ex === 'rname') q = `<p class="q">What is this radical called?</p><div class="rbig" lang="ja">${esc(c.glyph)}</div>`;
    else if (c.ex === 'rspot') q = `<p class="q">Which kanji is filed under this radical?</p><div class="rbig" lang="ja">${esc(KJ.radLabel(r))}</div><p class="muted" lang="ja">${esc(r.name)} — ${esc(r.meaning)}</p>`;
    else if (c.ex === 'kread') q = `<p class="q">How is <b lang="ja">${esc(c.ch)}</b> read in this word?</p><div class="big-jp" lang="ja">${hl(c.word, c.ch)}</div><p class="muted">${esc(c.en)}</p>`;
    else q = `<p class="q">In this word, is <b lang="ja">${esc(c.ch)}</b> read with 音読み or 訓読み?</p><div class="big-jp" lang="ja">${hl(c.word, c.ch)}</div><p lang="ja">${esc(c.kana)} <span class="muted">(${esc(c.ch)} = ${esc(c.reading)})</span></p><p class="muted">${esc(c.en)}</p>`;
    const res = u.res;
    const opts = c.options.map((o, k) => `<button type="button" class="choice ${res ? (k === c.correct ? 'correct' : k === u.pick ? 'incorrect' : '') : ''}" data-action="k-choose" data-k="${k}" ${res ? 'disabled' : ''} lang="ja">${esc(o)}</button>`).join('');
    let fb = '';
    if (res) {
      const ok = res.verdict === 'correct';
      let why = '';
      if (c.ex === 'kread') why = `<p lang="ja">${esc(c.word)} = ${esc(c.kana)}. ${c.type === 'on' ? 'Here it uses the 音読み (on) — typical in compounds.' : c.type === 'kun' ? 'Here it uses the 訓読み (kun) — typical when the kanji stands alone or has okurigana.' : ''}</p>`;
      if (c.ex === 'krule') why = `<p>${c.type === 'on' ? '音読み: ' + esc(KDATA.rule.on) : '訓読み: ' + esc(KDATA.rule.kun)}</p>`;
      if (c.ex === 'rspot' || c.ex === 'rmeaning' || c.ex === 'rname') why = `<p lang="ja">${esc(r.form)} ${esc(r.name)} — ${esc(r.meaning)}. Kanji: ${r.members.slice(0, 8).map(esc).join(' ')}</p>`;
      fb = `<div class="feedback ${ok ? 'good' : 'bad'}" role="status"><div class="fb-head">${ok ? '✓ Correct' : '✗ Not quite'}</div>${why}
        <div class="row">${c.word && audioOk() ? audioBtn(c.word) : ''}${btn('Continue →', 'k-next', 'primary', 'data-autofocus')}</div></div>`;
    }
    return `<div class="prompt">${q}</div><div class="choices">${opts}${res ? '' : '<button type="button" class="choice dk" data-action="k-dontknow">I don’t know</button>'}</div>${fb}`;
  }
  function kFinish() { const sum = E.kanji.finish(); V.view = 'ksummary'; V.p = { sum }; V.ui = {}; }
  function renderKSummary() {
    const sum = V.p.sum || (E.kanji.session && E.kanji.session.summary);
    if (!sum) return '';
    const rads = sum.newRadicals.map(n => E.KI.byNum[n]).filter(Boolean);
    const pr = E.kanji.progress();
    return `${topbar('Radicals — done')}<section class="summary">
      <div class="stat-row"><div><b>${sum.answered}</b><span>answered</span></div><div><b>${sum.answered ? pct(sum.correct, sum.answered) + '%' : '—'}</b><span>correct</span></div><div><b>${pr.introduced}/${pr.total}</b><span>radicals met</span></div></div>
      ${rads.length ? `<h3>New today</h3><div class="rgrid">${rads.map(r => `<button type="button" class="rcell learned" data-action="radical" data-num="${r.num}"><span class="rf" lang="ja">${esc(r.form)}</span><span class="rn" lang="ja">${esc(r.name)}</span></button>`).join('')}</div>` : ''}
      <p class="muted">Radicals you missed come back sooner; the ones you knew come back later. Your vocabulary schedule is unchanged.</p></section>
      <div class="row">${btn('Back to Kanji', 'go', 'primary', 'data-view="kanji" data-autofocus')}${btn('Today', 'go', 'ghost', 'data-view="home"')}</div>`;
  }

  /* ============================================================
     PROGRESS
     ============================================================ */
  // One-series line chart (small multiple). Hover/tap shows the value;
  // a table view is available below each group of charts.
  function lineChart(points, opts) {
    const W = 300, H = 90, pl = 30, pr = 8, pt = 10, pb = 20;
    const vals = points.map(p => p.v).filter(v => v != null);
    if (!vals.length) return `<div class="chart empty">No data yet</div>`;
    const max = opts.max != null ? opts.max : Math.max(...vals) * 1.15 || 1, min = opts.min != null ? opts.min : 0;
    const x = k => pl + (points.length === 1 ? (W - pl - pr) / 2 : k * (W - pl - pr) / (points.length - 1));
    const y = v => pt + (H - pt - pb) * (1 - (v - min) / (max - min || 1));
    let d = '', started = false;
    points.forEach((p, k) => { if (p.v == null) { started = false; return; } d += (started ? 'L' : 'M') + x(k).toFixed(1) + ' ' + y(p.v).toFixed(1); started = true; });
    const fmt = opts.fmt || (v => v);
    const grid = [min, (min + max) / 2, max].map(g => `<line x1="${pl}" x2="${W - pr}" y1="${y(g)}" y2="${y(g)}" class="grid"/><text x="${pl - 4}" y="${y(g) + 3}" class="axis" text-anchor="end">${esc(fmt(g))}</text>`).join('');
    const notes = (opts.notes || []).map(n => { const k = points.findIndex(p => p.key === n.week); return k < 0 ? '' : `<line x1="${x(k)}" x2="${x(k)}" y1="${pt}" y2="${H - pb}" class="annot"><title>${esc(n.text)}</title></line>`; }).join('');
    const dots = points.map((p, k) => p.v == null ? '' : `<g class="pt" tabindex="0" data-tip="${esc(p.label + ': ' + fmt(p.v) + (p.n != null ? ' (n=' + p.n + ')' : ''))}"><circle cx="${x(k)}" cy="${y(p.v)}" r="12" class="hit"/><circle cx="${x(k)}" cy="${y(p.v)}" r="4" class="dot"/><title>${esc(p.label + ': ' + fmt(p.v) + (p.n != null ? ' (n=' + p.n + ')' : ''))}</title></g>`).join('');
    const xl = [0, points.length - 1].map(k => `<text x="${x(k)}" y="${H - 5}" class="axis" text-anchor="${k ? 'end' : 'start'}">${esc(points[k].label)}</text>`).join('');
    return `<figure class="chart"><figcaption>${esc(opts.title)}</figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title)}">${grid}${notes}<path d="${d}" class="line"/>${dots}${xl}</svg></figure>`;
  }
  function renderProgress() {
    const ctx = E.ctx(), st = E.state, date = ctx.date;
    const cls = PR.classify(C, st, date);
    const WEEKS = 8;
    const ser = PR.skillSeries(st, WEEKS, date);
    const notes = PR.annotations(C, st);
    const label = w => { const p = w.split('-'); return +p[2] + '/' + +p[1]; };
    const skillCharts = Object.keys(CUR.SKILLS).filter(sk => ser.series[sk]).map(sk => {
      const pts = ser.weeks.map(w => { const b = ser.series[sk][w]; return { key: w, label: label(w), v: b.n >= 3 ? b.unaided / b.n : null, n: b.n }; });
      return lineChart(pts, { title: CUR.SKILLS[sk].name + ' — unaided correct', min: 0, max: 1, fmt: v => Math.round(v * 100) + '%', notes });
    }).join('');
    const ret = ser.weeks.map(w => { let n = 0, ok = 0; for (const sk of Object.keys(ser.series)) { n += ser.series[sk][w].delayedN; ok += ser.series[sk][w].delayedOk; } return { key: w, label: label(w), v: n >= 3 ? ok / n : null, n }; });
    const ctxS = ser.weeks.map(w => { let n = 0, ok = 0; for (const sk of Object.keys(ser.series)) { n += ser.series[sk][w].ctxN; ok += ser.series[sk][w].ctxOk; } return { key: w, label: label(w), v: n >= 3 ? ok / n : null, n }; });
    const speed = PR.speedSeries(st, WEEKS, date).map(p => ({ key: p.week, label: label(p.week), v: p.n >= 3 ? p.median / 1000 : null, n: p.n }));
    const ms = PR.milestones(C, st);
    const trouble = PR.troublesome(C, st, 10);
    const pracWeek = PR.practiceSummary(st, CAL.addDays(date, -7));
    const totalIntro = Object.keys(st.memory).filter(id => C.byId[id]).length;
    const firstWeek = PR.totals(st.daily, null);
    const calib = PR.calibration(st);
    const weeklies = Object.entries(st.weekly).sort().reverse().slice(0, 4);
    const av = E.availability();
    const recText = { morning: 'Do today’s Daily Morning lesson.', evening: 'Do the Daily Evening to lock in this morning’s words.', weekly: 'Take the weekly assessment.', recall: 'Try Recall on your weakest words.' }[av.recommended] || 'You’re up to date.';
    const statBox = (n, l, sub) => `<div class="stat"><b>${n}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
    return `${topbar('Progress', null, settingsBtn())}
      <div class="banner">Next: ${esc(recText)}</div>
      <h3>Where your words stand</h3>
      <div class="stat-grid">
        ${statBox(cls.durable.length, 'durable', 'likely recalled a month from now')}
        ${statBox(cls.independent.length, 'recalled on your own', 'latest check unaided')}
        ${statBox(cls.familiar.length, 'familiar', 'recognised, not yet produced')}
        ${statBox(cls.deteriorated.length, 'slipping', 'known before, missed lately')}
        ${statBox(cls.learning.length, 'still learning', '')}
        ${statBox(totalIntro + ' / ' + C.items.filter(i => i.lesson).length, 'met so far', 'of the verified curriculum')}
      </div>
      <p class="muted">“Recalled on your own” and “durable” require producing the word (typing or saying it), not recognising it. There is no overall fluency score — skills are shown separately.</p>
      <h3>What you can do now</h3>
      ${ms.length ? `<ul class="plain milestones">${ms.map(m => `<li class="${m.passed ? 'passed' : ''}">${m.passed ? '✅' : m.assessable && m.introduced === m.needs ? '🎯' : '⬜'} <b>${esc(m.name)}</b> — ${m.passed ? 'passed ' + esc(fmtDate(m.passed)) : m.introduced < m.needs ? `${m.introduced}/${m.needs} words met` : m.lastScore ? 'last try ' + esc(m.lastScore) + ' — tested again in the weekly' : 'ready to be tested in the next weekly'}<br><small class="muted">${esc(m.desc || '')}</small></li>`).join('')}</ul><p class="muted">A milestone is only marked when you pass its real-life check in a weekly assessment — not for viewing lessons.</p>` : '<p class="muted">No milestones loaded.</p>'}
      <h3>Skills over the last ${WEEKS} weeks</h3>
      <p class="muted">Share of scheduled checks answered correctly without help (practice excluded). Vertical marks = new topics or curriculum changes: harder new material can lower accuracy without any loss of skill.</p>
      <div class="charts">${skillCharts || '<p class="muted">Charts appear after a few sessions.</p>'}</div>
      <h3>Remembering after a delay</h3>
      <div class="charts">${lineChart(ret, { title: 'Correct when tested ≥1 day later', min: 0, max: 1, fmt: v => Math.round(v * 100) + '%', notes })}${lineChart(ctxS, { title: 'Using words in new sentences', min: 0, max: 1, fmt: v => Math.round(v * 100) + '%', notes })}${lineChart(speed, { title: 'Typing a word from its meaning (median seconds, lower = faster)', min: 0, fmt: v => v.toFixed(1) + 's', notes })}</div>
      <details><summary>Table view</summary><div class="table-wrap"><table class="conj"><thead><tr><th>Week</th>${Object.keys(ser.series).map(sk => `<th>${esc(CUR.SKILLS[sk] ? CUR.SKILLS[sk].name : sk)}</th>`).join('')}<th>Delayed</th></tr></thead><tbody>${ser.weeks.map((w, k) => `<tr><th>${esc(w)}</th>${Object.keys(ser.series).map(sk => { const b = ser.series[sk][w]; return `<td>${b.n ? pct(b.unaided, b.n) + '% (' + b.n + ')' : '—'}</td>`; }).join('')}<td>${ret[k].n ? pct(ret[k].v * ret[k].n, ret[k].n) + '% (' + ret[k].n + ')' : '—'}</td></tr>`).join('')}</tbody></table></div></details>
      <h3>Words you keep forgetting</h3>
      ${trouble.length ? `<p>${trouble.map(t => `<span class="chip static" lang="ja" title="${esc(item(t.id).en)}">${esc(item(t.id).jp)} ×${t.lapses}</span>`).join(' ')}</p><div class="row">${btn('Practise these in Recall', 'start-recall-weak', 'ghost')}</div>` : '<p class="muted">None yet.</p>'}
      ${weeklies.length ? `<h3>Weekly assessments</h3>${weeklies.map(([k, r]) => `<details><summary>${esc(fmtDate(k))} — ${r.tested} words tested · durable ${r.classes.durable.length} · needs practice ${r.classes.needsPractice.length + r.classes.deteriorated.length}</summary>${weeklyReportHTML(r)}</details>`).join('')}` : ''}
      <h3>Independent practice (last 7 days)</h3><p class="muted">${pracWeek.sessions} Recall/Training sessions · ${pracWeek.attempts} answers. Shown separately: practice never counts as scheduled progress.</p>
      <h3>Get unstuck</h3><p class="muted">${E.state.train.recoveryWins} of ${E.state.train.recoveryTries} descriptions self-rated as understood.</p>
      <details><summary>Calibration (for tuning the scheduler)</summary><p class="muted">Predicted chance of recall vs what actually happened on scheduled checks. If actual is far below predicted, the scheduler is too optimistic.</p><table class="conj"><thead><tr><th>Predicted</th><th>Actual</th><th>n</th></tr></thead><tbody>${calib.map(b => `<tr><td>${Math.round(b.a * 100)}–${Math.min(100, Math.round(b.b * 100))}%</td><td>${b.n ? pct(b.ok, b.n) + '%' : '—'}</td><td>${b.n}</td></tr>`).join('')}</tbody></table><p class="muted">${firstWeek.n} scheduled answers recorded in total.</p></details>`;
  }

  /* ============================================================
     WORDS (library)
     ============================================================ */
  function renderWords() {
    const t = V.p.topic || 'all';
    const list = C.items.filter(i => t === 'all' || i.topic === t);
    const status = it => { const m = E.state.memory[it.id]; if (!m) return '<span class="muted">not yet</span>'; const p = m.skills[CUR.primarySkill(it)]; if (!p) return 'met'; const R = SRS.recallProb(p, E.today()); return p.streak > 0 ? `<span title="estimated recall now">${Math.round(R * 100)}%</span>` : 'learning'; };
    return `${topbar('Words', null, settingsBtn())}
      <div class="chip-row scroll">${[['all', 'All']].concat(C.topics.map(x => [x.id, (x.icon || '') + ' ' + x.name])).map(([id, l]) => `<button type="button" class="chip ${t === id ? 'on' : ''}" data-action="words-topic" data-v="${id}">${esc(l)}</button>`).join('')}</div>
      <p class="muted">${list.length} verified items. Every item lists its sources.</p>
      <ul class="word-list">${list.map(it => `<li><button type="button" class="word-row" data-action="word" data-id="${esc(it.id)}"><span class="w-jp" lang="ja">${esc(it.jp)}</span><span class="w-info"><span lang="ja">${esc(it.kana)}</span>${romaji(it)}<br>${esc(it.en)}</span><span class="w-stat">${status(it)}</span></button></li>`).join('')}</ul>`;
  }
  function renderWord() {
    const it = item(V.p.id); if (!it) return '<p>Unknown item.</p>';
    const m = E.state.memory[it.id];
    const skills = it.skills.map(sk => { const s = m && m.skills[sk]; return `<tr><td>${esc(CUR.SKILLS[sk].name)}</td><td>${s ? Math.round(SRS.recallProb(s, E.today()) * 100) + '%' : '—'}</td><td>${s ? esc(fmtDate(s.due)) : '—'}</td><td>${s ? s.lapses || 0 : '—'}</td></tr>`; }).join('');
    const prac = E.state.practice.items[it.id];
    return `${topbar(it.en, 'go-words')}${teachCard(it).replace(/<div class="row">.*<\/div>$/s, '')}
      <h3>Your record</h3><div class="table-wrap"><table class="conj"><thead><tr><th>Skill</th><th>Recall now</th><th>Next check</th><th>Lapses</th></tr></thead><tbody>${skills}</tbody></table></div>
      ${prac ? `<p class="muted">Independent practice: ${Object.values(prac).reduce((t, s) => t + s.n, 0)} answers (not part of the schedule).</p>` : ''}
      <h3>Sources</h3><ul class="plain src">${it.sources.map(s => `<li>${srcLabel(s)}${s.matched ? ' — ' + esc(s.matched) : ''}${s.checked ? ' · checked ' + esc(s.checked) : ''}</li>`).join('')}</ul>`;
  }

  /* ============================================================
     SETTINGS
     ============================================================ */
  function prioEditor() {
    const sel = (E.state.settings.topicPriorities || []).filter(id => C.topicById[id]);
    const MAX = window.MichiPolicy.topicPriority.max;
    const full = sel.length >= MAX;
    const t = id => C.topicById[id];
    const list = sel.length ? `<ol class="prio-list" aria-labelledby="prio-h">${sel.map((id, k) => `<li><span class="prio-name"><b>${k + 1}.</b> ${esc(t(id).icon || '')} ${esc(t(id).name)}</span><span class="prio-btns">
        <button type="button" class="icon-btn boxed" data-action="prio-up" data-id="${id}" aria-label="Move ${esc(t(id).name)} up" ${k === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="icon-btn boxed" data-action="prio-down" data-id="${id}" aria-label="Move ${esc(t(id).name)} down" ${k === sel.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="icon-btn boxed" data-action="prio-remove" data-id="${id}" aria-label="Remove ${esc(t(id).name)}">✕</button></span></li>`).join('')}</ol>`
      : '<p class="hint">No priorities set — lessons follow the normal topic order.</p>';
    const add = C.topics.filter(x => !sel.includes(x.id)).map(x => `<button type="button" class="chip" data-action="prio-add" data-id="${x.id}" ${full ? 'aria-disabled="true"' : ''}>+ ${esc(x.icon || '')} ${esc(x.name)}</button>`).join('');
    return `${list}<p class="muted" aria-live="polite">${full ? `${MAX} topics chosen — remove one to choose another.` : `Add a topic (${sel.length}/${MAX}):`}</p><div class="chip-row wrap">${add}</div>`;
  }
  function renderSettings() {
    const s = E.state.settings;
    const voices = SP.listJapanese();
    const chosen = SP.choose(s.voiceURI);
    const zones = ['auto', 'Asia/Tokyo', 'Europe/Paris', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney'];
    if (s.timeZone && !zones.includes(s.timeZone)) zones.push(s.timeZone);
    const vrow = v => `<li class="voice ${chosen && chosen.uri === v.uri ? 'on' : ''}"><div><b>${esc(v.name)}</b><br><small>${esc(v.lang)} · ${v.gender ? esc(v.gender) + ' · ' : ''}${v.local ? 'on this device (works offline)' : '⚠ online voice — needs internet'}${v.quality === 'high' ? ' · enhanced' : ''}</small></div>
      <div class="row">${btn('▶ Sample', 'voice-sample', 'ghost small', `data-uri="${esc(v.uri)}"`)}${chosen && chosen.uri === v.uri ? '<span class="pill done">Selected</span>' : btn('Use', 'voice-use', 'primary small', `data-uri="${esc(v.uri)}"`)}</div></li>`;
    const backup = localStorage.getItem('michi_v1_backup');
    return `${topbar('Settings', 'home')}
      <section class="settings">
      <h3>Voice</h3>
      ${voices.length ? `<ul class="plain voices">${voices.map(vrow).join('')}</ul>` : `<p class="note">No Japanese voice found on this device.</p>`}
      <label class="field">Speed <input type="range" min="0.6" max="1.2" step="0.05" value="${s.voiceRate || 1}" data-setting="voiceRate" aria-label="Speech speed"> <output>${(s.voiceRate || 1).toFixed(2)}×</output></label>
      <details><summary>How to get a better offline Japanese voice</summary>
        <ul class="plain"><li><b>iPhone/iPad:</b> Settings → Accessibility → Spoken Content → Voices → Japanese → download <i>Kyoko (Enhanced)</i> or <i>Otoya (Enhanced)</i>. Then reload Michi.</li>
        <li><b>Android:</b> Settings → System → Languages → Text-to-speech → Google speech services → Install voice data → Japanese. Then reload.</li>
        <li><b>Windows:</b> Settings → Time &amp; language → Speech → Add voices → Japanese (Haruka, Ayumi, Ichiro, Sayaka).</li>
        <li><b>Mac:</b> System Settings → Accessibility → Spoken Content → System voice → Manage voices → Japanese.</li></ul>
        <p class="muted">Michi only lists voices that really exist on this device and never uses an online voice automatically.</p></details>
      <h3 id="prio-h">Topic priorities</h3>
      <p class="muted">Choose up to 3 topics you need most. Morning lessons pick new words from these more often — other topics are still taught, and everything you’ve learned keeps being reviewed. Evening sessions never add new words.</p>
      ${prioEditor()}
      <h3>Time for each session</h3>
      ${['morning', 'evening', 'weekly', 'kanji'].map(k => `<label class="field">${k[0].toUpperCase() + k.slice(1)} <input type="number" inputmode="numeric" min="3" max="${k === 'weekly' ? 90 : 60}" value="${s.minutes[k] || window.MichiPolicy.availableMinutes[k]}" data-setting="minutes.${k}"> min</label>`).join('')}
      <p class="muted">Session length follows these; how much fits is worked out from how fast you actually answer.</p>
      <h3>Time zone (for “today” and the Sunday unlock)</h3>
      <select data-setting="timeZone" aria-label="Time zone">${zones.map(z => `<option value="${esc(z)}" ${s.timeZone === z ? 'selected' : ''}>${z === 'auto' ? 'Device (' + esc(CAL.deviceZone()) + ')' : esc(z)}</option>`).join('')}</select>
      <h3>Display</h3>
      <div class="chip-row">${['light', 'dark'].map(t => `<button type="button" class="chip ${s.theme === t ? 'on' : ''}" data-action="theme" data-v="${t}">${t}</button>`).join('')}<button type="button" class="chip ${s.showRomaji ? 'on' : ''}" data-action="toggle-romaji">rōmaji ${s.showRomaji ? 'on' : 'off'}</button></div>
      <h3>Typing diagnostics</h3><p class="muted">If typing answers doesn’t work on your phone, turn this on: a live log of what the keyboard does appears under the answer box. A screenshot of it shows exactly where it fails.</p>
      <div class="chip-row"><button type="button" class="chip ${s.typingDebug ? 'on' : ''}" data-action="toggle-kbd">Diagnostics ${s.typingDebug ? 'on' : 'off'}</button></div>
      <h3>Backup</h3><p class="muted">Progress lives only on this device.</p>
      <div class="row">${btn('Export backup', 'export', 'ghost')}<label class="btn ghost">Import backup<input id="imp" type="file" accept="application/json" hidden></label></div>
      ${backup ? `<p class="muted">A copy of your data from the old version is kept.</p><div class="row">${btn('Download old-version backup', 'export-v1', 'ghost')}${btn('Restore from old-version backup', 'restore-v1', 'ghost')}</div>` : ''}
      <h3>Content</h3><p class="muted">${C.items.length} verified items in ${C.topics.length} topics · ${C.grammar.length} patterns · curriculum ${esc(C.version)}. Every item is checked against a cited source; unverified material is never shown.${C.skipped.length ? ' ' + C.skipped.length + ' entries were rejected at load (see console).' : ''}</p>
      <h3>Reset</h3>${btn('Erase all progress', 'reset', 'danger')}
      </section>`;
  }

  /* ============================================================
     EVENTS
     ============================================================ */
  $app.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.getAttribute('aria-disabled') === 'true' && !['start', 'prio-add'].includes(el.dataset.action)) return;
    const d = el.dataset;
    switch (d.action) {
      case 'go': e.preventDefault(); go(d.view); break;
      case 'go-conj': go('conj'); break;
      case 'go-kanji': go('kanji'); break;
      case 'radical': go('radical', { num: +d.num }); break;
      case 'k-start': { const r = E.kanji.start(); if (r.error) { toast(r.error === 'all-done' ? 'All radicals introduced and nothing is due — come back tomorrow.' : 'Nothing to do right now.'); break; } go('ksession'); break; }
      case 'k-resume': go('ksession'); break;
      case 'k-ack': E.kanji.answer({}); E.kanji.next(); V.ui = {}; if (!E.kanji.current()) { kFinish(); } render(); window.scrollTo(0, 0); break;
      case 'k-choose': { if (V.ui.res) break; const out = E.kanji.answer({ index: +d.k }); V.ui.pick = +d.k; V.ui.res = out && out.result; render(); break; }
      case 'k-dontknow': { if (V.ui.res) break; const out = E.kanji.answer({ dontKnow: true }); V.ui.res = out && out.result; render(); break; }
      case 'k-next': E.kanji.next(); V.ui = {}; if (!E.kanji.current()) kFinish(); render(); window.scrollTo(0, 0); break;
      case 'k-end': { const s = E.kanji.session; if (s && !s.finished && s.i > 0 && !confirm('Finish now? Your answers are saved.')) break; if (s && !s.finished) kFinish(); else go('kanji'); render(); break; }
      case 'go-train': go('train'); break;
      case 'go-words': go('words', { topic: V.p.topic }); break;
      case 'home': go('home'); break;
      case 'start': {
        const a = E.availability()[d.kind];
        if (a && a.state === 'locked') { toast(d.kind === 'weekly' ? 'Opens ' + fmtDate(a.status.unlocks) : a.reason); break; }
        start(d.kind); break;
      }
      case 'resume': if (E.session) go('session'); break;
      case 'discard': if (E.session) { E.endEarly(); go('home'); } break;
      case 'say': say(d.say, d.slow === '1'); break;
      case 'end': {
        const s = E.session;
        if (!s || s.finished) { go('home'); break; }
        if (PL.isScheduled(s) && !confirm('Finish now? What you answered is saved; anything not reached is carried forward.')) break;
        E.endEarly(); V.view = 'summary'; V.p = { sum: E.session.summary }; render(); break;
      }
      case 'check': submitTyped(); break;
      case 'ack': answer({}); break;
      case 'choose': answer({ index: +d.k }); V.ui.pick = +d.k; render(); break;
      case 'dontknow': V.ui.typed = ''; answer({ dontKnow: true, text: '' }); break;
      case 'hint': V.ui.hint = (V.ui.hint || 0) + 1; { const inp = $app.querySelector('input.answer'); if (inp) V.ui.draft = inp.value; const ta = $app.querySelector('[data-rec]'); if (ta) V.ui.text = ta.value; } render(); break;
      case 'reveal': V.ui.revealed = true; render(); break;
      case 'self': if (E.current().ex === 'recovery') { answer({ self: d.v, hints: V.ui.hint || 0 }); } else answer({ self: d.v }); break;
      case 'next': next(); break;
      case 'tile': V.ui.seq = (V.ui.seq || []).concat(+d.k); render(); break;
      case 'tile-undo': V.ui.seq = (V.ui.seq || []).slice(0, -1); render(); break;
      case 'tile-check': answer({ sequence: V.ui.seq || [] }); break;
      case 'span-start': spanRun(E.current()); break;
      case 'span-pick': {
        const c = E.current(); const picks = V.ui.picks = V.ui.picks || [];
        if (c.seq[picks.length] === d.id) { picks.push(d.id); if (picks.length === c.n) { V.ui.won = true; V.ui.phase = 'end'; E.answer({ won: true }); } }
        else { V.ui.won = false; V.ui.phase = 'end'; E.answer({ won: false }); }
        render(); break;
      }
      case 'rec-done': { const ta = $app.querySelector('[data-rec]'); V.ui.text = ta ? ta.value.trim() : ''; V.ui.done = true; render(); break; }
      case 'train': start('training', { activity: d.activity, direction: d.direction, focus: d.direction === 'mixed' && d.activity === 'mixed' ? 'weak' : 'weak' }); break;
      case 'train-switch': { const s = E.session; E.finish(); start('training', { activity: d.activity, direction: d.direction, focus: s && s.opts ? s.opts.focus : 'weak' }); break; }
      case 'rc-focus': V.ui.focus = d.v; V.ui.topic = null; render(); break;
      case 'rc-topic': V.ui.topic = d.v; render(); break;
      case 'rc-dir': V.ui.direction = d.v; render(); break;
      case 'rc-start': start('recall', { focus: V.ui.focus || 'weak', topic: V.ui.topic || null, direction: V.ui.direction === 'explain' ? 'mixed' : V.ui.direction || 'mixed', activity: V.ui.direction === 'explain' ? 'recovery' : 'mixed' }); break;
      case 'start-recall-weak': start('recall', { focus: 'weak', direction: 'mixed' }); break;
      case 'conj-group': go('conjGroup', { id: d.id }); break;
      case 'conj-form': go('conjForm', { id: d.id, kind: d.kind }); break;
      case 'words-topic': go('words', { topic: d.v }); break;
      case 'word': go('word', { id: d.id, topic: V.p.topic }); break;
      case 'voice-sample': SP.speak('こんにちは。京都駅はどこですか。お水をお願いします。', { uri: d.uri, rate: E.state.settings.voiceRate || 1, allowDefault: false }); break;
      case 'voice-use': E.state.settings.voiceURI = d.uri; E.save(); render(); toast('Voice saved'); break;
      case 'theme': E.state.settings.theme = d.v; E.save(); applyTheme(E.state.settings); render(); break;
      case 'prio-add': {
        const cur = (E.state.settings.topicPriorities || []).slice();
        const r = E.setTopicPriorities(cur.concat(d.id));
        if (r.error) toast('You can choose up to ' + r.max + ' topics. Remove one first.');
        else rerenderKeep(); break;
      }
      case 'prio-remove': E.setTopicPriorities((E.state.settings.topicPriorities || []).filter(x => x !== d.id)); rerenderKeep(); break;
      case 'prio-up': case 'prio-down': {
        const a = (E.state.settings.topicPriorities || []).slice(), k = a.indexOf(d.id), j = k + (d.action === 'prio-up' ? -1 : 1);
        if (k >= 0 && j >= 0 && j < a.length) { [a[k], a[j]] = [a[j], a[k]]; E.setTopicPriorities(a); }
        rerenderKeep(); break;
      }
      case 'toggle-kbd': E.state.settings.typingDebug = !E.state.settings.typingDebug; E.save(); render(); break;
      case 'toggle-romaji': E.state.settings.showRomaji = !E.state.settings.showRomaji; E.save(); render(); break;
      case 'export': download('michi-backup-' + E.today() + '.json', E.exportJSON()); break;
      case 'export-v1': download('michi-old-version-backup.json', localStorage.getItem('michi_v1_backup')); break;
      case 'restore-v1': if (confirm('Replace current progress with the data from the old version?')) { E.restoreV1Backup(); toast('Restored'); go('home'); } break;
      case 'reset': if (confirm('Erase ALL progress on this device? Export a backup first if unsure.')) { E.reset(); applyTheme(E.state.settings); go('home'); } break;
    }
  });
  // Re-render the settings screen without jumping back to the top.
  function rerenderKeep() { const y = window.scrollY; render(); window.scrollTo(0, y); }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function submitTyped() {
    const inp = $app.querySelector('input.answer');
    if (!inp || inp.disabled || V.ui.res) return;
    const text = inp.value;                       // includes any not-yet-confirmed IME text
    if (!text.trim()) { toast('Type an answer, or tap “I don’t know”.'); return; }
    V.ui.typed = text; V.ui.draft = text;
    composing = false;
    try { inp.blur(); } catch (e) { }            // ends any open composition and closes the keyboard
    answer({ text });
  }
  /* IME-safe submission.
     The ONLY thing blocked during composition is the Enter key that confirms
     a kana→kanji conversion (isComposing / keyCode 229 / the Enter Safari
     sends right after compositionend). A tap on "Check" always submits what
     is in the box. (Defect fixed here: the previous version ignored "Check"
     while its composition flag was set; on iPhone a tap on a button does not
     end the composition, so the answer could never be submitted.) */
  let composing = false, compEndAt = 0;
  $app.addEventListener('compositionstart', e => { if (e.target.matches('input.answer')) composing = true; });
  $app.addEventListener('compositionend', e => { if (e.target.matches('input.answer')) { composing = false; compEndAt = Date.now(); } });
  $app.addEventListener('focusout', e => { if (e.target.matches && e.target.matches('input.answer')) composing = false; });
  $app.addEventListener('submit', e => {
    if (!e.target.matches('form[data-form="typed"]')) return;
    e.preventDefault();                           // implicit submission (Enter / "Go"); keydown below filters IME Enters
    if (composing) return;
    submitTyped();
  });
  $app.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.keyCode !== 13 && e.keyCode !== 229) return;
    if (e.target.matches && e.target.matches('input.answer')) {
      const imeEnter = e.isComposing || e.keyCode === 229 || composing || (Date.now() - compEndAt < 30);
      e.preventDefault();
      if (!imeEnter && e.key === 'Enter') submitTyped();
      return;
    }
    // Enter continues after feedback (desktop convenience)
    if (e.key === 'Enter' && V.view === 'session' && V.ui.res && !(e.target.matches && e.target.matches('textarea, button, input'))) { e.preventDefault(); next(); }
  });
  // Tapping a field that is already focused while no keyboard is visible
  // (possible on iOS): blur and refocus inside the tap so the keyboard opens.
  let focusedAtTouch = null;
  $app.addEventListener('touchstart', () => { focusedAtTouch = document.activeElement; }, { passive: true });
  $app.addEventListener('touchend', e => {
    const zone = e.target.closest && e.target.closest('.answer-zone');
    if (!zone) return;
    const inp = zone.querySelector('input.answer:not([disabled])'); if (!inp) return;
    const vv = window.visualViewport;
    const keyboardHidden = !vv || vv.height > window.innerHeight * 0.85;
    if (focusedAtTouch === inp && keyboardHidden) { inp.blur(); inp.focus(); }
  }, { passive: true });
  $app.addEventListener('focusin', e => { if (e.target.matches && e.target.matches('input.answer')) setTimeout(() => { if (document.activeElement === e.target) keepVisible(e.target); }, 300); });

  /* ---------- optional on-device typing diagnostics (Settings) ---------- */
  const KBD = [];
  function kbdLog(ev, extra) {
    if (!E || !E.state.settings.typingDebug) return;
    const a = document.activeElement, vv = window.visualViewport;
    KBD.push(new Date().toISOString().slice(17, 23) + ' ' + ev + (extra ? ' ' + extra : '') + ' | active=' + (a ? (a.id || a.className || a.tagName) : '-') + ' vv=' + (vv ? Math.round(vv.height) : '-') + '/' + window.innerHeight);
    if (KBD.length > 40) KBD.shift();
    kbdShow();
  }
  function kbdShow() { const box = document.getElementById('kbd-log'); if (box) box.textContent = KBD.slice(-14).join('\n'); }
  function kbdLogBox() { return E && E.state.settings.typingDebug ? '<pre class="kbd-log" id="kbd-log" aria-label="Typing diagnostics"></pre>' : ''; }
  for (const ev of ['touchstart', 'touchend', 'pointerdown', 'focusin', 'focusout', 'compositionstart', 'compositionupdate', 'compositionend', 'beforeinput', 'input', 'keydown', 'submit']) {
    document.addEventListener(ev, e => {
      if (!e.target || !e.target.closest || !e.target.closest('.answer-form')) return;
      kbdLog(ev, ev === 'keydown' ? 'key=' + e.key + ' code=' + e.keyCode + ' composing=' + e.isComposing : ev.indexOf('composition') === 0 ? 'data=' + e.data : ev === 'beforeinput' ? 'type=' + e.inputType : ev === 'input' ? 'len=' + (e.target.value || '').length : '');
    }, { capture: true, passive: true });
  }
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => kbdLog('viewport-resize'));

  $app.addEventListener('input', e => {
    if (e.target.matches('input.answer')) V.ui.draft = e.target.value;
    if (e.target.matches('[data-rec]')) V.ui.text = e.target.value;
    if (e.target.dataset.setting === 'voiceRate') { E.state.settings.voiceRate = +e.target.value; const o = e.target.parentNode.querySelector('output'); if (o) o.textContent = (+e.target.value).toFixed(2) + '×'; E.save(); }
  });
  $app.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset && t.dataset.hook) { E.state.hooks[t.dataset.hook] = t.value.trim(); E.save(); }
    if (t.dataset && t.dataset.setting) {
      const k = t.dataset.setting;
      if (k.startsWith('minutes.')) { const v = Math.max(3, Math.min(90, Math.round(+t.value || 0))); E.state.settings.minutes[k.slice(8)] = v; t.value = v; }
      else if (k === 'timeZone') E.state.settings.timeZone = t.value;
      E.save();
    }
    if (t.id === 'imp' && t.files[0]) t.files[0].text().then(txt => { E.importJSON(txt); applyTheme(E.state.settings); toast('Backup imported'); go('home'); }).catch(() => alert('That file is not a Michi backup.'));
  });
  // Tooltips for chart points on tap (hover uses <title>).
  $app.addEventListener('pointerup', e => {
    const g = e.target.closest && e.target.closest('.pt'); if (!g) return;
    toast(g.dataset.tip);
  });

  /* ---------- day rollover & visibility: Sunday unlock without restart ---------- */
  // Re-render when anything time-dependent changes (date, evening opening at
  // 12:00, weekly unlock) — no refresh or restart needed.
  let lastDay = null;
  function timeSig() { return E.today() + '|' + E.eveningClock().open + '|' + E.weeklyStatus().state; }
  function checkDay() {
    if (!E) return;
    const sig = timeSig();
    if (lastDay && sig !== lastDay && ['home', 'progress'].includes(V.view)) rerenderKeep();
    lastDay = sig;
  }
  setInterval(checkDay, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });

  /* ---------- boot ---------- */
  async function getJson(p) { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); }
  async function boot() {
    try {
      const index = await getJson('data/index.json');
      const [topics, grammar, conjugation, recovery, milestones, synonyms] = await Promise.all([index.topics, index.grammar, index.conjugation, index.recovery, index.milestones, index.synonyms].map(f => f ? getJson('data/' + f).catch(() => null) : null));
      const itemFiles = await Promise.all(index.items.map(f => getJson('data/' + f).catch(err => { console.warn('item file failed', f, err); return null; })));
      C = CUR.build({ index, topics, itemFiles: itemFiles.filter(Boolean), grammar, conjugation, recovery, milestones, synonyms });
      if (C.skipped.length) console.warn('Rejected at load (not served):', C.skipped);
      CONJ = conjugation; REC = recovery || { prompts: [], markers: {} };
      KDATA = index.kanji ? await getJson('data/' + index.kanji).catch(() => null) : null;
    } catch (err) {
      $app.innerHTML = `<main class="screen"><div class="banner warn">Could not load the lesson data (${esc(err.message)}). If this is the first launch, connect to the internet once so the app can be stored for offline use.</div></main>`;
      return;
    }
    E = ENG.create({ C, K: KDATA, storage: window.localStorage, audio: () => audioOk() });
    window.__michi = { get E() { return E; }, C };       // for debugging and end-to-end tests
    applyTheme(E.state.settings);
    if (E.resume()) { /* offered on the home screen */ }
    lastDay = timeSig();
    go('home');
    SP.ready().then(() => { if (['home', 'settings'].includes(V.view)) render(); });
  }
  boot();
})();
