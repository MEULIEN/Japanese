/* ============================================================
   Michi — Kanji radicals: daily lesson engine (pure)
   ------------------------------------------------------------
   A separate daily lesson that teaches the radicals (部首) used by the
   kanji in the verified curriculum, in order of usefulness, and through
   them the kanji's readings and the on/kun reading rule.

   State lives in state.kanji (its own FSRS memory), so radical study never
   changes the vocabulary schedule, and vice versa.
     keys: 'r:<radical no.>'  skills: meaning · name · spot
           'k:<kanji>'        skills: reading · rule
   Lesson size is derived like the other lessons: the minutes the learner
   allows (Settings), their own median time per exercise, and how many
   reviews are due. Sample words prefer words the learner has met.
   ============================================================ */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MichiKanji = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const SRS = node ? require('./srs.js') : root.MichiSRS;
  const CAL = node ? require('./calendar.js') : root.MichiCalendar;
  const P = node ? require('./policy.js') : root.MichiPolicy;
  const K = node ? require('./kana.js') : root.MichiKana;

  function shuffle(a, rng) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const hira = s => K.kata2hira(String(s || '')).replace(/[.\-]/g, '');

  // Index the built data (data/kanji/radicals.json).
  function index(data) {
    const I = { radicals: data.radicals || [], byNum: {}, kanji: data.kanji || {}, rule: data.rule || {}, sources: data.sources || {} };
    for (const r of I.radicals) I.byNum[r.num] = r;
    return I;
  }
  function blankState() { return { memory: {}, log: [], sessions: [], latency: [] }; }

  // Words the learner has met in the main lessons (to prioritise samples).
  function metWords(state) { return new Set(Object.keys(state.memory || {})); }
  function samplesFor(I, ch, state) {
    const k = I.kanji[ch]; if (!k) return [];
    const met = metWords(state);
    return k.samples.map((s, n) => Object.assign({ met: !!(s.item && met.has(s.item)), n }, s))
      .sort((a, b) => (b.met - a.met) || ((!!a.ext) - (!!b.ext)) || a.n - b.n);
  }
  // Member kanji of a radical, learner-relevant first (met in lessons).
  function membersFor(I, r, state) {
    const met = metWords(state);
    const metKanji = ch => (I.kanji[ch].samples || []).some(s => s.item && met.has(s.item));
    return r.members.filter(ch => I.kanji[ch]).sort((a, b) => metKanji(b) - metKanji(a));
  }

  /* ---------- time estimates (learner's own median; prior otherwise) ---------- */
  const PRIOR = { kteach: 45, rmeaning: 9, rname: 9, rspot: 10, kread: 12, krule: 8 };
  function est(ks, ex) { const own = (ks.latency || []).filter(x => x.ex === ex).map(x => x.ms); return own.length >= 5 ? Math.max(3, SRS.median(own) / 1000 * 1.5) : PRIOR[ex] || 10; }

  /* ---------- card generators (each validates its own options) ---------- */
  let seq = 0;
  const id = () => 'kc' + Date.now().toString(36) + (seq++).toString(36);
  const radLabel = r => r.form + (r.variants || []).filter(v => v.form).map(v => ' / ' + v.form).join('');
  function G_meaning(I, r, rng) {
    const others = shuffle(I.radicals.filter(x => x.num !== r.num && x.meaning && x.meaning !== r.meaning), rng).slice(0, 3);
    if (others.length < 2) return null;
    const opts = shuffle([r].concat(others), rng);
    return { id: id(), ex: 'rmeaning', key: 'r:' + r.num, skill: 'meaning', rad: r.num, options: opts.map(x => x.meaning), correct: opts.indexOf(r) };
  }
  function G_name(I, r, rng) {
    const named = r.variants.find(v => v.form && v.name && v.name !== r.name) || (r.name ? { form: r.form, name: r.name } : null);
    if (!named) return null;
    const pool = I.radicals.flatMap(x => x.num === r.num ? [] : [x.name].concat(x.variants.map(v => v.name))).filter(n => n && n !== named.name);
    const opts = shuffle([named.name].concat(shuffle([...new Set(pool)], rng).slice(0, 3)), rng);
    if (opts.length < 3) return null;
    return { id: id(), ex: 'rname', key: 'r:' + r.num, skill: 'name', rad: r.num, glyph: named.form, options: opts, correct: opts.indexOf(named.name) };
  }
  function G_spot(I, r, state, rng) {
    const mem = membersFor(I, r, state);
    if (!mem.length) return null;
    const target = mem[Math.floor(rng() * Math.min(mem.length, 4))];
    const others = shuffle(Object.keys(I.kanji).filter(ch => I.kanji[ch].rad !== r.num && I.kanji[ch].inCurriculum), rng).slice(0, 3);
    if (others.length < 2) return null;
    const opts = shuffle([target].concat(others), rng);
    return { id: id(), ex: 'rspot', key: 'r:' + r.num, skill: 'spot', rad: r.num, options: opts, correct: opts.indexOf(target) };
  }
  function G_read(I, ch, state, rng, used) {
    const k = I.kanji[ch]; if (!k) return null;
    const s = samplesFor(I, ch, state).find(x => x.reading && x.type !== 'special' && !(used && used.has(x.jp))) || samplesFor(I, ch, state).find(x => x.reading && x.type !== 'special');
    if (!s) return null;
    const own = [...new Set(k.on.map(hira).concat(k.kun.map(x => hira(x.split('.')[0]))))].filter(x => x && x !== s.reading);
    const foreign = shuffle(Object.values(I.kanji).filter(x => x.ch !== ch).flatMap(x => x.on.map(hira)), rng).filter(x => x !== s.reading && !own.includes(x));
    const opts = [...new Set([s.reading].concat(shuffle(own, rng).slice(0, 2), foreign))].slice(0, 4);
    if (opts.length < 3) return null;
    const o = shuffle(opts, rng);
    return { id: id(), ex: 'kread', key: 'k:' + ch, skill: 'reading', ch, word: s.jp, kana: s.kana, en: s.en, item: s.item || null, type: s.type, options: o, correct: o.indexOf(s.reading) };
  }
  function G_rule(I, ch, state, rng, used) {
    const ss = samplesFor(I, ch, state).filter(x => x.reading && (x.type === 'on' || x.type === 'kun'));
    const s = ss.find(x => !(used && used.has(x.jp))) || ss[0];
    if (!s) return null;
    return { id: id(), ex: 'krule', key: 'k:' + ch, skill: 'rule', ch, word: s.jp, kana: s.kana, en: s.en, reading: s.reading, type: s.type, options: ['音読み (on-yomi)', '訓読み (kun-yomi)'], correct: s.type === 'on' ? 0 : 1 };
  }
  function validate(c) {
    if (!c) return false;
    if (!Array.isArray(c.options) || c.options.length < 2 || c.correct < 0 || c.correct >= c.options.length) return false;
    if (new Set(c.options).size !== c.options.length) return false;
    return true;
  }
  function forSkill(I, key, skill, state, rng) {
    const [t, v] = [key.slice(0, 1), key.slice(2)];
    if (t === 'r') { const r = I.byNum[+v]; if (!r) return null; return skill === 'meaning' ? G_meaning(I, r, rng) : skill === 'name' ? G_name(I, r, rng) : G_spot(I, r, state, rng); }
    return skill === 'reading' ? G_read(I, v, state, rng) : G_rule(I, v, state, rng);
  }

  /* ---------- due reviews ---------- */
  function dueList(I, ks, date) {
    const out = [];
    for (const [key, m] of Object.entries(ks.memory)) {
      for (const [skill, st] of Object.entries(m.skills || {})) {
        if (st.due <= date) out.push({ key, skill, R: SRS.recallProb(st, date), lapses: st.lapses || 0 });
      }
    }
    return out.sort((a, b) => (a.R - b.R) || (b.lapses - a.lapses));
  }
  function nextNew(I, ks) { return I.radicals.filter(r => !ks.memory['r:' + r.num]); }

  /* ---------- the daily lesson ----------
     ctx = { I, state (whole learner state), date, rng, minutes } */
  function startLesson(ctx) {
    const { I, state } = ctx, ks = state.kanji, rng = ctx.rng;
    const budget = (ctx.minutes || P.kanji.minutes) * 60;
    const s = { kind: 'kanji', id: 'kanji-' + ctx.date + '-' + Date.now().toString(36), date: ctx.date, startTs: ctx.now ? ctx.now() : Date.now(), queue: [], i: 0, results: [], newRadicals: [], budgetSec: budget };
    // 1. Reviews first, bounded share of the time (one skill per key).
    const seen = new Set(); let sec = 0;
    for (const d of dueList(I, ks, ctx.date)) {
      if (seen.has(d.key)) continue;
      const c = forSkill(I, d.key, d.skill, state, rng);
      if (!validate(c)) continue;
      const t = est(ks, c.ex);
      if (sec + t > budget * P.kanji.reviewShare && s.queue.length) break;
      c.phase = 'review'; s.queue.push(c); seen.add(d.key); sec += t;
    }
    // 2. New radicals, as many as fit (at least one when the learner has time).
    const cands = nextNew(I, ks);
    const lessonCards = [];
    for (const r of cands) {
      if (s.newRadicals.length >= P.kanji.maxNewRadicals) break;
      const cards = radicalCards(I, r, state, rng, budget - sec, ks);
      const t = cards.reduce((x, c) => x + est(ks, c.ex), 0);
      if (s.newRadicals.length && sec + t > budget) break;
      s.newRadicals.push(r.num); lessonCards.push(cards); sec += t;
    }
    // Teach each radical, practise it, then one delayed check per radical at the end.
    const delayed = [];
    for (const cards of lessonCards) {
      const [teach, ...rest] = cards;
      s.queue.push(teach, ...interleave(rest));
      const r = I.byNum[teach.rad];
      const d = G_meaning(I, r, rng) || G_name(I, r, rng);
      if (validate(d)) { d.phase = 'delayed'; delayed.push(d); }
    }
    s.queue.push(...shuffle(delayed, rng));
    if (!s.queue.length) s.reason = cands.length ? 'no-time' : 'all-done';
    return s;
  }
  // Cards for one new radical: teach → meaning → name → spot → per member kanji: reading + rule.
  // How many member kanji get exercises depends on the time left.
  function radicalCards(I, r, state, rng, secLeft, ks) {
    const out = [{ id: id(), ex: 'kteach', key: 'r:' + r.num, rad: r.num, phase: 'teach' }];
    for (const g of [G_meaning(I, r, rng), G_name(I, r, rng), G_spot(I, r, state, rng)]) if (validate(g)) out.push(Object.assign(g, { phase: 'learn' }));
    const perMember = est(ks, 'kread') + est(ks, 'krule');
    const fixed = out.reduce((x, c) => x + est(ks, c.ex), 0);
    const mem = membersFor(I, r, state);
    const n = Math.max(1, Math.min(mem.length, P.kanji.maxMembersPerRadical, Math.floor(Math.max(0, secLeft - fixed) / perMember)));
    const used = new Set();
    for (const ch of mem.slice(0, n)) {
      const a = G_read(I, ch, state, rng, used); if (validate(a)) { a.phase = 'learn'; out.push(a); used.add(a.word); }
      const b = G_rule(I, ch, state, rng, used); if (validate(b)) { b.phase = 'learn'; out.push(b); used.add(b.word); }
    }
    return out;
  }
  // Avoid two cards about the same kanji in a row.
  function interleave(cards) {
    const out = [], rest = cards.slice();
    while (rest.length) {
      const last = out[out.length - 1];
      let k = rest.findIndex(c => !last || (c.ch || c.rad) !== (last.ch || last.rad) || c.ex !== last.ex);
      if (k < 0) k = 0;
      out.push(rest.splice(k, 1)[0]);
    }
    return out;
  }

  /* ---------- answering (writes ONLY state.kanji) ---------- */
  function answer(state, s, response, meta) {
    const c = s.queue[s.i]; if (!c) return null;
    const ks = state.kanji;
    if (c.ex === 'kteach') {
      const m = ks.memory[c.key] || (ks.memory[c.key] = { intro: meta.date, skills: {} });
      m.introduced = m.introduced || meta.date;
      return { result: null };
    }
    const ok = !response.dontKnow && response.index === c.correct;
    const res = { verdict: ok ? 'correct' : 'wrong', chose: response.index };
    const m = ks.memory[c.key] || (ks.memory[c.key] = { intro: meta.date, skills: {} });
    const grade = SRS.gradeFromEvidence({ verdict: res.verdict, recognitionOnly: true });
    m.skills[c.skill] = SRS.review(m.skills[c.skill] || null, grade, meta.date);
    ks.log.push({ key: c.key, skill: c.skill, ex: c.ex, phase: c.phase, verdict: res.verdict, date: meta.date, ms: meta.latencyMs || null });
    if (ks.log.length > 3000) ks.log.splice(0, ks.log.length - 3000);
    if (meta.latencyMs && meta.latencyMs > 300 && meta.latencyMs < 120000) { ks.latency.push({ ex: c.ex, ms: meta.latencyMs }); if (ks.latency.length > 200) ks.latency.shift(); }
    s.results.push({ key: c.key, skill: c.skill, ex: c.ex, verdict: res.verdict, phase: c.phase });
    // One later retry after a mistake (bounded: once per card).
    if (!ok && !c.retry && c.phase !== 'delayed') {
      const again = Object.assign({}, c, { id: id(), retry: true, phase: 'retry' });
      s.queue.splice(Math.min(s.queue.length, s.i + 1 + P.minRetryGap), 0, again);
    }
    return { result: res };
  }
  function finish(state, s, date) {
    const sum = { kind: 'kanji', date, newRadicals: s.newRadicals.slice(), answered: s.results.length, correct: s.results.filter(r => r.verdict === 'correct').length, endedEarly: s.i < s.queue.length };
    state.kanji.sessions.push(sum);
    if (state.kanji.sessions.length > 400) state.kanji.sessions.shift();
    return sum;
  }
  function progress(I, ks, date) {
    const rad = I.radicals.filter(r => ks.memory['r:' + r.num]);
    const strong = rad.filter(r => { const m = ks.memory['r:' + r.num]; return Object.values(m.skills).some(x => x.streak > 0); });
    const kanjiSeen = Object.keys(ks.memory).filter(k => k.startsWith('k:')).length;
    return { total: I.radicals.length, introduced: rad.length, strong: strong.length, kanjiSeen, due: dueList(I, ks, date).length, doneToday: ks.sessions.some(x => x.date === date && !x.endedEarly) };
  }

  return { index, blankState, samplesFor, membersFor, startLesson, answer, finish, progress, dueList, validate, forSkill, radLabel, G_meaning, G_name, G_spot, G_read, G_rule };
});
