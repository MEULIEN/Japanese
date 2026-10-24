/* BJT Training page: programme dates, plan & recovery, diagnostic, adaptive
   selection, scoring/readiness rules, mocks & timing, persistence, isolation,
   and the integrity of the REAL question bank and vocabulary. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, run } = require('./harness');
const BJ = require('../js/bjt.js');
const ENG = require('../js/engine.js');
const CAL = require('../js/calendar.js');
const F = require('./fixtures');
const VAL = require('../scripts/validate_bjt.js');

const D = path.join(__dirname, '..', 'data', 'bjt');
const REAL = (() => {
  const idx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'index.json'), 'utf8'));
  const b = idx.bjt || { questions: [], vocab: null };
  return { files: b.questions.map(f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'))), vocab: b.vocab ? JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', b.vocab), 'utf8')) : { items: [] }, idx: b };
})();

/* ---------- synthetic bank (test-only): 30 items per section, bands 1–5 ---------- */
const TR = ['negation', 'number', 'detail', 'intention', 'change', 'politeness', 'integration', 'visual'];
function synth(per) {
  per = per || 30;
  const files = BJ.SECTION_ORDER.map(sec => ({ section: sec, questions: Array.from({ length: per }, (_, k) => {
    const ans = k % 4;
    const traps = [0, 1, 2, 3].map(i => i === ans ? null : TR[(k + i) % TR.length]);
    return { id: sec + '-' + k, section: sec, difficulty: 1 + (k % 5), skills: [['vocab', 'keigo', 'intention', 'info', 'detail'][k % 5]], topic: ['meeting', 'phone', 'order', 'email', 'hr', 'cost'][k % 6],
      stem: '質問' + k, options: ['あ' + k, 'い' + k, 'う' + k, 'え' + k], answer: ans, explanation: 'x', whyWrong: ['a', 'b', 'c', 'd'], traps, evidence: '証拠', vocab: [{ jp: '納期' + (k % 7), kana: 'のうき', en: 'deadline' }],
      audio: BJ.SECTIONS[sec].part < 3 ? { lines: [{ spk: 'M1', text: 'はい' }], question: '何？' } : undefined };
  }) }));
  const vocab = { items: Array.from({ length: 60 }, (_, k) => ({ id: 'bv' + k, jp: '語' + k, kana: 'ご', en: 'word ' + k, cat: ['meetings', 'keigo-sonkei', 'email', 'money'][k % 4], tier: 1 + (k % 3), status: 'verified', example: { jp: '例', en: 'e' }, sources: [{}] })) };
  return { files, vocab };
}
const SY = synth();
const C = F.curriculum();

function eng(opts) {
  opts = opts || {};
  const storage = opts.storage || new F.MemStorage();
  const clk = F.clock(opts.start || '2026-10-26T08:00:00+09:00', 20000);
  const E = ENG.create({ C, B: opts.B || SY, storage, now: clk, rng: F.seededRng(opts.seed || 7), audio: () => true });
  E.state.settings.timeZone = 'Asia/Tokyo';
  return { E, clk, storage };
}
// Simulated learner: P(correct) by part at band 3, shifted by difficulty.
function learner(pByPart) {
  return (q) => { const p = pByPart[q.part]; return Math.max(0.05, Math.min(0.97, p - (q.difficulty - 3) * 0.1)); };
}
function drive(E, clk, pFn, rng, max) {
  let n = 0;
  while (E.bjt.current() && n++ < (max || 400)) {
    const c = E.bjt.current();
    clk.tick();
    if (c.type === 'vteach') E.bjt.answer({});
    else if (c.type === 'q') { const q = E.bjt.q(c.qid); E.bjt.answer({ index: rng() < pFn(q) ? c.correct : (c.correct + 1) % 4 }); }
    else E.bjt.answer({ index: rng() < 0.8 ? c.correct : (c.correct + 1) % c.options.length });
    E.bjt.next();
  }
  return E.bjt.finish();
}

/* ---------- dates ---------- */
test('programme: Oct 26 → Nov 30 2026 is 36 days; every date in exactly one phase; day numbers and days left', () => {
  const dates = BJ.allDates();
  assert.strictEqual(dates.length, 36);
  assert.strictEqual(dates[0], '2026-10-26'); assert.strictEqual(dates[35], '2026-11-30');
  for (const d of dates) assert.strictEqual(BJ.PHASES.filter(p => d >= p.from && d <= p.to).length, 1, d);
  const a = BJ.dayInfo('2026-10-26'), z = BJ.dayInfo('2026-11-30');
  assert.deepStrictEqual([a.dayNo, a.daysLeft, a.state, a.phase.id], [1, 35, 'during', 1]);
  assert.deepStrictEqual([z.dayNo, z.daysLeft, z.state, z.phase.id], [36, 0, 'during', 6]);
  assert.deepStrictEqual([BJ.dayInfo('2026-11-02').phase.id, BJ.dayInfo('2026-11-09').phase.id, BJ.dayInfo('2026-11-16').phase.id, BJ.dayInfo('2026-11-23').phase.id], [2, 3, 4, 5]);
  assert.strictEqual(BJ.dayInfo('2026-10-25').state, 'before'); assert.strictEqual(BJ.dayInfo('2026-10-25').daysToStart, 1);
  assert.strictEqual(BJ.dayInfo('2026-12-01').state, 'after');
  assert.ok(BJ.dayInfo('2026-11-01').light && !BJ.dayInfo('2026-11-02').light);
});
test('programme dates follow the learner’s local calendar (Tokyo vs Paris across the Oct 25 DST change)', () => {
  const { E, clk } = eng({ start: '2026-10-25T23:30:00+09:00' });
  assert.strictEqual(E.today(), '2026-10-25');
  clk.set('2026-10-26T00:10:00+09:00'); assert.strictEqual(BJ.dayInfo(E.today()).dayNo, 1);
  E.state.settings.timeZone = 'Europe/Paris';                    // still Oct 25 in Paris (17:10, after DST ended)
  assert.strictEqual(E.today(), '2026-10-25');
});

/* ---------- scoring rules ---------- */
test('no data → readiness is "insufficient", and nothing anywhere is presented as a 0–800 score', () => {
  const { E } = eng();
  const r = E.bjt.dashboard().readiness;
  assert.strictEqual(r.overall, 'insufficient');
  for (const p of [1, 2, 3]) assert.strictEqual(r.parts[p].status, 'insufficient');
  assert.ok(r.notes.some(n => /Not a BJT score/.test(n)));
  const scan = (o, k) => { if (o && typeof o === 'object') for (const [kk, v] of Object.entries(o)) scan(v, kk); else if (typeof o === 'number' && /score/i.test(k || '')) assert.fail('score-like field ' + k); };
  scan(r); scan(E.bjt.report());
  for (const p of [1, 2, 3]) { const x = r.parts[p]; assert.ok(x.pTarget >= 0.25 && x.pTarget <= 1 && x.lo <= x.pTarget && x.hi >= x.pTarget); }
});
test('ability estimate: rises with accuracy, shrinks uncertainty with evidence, ignores re-asks and assisted answers', () => {
  const mk = (n, p, d) => Array.from({ length: n }, (_, k) => ({ d: d || 3, ok: k < Math.round(n * p), date: '2026-11-01' }));
  const lo = BJ.estimate(mk(20, 0.4), '2026-11-01'), hi = BJ.estimate(mk(20, 0.85), '2026-11-01');
  assert.ok(hi.theta > lo.theta + 0.5, lo.theta + ' vs ' + hi.theta);
  assert.ok(BJ.estimate(mk(40, 0.6), '2026-11-01').sd < BJ.estimate(mk(8, 0.6), '2026-11-01').sd);
  const st = BJ.blankState();
  st.responses.push({ q: 'a', part: 1, d: 3, ok: true, date: '2026-11-01', fresh: true }, { q: 'a', part: 1, d: 3, ok: true, date: '2026-11-02', fresh: false },
    { q: 'b', part: 1, d: 3, ok: true, date: '2026-11-02', fresh: true, assisted: true }, { q: 'c', part: 1, d: 3, ok: false, date: '2026-11-02', fresh: true, mode: 'review' });
  assert.deepStrictEqual(BJ.measuring(st).map(r => r.q), ['a']);
});

/* ---------- answers & feedback ---------- */
test('answers: options are shuffled per card, the key follows the shuffle, the chosen distractor’s error pattern is recorded; double taps record once', () => {
  const { E } = eng();
  const s = E.bjt.start({ kind: 'practice', n: 12 }).session;
  const perms = new Set(s.queue.map(c => c.perm.join('')));
  assert.ok(perms.size > 1, 'not always the same order');
  const c = E.bjt.current(), q = E.bjt.q(c.qid);
  assert.strictEqual(c.perm[c.correct], q.answer);
  const wrong = (c.correct + 1) % 4;
  const out = E.bjt.answer({ index: wrong });
  assert.strictEqual(out.result.ok, false);
  assert.strictEqual(out.result.trap, q.traps[c.perm[wrong]]);
  E.bjt.answer({ index: c.correct });                              // double tap
  const rows = E.state.bjt.responses.filter(r => r.sid === s.id);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].ok, false);
  assert.ok(E.state.bjt.review[q.id], 'a mistake is scheduled for review');
});
test('mock answers are saved without revealing correctness until the attempt is complete', () => {
  const { E } = eng();
  E.bjt.start({ kind: 'mock', milestone: 'mock1' });
  const c = E.bjt.current();
  const out = E.bjt.answer({ index: c.correct, uncertain: true });
  assert.deepStrictEqual(out.result, { saved: true });
});

/* ---------- diagnostic & adaptation ---------- */
test('diagnostic: samples all nine sections (~25 items), staircase adapts difficulty, reports by section and part', () => {
  const { E, clk } = eng(); const rng = F.seededRng(11);
  const s = E.bjt.start({ kind: 'diagnostic', taskId: 'x' }).session;
  assert.deepStrictEqual(new Set(s.queue.map(c => c.sec)).size, 9);
  assert.ok(s.queue.every(c => [2, 3, 4].includes(E.bjt.q(c.qid).difficulty)));
  const sum = drive(E, clk, learner({ 1: 0.95, 2: 0.95, 3: 0.95 }), rng);
  const total = Object.values(BJ.POLICY.diagnostic).reduce((a, b) => a + b, 0);
  assert.strictEqual(sum.answered, total);
  const ds = E.state.bjt.responses.filter(r => r.sid === s.id);
  for (const sec of BJ.SECTION_ORDER) {
    const d = ds.filter(r => r.sec === sec).map(r => r.d);
    if (d.length > 1 && ds.filter(r => r.sec === sec)[0].ok) assert.ok(d[1] > d[0], sec + ' got harder after a correct answer: ' + d);
  }
  assert.ok(sum.byPart[1].n && sum.byPart[2].n && sum.byPart[3].n);
  assert.ok(E.state.bjt.milestones.diagnostic);
});
test('adaptive plan: the weakest part gets the largest share; the label moves once performance improves', () => {
  const { E, clk } = eng(); const rng = F.seededRng(5);
  E.bjt.start({ kind: 'diagnostic' }); drive(E, clk, learner({ 1: 0.25, 2: 0.75, 3: 0.85 }), rng);
  for (let k = 0; k < 3; k++) { E.bjt.start({ kind: 'practice', n: 15 }); drive(E, clk, learner({ 1: 0.3, 2: 0.75, 3: 0.85 }), rng); }
  let pr = BJ.profile(E.BI, E.state.bjt, E.today());
  assert.strictEqual(pr.weakestPart, 1);
  const w = BJ.partWeights(E.BI, E.state.bjt, E.today());
  assert.ok(w[1] > w[2] && w[1] > w[3], JSON.stringify(w));
  // Ten days later Part I has improved and Part III has slipped.
  clk.set('2026-11-08T09:00:00+09:00');
  for (let k = 0; k < 6; k++) { E.bjt.start({ kind: 'practice', n: 15 }); drive(E, clk, learner({ 1: 0.92, 2: 0.75, 3: 0.35 }), rng); }
  pr = BJ.profile(E.BI, E.state.bjt, E.today());
  assert.notStrictEqual(pr.weakestPart, 1, 'Part I is no longer weakest');
  assert.ok(!pr.weakSections.includes('scene') || pr.sections.scene.recent < 0.7);
});
test('selection targets the learner’s level and avoids repeating recently practised questions', () => {
  const { E, clk } = eng(); const rng = F.seededRng(9);
  E.bjt.start({ kind: 'practice', n: 20 }); drive(E, clk, learner({ 1: 0.95, 2: 0.95, 3: 0.95 }), rng);
  const firstIds = new Set(E.state.bjt.responses.map(r => r.q));
  const s = E.bjt.start({ kind: 'practice', n: 20 }).session;
  assert.ok(s.queue.every(c => !firstIds.has(c.qid)), 'no repeats while unseen items remain');
  const avgD = s.queue.reduce((a, c) => a + E.bjt.q(c.qid).difficulty, 0) / s.queue.length;
  assert.ok(avgD > 3, 'strong learner gets harder items: ' + avgD);
  for (let k = 1; k < s.queue.length; k++) { const a = E.bjt.q(s.queue[k - 1].qid), b = E.bjt.q(s.queue[k].qid); assert.ok(a.topic !== b.topic || a.section !== b.section, 'spread'); }
});
test('error patterns drive targeted follow-up and mistake review returns on the next day', () => {
  const { E, clk } = eng(); const rng = F.seededRng(3);
  const s = E.bjt.start({ kind: 'practice', n: 20 }).session;
  // Always fall for the "negation" distractor when one exists.
  while (E.bjt.current()) { const c = E.bjt.current(), q = E.bjt.q(c.qid); const k = q.traps.indexOf('negation'); const disp = k >= 0 ? c.perm.indexOf(k) : c.correct; E.bjt.answer({ index: disp }); E.bjt.next(); }
  E.bjt.finish();
  const pr = BJ.profile(E.BI, E.state.bjt, E.today());
  assert.strictEqual(pr.patterns[0].trap, 'negation');
  const s2 = E.bjt.start({ kind: 'practice', n: 10 }).session;
  const share = s2.queue.filter(c => E.bjt.q(c.qid).traps.includes('negation')).length / s2.queue.length;
  assert.ok(share >= 0.5, 'targeted follow-up share ' + share);
  E.bjt.discard();
  clk.set('2026-10-27T09:00:00+09:00');
  const r = E.bjt.start({ kind: 'review' }).session;
  assert.ok(r.queue.length >= 1 && r.queue.every(c => E.state.bjt.review[c.qid]));
  assert.ok(s.queue.length);
});

/* ---------- the daily plan ---------- */
const tasksOn = (E, clk, iso, budget) => { clk.set(iso); if (budget) E.state.settings.minutes.bjt = budget; return E.bjt.plan(); };
test('plan: day 1 = diagnostic + vocabulary; practice blocks appear once the diagnostic is done; budget sizes the core work', () => {
  const { E, clk } = eng(); const rng = F.seededRng(2);
  let d = tasksOn(E, clk, '2026-10-26T08:00:00+09:00');
  assert.deepStrictEqual(d.tasks.filter(t => t.core).map(t => t.kind), ['diagnostic', 'vocab']);
  E.bjt.start(d.tasks[0].id); drive(E, clk, learner({ 1: 0.5, 2: 0.6, 3: 0.7 }), rng);
  assert.strictEqual(E.bjt.dashboard().status(d.tasks[0]), 'done');
  d = E.bjt.plan();
  assert.ok(d.tasks.some(t => ['listening', 'listenread', 'reading'].includes(t.kind)), 'practice after the diagnostic');
  assert.ok(d.tasks.find(t => t.kind === 'diagnostic'), 'completed task kept in the day');
  const big = tasksOn(E, clk, '2026-10-28T08:00:00+09:00', 90).tasks.filter(t => t.core && !t.milestone).reduce((a, t) => a + t.est, 0);
  E.state.bjt.days = {};
  const small = tasksOn(E, clk, '2026-10-28T08:00:00+09:00', 20).tasks.filter(t => t.core && !t.milestone).reduce((a, t) => a + t.est, 0);
  assert.ok(small < big && small <= 25, small + ' vs ' + big);
  assert.ok(E.bjt.plan().tasks.some(t => !t.core), 'what doesn’t fit is optional, not dropped');
});
test('plan: listening-weighted, light Sundays, milestones open in their windows, carry when missed, then are superseded', () => {
  const { E, clk } = eng(); const rng = F.seededRng(8);
  E.bjt.start({ kind: 'diagnostic' }); drive(E, clk, learner({ 1: 0.6, 2: 0.6, 3: 0.6 }), rng);
  const kinds = iso => tasksOn(E, clk, iso).tasks.map(t => t.kind);
  assert.ok(!kinds('2026-11-12T08:00:00+09:00').includes('midcheck'));
  assert.ok(kinds('2026-11-13T08:00:00+09:00').includes('midcheck'));
  const t17 = tasksOn(E, clk, '2026-11-17T08:00:00+09:00').tasks.find(t => t.kind === 'midcheck');
  assert.ok(t17 && t17.overdue, 'missed assessment carries forward, flagged overdue');
  assert.ok(!kinds('2026-11-19T08:00:00+09:00').includes('midcheck'), 'superseded by the mock window');
  assert.ok(kinds('2026-11-19T08:00:00+09:00').includes('mock'));
  const sun = tasksOn(E, clk, '2026-11-08T08:00:00+09:00').tasks.filter(t => t.core && !t.milestone).reduce((a, t) => a + t.est, 0);
  const mon = tasksOn(E, clk, '2026-11-09T08:00:00+09:00').tasks.filter(t => t.core && !t.milestone).reduce((a, t) => a + t.est, 0);
  assert.ok(sun < mon, 'Sunday is lighter: ' + sun + ' vs ' + mon);
  assert.ok(kinds('2026-11-30T08:00:00+09:00').includes('final'));
  const w = BJ.partWeights(E.BI, E.state.bjt, E.today());
  assert.ok(w[1] + w[2] > 0.55, 'listening-related parts get most of the practice');
});
test('missed days: no compression — the next day’s core load is normal, plus at most one optional catch-up', () => {
  const { E, clk } = eng(); const rng = F.seededRng(4);
  E.bjt.start({ kind: 'diagnostic' }); drive(E, clk, learner({ 1: 0.6, 2: 0.6, 3: 0.6 }), rng);
  const nov3 = tasksOn(E, clk, '2026-11-03T08:00:00+09:00');                  // seen but not done
  const coreN = nov3.tasks.filter(t => t.core).length;
  const nov6 = tasksOn(E, clk, '2026-11-06T08:00:00+09:00');                  // 2 days skipped entirely
  assert.ok(nov6.tasks.filter(t => t.core).length <= coreN + 1);
  const cu = nov6.tasks.filter(t => t.catchUp);
  assert.ok(cu.length <= 1 && cu.every(t => !t.core));
  const ov = E.bjt.overview();
  assert.strictEqual(ov.length, 36);
  assert.strictEqual(ov.find(x => x.date === '2026-11-03').status, 'missed');
  assert.strictEqual(ov.find(x => x.date === '2026-11-06').status, 'today');
  assert.strictEqual(ov.find(x => x.date === '2026-11-20').status, 'upcoming');
});

/* ---------- mock exam ---------- */
test('mock exam: 80 questions in the official section counts, Part I → II → III, part time limits 45/30/30 min', () => {
  const { E } = eng();
  const s = E.bjt.start({ kind: 'mock', milestone: 'mock1' }).session;
  assert.strictEqual(s.queue.length, 80);
  for (const sec of BJ.SECTION_ORDER) assert.strictEqual(s.queue.filter(c => c.sec === sec).length, BJ.SECTIONS[sec].mock, sec);
  const parts = s.queue.map(c => c.part); assert.deepStrictEqual(parts, parts.slice().sort());
  assert.deepStrictEqual(s.parts.map(p => p.limitSec / 60), [45, 30, 30]);
  assert.strictEqual(s.plays, 1, 'default mock rule: audio once');
  assert.ok(s.queue.every(c => c.phase === 'exam'));
});
test('mock timing: only active time counts; when a part’s time runs out the rest of that part is closed and scored as unanswered', () => {
  const { E, clk } = eng();
  const s = E.bjt.start({ kind: 'mock', milestone: 'mock1' }).session;
  E.bjt.tick(); E.bjt.answer({ index: E.bjt.current().correct }); E.bjt.next();
  E.bjt.pause(); clk.tick(30 * 60000); E.bjt.resumeClock();                  // half an hour in the background
  assert.ok(E.bjt.tick().leftSec > 44 * 60 - 60, 'pause did not consume exam time');
  assert.strictEqual(s.interruptions, 1);
  for (let k = 0; k < 600; k++) { clk.tick(5000); E.bjt.tick(); }            // let Part I run out
  assert.strictEqual(E.bjt.current().part, 2, 'moved to Part II');
  const p1 = E.state.bjt.responses.filter(r => r.sid === s.id && r.part === 1);
  assert.strictEqual(p1.length, 25);
  assert.strictEqual(p1.filter(r => r.nr).length, 23, 'never-reached items flagged');
  assert.ok(p1.filter(r => r.nr).every(r => !BJ.lastSeen(E.state.bjt)[r.q]), 'not counted as seen');
  while (E.bjt.current()) { E.bjt.answer({ index: 0 }); E.bjt.next(); }
  const sum = E.bjt.finish();
  assert.strictEqual(sum.answered, 80); assert.strictEqual(sum.notReached, 23);
  assert.ok(E.state.bjt.milestones.mock1);
  assert.strictEqual(E.state.bjt.mocks.length, 1);
  assert.ok(E.state.bjt.mocks[0].parts[0].expired);
});
test('timed practice records over-time answers and contributes to “accuracy under time pressure”', () => {
  const { E, clk } = eng();
  E.bjt.start({ kind: 'timed', n: 6, timed: true });
  let k = 0;
  while (E.bjt.current()) { clk.tick(k++ % 2 ? 5000 : 400000); E.bjt.answer({ index: E.bjt.current().correct }); E.bjt.next(); }
  E.bjt.finish();
  const rs = E.state.bjt.responses;
  assert.ok(rs.every(r => r.timed) && rs.some(r => r.over) && rs.some(r => !r.over));
  assert.ok(E.bjt.dashboard().profile.cats.timed.n === 6);
});

/* ---------- persistence & isolation ---------- */
test('persistence: answers, plan and an unfinished session survive a restart; the session resumes at the same question', () => {
  const storage = new F.MemStorage();
  const a = eng({ storage });
  const d = a.E.bjt.plan();
  const s = a.E.bjt.start(d.tasks[0].id).session;
  a.E.bjt.answer({ index: 0 }); a.E.bjt.next(); a.E.bjt.answer({ index: 1 }); a.E.bjt.next();
  const b = eng({ storage, start: '2026-10-26T09:00:00+09:00' });
  assert.ok(b.E.bjt.session && b.E.bjt.session.id === s.id && b.E.bjt.session.i === 2);
  assert.strictEqual(b.E.state.bjt.responses.length, 2);
  assert.ok(b.E.state.bjt.days['2026-10-26']);
  assert.strictEqual(b.E.bjt.start({ kind: 'practice' }).error, 'running', 'one session at a time — no accidental reset');
});
test('isolation: BJT study never changes the vocabulary memory, practice store or kanji schedule; existing users start clean', () => {
  const storage = new F.MemStorage();
  const old = require('../js/store.js').blank('2026-10-01');
  old.memory = { f_omizu: { intro: '2026-10-01', skills: { recognition: { s: 3, d: 5, due: '2026-10-30', last: '2026-10-27', reps: 2, lapses: 0 } } } };
  storage.setItem('michi_v2', JSON.stringify(Object.assign(old, { bjt: undefined })));
  const { E, clk } = eng({ storage });
  assert.strictEqual(E.state.bjt, null, 'no BJT data until first use');
  const before = JSON.stringify([E.state.memory, E.state.practice, E.state.kanji, E.state.log, E.state.daily, E.state.sessions]);
  E.bjt.start({ kind: 'diagnostic' }); drive(E, clk, learner({ 1: 0.5, 2: 0.5, 3: 0.5 }), F.seededRng(1));
  E.bjt.start({ kind: 'vocab', audio: true }); drive(E, clk, learner({ 1: 0.5, 2: 0.5, 3: 0.5 }), F.seededRng(2));
  assert.strictEqual(JSON.stringify([E.state.memory, E.state.practice, E.state.kanji, E.state.log, E.state.daily, E.state.sessions]), before);
  assert.ok(Object.keys(E.state.bjt.vocab).length > 0);
});
test('vocabulary: new items are taught then checked both ways; errors come back within the session; FSRS reviews next days', () => {
  const { E, clk } = eng();
  const s = E.bjt.start({ kind: 'vocab' }).session;
  const teach = s.queue.filter(c => c.type === 'vteach').length;
  assert.ok(teach >= 1 && teach <= BJ.POLICY.vocabNewPerDay);
  assert.ok(s.queue.some(c => c.type === 'vmean') && s.queue.some(c => c.type === 'vjp'));
  drive(E, clk, () => 0, F.seededRng(1));
  clk.set('2026-10-28T09:00:00+09:00');
  const s2 = E.bjt.start({ kind: 'vocab' }).session;
  assert.ok(s2.queue.some(c => c.phase === 'review'), 'due reviews');
});

/* ---------- the REAL bank ---------- */
test('real question bank: every item passes the validator; ids unique; enough items for two full mocks per section', () => {
  assert.ok(REAL.files.length >= 9, 'question files listed in data/index.json → bjt.questions');
  const all = REAL.files.flatMap(f => f.questions);
  const ids = new Set();
  for (const q of all) { const e = VAL.validateQuestion(q); assert.deepStrictEqual(e, [], q.id + ': ' + e.join('; ')); assert.ok(!ids.has(q.id), 'dup ' + q.id); ids.add(q.id); }
  const I = BJ.index(REAL.files, REAL.vocab);
  for (const sec of BJ.SECTION_ORDER) {
    const n = I.bySection[sec].length;
    assert.ok(n >= 2 * BJ.SECTIONS[sec].mock, sec + ': ' + n);
    assert.ok(I.bySection[sec].some(q => q.difficulty === 3), sec + ' has target-band items');
  }
  console.log('       ' + all.length + ' questions · ' + BJ.SECTION_ORDER.map(s => s + ' ' + I.bySection[s].length).join(', '));
});
test('real bank: answer key is not guessable from position or length; every distractor has a reason and an error pattern', () => {
  const all = REAL.files.flatMap(f => f.questions);
  const pos = [0, 0, 0, 0]; let longest = 0;
  for (const q of all) {
    pos[q.answer]++;
    const L = q.options.map(o => o.length); const m = Math.max(...L);
    if (L[q.answer] === m && L.filter(x => x === m).length === 1) longest++;
  }
  assert.ok(longest / all.length < 0.4, 'answer uniquely longest in ' + Math.round(100 * longest / all.length) + '%');
  const I = BJ.index(REAL.files, REAL.vocab); const rng = F.seededRng(1);
  const disp = [0, 0, 0, 0]; for (const q of I.qs) disp[BJ.qCard(q, rng).correct]++;
  assert.ok(Math.min(...disp) > I.qs.length * 0.15, 'displayed positions balanced: ' + disp);
});
test('real vocabulary: verified items only are served, each with a source, reading in kana, and a usage example', () => {
  const items = REAL.vocab.items || [];
  assert.ok(items.length >= 100, 'vocab ' + items.length);
  for (const v of items) assert.deepStrictEqual(VAL.validateVocab(v), [], v.id);
  const I = BJ.index(REAL.files, REAL.vocab);
  assert.ok(I.vocab.every(v => v.status === 'verified' && v.sources.length));
});
test('real bank runs end-to-end: diagnostic, practice in all modes, a full mock and the final report', () => {
  const { E, clk } = eng({ B: REAL }); const rng = F.seededRng(12);
  E.bjt.start({ kind: 'diagnostic' }); drive(E, clk, learner({ 1: 0.55, 2: 0.65, 3: 0.7 }), rng);
  for (const kind of ['listening', 'listenread', 'reading', 'keigo', 'vocab', 'timed', 'review']) { const r = E.bjt.start({ kind, n: 8, timed: kind === 'timed' }); if (r.error) { assert.strictEqual(kind, 'review'); continue; } drive(E, clk, learner({ 1: 0.55, 2: 0.65, 3: 0.7 }), rng); }
  const m = E.bjt.start({ kind: 'mock', milestone: 'mock1' }).session;
  assert.strictEqual(m.queue.length, 80);
  drive(E, clk, learner({ 1: 0.55, 2: 0.65, 3: 0.7 }), rng);
  const rep = E.bjt.report();
  assert.ok(['on-track', 'borderline', 'not-yet', 'insufficient'].includes(rep.readiness.overall));
  assert.ok(rep.recommendation.length > 20);
});

run('bjt: programme, plan, adaptation, scoring rules, mocks, persistence, content');
