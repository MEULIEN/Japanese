/* Michi engine tests — plain Node assert, no framework, no network.
   Run: node tests/engine.test.js   (or: npm test)
   Exits non-zero on first failure so CI / a human sees a real result. */
const assert = require('assert');
const E = require('../engine.js');

let passed = 0;
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// Deterministic RNG so shuffles are reproducible in tests.
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// Minimal item factory + a small verified "curriculum".
function item(id, domain, tier, en) { return { id, jp: id + '漢', kana: id + 'かな', romaji: id, en: en || id, domain, tier: tier || 1, status: 'verified', sources: ['test'] }; }
// All tier-1 by default so newMax (not tier gating) is the binding constraint;
// tier gating is exercised separately in the tierOpen test.
function corpus(n, domains) {
  domains = domains || ['a', 'b'];
  const out = [];
  for (let i = 0; i < n; i++) out.push(item('w' + i, domains[i % domains.length], 1, 'meaning-' + i));
  return out;
}
const T = '2026-10-20';

/* ---------- date + scheduling ---------- */
test('addDays crosses month boundaries', () => {
  assert.strictEqual(E.addDays('2026-10-20', 1), '2026-10-21');
  assert.strictEqual(E.addDays('2026-10-31', 1), '2026-11-01');
  assert.strictEqual(E.addDays('2026-01-01', -1), '2025-12-31');
});

test('gradeRecord: good advances box and schedules future due', () => {
  const r = E.gradeRecord(null, 'good', T, 'read');
  assert.strictEqual(r.box, 2);
  assert.strictEqual(r.due, '2026-10-21');      // box 2 => +1 day
  assert.strictEqual(r.reps, 1);
});

test('gradeRecord: again resets to box 1, due today, counts a lapse', () => {
  let r = E.gradeRecord(null, 'good', T, 'read');   // box 2
  r = E.gradeRecord(r, 'again', T, 'listen');
  assert.strictEqual(r.box, 1);
  assert.strictEqual(r.due, T);
  assert.strictEqual(r.lapses, 1);
});

test('gradeRecord: easy jumps two boxes', () => {
  const r = E.gradeRecord(null, 'easy', T, 'read');
  assert.strictEqual(r.box, 3);
  assert.strictEqual(r.due, E.addDays(T, E.BOX_DAYS[3]));
});

test('gradeRecord: production only counts in type/say modes', () => {
  assert.strictEqual(E.gradeRecord(null, 'good', T, 'read').prod, 0);
  assert.strictEqual(E.gradeRecord(null, 'good', T, 'listen').prod, 0);
  assert.strictEqual(E.gradeRecord(null, 'good', T, 'type').prod, 1);
  assert.strictEqual(E.gradeRecord(null, 'good', T, 'say').prod, 1);
});

/* ---------- Bug D: mastery requires production, not recognition ---------- */
test('isKnown: recognition alone never marks an item known', () => {
  const items = {};
  // Advance to a mature box using ONLY recognition modes.
  items.w0 = E.gradeRecord(null, 'easy', T, 'read');   // box 3, prod 0
  assert.strictEqual(items.w0.box, 3);
  assert.strictEqual(E.isKnown(items, 'w0'), false, 'box>=3 but no production => not known');
  items.w0 = E.gradeRecord(items.w0, 'good', T, 'type'); // now produced once
  assert.strictEqual(E.isKnown(items, 'w0'), true);
});

/* ---------- selection ---------- */
test('pickNew: interleaves across domains, respects count', () => {
  const live = corpus(6, ['a', 'b']);
  const got = E.pickNew(live, {}, 4, seeded(1));
  assert.strictEqual(got.length, 4);
  const doms = new Set(got.map(i => i.domain));
  assert.ok(doms.size === 2, 'should draw from both domains');
});

test('tierOpen: tier 2 stays shut until 80% of tier 1 introduced', () => {
  const live = [item('a1', 'a', 1), item('a2', 'a', 1), item('a3', 'a', 1), item('a4', 'a', 1), item('a5', 'a', 1), item('b1', 'a', 2)];
  assert.strictEqual(E.tierOpen(live, {}, 2), false);
  const items = { a1: {}, a2: {}, a3: {}, a4: {} }; // 4/5 = 80%
  assert.strictEqual(E.tierOpen(live, items, 2), true);
});

/* ---------- Bug A: recall never silently empties when items are learned ---------- */
test('reviewPool: pulls learned items forward when nothing strictly due', () => {
  const live = corpus(4, ['a']);
  // Learn all 4 "today" => each scheduled for a future day, nothing due now.
  const items = {};
  live.forEach(i => { items[i.id] = E.gradeRecord(null, 'good', T, 'read'); }); // due tomorrow
  const due = E.reviewPool(live, items, 10, T, false);
  assert.strictEqual(due.length, 0, 'strictly-due pool is empty same day');
  const ahead = E.reviewPool(live, items, 10, T, true);
  assert.strictEqual(ahead.length, 4, 'with allowAhead, recall still has material');
});

test('buildSession midday: non-empty right after a morning of learning (Bug A)', () => {
  const live = corpus(5, ['a', 'b']);
  const items = {};
  live.forEach(i => { items[i.id] = E.gradeRecord(null, 'good', T, 'read'); });
  const s = E.buildSession('midday', { live, items, today: T, rng: seeded(3) });
  assert.ok(s.queue.length > 0, 'Recall must have cards the same day you learned');
  assert.strictEqual(s.reason, null);
});

test('buildSession: honest reason when nothing has ever been learned', () => {
  const live = corpus(5);
  const s = E.buildSession('midday', { live, items: {}, today: T });
  assert.strictEqual(s.queue.length, 0);
  assert.strictEqual(s.reason, 'nothing-learned');
});

/* ---------- Bug B: memory round adapts to available items ---------- */
test('spanSetup: returns null below the minimum, no faking', () => {
  assert.strictEqual(E.spanSetup([item('a', 'a')], 3, seeded(1)), null);
  assert.strictEqual(E.spanSetup([item('a', 'a'), item('b', 'a')], 3, seeded(1)), null);
});

test('spanSetup: exactly 3 items works and never duplicates', () => {
  const pool = [item('a', 'a'), item('b', 'a'), item('c', 'a')];
  const sp = E.spanSetup(pool, 3, seeded(5));
  assert.ok(sp, 'three items is enough');
  assert.strictEqual(sp.n, 3);
  assert.strictEqual(new Set(sp.grid.map(i => i.id)).size, sp.grid.length, 'no duplicate items in the grid');
  assert.ok(sp.grid.length <= pool.length, 'grid cannot exceed the real pool');
});

test('spanSetup: large pool caps at SPAN_MAX and adds <=3 distractors', () => {
  const pool = corpus(20, ['a']);
  const sp = E.spanSetup(pool, 9, seeded(7));
  assert.strictEqual(sp.n, E.SPAN_MAX);
  assert.ok(sp.grid.length <= sp.n + 3);
});

test('buildSession evening: omits span when too few learned, keeps other work (Bug B)', () => {
  const live = corpus(4, ['a']);
  const items = {}; live.slice(0, 2).forEach(i => { items[i.id] = E.gradeRecord(null, 'good', T, 'read'); });
  const s = E.buildSession('evening', { live, items, today: T, flex: [], rng: seeded(2) });
  assert.ok(!s.queue.some(c => c.step === 'span'), 'no span with <3 learned');
  assert.ok(s.queue.length > 0, 'evening still has review work');
});

test('buildSession evening: includes span once >=3 learned', () => {
  const live = corpus(5, ['a']);
  const items = {}; live.slice(0, 3).forEach(i => { items[i.id] = E.gradeRecord(null, 'good', T, 'read'); });
  const s = E.buildSession('evening', { live, items, today: T, flex: [], rng: seeded(2) });
  assert.ok(s.queue.some(c => c.step === 'span'), 'span appears with 3 learned');
});

/* ---------- Bug C: duration is estimated from real content ---------- */
test('estimateMinutes: a 5-new morning is a substantive lesson, not 3 min', () => {
  const live = corpus(8, ['a', 'b']);
  const s = E.buildSession('morning', { live, items: {}, today: T, rng: seeded(9) });
  // 5 new => pretest+teach+first-quiz + delayed re-test each.
  const mins = E.estimateMinutes(s.queue);
  assert.ok(mins >= 6, 'estimate should reflect real work (got ' + mins + ' min)');
  assert.ok(s.queue.filter(c => c.delayed).length === 5, 'all new items get a delayed retrieval');
});

test('estimateSeconds: empty queue is zero, grows with cards', () => {
  assert.strictEqual(E.estimateSeconds([]), 0);
  assert.ok(E.estimateSeconds([{ step: 'quiz', mode: 'say' }]) > E.estimateSeconds([{ step: 'quiz', mode: 'read' }]));
});

/* ---------- answer checking fairness ---------- */
test('acceptAnswer: accepts kana, romaji, and listed alternatives', () => {
  const it = { jp: 'お願いします', kana: 'おねがいします', romaji: 'onegaishimasu', alt: ['お願い'] };
  assert.ok(E.acceptAnswer('おねがいします', it));
  assert.ok(E.acceptAnswer('onegaishimasu', it));
  assert.ok(E.acceptAnswer('  おねがいします ', it), 'whitespace tolerant');
  assert.ok(E.acceptAnswer('お願い', it), 'explicit alternative accepted');
  assert.ok(!E.acceptAnswer('arigatou', it), 'wrong answer rejected');
  assert.ok(!E.acceptAnswer('', it), 'empty rejected');
});

test('acceptAnswer: long-vowel spelling variants are fair', () => {
  const it = { jp: '注文', kana: 'ちゅうもん', romaji: 'chūmon' };
  assert.ok(E.acceptAnswer('chuumon', it) || E.acceptAnswer('chumon', it), 'macron/double-vowel tolerant');
});

/* ---------- prepareItem / verified-only loading (Bug E) ---------- */
test('prepareItem: rejects drafts, missing fields, and duplicates', () => {
  const pack = { domain: 'food', status: 'draft', sources: ['s'] };
  assert.strictEqual(E.prepareItem({ id: 'x', jp: 'あ', kana: 'あ', en: 'a', tier: 1 }, pack).skip, 'not-verified');
  const vpack = { domain: 'food', status: 'verified', sources: ['s'] };
  const good = E.prepareItem({ id: 'x', jp: 'あ', kana: 'あ', en: 'a', tier: 1 }, vpack, new Set());
  assert.ok(good.item, 'verified item with all fields accepted');
  assert.strictEqual(E.prepareItem({ id: 'x', jp: 'あ', kana: 'あ', en: 'a', tier: 1 }, vpack, new Set(['x'])).skip, 'duplicate-id');
  assert.strictEqual(E.prepareItem({ id: 'y', jp: 'あ', kana: 'あ', tier: 1 }, vpack, new Set()).skip.indexOf('missing') === 0, true);
});

/* ---------- full simulated session (integration, no DOM) ---------- */
test('integration: a morning lesson can be driven end to end', () => {
  const live = corpus(8, ['a', 'b']);
  const items = {};
  const s = E.buildSession('morning', { live, items, today: T, rng: seeded(11) });
  let answered = 0;
  for (const card of s.queue) {
    if (card.step === 'quiz') {
      const mode = card.mode;
      items[card.item.id] = E.gradeRecord(items[card.item.id], 'good', T, mode);
      answered++;
    }
  }
  assert.ok(answered >= 10, 'a 5-new morning drives many retrievals (got ' + answered + ')');
  // Every new item should now have a record.
  assert.ok(s.queue.filter(c => c.step === 'teach').every(c => items[c.item.id]), 'all taught items recorded');
});

/* ---------- runner ---------- */
(function run() {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { fn(); passed++; console.log('  ok  ' + name); }
    catch (e) { failed++; console.log('FAIL  ' + name + '\n        ' + (e && e.message)); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + tests.length + ' total');
  process.exit(failed ? 1 : 0);
})();
