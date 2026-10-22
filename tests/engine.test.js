/* Learning-engine tests: session planning, adaptation, isolation of
   independent study, weekly assessment, persistence & migration, and
   behaviour as the curriculum grows or shrinks. Run: node tests/engine.test.js */
const assert = require('assert');
const { test, run } = require('./harness');
const F = require('./fixtures');
const ENG = require('../js/engine.js');
const ST = require('../js/store.js');
const PL = require('../js/planner.js');
const X = require('../js/exercises.js');
const CAL = require('../js/calendar.js');
const P = require('../js/policy.js');

function engine(C, opts) {
  opts = opts || {};
  const storage = opts.storage || new F.MemStorage();
  const clk = opts.clock || F.clock(opts.start || '2026-10-21T08:00:00+09:00', 9000);
  const rng = F.seededRng(opts.seed || 7);
  const E = ENG.create({ C, storage, now: clk, rng, audio: () => opts.audio !== false });
  E.state.settings.timeZone = 'Asia/Tokyo';
  return { E, storage, clk, rng };
}
function deepFreeze(o) { Object.freeze(o); for (const v of Object.values(o)) if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v); return o; }
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------- morning ---------- */
test('morning: diagnostic covers ONLY this lesson’s candidate material, in one coherent topic', () => {
  const C = F.curriculum();
  const { E } = engine(C);
  const r = E.start('morning'); assert.ok(r.session, 'started');
  const s = r.session;
  const diagItems = s.queue.filter(c => c.phase === 'diag').map(c => c.item);
  const scope = new Set(s.plan.newIds.concat(s.plan.reserveIds));
  assert.ok(diagItems.length > 0);
  for (const id of diagItems) assert.ok(scope.has(id), 'diag item outside lesson scope: ' + id);
  // One topic — or, only when that topic has too little left for a normal
  // lesson, a top-up from one second topic (never a scattered mix).
  for (const id of scope) assert.ok([s.topic, s.topic2].includes(C.byId[id].topic), 'candidate outside the lesson topics: ' + id);
  if (s.topic2) assert.ok(C.byTopic[s.topic].filter(i => !E.state.memory[i.id]).length < P.morning.preferredNew[0], 'top-up only when the topic is nearly exhausted');
});
test('morning: a correct multiple-choice diagnostic triggers an unaided production check before counting as known', () => {
  const C = F.curriculum();
  const { E, rng } = engine(C);
  const s = E.start('morning').session;
  const first = E.current(); assert.strictEqual(first.ex, 'diag');
  E.answer({ index: first.correct }); E.next();
  const follow = E.current();
  if (C.byId[first.item].use === 'say') {
    assert.strictEqual(follow.ex, 'type'); assert.strictEqual(follow.item, first.item);
    assert.strictEqual(s.objectives[first.item].diag, 'partial', 'MC alone = partial, not known');
    E.answer({ text: 'ちがう' }); E.next();
    assert.strictEqual(s.objectives[first.item].diag, 'partial');
  }
});
test('morning: completes, introduces items, schedules the evening, nothing unfinished marked mastered', () => {
  const C = F.curriculum();
  const { E, rng, clk } = engine(C);
  E.start('morning'); F.drive(E, 0.8, rng, clk);
  const sum = E.finish();
  assert.ok(sum.introduced.length >= 1);
  assert.ok(E.state.lesson.pendingEvening && E.state.lesson.pendingEvening.items.length === sum.introduced.length);
  for (const id of sum.introduced) assert.ok(E.state.memory[id], 'introduced item in memory');
  for (const id of sum.established) assert.ok(sum.introduced.includes(id));
  // Every introduced item has at least one graded scheduled attempt today
  for (const id of sum.introduced) assert.ok(E.state.log.some(r => r.item === id && r.phase !== 'diag'), 'graded: ' + id);
});
test('morning: new-item count adapts to available time (no fixed lesson size)', () => {
  const C = F.curriculum({ scale: 120 });
  const sizes = [5, 20, 60].map(min => { const { E } = engine(C); E.state.settings.minutes.morning = min; return E.start('morning').session.plan.newIds.length; });
  assert.ok(sizes[0] < sizes[1], 'more time → more items ' + sizes);
  assert.ok(sizes[2] <= P.morning.absoluteMaxNew, 'never beyond the overload safeguard');
  assert.ok(sizes[0] >= 1, 'always something to learn');
});
test('morning: weak recent retention reduces new material', () => {
  const C = F.curriculum({ scale: 120 });
  const a = engine(C); const b = engine(C);
  const fill = (E, ok) => { for (let k = 0; k < 40; k++) E.state.log.push({ date: '2026-10-20', phase: 'review', verdict: ok(k) ? 'correct' : 'wrong' }); };
  fill(a.E, () => true); fill(b.E, k => k % 2 === 0);
  const na = a.E.start('morning').session.plan.newIds.length, nb = b.E.start('morning').session.plan.newIds.length;
  assert.ok(nb < na, `struggling learner gets fewer new items (${nb} < ${na})`);
});
test('morning: running out of time carries untaught objectives forward explicitly', () => {
  const C = F.curriculum({ scale: 60 });
  const { E, rng, clk } = engine(C);
  E.state.settings.minutes.morning = 6;
  E.start('morning');
  // Slow learner: 60 s per card.
  let n = 0; while (E.current() && n++ < 500) { clk.tick(60000); E.answer(F.respond(E, E.current(), 0.7, rng)); E.next(); }
  const sum = E.finish();
  assert.ok(sum.minutes <= 6 * 1.6, 'session stayed near its budget: ' + sum.minutes);
  if (sum.carry.length) {
    assert.deepStrictEqual(E.state.lesson.carry, sum.carry);
    for (const id of sum.carry) assert.ok(!sum.established.includes(id), 'carried items are not marked learned');
    const next = E.start('morning').session;
    assert.ok(sum.carry.some(id => next.plan.newIds.includes(id)), 'carried items come first next time');
  }
});
test('morning: ending early carries objectives; nothing silently mastered', () => {
  const C = F.curriculum();
  const { E, rng } = engine(C);
  E.start('morning');
  for (let k = 0; k < 3; k++) { E.answer(F.respond(E, E.current(), 1, rng)); E.next(); }
  const sum = E.endEarly();
  assert.ok(sum.carry.length > 0);
  // Only items with demonstrated unaided production may count as established.
  for (const id of sum.established) assert.ok(E.session.results.some(r => r.item === id && r.verdict === 'correct' && !r.hint && !['diag', 'choice', 'listen', 'pick'].includes(r.ex)), 'established without production: ' + id);
  assert.ok(E.state.sessions[E.state.sessions.length - 1].endedEarly);
});

/* ---------- mistakes ---------- */
test('mistakes: bounded remediation — per-item retry cap and time budget', () => {
  const C = F.curriculum();
  const { E, rng, clk } = engine(C);
  const s = E.start('morning').session;
  F.drive(E, 0.0, rng, clk);                              // every answer wrong
  for (const n of Object.values(s.retries)) assert.ok(n <= P.maxRetriesPerItem);
  assert.ok(s.remediationSec <= s.budgetSec * P.morning.remediationShare + 60);
  assert.ok(s.queue.length < 400, 'no runaway lesson: ' + s.queue.length);
});
test('mistakes: a retry uses a different exercise for the same skill, after a gap', () => {
  const C = F.curriculum();
  const { E, rng } = engine(C);
  const s = E.start('morning').session;
  let guard = 0;
  while (E.current() && E.current().phase === 'diag' && guard++ < 100) { E.answer({ dontKnow: true }); E.next(); }
  while (E.current() && guard++ < 300) {
    const c = E.current();
    if (c.ex === 'type' && c.phase === 'learn') {
      const at = s.i;
      const out = E.answer({ text: 'ぜんぜんちがう' });
      if (out.remediation && out.remediation.inserted) {
        const k = s.queue.findIndex(q => q.id === out.remediation.inserted);
        assert.ok(k - at > P.minRetryGap - 1 || k === s.queue.length - 1, 'gap before retry');
        assert.strictEqual(s.queue[k].skill, 'production');
        return;
      }
    } else E.answer(F.respond(E, c, 1, rng));
    E.next();
  }
});
test('diagnostic answers never create memory entries (a guess cannot make a word "introduced")', () => {
  const C = F.curriculum();
  const { E, rng } = engine(C);
  const s = E.start('morning').session;
  while (E.current() && E.current().phase === 'diag') { E.answer(F.respond(E, E.current(), 0.5, rng)); E.next(); }
  const graded = new Set(E.state.log.filter(r => r.phase !== 'diag').map(r => r.item));
  for (const id of Object.keys(E.state.memory)) assert.ok(graded.has(id), 'memory entry without lesson evidence: ' + id);
  assert.ok(E.state.log.some(r => r.phase === 'diag'), 'diagnostic still logged');
});
test('typos are feedback, not failures that trigger re-drilling', () => {
  const C = F.curriculum();
  const { E } = engine(C);
  const s = E.start('morning').session;
  const card = Object.assign({ id: 'x', phase: 'learn' }, X.G.type(C.byId['f_okaikei'], { C, scope: new Set(), rng: Math.random }));
  s.queue.splice(s.i, 0, card);
  const out = E.answer({ text: 'おかいげい' });
  assert.strictEqual(out.result.kind, 'typo');
  assert.ok(!out.remediation);
});

/* ---------- evening ---------- */
test('evening: no new vocabulary; only morning items + due reviews; different exercises than the morning', () => {
  const C = F.curriculum();
  const { E, rng, clk } = engine(C);
  E.start('morning'); F.drive(E, 0.8, rng, clk); const m = E.finish();
  const before = new Set(Object.keys(E.state.memory));
  clk.set('2026-10-21T19:00:00+09:00');
  const s = E.start('evening').session;
  assert.ok(s.queue.length > 0);
  for (const c of s.queue) {
    assert.ok(!['teach', 'diag', 'teachpattern'].includes(c.ex), 'no teaching in the evening');
    if (c.item) assert.ok(before.has(c.item), 'only previously introduced items: ' + c.item);
  }
  const cons = s.queue.filter(c => c.phase === 'consolidate');
  assert.ok(cons.length >= m.introduced.length, 'every morning item revisited');
  const morningEx = E.state.lesson.pendingEvening.exUsed;
  // Exact repetition = the same fixed-prompt exercise as in the morning
  // (pattern/cloze/form/build produce a new sentence or form each time).
  const FIXED = ['type', 'speak', 'choice', 'listen', 'pick', 'reading'];
  const repeats = cons.filter(c => FIXED.includes(c.ex) && (morningEx[c.item] || []).includes(c.ex)).length;
  assert.ok(repeats / cons.length <= 0.5, `mostly new prompts, not exact repeats (${repeats}/${cons.length})`);
  F.drive(E, 0.9, rng, clk); E.finish();
  assert.strictEqual(E.state.lesson.pendingEvening, null, 'morning consolidated');
  assert.strictEqual(Object.keys(E.state.memory).length, before.size, 'no new items introduced');
});
test('evening: emphasises productive skills', () => {
  const C = F.curriculum({ take: 9 });   // restaurant words only (all to be produced)
  const { E, rng, clk } = engine(C);
  E.start('morning'); F.drive(E, 0.8, rng, clk); E.finish();
  clk.set('2026-10-21T18:00:00+09:00');
  const s = E.start('evening').session;
  const say = c => c.phase === 'consolidate' && C.byId[c.item].use === 'say';
  const prod = s.queue.filter(c => say(c) && ['production', 'context', 'speaking', 'form', 'reading'].includes(c.skill)).length;
  const rec = s.queue.filter(c => say(c) && ['recognition', 'listening'].includes(c.skill)).length;
  assert.ok(prod >= rec, `productive ${prod} vs recognition ${rec}`);
});

/* ---------- isolation of independent study ---------- */
test('Recall never modifies the official schedule, mastery or scheduled statistics', () => {
  const C = F.curriculum();
  const { E, rng, clk } = engine(C);
  E.start('morning'); F.drive(E, 0.7, rng, clk); E.finish();
  const snap = clone({ memory: E.state.memory, log: E.state.log, daily: E.state.daily, latency: E.state.latency });
  deepFreeze(E.state.memory); deepFreeze(E.state.daily); deepFreeze(E.state.latency);
  for (const dir of Object.keys(PL.RECALL_DIRECTIONS)) {
    const r = E.start('recall', { direction: dir });
    if (r.error) continue;
    F.drive(E, 0.5, rng, clk, 40); E.finish();
  }
  assert.deepStrictEqual(clone(E.state.memory), snap.memory);
  assert.deepStrictEqual(clone(E.state.daily), snap.daily);
  assert.strictEqual(E.state.log.length, snap.log.length);
  assert.ok(E.state.practice.log.length > 0, 'practice was recorded separately');
});
test('Training (all activities) never modifies the official schedule', () => {
  const C = F.curriculum();
  const { E, rng, clk } = engine(C);
  E.start('morning'); F.drive(E, 0.7, rng, clk); E.finish();
  const snap = clone(E.state.memory);
  deepFreeze(E.state.memory);
  for (const act of ['mixed', 'span', 'switch', 'recovery', 'reconstruct']) {
    const r = E.start('training', { activity: act, focus: 'mixed' });
    if (r.error) continue;
    F.drive(E, 0.5, rng, clk, 30); E.finish();
  }
  assert.deepStrictEqual(clone(E.state.memory), snap);
});
test('isolation is enforced in the data layer, not the UI', () => {
  const st = ST.blank('2026-10-21');
  assert.throws(() => ST.recordScheduled(st, { kind: 'recall', item: 'a', skill: 'production', date: '2026-10-21' }));
  assert.throws(() => ST.recordPractice(st.practice, { kind: 'morning', item: 'a', skill: 'production', date: '2026-10-21' }));
});
test('practice sessions are endless but not degenerate: no item repeats back-to-back, misses return once', () => {
  const C = F.curriculum();
  const { E, rng, clk } = engine(C);
  E.start('morning'); F.drive(E, 0.8, rng, clk); E.finish();
  E.start('training', { focus: 'mixed' });
  const seen = [];
  for (let k = 0; k < 120 && E.current(); k++) { const c = E.current(); seen.push(c.item); E.answer(F.respond(E, c, 0.6, rng)); E.next(); }
  assert.ok(seen.length === 120, 'kept going: ' + seen.length);
  for (let k = 1; k < seen.length; k++) if (seen[k] && seen[k] === seen[k - 1]) assert.fail('back-to-back repeat at ' + k);
  const distinct = new Set(seen).size;
  assert.ok(distinct >= Math.min(5, Object.keys(E.state.memory).length), 'variety: ' + distinct);
  assert.ok(E.session.queue.length < 200, 'no growing duplicate backlog');
});

/* ---------- weekly ---------- */
test('weekly: locked before Sunday, available on Sunday without restart, done afterwards', () => {
  const C = F.curriculum();
  const { E, rng, clk } = engine(C, { start: '2026-10-21T08:00:00+09:00' });   // Wednesday
  E.start('morning'); F.drive(E, 0.8, rng, clk); E.finish();
  assert.strictEqual(E.availability().weekly.state, 'locked');
  assert.strictEqual(E.start('weekly').error, 'locked');
  clk.set('2026-10-24T23:59:00+09:00'); assert.strictEqual(E.availability().weekly.state, 'locked', 'Saturday night');
  clk.set('2026-10-25T00:01:00+09:00'); assert.strictEqual(E.availability().weekly.state, 'available', 'Sunday just after midnight');
  const s = E.start('weekly').session; assert.ok(s.queue.length > 0);
  F.drive(E, 0.8, rng, clk); const sum = E.finish();
  assert.ok(sum.report && sum.report.tested > 0);
  assert.strictEqual(E.availability().weekly.state, 'done');
  clk.set('2026-11-01T09:00:00+09:00'); assert.strictEqual(E.availability().weekly.state, 'available', 'next Sunday');
});
test('weekly: covers the week’s material broadly — at most maxSkillsPerItem per item, several skill dimensions', () => {
  const C = F.curriculum({ scale: 80 });
  const { E, rng, clk } = engine(C, { start: '2026-10-19T08:00:00+09:00' });
  for (let d = 0; d < 5; d++) { clk.set(CAL.addDays('2026-10-19', d) + 'T08:00:00+09:00'); E.start('morning'); F.drive(E, 0.8, rng, clk); E.finish(); clk.set(CAL.addDays('2026-10-19', d) + 'T19:00:00+09:00'); if (!E.start('evening').error) { F.drive(E, 0.8, rng, clk); E.finish(); } }
  clk.set('2026-10-25T10:00:00+09:00');
  const s = E.start('weekly').session;
  const per = {};
  for (const c of s.queue.filter(c => c.phase === 'assess')) per[c.item] = (per[c.item] || 0) + 1;
  for (const n of Object.values(per)) assert.ok(n <= P.weekly.maxSkillsPerItem);
  const skills = new Set(s.queue.map(c => c.skill));
  assert.ok(skills.size >= 4, 'multiple dimensions: ' + [...skills]);
  const weekItems = Object.keys(E.state.memory);
  assert.ok(Object.keys(per).length >= Math.min(weekItems.length, 10), 'breadth');
});
test('weekly: missed Sunday stays available (catch-up) and nothing is discarded', () => {
  const C = F.curriculum();
  const { E, rng, clk } = engine(C, { start: '2026-10-20T08:00:00+09:00' });
  E.start('morning'); F.drive(E, 0.8, rng, clk); E.finish();
  clk.set('2026-10-27T08:00:00+09:00');            // Tuesday after the Sunday
  const a = E.availability().weekly;
  assert.strictEqual(a.state, 'available'); assert.ok(a.status.catchUp);
  const s = E.start('weekly').session;
  assert.ok(s.plan.recentIds.length > 0, 'last week’s material is in scope');
});

/* ---------- curriculum growth / shrink & insufficient data ---------- */
test('generators work for curricula of any size (0 … 300 items) without code changes', () => {
  for (const n of [0, 1, 2, 3, 5, 31, 300]) {
    const C = n <= 31 ? F.curriculum({ take: n }) : F.curriculum({ scale: n });
    const { E, rng, clk } = engine(C);
    const r = E.start('morning');
    if (n === 0) { assert.ok(r.error, 'empty curriculum: honest error'); continue; }
    assert.ok(r.session, 'morning starts with ' + n + ' items');
    F.drive(E, 0.8, rng, clk); E.finish();
    for (const k of ['evening', 'recall', 'training']) { const x = E.start(k); if (x.session) { F.drive(E, 0.8, rng, clk, 50); E.finish(); } }
  }
});
test('insufficient data → a different valid exercise, never a broken one', () => {
  const C = F.curriculum({ take: 2 });          // only 2 items: no 3-option choice possible
  const g = { C, rng: Math.random, scope: new Set(C.items.map(i => i.id)), audio: true, memory: {} };
  assert.strictEqual(X.G.choice(C.items[0], g), null, 'choice needs 3 distinct options');
  const alt = X.forSkill(C.items[0], 'production', g);
  assert.ok(alt && alt.ex === 'type');
  const { E, rng, clk } = engine(C);
  E.start('morning'); F.drive(E, 1, rng, clk);
  for (const c of E.session.queue) assert.ok(c.ex !== 'choice' || c.options.length >= 3);
});
test('no Japanese voice → no listening cards; something else is used instead', () => {
  const C = F.curriculum();
  const { E } = engine(C, { audio: false });
  const s = E.start('morning').session;
  E.session.phase === 'diag' && PL.afterDiag(s, E.ctx());
  assert.ok(!s.queue.some(c => c.ex === 'listen'));
  assert.ok(s.queue.some(c => c.ex === 'type' || c.ex === 'choice'));
});
test('every card the planner produces passes validation', () => {
  const C = F.curriculum();
  const { E, rng, clk } = engine(C);
  const g = () => ({ C, rng, scope: new Set(Object.keys(E.state.memory).concat(C.items.map(i => i.id))), audio: true, memory: E.state.memory });
  for (const k of ['morning', 'evening', 'recall']) {
    const r = E.start(k); if (r.error) continue;
    if (E.session.phase === 'diag') PL.afterDiag(E.session, E.ctx());
    for (const c of E.session.queue) if (c.item) assert.ok(X.validate(c, C.byId[c.item], g()).ok, k + ' invalid ' + c.ex + ' ' + c.item + ' ' + JSON.stringify(X.validate(c, C.byId[c.item], g())));
    F.drive(E, 0.8, rng, clk, 300); E.finish();
  }
});
test('patterns are taught before they are practised', () => {
  const C = F.curriculum();
  const { E, rng, clk } = engine(C);
  const s = E.start('morning').session;
  PL.afterDiag(s, E.ctx());
  const seenP = new Set();
  for (const c of s.queue) {
    if (c.ex === 'teachpattern') seenP.add(c.pattern);
    if ((c.ex === 'pattern' || c.ex === 'build') && c.pattern) assert.ok(seenP.has(c.pattern), 'pattern used before taught: ' + c.pattern);
  }
});

/* ---------- persistence ---------- */
test('restart mid-session: progress so far persisted, session resumes at the same card', () => {
  const C = F.curriculum();
  const storage = new F.MemStorage();
  const a = engine(C, { storage });
  a.E.start('morning');
  for (let k = 0; k < 6; k++) { a.E.answer(F.respond(a.E, a.E.current(), 0, a.rng)); a.E.next(); }
  const at = a.E.session.i, cardId = a.E.current().id, logLen = a.E.state.log.length;
  const b = engine(C, { storage });                           // "restart the app"
  assert.strictEqual(b.E.state.log.length, logLen, 'answers already saved');
  const s = b.E.resume(); assert.ok(s);
  assert.strictEqual(s.i, at); assert.strictEqual(b.E.current().id, cardId);
  F.drive(b.E, 0.8, b.rng, b.clk); b.E.finish();
  assert.ok(b.E.state.lesson.pendingEvening);
});
test('corrupted main copy → automatic recovery from the previous copy', () => {
  const C = F.curriculum();
  const storage = new F.MemStorage();
  const a = engine(C, { storage });
  a.E.start('morning'); F.drive(a.E, 0.8, a.rng, a.clk); a.E.finish();
  a.E.save();                                                // creates a previous copy
  storage.setItem(ST.KEY, '{"schema":2, broken');
  const b = engine(C, { storage });
  assert.ok(b.E.loadNotes.includes('recovered-from-previous-copy'));
  assert.ok(Object.keys(b.E.state.memory).length > 0);
});
test('migration from v1: backup kept, history preserved, no false mastery', () => {
  const storage = new F.MemStorage();
  const v1 = { items: { f_omizu: { box: 4, due: '2026-10-25', reps: 5, lapses: 1, prod: 2 }, f_menu: { box: 2, due: '2026-10-22', reps: 2, lapses: 0, prod: 0 }, gone_item: { box: 3, due: '2026-10-23', reps: 3, lapses: 0, prod: 1 } }, days: { '2026-10-18': { kinds: ['morning', 'midday'], reviews: 9 } }, hooks: { f_omizu: 'O-MIZU = oh, me, zoo water' }, settings: { theme: 'dark' }, span: 4, flex: 2 };
  storage.setItem('michi_v1', JSON.stringify(v1));
  const C = F.curriculum();
  const { E } = engine(C, { storage });
  assert.ok(E.migrated);
  assert.strictEqual(storage.getItem('michi_v1_backup'), JSON.stringify(v1), 'byte-identical backup');
  assert.strictEqual(storage.getItem('michi_v1'), JSON.stringify(v1), 'original untouched');
  const m = E.state.memory.f_omizu;
  assert.strictEqual(m.skills.recognition.due, '2026-10-25');
  assert.ok(m.skills.production, 'unaided production history carried over');
  assert.ok(!E.state.memory.f_menu.skills.production, 'no production state invented');
  assert.ok(E.state.memory.gone_item, 'history for items not in the current curriculum is kept, just unused');
  assert.strictEqual(E.state.hooks.f_omizu, v1.hooks.f_omizu);
  assert.strictEqual(E.state.settings.theme, 'dark');
  assert.strictEqual(E.state.train.spanBest, 4);
  // schedule keeps working after migration
  const r = E.start('evening'); assert.ok(r.session || r.error);
  assert.ok(JSON.parse(storage.getItem(ST.KEY)).schema === 2, 'v2 saved');
});
test('export → import round-trip', () => {
  const C = F.curriculum();
  const a = engine(C);
  a.E.start('morning'); F.drive(a.E, 0.8, a.rng, a.clk); a.E.finish();
  const json = a.E.exportJSON();
  const b = engine(C);
  b.E.importJSON(json);
  assert.deepStrictEqual(b.E.state.memory, a.E.state.memory);
});

/* ---------- evening opens at 12:00 local time ---------- */
test('evening noon lock: 11:59 locked, 12:00 open, 12:01 open — enforced by start(), not just the UI', () => {
  const C = F.curriculum();
  const { E, rng, clk } = engine(C, { start: '2026-10-21T08:00:00+09:00' });
  E.start('morning'); F.drive(E, 0.8, rng, clk); E.finish();
  const results = [];
  for (const [t, expectOpen] of [['11:59:59', false], ['12:00:00', true], ['12:01:00', true], ['23:59:00', true]]) {
    clk.set('2026-10-21T' + t + '+09:00');
    const a = E.availability().evening;
    const r = E.start('evening');
    results.push(t + ' → ' + (a.state === 'available' ? 'open' : 'locked') + ' / start: ' + (r.error || 'session'));
    assert.strictEqual(a.state === 'available', expectOpen, t + ' availability');
    assert.strictEqual(!r.error, expectOpen, t + ' start() enforcement');
    if (!expectOpen) { assert.strictEqual(r.error, 'evening-locked'); assert.match(a.reason, /Available from 12:00/); }
    if (r.session) E.session = null;                       // don't run it here
  }
  console.log('       simulated clock (Asia/Tokyo): ' + results.join(' · '));
  assert.ok(!E.state.sessions.some(s => s.kind === 'evening'), 'unlocking never marks the evening done');
});
test('evening noon lock: next day locks again before noon; midnight rollover; morning/recall/training never time-locked', () => {
  const C = F.curriculum();
  const { E, rng, clk } = engine(C, { start: '2026-10-21T08:00:00+09:00' });
  E.start('morning'); F.drive(E, 0.8, rng, clk); E.finish();
  clk.set('2026-10-22T00:10:00+09:00');
  assert.strictEqual(E.availability().evening.state, 'locked', 'just after midnight');
  for (const k of ['morning', 'recall', 'training']) assert.ok(!E.start(k).error, k + ' available before noon');
  E.session = null;
  clk.set('2026-10-22T12:00:00+09:00');
  assert.strictEqual(E.availability().evening.state, 'available');
});
test('evening noon lock follows the configured time zone', () => {
  const C = F.curriculum();
  const { E, rng, clk } = engine(C, { start: '2026-10-21T08:00:00+09:00' });
  E.start('morning'); F.drive(E, 0.8, rng, clk); E.finish();
  clk.set('2026-10-21T03:30:00Z');                       // 12:30 in Tokyo, 05:30 in Paris
  E.state.settings.timeZone = 'Asia/Tokyo'; assert.strictEqual(E.availability().evening.state, 'available');
  E.state.settings.timeZone = 'Europe/Paris'; assert.strictEqual(E.availability().evening.state, 'locked');
  assert.match(E.availability().evening.reason, /in 6 h 30 min/);
});

/* ---------- topic priorities ---------- */
test('topic priorities: validated (known ids, no duplicates, at most 3) and persisted', () => {
  const C = F.curriculum();
  const storage = new F.MemStorage();
  const { E } = engine(C, { storage });
  assert.ok(E.setTopicPriorities(['directions']).ok);
  assert.ok(E.setTopicPriorities(['directions', 'daily']).ok);
  assert.ok(E.setTopicPriorities(['directions', 'daily', 'describe']).ok);
  assert.strictEqual(E.setTopicPriorities(['directions', 'daily', 'describe', 'signs']).error, 'too-many');
  assert.deepStrictEqual(E.state.settings.topicPriorities, ['directions', 'daily', 'describe'], 'a 4th is refused, the 3 stay');
  E.setTopicPriorities(['describe', 'directions', 'nope', 'describe']);
  assert.deepStrictEqual(E.state.settings.topicPriorities, ['describe', 'directions'], 'reorder/remove; unknown and duplicate ids dropped');
  const again = engine(C, { storage }).E;                 // restart
  assert.deepStrictEqual(again.state.settings.topicPriorities, ['describe', 'directions']);
});
test('topic priorities change actual lesson content, but learning stays broad', () => {
  const C = F.curriculum({ scale: 300 });
  const run = prios => {
    const { E, rng, clk } = engine(C, { start: '2026-11-02T08:00:00+09:00' });
    E.setTopicPriorities(prios);
    const topics = [];
    for (let d = 0; d < 12; d++) {
      clk.set(CAL.addDays('2026-11-02', d) + 'T08:00:00+09:00');
      const r = E.start('morning'); if (r.error) continue;
      topics.push(r.session.topic); F.drive(E, 0.85, rng, clk); E.finish();
    }
    return { topics, E };
  };
  const none = run([]), pr = run(['describe']);
  const share = pr.topics.filter(t => t === 'describe').length / pr.topics.length;
  console.log('       no priority:', none.topics.join(','), '\n       priority=describe:', pr.topics.join(','));
  assert.ok(share >= 0.5, 'priority topic dominates new material: ' + share);
  assert.ok(pr.topics.some(t => t !== 'describe'), 'other topics still introduced');
  assert.ok(none.topics.filter(t => t === 'describe').length < pr.topics.filter(t => t === 'describe').length, 'priority changed the lessons');
  // Reviews keep covering non-priority topics.
  const reviewedTopics = new Set(pr.E.state.log.filter(r => r.phase === 'review').map(r => C.byId[r.item].topic));
  assert.ok([...reviewedTopics].some(t => t !== 'describe'), 'spaced repetition still reviews other topics');
  // The morning tells the learner why.
  const s = pr.E.state.sessions.filter(x => x.kind === 'morning');
  assert.ok(s.some(x => x.topicWhy === 'priority') && s.some(x => x.topicWhy === 'balance'));
});
test('topic priorities: exhausted priority topic → other material (never an empty lesson); evening still adds nothing new', () => {
  const C = F.curriculum();                               // small: describe has 4 items
  const { E, rng, clk } = engine(C, { start: '2026-11-02T08:00:00+09:00' });
  E.setTopicPriorities(['describe']);
  for (let d = 0; d < 4; d++) {
    clk.set(CAL.addDays('2026-11-02', d) + 'T08:00:00+09:00');
    const r = E.start('morning');
    if (r.error) break;
    assert.ok(r.session.queue.length > 0, 'never an empty lesson');
    F.drive(E, 0.9, rng, clk); E.finish();
    clk.set(CAL.addDays('2026-11-02', d) + 'T19:00:00+09:00');
    const before = Object.keys(E.state.memory).length;
    if (!E.start('evening').error) { F.drive(E, 0.9, rng, clk); E.finish(); }
    assert.strictEqual(Object.keys(E.state.memory).length, before, 'evening introduced nothing new');
  }
  assert.ok(C.byTopic.describe.every(i => E.state.memory[i.id]), 'priority topic fully introduced');
  const later = E.state.sessions.filter(x => x.kind === 'morning').slice(-1)[0];
  assert.ok(later.topic !== 'describe' || later.topic2, 'then moves on to other material');
});
test('topic priorities do not change Recall/Training selection', () => {
  const C = F.curriculum();
  const a = engine(C, { seed: 3 }), b = engine(C, { seed: 3 });
  for (const x of [a, b]) { x.E.start('morning'); F.drive(x.E, 0.9, x.rng, x.clk); x.E.finish(); }
  b.E.setTopicPriorities(['describe']);
  const ra = a.E.start('recall', { focus: 'weak' }).session, rb = b.E.start('recall', { focus: 'weak' }).session;
  assert.strictEqual(ra.poolSize, rb.poolSize, 'same practice pool regardless of priorities');
});

test('merged vocabulary: history recorded under an alias id moves onto the canonical word', () => {
  const C = F.curriculum();
  C.byId.f_omizu.aliases = ['old_mizu']; C.aliasOf = { old_mizu: 'f_omizu' };
  const storage = new F.MemStorage();
  storage.setItem(ST.KEY, JSON.stringify(Object.assign(ST.blank('2026-10-21'), { memory: { old_mizu: { intro: '2026-10-01', skills: { recognition: { s: 5, d: 5, last: '2026-10-20', due: '2026-10-25', reps: 4, lapses: 0 } } } }, hooks: { old_mizu: 'my hook' } })));
  const { E } = engine(C, { storage });
  assert.ok(E.state.memory.f_omizu && !E.state.memory.old_mizu);
  assert.strictEqual(E.state.memory.f_omizu.skills.recognition.due, '2026-10-25', 'schedule kept');
  assert.strictEqual(E.state.hooks.f_omizu, 'my hook');
});

/* ---------- regressions for defects found during this rebuild ---------- */
test('regression: a correct retry after a miss is "needed help", not "recalled on your own"', () => {
  const C = F.curriculum({ take: 9 });
  const { E } = engine(C);
  const s = E.start('morning').session;
  PL.afterDiag(s, E.ctx());
  const it = C.byId['f_omizu'];
  const g = { C, scope: new Set([it.id]), rng: Math.random };
  const a = Object.assign({ id: 'r1', phase: 'learn' }, X.G.type(it, g)), b = Object.assign({ id: 'r2', phase: 'retry' }, X.G.type(it, g));
  s.queue.splice(s.i, 0, a, b);
  E.answer({ text: 'ちがう' }); E.next(); E.answer({ text: 'おみず' });
  const sum = PL.summarize(s, E.ctx());
  assert.ok(!sum.independent.includes(it.id)); assert.ok(sum.assisted.includes(it.id));
});
test('regression: memory span length adapts (grows after success, shrinks after a miss)', () => {
  const C = F.curriculum({ take: 9 });
  const { E, rng, clk } = engine(C);
  E.start('morning'); F.drive(E, 0.9, rng, clk); E.finish();
  E.start('training', { activity: 'span' });
  const n0 = E.current().n;
  E.answer({ won: true }); E.next(); const n1 = E.current().n;
  E.answer({ won: false }); E.next(); const n2 = E.current().n;
  assert.strictEqual(n1, n0 + 1); assert.strictEqual(n2, n1 - 1);
  assert.ok(E.state.train.spanHistory.length === 2);
});
test('regression: old fixed lesson sizes are gone — Recall has no end and no fixed count', () => {
  const C = F.curriculum();
  const { E, rng, clk } = engine(C);
  E.start('morning'); F.drive(E, 0.9, rng, clk); E.finish();
  E.start('recall', { focus: 'weak' });
  const n = F.drive(E, 0.7, rng, clk, 150);
  assert.strictEqual(n, 150, 'recall kept generating cards until the learner stopped');
});

/* ---------- long-run behaviour ---------- */
test('30 simulated days: reviews stay bounded, intervals grow for known items, failures resurface', () => {
  const C = F.curriculum({ scale: 200 });
  const { E, rng, clk } = engine(C, { start: '2026-11-01T08:00:00+09:00' });
  let maxQueue = 0;
  for (let d = 0; d < 30; d++) {
    const day = CAL.addDays('2026-11-01', d);
    clk.set(day + 'T08:00:00+09:00'); if (!E.start('morning').error) { F.drive(E, 0.85, rng, clk); E.finish(); }
    clk.set(day + 'T19:00:00+09:00'); if (!E.start('evening').error) { maxQueue = Math.max(maxQueue, E.session.queue.length); F.drive(E, 0.85, rng, clk); E.finish(); }
    if (CAL.weekday(day) === 0) { clk.set(day + 'T12:00:00+09:00'); if (!E.start('weekly').error) { F.drive(E, 0.85, rng, clk); E.finish(); } }
  }
  const mems = Object.values(E.state.memory).flatMap(m => Object.values(m.skills));
  assert.ok(mems.some(s => CAL.daysBetween(s.last, s.due) >= 7), 'some intervals have grown past a week');
  assert.ok(maxQueue < 150, 'evening never becomes a mountain: ' + maxQueue);
  // Absence of 20 days: the next session still has a bounded size.
  clk.set('2026-12-20T18:00:00+09:00');
  const s = E.start('evening').session;
  const sec = s.queue.reduce((t, c) => t + (c.estSec || 15), 0);
  assert.ok(sec <= s.budgetSec * 1.3, 'after a long absence the session still fits the time budget');
});

run('engine: sessions · adaptation · isolation · weekly · persistence · scaling');
