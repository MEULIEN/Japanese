/* ============================================================
   Michi — BJT Training (pure logic; no DOM)
   ------------------------------------------------------------
   A date-driven, adaptive 36-day preparation programme for the BJT
   Business Japanese Proficiency Test (target 400+ by 2026-11-30).

   Everything is written to state.bjt only, so BJT study never changes
   the vocabulary or kanji schedules (and vice versa).

   Format facts (data/bjt/sources.json): 3 parts, 80 four-option
   questions — Part I 5+10+10, Part II 5+10+10, Part III 10+10+10 — and
   an IRT-scaled 0–800 score. This module NEVER converts practice results
   into a 0–800 number: the official scaling uses item parameters we do
   not have. It reports raw accuracy, accuracy by section, change over
   time, and a readiness indicator relative to the app's own "target
   band" items (difficulty 3), with its uncertainty, or "insufficient
   data" when there is not enough evidence.

   Ability model (internal, documented): a 3-parameter logistic item
   response function with the guessing floor fixed at 1/4 (four options)
   and item difficulty taken from the AUTHOR-ASSIGNED band 1–5
   (b = (d − 3) × 0.9). Bands are judgements, not calibrations, so the
   estimate is a practice indicator only. Only first exposures count
   (a re-asked question measures memory of that question); assisted
   answers (choices shown as text, or a transcript read because no voice
   was available) never count toward listening ability.
   ============================================================ */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MichiBJT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const SRS = node ? require('./srs.js') : root.MichiSRS;
  const CAL = node ? require('./calendar.js') : root.MichiCalendar;

  /* ---------- the programme ---------- */
  const PLAN = { start: '2026-10-26', end: '2026-11-30', target: 400 };
  const PHASES = [
    { id: 1, from: '2026-10-26', to: '2026-11-01', name: 'Diagnostic & foundations', goals: ['Take the diagnostic (all three parts).', 'Find your weakest part and skill.', 'Core workplace expressions and keigo; daily mistake review.'] },
    { id: 2, from: '2026-11-02', to: '2026-11-08', name: 'Build core competence', goals: ['Practise all three parts.', 'Who is speaking, their relationship, their intention, what must be done.', 'Documents, schedules, notices and charts; first short timed sets.'] },
    { id: 3, from: '2026-11-09', to: '2026-11-15', name: 'Target weaknesses', goals: ['More practice on the weakest part and recurring error patterns.', 'Harder listening and integration tasks; implied meaning and indirect requests.', 'Mixed timed assessment (Nov 13–15).'] },
    { id: 4, from: '2026-11-16', to: '2026-11-22', name: 'Timed exam practice', goals: ['Daily timed mixed sets; switching between parts.', 'Speed without losing accuracy.', 'Full mock exam (Nov 19–22); results reshape the final week.'] },
    { id: 5, from: '2026-11-23', to: '2026-11-29', name: 'Final consolidation', goals: ['Highest-impact weaknesses only.', 'Realistic timing; recurring errors, vocabulary and keigo.', 'Second full mock (Nov 26–28); light day on Nov 29.'] },
    { id: 6, from: '2026-11-30', to: '2026-11-30', name: 'Final readiness check', goals: ['Final readiness assessment.', 'Progress report against 400+ and a recommendation.'] }
  ];
  // Rest / lighter days: Sundays and the day before the final check.
  const LIGHT_DAYS = ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'];
  // Milestones: open window, last day it may be carried to, and what supersedes it.
  const MILESTONES = [
    { id: 'diagnostic', label: 'Diagnostic assessment', from: null, to: '2026-11-01', carryUntil: '2026-11-30' },
    { id: 'midcheck', label: 'Mixed timed assessment', from: '2026-11-13', to: '2026-11-15', carryUntil: '2026-11-18' },
    { id: 'mock1', label: 'Full mock exam 1', from: '2026-11-19', to: '2026-11-22', carryUntil: '2026-11-25' },
    { id: 'mock2', label: 'Full mock exam 2', from: '2026-11-26', to: '2026-11-28', carryUntil: '2026-11-29' },
    { id: 'final', label: 'Final readiness assessment', from: '2026-11-30', to: '2026-11-30', carryUntil: '2099-12-31' }
  ];

  const SECTIONS = {
    scene: { part: 1, jp: '場面把握', en: 'Scene comprehension', mock: 5, spokenOptions: true, sec: 30 },
    utterance: { part: 1, jp: '発言聴解', en: 'Utterance comprehension', mock: 10, spokenOptions: true, sec: 30 },
    listening: { part: 1, jp: '総合聴解', en: 'Comprehensive listening', mock: 10, spokenOptions: true, sec: 35 },
    situation: { part: 2, jp: '状況把握', en: 'Situation comprehension', mock: 5, sec: 35 },
    document: { part: 2, jp: '資料聴読解', en: 'Document listening-reading', mock: 10, sec: 50 },
    integrated: { part: 2, jp: '総合聴読解', en: 'Integrated listening-reading', mock: 10, sec: 60 },
    vocab: { part: 3, jp: '語彙・文法', en: 'Vocabulary & grammar', mock: 10, sec: 30 },
    expression: { part: 3, jp: '表現読解', en: 'Expression (register & keigo)', mock: 10, sec: 45 },
    reading: { part: 3, jp: '総合読解', en: 'Comprehensive reading', mock: 10, sec: 110 }
  };
  const SECTION_ORDER = Object.keys(SECTIONS);
  const PARTS = {
    1: { jp: '聴解', en: 'Listening', minutes: 45, count: 25 },
    2: { jp: '聴読解', en: 'Listening & reading', minutes: 30, count: 25 },
    3: { jp: '読解', en: 'Reading', minutes: 30, count: 30 }
  };
  const TRAPS = {
    negation: 'Missed a negation', intention: 'Misread what the speaker wants or means', number: 'Number or amount',
    deadline: 'Date, time or deadline', suggestion: 'Suggestion taken as a decision (or the reverse)',
    relationship: 'Relationship (superior, client, in-group/out-group)', integration: 'Missed information split across audio and document',
    politeness: 'Wrong politeness level or keigo direction', detail: 'Picked something mentioned but not asked',
    sequence: 'Order of actions / what happens next', speaker: 'Attributed to the wrong person',
    change: 'Chose the original plan, not the changed one', vocab: 'Confused a similar word', grammar: 'Wrong form or collocation',
    inference: 'Took it literally instead of the implied meaning', visual: 'Misread the chart or table'
  };
  const CATEGORIES = {   // the reporting categories of the brief
    listening: { en: 'Listening comprehension (Part I)', test: r => r.part === 1 },
    listenread: { en: 'Listening & reading (Part II)', test: r => r.part === 2 },
    reading: { en: 'Reading comprehension (Part III)', test: r => r.part === 3 },
    vocab: { en: 'Business vocabulary', test: (r, q) => q && q.skills.includes('vocab') },
    keigo: { en: 'Keigo & appropriate expressions', test: (r, q) => q && (q.skills.includes('keigo') || r.sec === 'expression' || r.sec === 'utterance') },
    intention: { en: 'Speaker intention & implied meaning', test: (r, q) => q && q.skills.includes('intention') },
    info: { en: 'Information from documents, schedules, charts', test: (r, q) => q && q.skills.includes('info') },
    timed: { en: 'Accuracy under time pressure', test: r => !!r.timed }
  };

  /* ---------- tunable policy (documented assumptions) ---------- */
  const POLICY = {
    bandStep: 0.9,           // logits between difficulty bands [assumption]
    priorSD: 1.2,            // ability prior N(0, 1.2²)
    halfLifeDays: 10,        // older answers weigh less: ability changes during the programme
    targetP: 0.70,           // benchmark: ≥70% on target-band (d3) items [assumption, see README]
    minFresh: 12,            // fresh answers per part before any readiness label
    practiceP: 0.65,         // aim practice items at ~65% predicted success (desirable difficulty)
    avoidRepeatDays: 7,      // a practised question is not shown again for this long (unless the pool runs out)
    vocabNewPerDay: 8,       // preferred new BJT vocabulary per day (shrinks with heavy reviews / low retention)
    vocabMaxReviews: 40,
    mockPlaysDefault: 1,     // mock rule: each audio may be played this many times (a practice setting)
    blockMinutes: 12,        // preferred length of one practice block
    minPerQuestion: { 1: 2.0, 2: 2.2, 3: 1.4 },   // untimed practice incl. reading feedback [prior]
    diagnostic: { scene: 2, utterance: 3, listening: 3, situation: 2, document: 3, integrated: 3, vocab: 3, expression: 3, reading: 2 },
    midcheck: { scene: 2, utterance: 5, listening: 5, situation: 2, document: 5, integrated: 5, vocab: 5, expression: 5, reading: 4 },
    final: { scene: 2, utterance: 5, listening: 5, situation: 2, document: 5, integrated: 5, vocab: 5, expression: 5, reading: 4 },
    mockDifficulty: { 1: 0.1, 2: 0.25, 3: 0.35, 4: 0.2, 5: 0.1 }
  };

  /* ---------- small helpers ---------- */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function shuffle(a, rng) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  let seq = 0;
  const uid = (p) => (p || 'b') + Date.now().toString(36) + (seq++).toString(36);
  const bOf = d => (d - 3) * POLICY.bandStep;
  const pCorrect = (th, b) => 0.25 + 0.75 / (1 + Math.exp(-(th - b)));

  /* ---------- content ---------- */
  // files: [{ section, questions }], vocab: { items }
  function index(files, vocab) {
    const I = { qs: [], byId: {}, bySection: {}, vocab: [], vocabById: {}, vocabByJp: {} };
    for (const s of SECTION_ORDER) I.bySection[s] = [];
    for (const f of files || []) for (const q of (f && f.questions) || []) {
      if (!SECTIONS[q.section] || I.byId[q.id] || !Array.isArray(q.options) || q.options.length !== 4) continue;
      const qq = Object.assign({ part: SECTIONS[q.section].part }, q);
      I.qs.push(qq); I.byId[q.id] = qq; I.bySection[q.section].push(qq);
    }
    for (const v of (vocab && vocab.items) || []) {
      if (v.status !== 'verified' || I.vocabById[v.id]) continue;
      I.vocab.push(v); I.vocabById[v.id] = v; I.vocabByJp[v.jp] = v;
    }
    return I;
  }
  function blankState() {
    return { responses: [], days: {}, done: {}, milestones: {}, mocks: [], sessions: [], review: {}, vocab: {}, vocabLog: [], prefs: { mockPlays: POLICY.mockPlaysDefault } };
  }
  function normalize(b) {
    const o = Object.assign(blankState(), b || {});
    o.prefs = Object.assign(blankState().prefs, (b && b.prefs) || {});
    for (const k of ['responses', 'mocks', 'sessions', 'vocabLog']) if (!Array.isArray(o[k])) o[k] = [];
    for (const k of ['days', 'done', 'milestones', 'review', 'vocab']) if (!o[k] || typeof o[k] !== 'object') o[k] = {};
    return o;
  }

  /* ---------- calendar ---------- */
  function dayInfo(date) {
    const total = CAL.daysBetween(PLAN.start, PLAN.end) + 1;         // 36
    const dayNo = CAL.daysBetween(PLAN.start, date) + 1;
    const phase = PHASES.find(p => date >= p.from && date <= p.to) || null;
    const state = date < PLAN.start ? 'before' : date > PLAN.end ? 'after' : 'during';
    return { total, dayNo, daysLeft: Math.max(0, CAL.daysBetween(date, PLAN.end)), state, phase, light: LIGHT_DAYS.includes(date), daysToStart: Math.max(0, CAL.daysBetween(date, PLAN.start)) };
  }
  function allDates() { const out = []; for (let d = PLAN.start; d <= PLAN.end; d = CAL.addDays(d, 1)) out.push(d); return out; }

  /* ---------- evidence ---------- */
  // Responses that measure ability: first exposure, not assisted, not a review re-ask.
  function measuring(st) { return st.responses.filter(r => r.fresh && !r.assisted && !r.nr && r.mode !== 'review'); }
  function weight(r, date) { return Math.pow(0.5, Math.max(0, CAL.daysBetween(r.date, date)) / POLICY.halfLifeDays); }

  // Posterior over ability on a grid (robust, no convergence issues).
  function estimate(rs, date) {
    let n = 0, neff = 0;
    const grid = []; for (let t = -4; t <= 4.0001; t += 0.05) grid.push(t);
    const lp = grid.map(t => -t * t / (2 * POLICY.priorSD * POLICY.priorSD));
    for (const r of rs) {
      const w = weight(r, date), b = bOf(r.d);
      n++; neff += w;
      for (let k = 0; k < grid.length; k++) { const p = pCorrect(grid[k], b); lp[k] += w * Math.log(r.ok ? p : 1 - p); }
    }
    const m = Math.max(...lp); const ps = lp.map(x => Math.exp(x - m)); const Z = ps.reduce((a, b) => a + b, 0);
    let mean = 0; grid.forEach((t, k) => { mean += t * ps[k] / Z; });
    let v = 0; grid.forEach((t, k) => { v += (t - mean) * (t - mean) * ps[k] / Z; });
    return { theta: mean, sd: Math.sqrt(v), n, neff };
  }
  function accuracy(rs, date) {
    let w = 0, ok = 0, raw = 0;
    for (const r of rs) { const x = date ? weight(r, date) : 1; w += x; if (r.ok) { ok += x; raw++; } }
    return { n: rs.length, correct: raw, raw: rs.length ? raw / rs.length : null, recent: w ? ok / w : null };
  }

  /* Readiness relative to the target band (difficulty 3 items).
     Never a BJT score. 'insufficient' until each part has enough fresh evidence. */
  function readiness(I, st, date) {
    const fresh = measuring(st);
    const parts = {};
    for (const p of [1, 2, 3]) {
      const rs = fresh.filter(r => r.part === p);
      const e = estimate(rs, date);
      const mid = pCorrect(e.theta, 0), lo = pCorrect(e.theta - 1.64 * e.sd, 0), hi = pCorrect(e.theta + 1.64 * e.sd, 0);
      let status = 'insufficient';
      if (rs.length >= POLICY.minFresh) status = mid >= POLICY.targetP && lo >= POLICY.targetP - 0.1 ? 'on-track' : mid >= POLICY.targetP - 0.1 ? 'borderline' : 'not-yet';
      parts[p] = { n: rs.length, theta: e.theta, sd: e.sd, pTarget: mid, lo, hi, status, acc: accuracy(rs) };
    }
    const known = [1, 2, 3].filter(p => parts[p].status !== 'insufficient');
    const timed = st.responses.filter(r => r.timed && r.mode !== 'review');
    let overall = 'insufficient';
    if (known.length === 3) {
      const wsum = PARTS[1].count + PARTS[2].count + PARTS[3].count;
      const mid = [1, 2, 3].reduce((a, p) => a + parts[p].pTarget * PARTS[p].count, 0) / wsum;
      const worst = Math.min(...[1, 2, 3].map(p => parts[p].pTarget));
      overall = mid >= POLICY.targetP && worst >= POLICY.targetP - 0.1 ? 'on-track' : mid >= POLICY.targetP - 0.1 ? 'borderline' : 'not-yet';
    }
    return {
      overall, parts, timedN: timed.length, timedAcc: accuracy(timed).raw,
      notes: [
        'Not a BJT score. The official 0–800 score is IRT-scaled from item parameters only the test owner has; the app cannot reproduce it.',
        'Readiness compares your answers on the app’s own difficulty scale with its “target band” (items its authors judged to sit near the J3/J2 boundary, where 400 lies). Those difficulty bands are author judgements, not statistical calibrations.',
        known.length < 3 ? 'At least ' + POLICY.minFresh + ' first-time answers per part are needed before a label is shown.' : null,
        !timed.length ? 'No timed results yet: untimed accuracy usually overstates exam performance.' : null
      ].filter(Boolean)
    };
  }

  /* Weaknesses: by section, by reporting category, by error pattern. Recency-weighted.
     A weakness is recomputed from current evidence every time, so it disappears
     as soon as performance improves. */
  function profile(I, st, date) {
    const rs = st.responses.filter(r => !r.assisted && r.mode !== 'review' && !r.nr);
    const recent = rs.filter(r => CAL.daysBetween(r.date, date) <= 21);
    const sections = {};
    for (const s of SECTION_ORDER) sections[s] = accuracy(recent.filter(r => r.sec === s), date);
    const cats = {};
    for (const [k, c] of Object.entries(CATEGORIES)) cats[k] = accuracy(recent.filter(r => c.test(r, I.byId[r.q])), date);
    // Error patterns: rate = weighted errors on that trap / weighted opportunities.
    const traps = {};
    for (const r of recent) {
      const q = I.byId[r.q]; if (!q) continue;
      const w = weight(r, date);
      for (const t of new Set(q.traps.filter(Boolean))) { const x = traps[t] || (traps[t] = { opp: 0, err: 0, n: 0 }); x.opp += w; }
      if (!r.ok && r.trap) { const x = traps[r.trap] || (traps[r.trap] = { opp: 0, err: 0, n: 0 }); x.err += w; x.n++; }
    }
    const patterns = Object.entries(traps).filter(([, x]) => x.n >= 2 && x.opp > 0).map(([t, x]) => ({ trap: t, label: TRAPS[t], errors: x.n, rate: x.err / x.opp }))
      .sort((a, b) => b.rate * Math.sqrt(b.errors) - a.rate * Math.sqrt(a.errors));
    const partAcc = {};
    for (const p of [1, 2, 3]) partAcc[p] = accuracy(recent.filter(r => r.part === p), date);
    const tested = [1, 2, 3].filter(p => partAcc[p].n >= 4);
    const weakestPart = tested.length ? tested.sort((a, b) => partAcc[a].recent - partAcc[b].recent)[0] : null;
    const weakSections = SECTION_ORDER.filter(s => sections[s].n >= 3 && sections[s].recent < POLICY.targetP).sort((a, b) => sections[a].recent - sections[b].recent);
    return { sections, cats, patterns, partAcc, weakestPart, weakSections };
  }

  /* Share of practice per part: exam weight (Part I and II carry the listening
     two-thirds) boosted by the gap to the benchmark. Untested parts get a
     moderate boost so they are sampled. */
  function partWeights(I, st, date) {
    const pr = profile(I, st, date);
    const base = { 1: 0.40, 2: 0.33, 3: 0.27 };
    const w = {};
    for (const p of [1, 2, 3]) {
      const a = pr.partAcc[p];
      const gap = a.n >= 4 ? Math.max(0, POLICY.targetP + 0.1 - a.recent) : 0.2;
      w[p] = base[p] * (1 + 2.5 * gap);
    }
    const Z = w[1] + w[2] + w[3];
    for (const p of [1, 2, 3]) w[p] /= Z;
    return w;
  }

  /* ---------- question selection ---------- */
  function lastSeen(st) { const m = {}; for (const r of st.responses) if (!r.nr && (!m[r.q] || r.date > m[r.q])) m[r.q] = r.date; return m; }
  function abilityFor(st, part, date) { return estimate(measuring(st).filter(r => r.part === part), date).theta; }

  /* opts: { sections: [ids] | weights: {sec: w}, n, date, rng, targetP, exclude: Set, trapBias: [traps], difficulty: [lo, hi] } */
  function pickQuestions(I, st, opts) {
    const rng = opts.rng || Math.random, date = opts.date;
    const seen = lastSeen(st);
    const excl = opts.exclude || new Set();
    const secs = opts.sections || SECTION_ORDER;
    const theta = {}; for (const p of [1, 2, 3]) theta[p] = abilityFor(st, p, date);
    const target = opts.targetP || POLICY.practiceP;
    const bias = new Set(opts.trapBias || []);
    const score = q => {
      const s = seen[q.id];
      const fresh = !s, ago = s ? CAL.daysBetween(s, date) : 999;
      if (!fresh && ago < POLICY.avoidRepeatDays) return -50 + ago;   // only if nothing else is left
      const p = pCorrect(theta[q.part], bOf(q.difficulty));
      let x = -Math.abs(p - target) * 4 + (fresh ? 2 : Math.min(1, ago / 30));
      if (bias.size && q.traps.some(t => t && bias.has(t))) x += 0.8;
      if (opts.difficulty && (q.difficulty < opts.difficulty[0] || q.difficulty > opts.difficulty[1])) x -= 3;
      return x + rng() * 0.6;                                           // a little randomness: no fixed order
    };
    const pool = I.qs.filter(q => secs.includes(q.section) && !excl.has(q.id));
    const out = [];
    if (opts.weights) {
      // Distribute n over sections by weight (largest remainder), then best items per section.
      const ws = Object.entries(opts.weights).filter(([s, w]) => w > 0 && I.bySection[s] && I.bySection[s].length);
      const Z = ws.reduce((a, [, w]) => a + w, 0) || 1;
      const alloc = ws.map(([s, w]) => ({ s, x: opts.n * w / Z })).map(o => ({ s: o.s, k: Math.floor(o.x), r: o.x - Math.floor(o.x) }));
      let left = opts.n - alloc.reduce((a, o) => a + o.k, 0);
      alloc.sort((a, b) => b.r - a.r).forEach(o => { if (left > 0) { o.k++; left--; } });
      for (const o of alloc) out.push(...pool.filter(q => q.section === o.s).map(q => [score(q), q]).sort((a, b) => b[0] - a[0]).slice(0, o.k).map(x => x[1]));
    } else {
      out.push(...pool.map(q => [score(q), q]).sort((a, b) => b[0] - a[0]).slice(0, opts.n).map(x => x[1]));
    }
    return spreadTopics(out, rng);
  }
  // Avoid two consecutive questions on the same topic or section where possible.
  function spreadTopics(qs, rng) {
    const rest = shuffle(qs, rng), out = [];
    while (rest.length) {
      const last = out[out.length - 1];
      let k = rest.findIndex(q => !last || (q.topic !== last.topic && q.section !== last.section));
      if (k < 0) k = rest.findIndex(q => !last || q.topic !== last.topic);
      if (k < 0) k = 0;
      out.push(rest.splice(k, 1)[0]);
    }
    return out;
  }
  // Diagnostic: fixed breadth across all 9 sections, a staircase within each
  // section (start at band 3; harder after a correct answer, easier after a miss)
  // is applied as the session runs (see answer → adaptNext).
  function diagnosticQueue(I, st, rng, plan) {
    const out = [];
    for (const s of SECTION_ORDER) {
      const n = plan[s] || 0; if (!n) continue;
      const pool = I.bySection[s].filter(q => q.difficulty >= 2 && q.difficulty <= 4);
      const first = shuffle(pool.filter(q => q.difficulty === 3), rng)[0] || shuffle(pool, rng)[0];
      if (!first) continue;
      out.push({ qid: first.id, stair: s, left: n - 1 });
    }
    // Interleave parts so the learner isn't hit with 8 listening items in a row.
    return out;
  }

  /* ---------- cards & sessions ---------- */
  function qCard(q, rng, phase) {
    const order = q.fixedOrder ? [0, 1, 2, 3] : shuffle([0, 1, 2, 3], rng);
    return { id: uid('c'), type: 'q', qid: q.id, sec: q.section, part: q.part, perm: order, correct: order.indexOf(q.answer), phase: phase || null };
  }
  const KIND_LABEL = { diagnostic: 'Diagnostic', practice: 'Practice', listening: 'Listening (Part I)', listenread: 'Listening & reading (Part II)', reading: 'Reading (Part III)', keigo: 'Keigo & workplace communication', vocab: 'Business vocabulary', review: 'Mistake review', timed: 'Timed mixed practice', midcheck: 'Mixed timed assessment', mock: 'Mock examination', final: 'Final readiness assessment' };

  /* Start a session. spec: { kind, n, sections, weights, taskId, timed, split, trapBias } */
  function startSession(I, st, spec, ctx) {
    const rng = ctx.rng || Math.random, date = ctx.date, now = ctx.now ? ctx.now() : Date.now();
    const s = { id: uid('s'), kind: spec.kind, taskId: spec.taskId || null, date, startTs: now, queue: [], i: 0, results: [], timed: !!spec.timed, label: spec.label || KIND_LABEL[spec.kind] || spec.kind };
    const sec = SECTION_ORDER;
    if (spec.kind === 'diagnostic') {
      s.stairs = diagnosticQueue(I, st, rng, spec.plan || POLICY.diagnostic);
      s.queue = interleaveParts(s.stairs.map(x => qCard(I.byId[x.qid], rng, 'diag')));
      s.used = s.queue.map(c => c.qid);
    } else if (spec.kind === 'mock' || spec.kind === 'midcheck' || spec.kind === 'final') {
      const plan = spec.kind === 'mock' ? Object.fromEntries(sec.map(x => [x, SECTIONS[x].mock])) : POLICY[spec.kind];
      const qs = mockSelection(I, st, plan, rng, date);
      s.queue = qs.map(q => qCard(q, rng, 'exam'));
      s.timed = true; s.exam = true;
      s.plays = st.prefs.mockPlays || POLICY.mockPlaysDefault;
      s.parts = [1, 2, 3].map(p => ({ part: p, limitSec: Math.round(PARTS[p].minutes * 60 * (spec.kind === 'mock' ? 1 : (s.queue.filter(c => c.part === p).length / PARTS[p].count))), usedMs: 0, startedAt: null, done: false }));
      s.split = !!spec.split; s.interruptions = 0; s.seenBefore = qs.filter(q => lastSeen(st)[q.id]).length;
      s.milestone = spec.milestone || null;
    } else if (spec.kind === 'review') {
      const due = Object.entries(st.review).filter(([id, x]) => I.byId[id] && x.due <= date).sort((a, b) => a[1].due < b[1].due ? -1 : 1).slice(0, spec.n || 15);
      s.queue = shuffle(due.map(([id]) => qCard(I.byId[id], rng, 'review')), rng);
    } else if (spec.kind === 'vocab') {
      s.queue = vocabQueue(I, st, date, rng, spec);
    } else {
      // practice / listening / listenread / reading / keigo / timed
      const opts = { n: spec.n || 8, date, rng, trapBias: spec.trapBias || profile(I, st, date).patterns.slice(0, 3).map(p => p.trap) };
      if (spec.weights) opts.weights = spec.weights;
      else opts.sections = spec.sections || (spec.kind === 'listening' ? ['scene', 'utterance', 'listening'] : spec.kind === 'listenread' ? ['situation', 'document', 'integrated'] : spec.kind === 'reading' ? ['vocab', 'expression', 'reading'] : spec.kind === 'keigo' ? ['utterance', 'expression'] : sec);
      if (spec.kind === 'keigo' && !spec.sections) opts.sections = ['utterance', 'expression'];
      s.queue = pickQuestions(I, st, opts).map(q => qCard(q, rng, spec.kind));
      if (spec.kind === 'keigo') s.queue = s.queue.concat(vocabQueue(I, st, date, rng, { cats: ['keigo-sonkei', 'keigo-kenjo', 'hierarchy-etiquette', 'email', 'phone'], newMax: 3, reviewMax: 6 }));
      if (spec.timed) s.limitSec = s.queue.reduce((a, c) => a + (c.type === 'q' ? SECTIONS[c.sec].sec : 10), 0);
    }
    if (!s.queue.length) s.reason = spec.kind === 'review' ? 'nothing-due' : 'no-material';
    return s;
  }
  function interleaveParts(cards) {
    const by = { 1: [], 2: [], 3: [] }; cards.forEach(c => by[c.part].push(c));
    const out = []; let k = 0;
    while (by[1].length + by[2].length + by[3].length) { const p = [1, 2, 3][k++ % 3]; if (by[p].length) out.push(by[p].shift()); }
    return out;
  }
  // Mock selection: the official per-section counts, unseen items first, a
  // realistic difficulty mix, ordered easy → hard within each section.
  function mockSelection(I, st, plan, rng, date) {
    const seen = lastSeen(st), out = [];
    for (const s of SECTION_ORDER) {
      const n = plan[s] || 0; if (!n) continue;
      const pool = I.bySection[s];
      // Difficulty quota per band (largest remainder).
      const raw = [1, 2, 3, 4, 5].map(d => ({ d, x: n * POLICY.mockDifficulty[d] }));
      const want = {}; raw.forEach(o => { want[o.d] = Math.floor(o.x); });
      let rem = n - raw.reduce((a, o) => a + Math.floor(o.x), 0);
      raw.sort((a, b) => (b.x - Math.floor(b.x)) - (a.x - Math.floor(a.x)) || Math.abs(a.d - 3) - Math.abs(b.d - 3)).forEach(o => { if (rem > 0) { want[o.d]++; rem--; } });
      const rank = q => (seen[q.id] ? 1000 - Math.min(999, CAL.daysBetween(seen[q.id], date)) : 0) + rng();
      const chosen = [];
      for (const d of [1, 2, 3, 4, 5]) chosen.push(...pool.filter(q => q.difficulty === d).sort((a, b) => rank(a) - rank(b)).slice(0, want[d]));
      // Fill any shortfall (thin bands) from the rest of the section.
      for (const q of pool.slice().sort((a, b) => rank(a) - rank(b))) { if (chosen.length >= n) break; if (!chosen.includes(q)) chosen.push(q); }
      out.push(...chosen.slice(0, n).sort((a, b) => a.difficulty - b.difficulty));
    }
    return out;
  }

  /* ---------- vocabulary (own FSRS memory in state.bjt.vocab) ---------- */
  function vocabDue(I, st, date) {
    const out = [];
    for (const [id, m] of Object.entries(st.vocab)) {
      if (!I.vocabById[id]) continue;
      for (const [skill, x] of Object.entries(m.skills || {})) if (x.due <= date) out.push({ id, skill, R: SRS.recallProb(x, date) });
    }
    return out.sort((a, b) => a.R - b.R);
  }
  // New vocabulary order: tier, then words from questions the learner missed,
  // then categories tied to weak skills.
  function vocabNew(I, st, date, cats) {
    const missedJp = new Set();
    for (const r of st.responses) if (!r.ok) { const q = I.byId[r.q]; if (q) for (const v of q.vocab || []) missedJp.add(v.jp); }
    const pr = profile(I, st, date);
    const keigoWeak = pr.cats.keigo.n >= 3 && pr.cats.keigo.recent < POLICY.targetP;
    return I.vocab.filter(v => !st.vocab[v.id] && (!cats || cats.includes(v.cat)))
      .map(v => [v.tier * 10 - (missedJp.has(v.jp) ? 6 : 0) - (keigoWeak && /keigo|hierarchy|email|phone/.test(v.cat) ? 3 : 0), v])
      .sort((a, b) => a[0] - b[0]).map(x => x[1]);
  }
  function vocabCard(I, v, skill, rng, audio) {
    const same = I.vocab.filter(x => x.id !== v.id && x.cat === v.cat);
    const other = I.vocab.filter(x => x.id !== v.id && x.cat !== v.cat);
    const pairItem = v.pair && I.vocabById[v.pair];
    const pick = (field) => {
      const seen = new Set([v[field]]); const ds = [];
      for (const x of [pairItem].concat(shuffle(same, rng), shuffle(other, rng))) { if (x && !seen.has(x[field]) && ds.length < 3) { seen.add(x[field]); ds.push(x[field]); } }
      return ds;
    };
    if (skill === 'jp') { const opts = shuffle([v.jp].concat(pick('jp')), rng); return { id: uid('v'), type: 'vjp', vid: v.id, skill, options: opts, correct: opts.indexOf(v.jp) }; }
    const opts = shuffle([v.en].concat(pick('en')), rng);
    return { id: uid('v'), type: skill === 'listen' && audio ? 'vlisten' : 'vmean', vid: v.id, skill: skill === 'listen' && !audio ? 'meaning' : skill, options: opts, correct: opts.indexOf(v.en) };
  }
  function vocabQueue(I, st, date, rng, spec) {
    spec = spec || {};
    const due = vocabDue(I, st, date).filter(d => !spec.cats || spec.cats.includes(I.vocabById[d.id].cat));
    const reviews = []; const used = new Set();
    for (const d of due) { if (used.has(d.id)) continue; used.add(d.id); reviews.push(d); if (reviews.length >= (spec.reviewMax || POLICY.vocabMaxReviews)) break; }
    // Fewer new items when reviews pile up or recent retention is low.
    const ret = vocabRetention(st, date);
    let nNew = spec.newMax != null ? spec.newMax : POLICY.vocabNewPerDay;
    if (reviews.length > 25) nNew = Math.min(nNew, 3); else if (reviews.length > 15) nNew = Math.min(nNew, 5);
    if (ret.n >= 10 && ret.rate < 0.75) nNew = Math.min(nNew, 4);
    const news = vocabNew(I, st, date, spec.cats).slice(0, nNew);
    const q = [];
    for (const d of reviews) q.push(Object.assign(vocabCard(I, I.vocabById[d.id], d.skill, rng, spec.audio), { phase: 'review' }));
    // Listening recognition is added once the meaning is reasonably stable (audio only).
    if (spec.audio) {
      let k = 0;
      for (const [id, m] of Object.entries(st.vocab)) {
        if (k >= 5 || used.has(id) || !I.vocabById[id]) continue;
        if (m.skills.meaning && m.skills.meaning.s >= 3 && !m.skills.listen) { q.push(Object.assign(vocabCard(I, I.vocabById[id], 'listen', rng, true), { phase: 'review' })); k++; }
      }
    }
    for (const v of news) q.push({ id: uid('v'), type: 'vteach', vid: v.id, phase: 'new' });
    for (const v of news) q.push(Object.assign(vocabCard(I, v, 'meaning', rng, false), { phase: 'new' }));
    for (const v of shuffle(news, rng)) q.push(Object.assign(vocabCard(I, v, 'jp', rng, false), { phase: 'new' }));
    return q;
  }
  function vocabRetention(st, date) {
    const rs = st.vocabLog.filter(r => r.elapsed >= 1 && CAL.daysBetween(r.date, date) <= 14);
    return { n: rs.length, rate: rs.length ? rs.filter(r => r.ok).length / rs.length : null };
  }
  function vocabStats(I, st, date) {
    const intro = Object.keys(st.vocab).filter(id => I.vocabById[id]);
    const strong = intro.filter(id => Object.values(st.vocab[id].skills || {}).some(x => x.s >= 7));
    return { total: I.vocab.length, introduced: intro.length, strong: strong.length, due: new Set(vocabDue(I, st, date).map(d => d.id)).size, retention: vocabRetention(st, date) };
  }

  /* ---------- answering (writes ONLY state.bjt) ----------
     response: { index | dontKnow, uncertain, plays, assisted, transcript }
     meta: { date, ms, now } */
  function answer(I, st, s, response, meta) {
    const c = s.queue[s.i]; if (!c) return null;
    if (c._answered) return c._answered;
    response = response || {};
    if (c.type === 'vteach') {
      const m = st.vocab[c.vid] || (st.vocab[c.vid] = { intro: meta.date, skills: {} });
      m.intro = m.intro || meta.date;
      return (c._answered = { result: null });
    }
    if (c.type === 'vmean' || c.type === 'vjp' || c.type === 'vlisten') {
      const ok = !response.dontKnow && response.index === c.correct;
      const m = st.vocab[c.vid] || (st.vocab[c.vid] = { intro: meta.date, skills: {} });
      const prev = m.skills[c.skill] || null;
      const elapsed = prev && prev.last ? CAL.daysBetween(prev.last, meta.date) : 0;
      m.skills[c.skill] = SRS.review(prev, SRS.gradeFromEvidence({ verdict: ok ? 'correct' : 'wrong', recognitionOnly: true }), meta.date);
      st.vocabLog.push({ v: c.vid, skill: c.skill, ok, date: meta.date, elapsed, sid: s.id });
      if (st.vocabLog.length > 4000) st.vocabLog.splice(0, st.vocabLog.length - 4000);
      s.results.push({ type: 'v', vid: c.vid, ok, phase: c.phase });
      if (!ok && c.phase === 'new' && !c.retry) s.queue.splice(Math.min(s.queue.length, s.i + 4), 0, Object.assign({}, c, { id: uid('v'), retry: true, _answered: undefined }));
      return (c._answered = { result: { ok, correct: c.correct, chose: response.index } });
    }
    // A BJT question.
    const q = I.byId[c.qid];
    const skip = response.skip === true;
    const orig = response.index != null && !response.dontKnow && !skip ? c.perm[response.index] : null;
    const ok = orig === q.answer;
    const trap = !ok && orig != null ? q.traps[orig] : null;
    const seenBefore = st.responses.some(r => r.q === q.id && !r.nr);
    const limit = SECTIONS[q.section].sec * 1000;
    const row = { sid: s.id, q: q.id, sec: q.section, part: q.part, d: q.difficulty, date: meta.date, ts: meta.now || null, ok, chose: orig, trap, ms: meta.ms || null,
      mode: s.kind, task: s.taskId || null, fresh: !seenBefore, plays: response.plays || 0, assisted: !!(response.assisted || response.transcript), transcript: !!response.transcript,
      timed: !!s.timed, over: !!(s.timed && meta.ms && meta.ms > limit), unc: !!response.uncertain, skip, nr: !!response.notReached, dk: !!response.dontKnow };
    // No duplicate record for the same card (double taps, re-renders).
    if (!st.responses.some(r => r.sid === s.id && r.card === c.id)) { row.card = c.id; st.responses.push(row); }
    if (st.responses.length > 6000) st.responses.splice(0, st.responses.length - 6000);
    s.results.push({ type: 'q', qid: q.id, sec: q.section, part: q.part, ok, trap, unc: row.unc, skip, nr: row.nr, ms: row.ms, chose: orig });
    // Mistake review memory (FSRS): a wrong or uncertain answer schedules the question.
    if (s.kind === 'review') {
      const x = st.review[q.id];
      st.review[q.id] = SRS.review(x || null, SRS.gradeFromEvidence({ verdict: ok ? 'correct' : 'wrong', recognitionOnly: true }), meta.date);
      if (ok && st.review[q.id].s >= 21) delete st.review[q.id];          // retired: answered correctly over a long interval
    } else if ((!ok || row.unc) && !response.notReached) {
      st.review[q.id] = st.review[q.id] && st.review[q.id].due <= meta.date ? st.review[q.id] : SRS.review(null, 1, meta.date);
    }
    // Diagnostic staircase: next item in this section adapts to the answer.
    if (s.kind === 'diagnostic' && s.stairs) adaptDiagnostic(I, s, q, ok, meta);
    const out = { result: s.exam ? { saved: true } : { ok, correct: c.correct, chose: response.index, trap, origChose: orig } };
    return (c._answered = out);
  }
  function adaptDiagnostic(I, s, q, ok, meta) {
    const stair = s.stairs.find(x => x.stair === q.section);
    if (!stair || stair.left <= 0) return;
    stair.left--;
    const want = clamp(q.difficulty + (ok ? 1 : -1), 1, 5);
    const pool = I.bySection[q.section].filter(x => !s.used.includes(x.id));
    const next = pool.sort((a, b) => Math.abs(a.difficulty - want) - Math.abs(b.difficulty - want) || (a.id < b.id ? -1 : 1))[0];
    if (!next) return;
    s.used.push(next.id);
    // Insert later in the session (spaced), not immediately after.
    const pos = Math.min(s.queue.length, s.i + 1 + 3);
    s.queue.splice(pos, 0, qCard(next, meta.rng || Math.random, 'diag'));
  }

  /* ---------- exam timing (active time only; pauses are counted) ---------- */
  function partOf(s) { const c = s.queue[s.i]; return c && s.parts ? s.parts.find(p => p.part === c.part) : null; }
  function tick(s, now) {
    const p = partOf(s); if (!p || p.done) return null;
    if (p.startedAt == null) p.startedAt = now;
    if (s._lastTick != null && !s.paused) p.usedMs += Math.max(0, Math.min(now - s._lastTick, 5000));   // cap: a frozen tab can't eat the clock
    s._lastTick = now;
    return { part: p.part, leftSec: Math.max(0, Math.round(p.limitSec - p.usedMs / 1000)), expired: p.usedMs / 1000 >= p.limitSec };
  }
  function pause(s, now) { if (s && !s.paused) { s.paused = true; s.pausedAt = now; } }
  function resume(s, now) { if (s && s.paused) { s.paused = false; if (now - (s.pausedAt || now) > 120000) s.interruptions = (s.interruptions || 0) + 1; s._lastTick = now; } }
  // Time is up for the current part. The question on screen counts as unanswered
  // (wrong); questions never reached also count as wrong in the attempt's total,
  // but are not "seen" (they can appear again) and are not ability evidence.
  function expirePart(I, st, s, meta) {
    const p = partOf(s); if (!p) return;
    let first = true;
    while (s.queue[s.i] && s.queue[s.i].part === p.part) {
      if (!s.queue[s.i]._answered) answer(I, st, s, first ? { skip: true } : { skip: true, notReached: true }, meta);
      first = false;
      s.i++;
    }
    p.done = true; p.expired = true;
  }

  /* ---------- finishing ---------- */
  function summarize(I, s) {
    const qs = s.results.filter(r => r.type === 'q');
    const nr = qs.filter(r => r.nr).length;
    const bySec = {}, byPart = {}, traps = {};
    for (const r of qs) {
      const a = bySec[r.sec] || (bySec[r.sec] = { n: 0, ok: 0 }); a.n++; if (r.ok) a.ok++;
      const b = byPart[r.part] || (byPart[r.part] = { n: 0, ok: 0 }); b.n++; if (r.ok) b.ok++;
      if (r.trap) traps[r.trap] = (traps[r.trap] || 0) + 1;
    }
    const vs = s.results.filter(r => r.type === 'v');
    return { id: s.id, kind: s.kind, label: s.label, taskId: s.taskId, date: s.date, answered: qs.length, correct: qs.filter(r => r.ok).length, skipped: qs.filter(r => r.skip).length, notReached: nr, uncertain: qs.filter(r => r.unc).length,
      bySec, byPart, traps, vocab: { n: vs.length, ok: vs.filter(r => r.ok).length }, timed: !!s.timed, exam: !!s.exam, endedEarly: s.i < s.queue.length,
      parts: s.parts ? s.parts.map(p => ({ part: p.part, usedSec: Math.round(p.usedMs / 1000), limitSec: p.limitSec, expired: !!p.expired })) : null,
      interruptions: s.interruptions || 0, seenBefore: s.seenBefore || 0, split: !!s.split, plays: s.plays || null };
  }
  function finish(I, st, s, date) {
    const sum = summarize(I, s);
    s.finished = true; s.summary = sum;
    st.sessions.push(Object.assign({}, sum, { bySec: sum.bySec }));
    if (st.sessions.length > 500) st.sessions.shift();
    if (s.exam) {
      st.mocks.push({ id: s.id, kind: s.kind, date, label: s.label, answered: sum.answered, correct: sum.correct, total: s.queue.filter(c => c.type === 'q').length, byPart: sum.byPart, bySec: sum.bySec, parts: sum.parts, interruptions: sum.interruptions, seenBefore: sum.seenBefore, split: sum.split, plays: sum.plays, complete: !sum.endedEarly });
    }
    // Task / milestone completion.
    const complete = !sum.endedEarly || (s.kind === 'vocab' && sum.vocab.n >= 5) || (sum.answered >= Math.ceil(0.8 * s.queue.filter(c => c.type === 'q').length) && sum.answered > 0);
    if (s.taskId) {
      const d = st.done[s.taskId] || (st.done[s.taskId] = { n: 0, sessions: [] });
      d.n += sum.answered + sum.vocab.n; d.sessions.push(s.id);
      if (complete) d.at = d.at || date;
    }
    const ms = { diagnostic: 'diagnostic', midcheck: 'midcheck', final: 'final' }[s.kind] || (s.kind === 'mock' ? s.milestone : null);
    if (ms && complete && !st.milestones[ms]) st.milestones[ms] = { date, sid: s.id };
    return sum;
  }

  /* ---------- the daily plan ----------
     A day's tasks are generated once (first view of that day) and stored, so
     they don't shift under the learner while they work; changing the time
     budget regenerates the tasks not yet started. Missed routine practice is
     not piled onto later days (no compression): the next day's plan is
     already built from current weaknesses, and at most one high-value missed
     block from the previous 3 days is offered as an optional catch-up.
     Milestones (diagnostic, timed assessment, mocks, final) carry forward
     until done or superseded. */
  function dueReviewCount(I, st, date) { return Object.entries(st.review).filter(([id, x]) => I.byId[id] && x.due <= date).length; }
  function openMilestones(st, date) {
    return MILESTONES.filter(m => !st.milestones[m.id] && (m.from == null || date >= m.from) && date <= m.carryUntil)
      .map(m => Object.assign({}, m, { overdue: date > m.to }));
  }
  function makeTasks(I, st, date, budgetMin) {
    const di = dayInfo(date);
    const phase = di.phase ? di.phase.id : (di.state === 'before' ? 1 : 6);
    const tasks = [];
    const add = (t) => { t.id = date + ':' + t.kind + ':' + tasks.filter(x => x.kind === t.kind).length; tasks.push(t); return t; };
    const diagDone = !!st.milestones.diagnostic;
    const ms = openMilestones(st, date);
    for (const m of ms) {
      if (m.id === 'diagnostic') add({ kind: 'diagnostic', label: 'Diagnostic assessment', why: 'Measures all three parts so the plan can target your weakest areas. About 25 questions; you can pause and resume.', est: 30, core: true, milestone: 'diagnostic', overdue: m.overdue });
      if (m.id === 'midcheck' && diagDone) add({ kind: 'midcheck', label: m.label, why: 'Timed, mixed across all parts (about 40 questions, half-length timing) — checks progress after two weeks.', est: 55, core: true, milestone: 'midcheck', overdue: m.overdue });
      if ((m.id === 'mock1' || m.id === 'mock2') && diagDone) add({ kind: 'mock', label: m.label, why: '80 questions in the official three-part structure with part time limits. Can be split into three sittings within the window.', est: 105, core: true, milestone: m.id, overdue: m.overdue });
      if (m.id === 'final') add({ kind: 'final', label: m.label, why: 'Fresh questions across all parts, timed. Closes the programme with a report.', est: 55, core: true, milestone: 'final', overdue: m.overdue });
    }
    const due = dueReviewCount(I, st, date);
    if (due) add({ kind: 'review', label: 'Mistake review', why: due + ' earlier mistake' + (due > 1 ? 's' : '') + ' due again (spaced repetition).', est: Math.min(15, Math.ceil(due * 1.5)), core: true, n: Math.min(15, due) });
    const vs = vocabStats(I, st, date);
    if (I.vocab.length) add({ kind: 'vocab', label: 'Business vocabulary', why: (vs.due ? vs.due + ' due · ' : '') + 'new words chosen from your mistakes and weak skills.', est: 8, core: true });
    if (diagDone || di.state === 'after') {
      const w = partWeights(I, st, date);
      const pr = profile(I, st, date);
      const per = p => POLICY.minPerQuestion[p];
      const block = (part, extra) => {
        const kind = part === 1 ? 'listening' : part === 2 ? 'listenread' : 'reading';
        const n = Math.max(5, Math.round(POLICY.blockMinutes / per(part)));
        const weakSecs = pr.weakSections.filter(s => SECTIONS[s].part === part);
        return Object.assign({ kind, part, n, label: KIND_LABEL[kind], est: Math.round(n * per(part)), core: true, why: weakSecs.length ? 'Weakest here: ' + weakSecs.map(s => SECTIONS[s].en).join(', ') + '.' : 'Share of practice follows the exam weight and your results.' }, extra || {});
      };
      const order = [1, 2, 3].sort((a, b) => w[b] - w[a]);
      if (di.light) {
        add(block(order[0], { why: 'Light day: one short block on your weakest part.', n: 5, est: Math.round(5 * per(order[0])) }));
      } else if (phase <= 2) {
        add(block(order[0])); add(block(order[1]));
        if (phase === 1) add({ kind: 'keigo', label: KIND_LABEL.keigo, why: 'Register, keigo direction and in-group/out-group — tested in Part I and Part III.', est: 12, core: true, n: 6 });
        else add(block(order[2]));
        if (phase === 2 && date >= '2026-11-05') add({ kind: 'timed', label: 'Short timed set', why: 'Speed with accuracy: 10 mixed questions against the clock.', est: 10, core: true, n: 10, timed: true });
      } else if (phase === 3) {
        add(block(order[0], { trapFocus: true, why: 'Most time goes to your weakest part' + (pr.patterns[0] ? ' and to “' + pr.patterns[0].label.toLowerCase() + '” errors.' : '.') }));
        add(block(order[0], { n: 6, est: Math.round(6 * per(order[0])) }));
        add(block(order[1]));
        add({ kind: 'timed', label: 'Timed mixed set', why: 'Switching between parts under time pressure.', est: 15, core: true, n: 15, timed: true });
      } else if (phase === 4) {
        add({ kind: 'timed', label: 'Timed mixed set', why: 'Daily exam-pace practice across all parts.', est: 20, core: true, n: 20, timed: true });
        add(block(order[0]));
      } else {
        add(block(order[0], { why: 'Highest-impact weakness' + (pr.patterns[0] ? ': “' + pr.patterns[0].label.toLowerCase() + '”.' : '.') }));
        add({ kind: 'timed', label: 'Timed mixed set', why: 'Keep exam pace.', est: 15, core: true, n: 15, timed: true });
        add({ kind: 'keigo', label: KIND_LABEL.keigo, why: 'Final keigo and expression review.', est: 10, core: true, n: 5 });
      }
      // Catch-up: the most valuable undone core block from the last 3 days.
      for (let k = 1; k <= 3; k++) {
        const d = CAL.addDays(date, -k), day = st.days[d]; if (!day) continue;
        const miss = day.tasks.find(t => t.core && !st.done[t.id] && ['listening', 'listenread', 'reading', 'timed', 'keigo'].includes(t.kind));
        if (miss) { add(Object.assign({}, miss, { core: false, catchUp: d, label: 'Catch-up: ' + miss.label, why: 'Missed on ' + CAL.pretty(d) + '. Optional — today’s plan already covers your weakest areas.' })); break; }
      }
    }
    // Fit the budget: core tasks in priority order; what doesn't fit becomes optional.
    let used = 0;
    for (const t of tasks) {
      if (!t.core) continue;
      if (t.milestone) { used += Math.min(t.est, budgetMin); continue; }       // milestones always stay core (they can be split)
      if (used + t.est <= budgetMin + 5) used += t.est; else { t.core = false; t.why += ' (optional today: over your time budget)'; }
    }
    tasks.sort((a, b) => (b.core - a.core) || (!!b.milestone - !!a.milestone));
    return { date, budget: budgetMin, phase, light: di.light, tasks, gen: 1 };
  }
  function dayPlan(I, st, date, budgetMin, regenerate) {
    let day = st.days[date];
    const ms = openMilestones(st, date).map(m => m.id).join(',');
    if (!day || regenerate || day.budget !== budgetMin || day.ms !== ms) {
      const fresh = makeTasks(I, st, date, budgetMin);
      // Keep tasks already started or done (stable ids) from the previous version.
      if (day) for (const t of day.tasks) if (st.done[t.id] && !fresh.tasks.some(x => x.id === t.id)) fresh.tasks.push(t);
      fresh.ms = ms;
      st.days[date] = day = fresh;
    }
    return day;
  }
  function taskStatus(st, t) { const d = st.done[t.id]; return d && d.at ? 'done' : d && d.n ? 'started' : 'todo'; }
  function specForTask(I, st, t, date) {
    const spec = { kind: t.kind, taskId: t.id, n: t.n, timed: !!t.timed, label: t.label };
    if (t.kind === 'mock') spec.milestone = t.milestone;
    if (t.kind === 'timed') spec.weights = Object.fromEntries(SECTION_ORDER.map(s => [s, SECTIONS[s].mock]));
    if (['listening', 'listenread', 'reading'].includes(t.kind)) {
      const pr = profile(I, st, date);
      const secs = SECTION_ORDER.filter(s => SECTIONS[s].part === t.part);
      const w = {}; for (const s of secs) { const a = pr.sections[s]; w[s] = SECTIONS[s].mock * (1 + (a.n >= 3 ? 2 * Math.max(0, POLICY.targetP + 0.1 - a.recent) : 0.3)); }
      spec.weights = w;
    }
    return spec;
  }
  function recommend(I, st, date, day) {
    const t = day.tasks.find(x => x.core && taskStatus(st, x) !== 'done');
    return t || day.tasks.find(x => taskStatus(st, x) !== 'done') || null;
  }
  // Calendar overview for the plan page: per date, what was planned and done.
  function planOverview(I, st, today) {
    return allDates().map(d => {
      const di = dayInfo(d), day = st.days[d];
      const planned = day ? day.tasks.filter(t => t.core).length : null;
      const done = day ? day.tasks.filter(t => t.core && taskStatus(st, t) === 'done').length : 0;
      const answered = st.responses.filter(r => r.date === d).length + st.vocabLog.filter(r => r.date === d).length;
      const ms = MILESTONES.filter(m => (m.from || PLAN.start) <= d && m.to >= d).map(m => ({ id: m.id, label: m.label, done: !!st.milestones[m.id], doneOn: st.milestones[m.id] && st.milestones[m.id].date }));
      const status = d > today ? 'upcoming' : d === today ? 'today' : planned == null ? (answered ? 'practised' : 'missed') : done >= planned ? 'done' : done || answered ? 'partial' : 'missed';
      return { date: d, dayNo: di.dayNo, phase: di.phase && di.phase.id, light: di.light, planned, done, answered, status, milestones: ms };
    });
  }

  /* ---------- reporting ---------- */
  function trend(st, date) {
    // Raw accuracy per study day (non-review, non-assisted), to show change over time.
    const by = {};
    for (const r of st.responses) { if (r.mode === 'review' || r.assisted || r.skip) continue; const x = by[r.date] || (by[r.date] = { n: 0, ok: 0 }); x.n++; if (r.ok) x.ok++; }
    return Object.entries(by).sort().map(([d, x]) => ({ date: d, n: x.n, acc: x.ok / x.n }));
  }
  function finalReport(I, st, date) {
    const rd = readiness(I, st, date), pr = profile(I, st, date);
    const strengths = SECTION_ORDER.filter(s => pr.sections[s].n >= 5 && pr.sections[s].recent >= POLICY.targetP + 0.1);
    const weak = pr.weakSections;
    let rec;
    if (rd.overall === 'insufficient') rec = 'There is not enough evidence to judge readiness. Complete a mock exam before deciding.';
    else if (rd.overall === 'on-track') rec = 'Your practice results are consistent with the target band. Book the test while the material is fresh; keep 20–30 minutes a day of timed mixed practice and review until the test date.';
    else if (rd.overall === 'borderline') rec = 'Borderline. Two to three more weeks focused on ' + (weak.length ? weak.slice(0, 2).map(s => SECTIONS[s].en.toLowerCase()).join(' and ') : 'your weakest part') + ', with one more full mock, would make 400+ more likely.';
    else rec = 'Not yet consistent with the target band. Continue preparation (4+ weeks) before sitting the exam, prioritising ' + (weak.length ? weak.slice(0, 2).map(s => SECTIONS[s].en.toLowerCase()).join(' and ') : 'listening') + '.';
    return { readiness: rd, strengths, weak, patterns: pr.patterns.slice(0, 5), mocks: st.mocks.slice(), trend: trend(st, date), recommendation: rec };
  }

  return {
    PLAN, PHASES, LIGHT_DAYS, MILESTONES, SECTIONS, SECTION_ORDER, PARTS, TRAPS, CATEGORIES, POLICY, KIND_LABEL,
    index, blankState, normalize, dayInfo, allDates, estimate, accuracy, readiness, profile, partWeights, pickQuestions, mockSelection,
    startSession, answer, finish, summarize, tick, pause, resume, expirePart, partOf, qCard,
    vocabQueue, vocabStats, vocabDue, vocabRetention, makeTasks, dayPlan, taskStatus, specForTask, recommend, planOverview, openMilestones,
    trend, finalReport, pCorrect, bOf, measuring, lastSeen
  };
});
