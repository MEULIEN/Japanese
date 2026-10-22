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
  const X = window.MichiExercises, PR = window.MichiProgress, SP = window.MichiSpeech, SRS = window.MichiSRS, PL = window.MichiPlanner, K = window.MichiKana;
  const $app = document.getElementById('app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (n, d) => d ? Math.round(100 * n / d) : 0;

  let E = null, C = null, CONJ = null, REC = null;
  const V = { view: 'loading', p: {}, ui: {} };      // ui: per-card transient state
  const TABS = [['home', '今', 'Today'], ['train', '練', 'Train'], ['conj', '活', 'Conjugate'], ['progress', '進', 'Progress'], ['words', '語', 'Words']];

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
    const views = { home: renderHome, train: renderTrain, conj: renderConj, conjGroup: renderConjGroup, conjForm: renderConjForm, progress: renderProgress, words: renderWords, word: renderWord, settings: renderSettings, recallSetup: renderRecallSetup, session: renderSession, summary: renderSummary, patterns: renderPatterns };
    const f = views[V.view];
    const tabbed = ['home', 'train', 'conj', 'progress', 'words', 'settings', 'conjGroup', 'conjForm', 'word', 'recallSetup', 'patterns'].includes(V.view);
    const active = { conjGroup: 'conj', conjForm: 'conj', word: 'words', recallSetup: 'home', settings: 'home', patterns: 'train' }[V.view] || V.view;
    $app.innerHTML = `<main class="screen ${tabbed ? 'with-tabs' : ''}" id="main">${f ? f() : '<p class="muted">Loading…</p>'}</main>` +
      (tabbed ? `<nav class="tabbar" aria-label="Main">${TABS.map(([v, g, l]) => `<button type="button" class="tabbar-btn ${active === v ? 'active' : ''}" data-action="go" data-view="${v}" ${active === v ? 'aria-current="page"' : ''}><span class="t-glyph" aria-hidden="true">${g}</span><span class="t-label">${l}</span></button>`).join('')}</nav>` : '');
    afterRender();
  }
  // Focus management after every render. Called synchronously from the
  // event handler that changed the view, so on iOS the focus() happens
  // inside the user gesture and the software keyboard opens.
  function afterRender() {
    const inp = $app.querySelector('input.answer:not([disabled])');
    if (inp) {
      if (V.ui.draft != null && inp.value !== V.ui.draft) inp.value = V.ui.draft;
      try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); }
      keepVisible(inp);
    } else {
      const next = $app.querySelector('[data-autofocus]');
      if (next) try { next.focus({ preventScroll: true }); } catch (e) { }
    }
  }
  function keepVisible(el) {
    try { el.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch (e) { }
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
      const badge = state === 'done' ? '<span class="pill done">✓ Done today</span>' : state === 'locked' ? '<span class="pill locked">🔒 Locked</span>' : rec ? '<span class="pill rec">Recommended</span>' : '<span class="pill">Available</span>';
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
    const morningSub = av.morning.state === 'locked' ? esc(av.morning.reason) : topic ? `${topic.icon || ''} ${esc(topic.name)} · ~${mins.morning} min · quick check, then new words` : `~${mins.morning} min · review (all topics introduced)`;
    const eveningSub = av.evening.state === 'locked' ? esc(av.evening.reason) : st.lesson.pendingEvening ? `~${mins.evening} min · use this morning’s words in new ways · no new words` : `~${mins.evening} min · due reviews (no new words)`;
    return `${topbar('Michi 道', null, '<button type="button" class="icon-btn" data-action="go" data-view="settings" aria-label="Settings">⚙︎</button>')}
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
        <label class="sr-only" for="ans">Your answer</label>
        <input id="ans" class="answer" name="answer" type="text" lang="ja" inputmode="text" enterkeyhint="done" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="かな / kanji / rōmaji" ${res ? 'disabled' : ''} value="${esc(u.draft || '')}">
        ${res ? '' : `<div class="row">${btn('Check', 'submit-typed', 'primary', 'type="submit"').replace('type="button" ', '')}${c.phase !== 'delayed' && c.phase !== 'diag' && c.phase !== 'assess' && hintLvl < 2 ? btn('Hint', 'hint', 'ghost') : ''}${btn('I don’t know', 'dontknow', 'ghost')}</div>`}
      </form>`;
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
    const form = `<form class="answer-form" data-form="typed" autocomplete="off" novalidate><label class="sr-only" for="ans">Your answer</label>
      <input id="ans" class="answer" type="text" lang="ja" inputmode="text" enterkeyhint="done" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ${res ? 'disabled' : ''} value="${esc(u.draft || '')}">
      ${res ? '' : `<div class="row">${btn('Check', 'submit-typed', 'primary').replace('type="button"', 'type="submit"')}${btn('Pass', 'dontknow', 'ghost')}</div>`}</form>`;
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
        ${sum.kind === 'morning' ? `<h3>New today (${sum.introduced.length})</h3>${nameList(sum.introduced)}${sum.knownBefore.length ? `<p class="muted">Already knew: ${nameList(sum.knownBefore)}</p>` : ''}` : ''}
        ${scheduled ? `<h3>Recalled on your own</h3>${nameList(sum.independent)}
        <h3>Needed help</h3>${nameList(sum.assisted)}` : `<p class="muted">Practice only — your review schedule and mastery are unchanged.</p>`}
        ${sum.errors.length ? `<h3>Worth more practice</h3><ul class="plain">${dedupeErrors(sum.errors).map(e => `<li><span lang="ja">${esc(item(e.item).jp)}</span> — ${esc(ERRK[e.kind] || 'missed')} (${esc((CUR.SKILLS[e.skill] || {}).name || e.skill)})</li>`).join('')}</ul>` : ''}
        ${sum.carry && sum.carry.length ? `<h3>Carried to the next morning</h3><p class="muted">Not reached this time — nothing is marked learned that you didn’t practise.</p>${nameList(sum.carry)}` : ''}
        ${rep}
        ${scheduled ? `<h3>What comes next</h3><p>${nextDays ? 'Coming up: ' + esc(nextDays) + '. ' : ''}${esc(((sum.next && sum.next.reasons) || []).join('; '))}${sum.kind === 'morning' ? ' This evening: use today’s words in new ways (no new words).' : ''}</p>` : ''}
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
    return `${topbar('Training')}
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
    return `${topbar('Conjugation')}
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
    return `${topbar('Progress')}
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
    return `${topbar('Words')}
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
      <h3>Time for each session</h3>
      ${['morning', 'evening', 'weekly'].map(k => `<label class="field">${k[0].toUpperCase() + k.slice(1)} <input type="number" inputmode="numeric" min="3" max="${k === 'weekly' ? 90 : 60}" value="${s.minutes[k]}" data-setting="minutes.${k}"> min</label>`).join('')}
      <p class="muted">Session length follows these; how much fits is worked out from how fast you actually answer.</p>
      <h3>Time zone (for “today” and the Sunday unlock)</h3>
      <select data-setting="timeZone" aria-label="Time zone">${zones.map(z => `<option value="${esc(z)}" ${s.timeZone === z ? 'selected' : ''}>${z === 'auto' ? 'Device (' + esc(CAL.deviceZone()) + ')' : esc(z)}</option>`).join('')}</select>
      <h3>Display</h3>
      <div class="chip-row">${['light', 'dark'].map(t => `<button type="button" class="chip ${s.theme === t ? 'on' : ''}" data-action="theme" data-v="${t}">${t}</button>`).join('')}<button type="button" class="chip ${s.showRomaji ? 'on' : ''}" data-action="toggle-romaji">rōmaji ${s.showRomaji ? 'on' : 'off'}</button></div>
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
    if (!el || el.getAttribute('aria-disabled') === 'true' && el.dataset.action !== 'start') return;
    const d = el.dataset;
    switch (d.action) {
      case 'go': e.preventDefault(); go(d.view); break;
      case 'go-conj': go('conj'); break;
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
      case 'toggle-romaji': E.state.settings.showRomaji = !E.state.settings.showRomaji; E.save(); render(); break;
      case 'export': download('michi-backup-' + E.today() + '.json', E.exportJSON()); break;
      case 'export-v1': download('michi-old-version-backup.json', localStorage.getItem('michi_v1_backup')); break;
      case 'restore-v1': if (confirm('Replace current progress with the data from the old version?')) { E.restoreV1Backup(); toast('Restored'); go('home'); } break;
      case 'reset': if (confirm('Erase ALL progress on this device? Export a backup first if unsure.')) { E.reset(); applyTheme(E.state.settings); go('home'); } break;
    }
  });
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function submitTyped() {
    const inp = $app.querySelector('input.answer');
    if (!inp || inp.disabled || V.ui.res) return;
    const text = inp.value;
    if (!text.trim()) { toast('Type an answer, or tap “I don’t know”.'); inp.focus(); return; }
    V.ui.typed = text; V.ui.draft = text;
    answer({ text });
  }
  // IME-safe submission.
  let composing = false;
  $app.addEventListener('compositionstart', () => { composing = true; });
  $app.addEventListener('compositionend', () => { composing = false; });
  $app.addEventListener('submit', e => {
    if (!e.target.matches('form[data-form="typed"]')) return;
    e.preventDefault();
    if (composing) return;
    submitTyped();
  });
  $app.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.matches && e.target.matches('input.answer')) {
      if (e.isComposing || e.keyCode === 229 || composing) { e.preventDefault(); return; }   // confirming a conversion
      e.preventDefault(); submitTyped(); return;
    }
    // Enter continues after feedback (desktop convenience)
    if (V.view === 'session' && V.ui.res && !(e.target.matches && e.target.matches('textarea, button'))) { e.preventDefault(); next(); }
  });
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
  let lastDay = null;
  function checkDay() {
    if (!E) return;
    const d = E.today();
    if (lastDay && d !== lastDay && ['home', 'progress'].includes(V.view)) render();
    lastDay = d;
  }
  setInterval(checkDay, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });

  /* ---------- boot ---------- */
  async function getJson(p) { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); }
  async function boot() {
    try {
      const index = await getJson('data/index.json');
      const [topics, grammar, conjugation, recovery, milestones] = await Promise.all([index.topics, index.grammar, index.conjugation, index.recovery, index.milestones].map(f => f ? getJson('data/' + f).catch(() => null) : null));
      const itemFiles = await Promise.all(index.items.map(f => getJson('data/' + f).catch(err => { console.warn('item file failed', f, err); return null; })));
      C = CUR.build({ index, topics, itemFiles: itemFiles.filter(Boolean), grammar, conjugation, recovery, milestones });
      if (C.skipped.length) console.warn('Rejected at load (not served):', C.skipped);
      CONJ = conjugation; REC = recovery || { prompts: [], markers: {} };
    } catch (err) {
      $app.innerHTML = `<main class="screen"><div class="banner warn">Could not load the lesson data (${esc(err.message)}). If this is the first launch, connect to the internet once so the app can be stored for offline use.</div></main>`;
      return;
    }
    E = ENG.create({ C, storage: window.localStorage, audio: () => audioOk() });
    window.__michi = { get E() { return E; }, C };       // for debugging and end-to-end tests
    applyTheme(E.state.settings);
    if (E.resume()) { /* offered on the home screen */ }
    lastDay = E.today();
    go('home');
    SP.ready().then(() => { if (['home', 'settings'].includes(V.view)) render(); });
  }
  boot();
})();
