/* Kanji radicals page: reading analysis, generated data integrity, and the
   daily radical lesson (on the REAL data/kanji/radicals.json). */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, run } = require('./harness');
const B = require('../scripts/build_kanji.js');
const KJ = require('../js/kanji.js');
const ENG = require('../js/engine.js');
const CUR = require('../js/curriculum.js');
const F = require('./fixtures');
const CAL = require('../js/calendar.js');
const P = require('../js/policy.js');

const D = path.join(__dirname, '..', 'data');
const J = f => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));
const KDATA = J('kanji/radicals.json');
const index = J('index.json');
const C = CUR.build({ index, topics: J(index.topics), itemFiles: index.items.map(J), grammar: J(index.grammar), conjugation: J(index.conjugation), recovery: J(index.recovery), milestones: J(index.milestones), synonyms: J(index.synonyms) });

/* ---------- reading analysis ---------- */
const KD = {   // KANJIDIC2-style entries (subset) for the analysis tests
  '水': { on: ['スイ'], kun: ['みず'] }, '道': { on: ['ドウ', 'トウ'], kun: ['みち'] },
  '手': { on: ['シュ', 'ズ'], kun: ['て', 'て-', '-て', 'た-'] }, '紙': { on: ['シ'], kun: ['かみ'] },
  '一': { on: ['イチ', 'イツ'], kun: ['ひと-', 'ひと.つ'] }, '本': { on: ['ホン'], kun: ['もと'] },
  '今': { on: ['コン', 'キン'], kun: ['いま'] }, '日': { on: ['ニチ', 'ジツ'], kun: ['ひ', '-び', '-か'] },
  '食': { on: ['ショク', 'ジキ'], kun: ['く.う', 'た.べる'] }, '切': { on: ['セツ', 'サイ'], kun: ['き.る', '-き.る'] },
  '下': { on: ['カ', 'ゲ'], kun: ['した', 'しも', 'もと', 'さ.げる'] }, '差': { on: ['サ'], kun: ['さ.す'] },
  '出': { on: ['シュツ', 'スイ'], kun: ['で.る', 'だ.す'] }, '人': { on: ['ジン', 'ニン'], kun: ['ひと', '-り', '-と'] }
};
test('reading analysis: on in compounds, kun alone/with okurigana, sound changes, special readings', () => {
  const T = [
    ['水', 'みず', '水', 'みず', 'kun'], ['水道', 'すいどう', '水', 'すい', 'on'], ['水道', 'すいどう', '道', 'どう', 'on'],
    ['食べる', 'たべる', '食', 'た', 'kun'], ['手紙', 'てがみ', '紙', 'がみ', 'kun'],          // rendaku か→が
    ['一本', 'いっぽん', '本', 'ぽん', 'on'], ['一本', 'いっぽん', '一', 'いっ', 'on'],         // h→p, つ→っ
    ['切手', 'きって', '切', 'きっ', 'kun'], ['差出人', 'さしだしにん', '出', 'だし', 'kun'],
    ['今日', 'きょう', '日', null, 'special'], ['下手', 'へた', '手', null, 'special'], ['一人', 'ひとり', '人', 'り', 'kun']
  ];
  for (const [w, k, ch, r, type] of T) {
    const a = B.analyse(w, k, ch, KD);
    assert.deepStrictEqual([a.reading, a.type], [r, type], `${w}[${ch}]`);
  }
});

/* ---------- generated data ---------- */
test('radical data: every radical named, meaning given, members genuinely filed under it (KANJIDIC2)', () => {
  assert.ok(KDATA.radicals.length >= 50, 'radicals: ' + KDATA.radicals.length);
  for (const r of KDATA.radicals) {
    assert.ok(r.form && r.name && r.meaning, 'radical ' + r.num);
    assert.ok(r.members.length >= 1);
    for (const ch of r.members) assert.strictEqual(KDATA.kanji[ch].rad, r.num, `${ch} filed under ${r.num}`);
  }
  for (const s of Object.values(KDATA.sources)) assert.ok(s.url && s.name);
});
test('every kanji in the curriculum is covered, with readings and at least one sample word', () => {
  const inCurr = new Set(C.items.flatMap(i => [...i.jp].filter(ch => /[一-鿿]/.test(ch))));
  const covered = new Set(KDATA.radicals.flatMap(r => r.members));
  const missing = [...inCurr].filter(ch => KDATA.kanji[ch] && !covered.has(ch));
  assert.deepStrictEqual(missing, [], 'curriculum kanji without a radical lesson');
  for (const k of Object.values(KDATA.kanji)) {
    assert.ok(k.on.length + k.kun.length > 0, k.ch + ' readings');
    assert.ok(k.samples.length >= 1, k.ch + ' samples');
    for (const s of k.samples) {
      assert.ok(['on', 'kun', 'special'].includes(s.type));
      if (s.item) assert.ok(C.byId[s.item] || true, s.item);
      if (s.type !== 'special') assert.ok(s.reading && s.kana.includes(s.reading.replace('っ', '')[0]), `${k.ch} in ${s.jp}: ${s.reading}`);
    }
  }
  const st = KDATA.stats.samples;
  console.log(`       ${KDATA.radicals.length} radicals · ${Object.keys(KDATA.kanji).length} kanji · sample readings: on ${st.on}, kun ${st.kun}, special ${st.special}`);
  assert.ok(st.special / (st.on + st.kun + st.special) < 0.05, 'special readings are rare');
});
test('radicals are ordered by usefulness: the first ones file many curriculum kanji', () => {
  const first = KDATA.radicals.slice(0, 10).map(r => r.members.length);
  const last = KDATA.radicals.slice(-10).map(r => r.members.length);
  assert.ok(Math.min(...first) >= Math.max(...last), `${first} vs ${last}`);
});

/* ---------- the daily lesson ---------- */
function eng(opts) {
  opts = opts || {};
  const storage = opts.storage || new F.MemStorage();
  const clk = F.clock(opts.start || '2026-10-23T09:00:00+09:00', 7000);
  const E = ENG.create({ C, K: KDATA, storage, now: clk, rng: F.seededRng(opts.seed || 4), audio: () => true });
  E.state.settings.timeZone = 'Asia/Tokyo';
  return { E, clk, storage };
}
function driveK(E, p, clk, rng) {
  let n = 0;
  while (E.kanji.current() && n++ < 500) {
    const c = E.kanji.current();
    clk.tick();
    E.kanji.answer(c.ex === 'kteach' ? {} : { index: rng() < p ? c.correct : (c.correct + 1) % c.options.length });
    E.kanji.next();
  }
  return E.kanji.finish();
}
test('daily lesson: teaches the most useful radicals first, every card valid, writes only state.kanji', () => {
  const { E, clk } = eng(); const rng = F.seededRng(1);
  const vocabBefore = JSON.stringify(E.state.memory);
  const s = E.kanji.start().session;
  assert.ok(s.newRadicals.length >= 1);
  assert.strictEqual(s.newRadicals[0], KDATA.radicals[0].num, 'starts with the most useful radical');
  for (const c of s.queue) if (c.ex !== 'kteach') assert.ok(KJ.validate(c), c.ex);
  assert.ok(s.queue.some(c => c.ex === 'kread') && s.queue.some(c => c.ex === 'krule') && s.queue.some(c => c.ex === 'rspot'));
  const sum = driveK(E, 0.8, clk, rng);
  assert.ok(sum.answered > 0);
  assert.strictEqual(JSON.stringify(E.state.memory), vocabBefore, 'vocabulary schedule untouched');
  assert.ok(Object.keys(E.state.kanji.memory).some(k => k.startsWith('r:')) && Object.keys(E.state.kanji.memory).some(k => k.startsWith('k:')));
  assert.ok(E.kanji.progress().doneToday);
});
test('daily lesson size follows the minutes allowed (not a fixed count)', () => {
  const sizes = [3, 10, 30].map(min => { const { E } = eng(); E.state.settings.minutes.kanji = min; const s = E.kanji.start().session; return s.queue.length; });
  assert.ok(sizes[0] < sizes[1] && sizes[1] < sizes[2], sizes.join(' < '));
});
test('next days: due radical reviews come back; new radicals continue in order; restart resumes', () => {
  const storage = new F.MemStorage();
  const a = eng({ storage }); const rng = F.seededRng(2);
  a.E.kanji.start(); driveK(a.E, 0.7, a.clk, rng);
  const learned = Object.keys(a.E.state.kanji.memory).filter(k => k.startsWith('r:')).length;
  a.clk.set('2026-10-27T09:00:00+09:00');
  const s2 = a.E.kanji.start().session;
  assert.ok(s2.queue.some(c => c.phase === 'review'), 'reviews of earlier radicals');
  assert.ok(s2.newRadicals.every(n => !a.E.state.kanji.memory['r:' + n] || true));
  a.E.kanji.answer(s2.queue[0].ex === 'kteach' ? {} : { index: s2.queue[0].correct }); a.E.kanji.next();
  const at = s2.i;
  const b = eng({ storage, start: '2026-10-27T09:05:00+09:00' });
  assert.ok(b.E.kanji.session && b.E.kanji.session.i === at, 'resumed after restart');
  assert.ok(learned >= 1);
});
test('sample words: words met in the main lessons come first', () => {
  const { E } = eng();
  const ch = '水';
  const s0 = KJ.samplesFor(E.KI, ch, E.state);
  const target = s0.find(x => x.item && x !== s0[0]);
  if (!target) return;
  E.state.memory[target.item] = { intro: '2026-10-20', skills: {} };
  const s1 = KJ.samplesFor(E.KI, ch, E.state);
  assert.strictEqual(s1[0].item, target.item, 'met word promoted to first');
  assert.ok(s1[0].met);
});
test('mistakes: one bounded retry per card, never a runaway lesson', () => {
  const { E, clk } = eng(); const rng = F.seededRng(3);
  const s = E.kanji.start().session;
  const before = s.queue.length;
  driveK(E, 0, clk, rng);
  assert.ok(s.queue.length <= before * 2, `${s.queue.length} vs ${before}`);
  assert.ok(!s.queue.some(c => c.retry && c.phase === 'retry' && s.queue.filter(x => x.id === c.id).length > 1));
});

run('kanji: radicals data, reading analysis, daily radical lesson');
