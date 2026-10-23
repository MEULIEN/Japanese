/* Unit tests: conjugation, kana/answer checking, FSRS scheduler, calendar. */
const assert = require('assert');
const { test, run } = require('./harness');
const C = require('../js/conjugate.js');
const K = require('../js/kana.js');
const A = require('../js/answer.js');
const S = require('../js/srs.js');
const CAL = require('../js/calendar.js');

const v = (jp, kana, verb_class) => ({ jp, kana, verb_class });
const adj = (jp, kana, adj_class) => ({ jp, kana, adj_class });
const j = (w, f) => C.conjugate(w, f).jp;
const k = (w, f) => C.conjugate(w, f).kana;

/* ---------- conjugation ---------- */
test('godan: every ending row (masu / nai / te / ta)', () => {
  const T = [
    [v('買う', 'かう', 'godan'), '買います', '買わない', '買って', '買った'],
    [v('待つ', 'まつ', 'godan'), '待ちます', '待たない', '待って', '待った'],
    [v('帰る', 'かえる', 'godan'), '帰ります', '帰らない', '帰って', '帰った'],
    [v('書く', 'かく', 'godan'), '書きます', '書かない', '書いて', '書いた'],
    [v('泳ぐ', 'およぐ', 'godan'), '泳ぎます', '泳がない', '泳いで', '泳いだ'],
    [v('話す', 'はなす', 'godan'), '話します', '話さない', '話して', '話した'],
    [v('死ぬ', 'しぬ', 'godan'), '死にます', '死なない', '死んで', '死んだ'],
    [v('遊ぶ', 'あそぶ', 'godan'), '遊びます', '遊ばない', '遊んで', '遊んだ'],
    [v('読む', 'よむ', 'godan'), '読みます', '読まない', '読んで', '読んだ']
  ];
  for (const [w, masu, nai, te, ta] of T) {
    assert.strictEqual(j(w, 'masu'), masu); assert.strictEqual(j(w, 'nai'), nai);
    assert.strictEqual(j(w, 'te'), te); assert.strictEqual(j(w, 'ta'), ta);
  }
});
test('る-ending godan verbs are NOT treated as ichidan (帰る, 入る, 知る)', () => {
  assert.strictEqual(j(v('帰る', 'かえる', 'godan'), 'nai'), '帰らない');
  assert.strictEqual(j(v('入る', 'はいる', 'godan'), 'masu'), '入ります');
  assert.strictEqual(j(v('知る', 'しる', 'godan'), 'te'), '知って');
  assert.strictEqual(j(v('食べる', 'たべる', 'ichidan'), 'nai'), '食べない');
});
test('ichidan: full form set', () => {
  const w = v('食べる', 'たべる', 'ichidan');
  const exp = { masu: '食べます', nai: '食べない', te: '食べて', ta: '食べた', potential: '食べられる', passive: '食べられる', causative: '食べさせる', volitional: '食べよう', imperative: '食べろ', ba: '食べれば', tara: '食べたら', tai: '食べたい', prohibitive: '食べるな', te_iru: '食べている', nakatta: '食べなかった' };
  for (const f in exp) assert.strictEqual(j(w, f), exp[f], f);
  assert.ok(C.conjugate(w, 'potential').alt.some(a => a.jp === '食べれる'), 'ら抜き variant offered as alternative');
});
test('irregulars: する, 来る (kanji kept, reading changes), 勉強する', () => {
  const suru = v('する', 'する', 'suru');
  assert.deepStrictEqual([j(suru, 'masu'), j(suru, 'nai'), j(suru, 'te'), j(suru, 'potential'), j(suru, 'passive'), j(suru, 'causative'), j(suru, 'volitional'), j(suru, 'ba')],
    ['します', 'しない', 'して', 'できる', 'される', 'させる', 'しよう', 'すれば']);
  const kuru = v('来る', 'くる', 'kuru');
  assert.strictEqual(j(kuru, 'nai'), '来ない'); assert.strictEqual(k(kuru, 'nai'), 'こない');
  assert.strictEqual(k(kuru, 'masu'), 'きます'); assert.strictEqual(k(kuru, 'te'), 'きて');
  assert.strictEqual(k(kuru, 'ba'), 'くれば'); assert.strictEqual(k(kuru, 'imperative'), 'こい');
  assert.strictEqual(k(kuru, 'volitional'), 'こよう'); assert.strictEqual(k(kuru, 'potential'), 'こられる');
  const b = v('勉強する', 'べんきょうする', 'suru');
  assert.strictEqual(j(b, 'masu'), '勉強します'); assert.strictEqual(k(b, 'te'), 'べんきょうして');
  assert.strictEqual(j(b, 'potential'), '勉強できる');
});
test('special godan: 行く te/ta, ある negative, いらっしゃる masu/imperative', () => {
  const iku = v('行く', 'いく', 'iku');
  assert.strictEqual(j(iku, 'te'), '行って'); assert.strictEqual(j(iku, 'ta'), '行った'); assert.strictEqual(j(iku, 'tara'), '行ったら');
  assert.strictEqual(j(iku, 'masu'), '行きます');
  const aru = v('ある', 'ある', 'godan');
  assert.strictEqual(j(aru, 'nai'), 'ない'); assert.strictEqual(j(aru, 'nakatta'), 'なかった'); assert.strictEqual(j(aru, 'masu'), 'あります');
  const ir = v('いらっしゃる', 'いらっしゃる', 'aru-honorific');
  assert.strictEqual(j(ir, 'masu'), 'いらっしゃいます'); assert.strictEqual(j(ir, 'imperative'), 'いらっしゃい'); assert.strictEqual(j(ir, 'te'), 'いらっしゃって');
});
test('くれる (kureru special class): ichidan forms, imperative くれ (not くれろ)', () => {
  const w = v('くれる', 'くれる', 'kureru');
  assert.deepStrictEqual(['masu', 'nai', 'te', 'ta', 'imperative', 'te_kudasai'].map(f => j(w, f)), ['くれます', 'くれない', 'くれて', 'くれた', 'くれ', 'くれてください']);
  assert.strictEqual(C.groupOf(w), 'group2');
});
test('obligation / permission / prohibition patterns + accepted variants', () => {
  const w = v('飲む', 'のむ', 'godan');
  assert.strictEqual(j(w, 'te_mo_ii'), '飲んでもいいです');
  assert.strictEqual(j(w, 'te_wa_ikenai'), '飲んではいけません');
  assert.ok(C.conjugate(w, 'te_wa_ikenai').alt.some(a => a.jp === '飲んじゃいけません'));
  assert.strictEqual(j(w, 'nakereba'), '飲まなければなりません');
  assert.ok(C.conjugate(w, 'nakereba').alt.some(a => a.jp === '飲まないといけません'));
  assert.strictEqual(j(v('待つ', 'まつ', 'godan'), 'te_wa_ikenai'), '待ってはいけません');
  assert.ok(C.conjugate(v('待つ', 'まつ', 'godan'), 'te_wa_ikenai').alt.some(a => a.jp === '待っちゃいけません'));
});
test('derived potential/passive/causative conjugate as ichidan (polite)', () => {
  assert.strictEqual(C.politeOf(v('書く', 'かく', 'godan'), 'potential').jp, '書けます');
  assert.strictEqual(C.politeOf(v('食べる', 'たべる', 'ichidan'), 'causative').jp, '食べさせます');
});
test('adjectives: i, いい (from よい), na (incl. きれい/嫌い which end in い)', () => {
  const takai = adj('高い', 'たかい', 'i');
  assert.deepStrictEqual(['neg', 'past', 'past_neg', 'te', 'adverb', 'ba'].map(f => j(takai, f)), ['高くない', '高かった', '高くなかった', '高くて', '高く', '高ければ']);
  const ii = adj('いい', 'いい', 'ii');
  assert.deepStrictEqual(['plain', 'neg', 'past', 'te', 'ba'].map(f => j(ii, f)), ['いい', 'よくない', 'よかった', 'よくて', 'よければ']);
  const kirei = adj('きれい', 'きれい', 'na');
  assert.deepStrictEqual(['neg', 'past', 'attributive', 'adverb', 'te'].map(f => j(kirei, f)), ['きれいじゃない', 'きれいだった', 'きれいな', 'きれいに', 'きれいで']);
  assert.ok(C.conjugate(kirei, 'neg_polite').alt.some(a => a.jp === 'きれいではありません'));
  assert.strictEqual(j(adj('嫌い', 'きらい', 'na'), 'neg'), '嫌いじゃない');
});
test('bad data is rejected loudly, not conjugated wrongly', () => {
  assert.throws(() => C.conjugate(v('食べる', 'たべる', 'xyz'), 'masu'));
  assert.throws(() => C.conjugate(v('見た', 'みた', 'ichidan'), 'masu'));
  assert.strictEqual(C.conjugate({ jp: '傘', kana: 'かさ' }, 'masu'), null);
  assert.strictEqual(C.conjugate(v('食べる', 'たべる', 'ichidan'), 'nonexistent'), null);
});
test('reference grouping and godan ending patterns', () => {
  assert.strictEqual(C.groupOf(v('帰る', 'かえる', 'godan')), 'group1');
  assert.strictEqual(C.groupOf(v('見る', 'みる', 'ichidan')), 'group2');
  assert.strictEqual(C.groupOf(v('来る', 'くる', 'kuru')), 'irregular');
  assert.strictEqual(C.godanEnding(v('帰る', 'かえる', 'godan')), 'ru');
  assert.strictEqual(C.godanEnding(v('行く', 'いく', 'iku')), 'ku');
});

/* ---------- kana & answer checking ---------- */
test('rōmaji → kana', () => {
  const T = { taberu: 'たべる', kitte: 'きって', shinbun: 'しんぶん', "kon'nichiwa": 'こんにちわ', 'tōkyō': 'とうきょう', sumimasen: 'すみません', chotto: 'ちょっと', onegaishimasu: 'おねがいします', kan_i: null };
  for (const r in T) assert.strictEqual(K.romajiToKana(r), T[r], r);
});
test('answer: exact, kana/katakana/width/space tolerant', () => {
  const e = { jp: '食べる', kana: 'たべる', romaji: 'taberu' };
  for (const s of ['食べる', 'たべる', 'タベル', ' たべる ', 'taberu', 'TABERU', 'ｔａｂｅｒｕ']) assert.strictEqual(A.check(s, e).verdict, 'correct', s);
  // rōmaji writes particles by sound: は=wa, を=o, へ=e
  assert.strictEqual(A.check('otearai wa doko desu ka', { jp: 'お手洗いはどこですか', kana: 'おてあらいはどこですか' }).verdict, 'correct');
  assert.strictEqual(A.check('mizu o kudasai', { jp: '水をください', kana: 'みずをください' }).verdict, 'correct');
  assert.strictEqual(A.check('おてあらいわどこですか', { jp: 'お手洗いはどこですか', kana: 'おてあらいはどこですか' }).verdict !== 'correct', true, 'kana input keeps は/わ distinct');
  assert.strictEqual(A.check('', e).verdict, 'wrong');
});
test('answer: accepted alternatives; meaningful differences kept', () => {
  const e = { jp: 'お会計', kana: 'おかいけい', accept: ['会計'] };
  assert.strictEqual(A.check('会計', e).kind, 'alt');
  assert.strictEqual(A.check('おかいげい', e).kind, 'typo');                  // one-kana slip in a long word
  const kasa = { jp: '傘', kana: 'かさ' };
  assert.strictEqual(A.check('かざ', kasa).verdict, 'wrong', 'short word: voicing changes the word');
  const ookii = { jp: '大きい', kana: 'おおきい', romaji: 'ōkii' };
  assert.strictEqual(A.check('ōkii', ookii).verdict, 'correct', 'macron ō may be おお');
  assert.strictEqual(A.check('okii', ookii).kind, 'long-vowel');
  assert.strictEqual(A.check('おきい', ookii).verdict, 'near');
});
test('answer: a real but wrong conjugated form is classified as a form error', () => {
  const w = v('食べる', 'たべる', 'ichidan');
  const target = C.conjugate(w, 'ta');
  const others = ['masu', 'te', 'nai'].map(f => Object.assign({ form: f }, C.conjugate(w, f)));
  const r = A.check('たべて', target, others);
  assert.strictEqual(r.kind, 'wrong-form'); assert.strictEqual(r.matched, 'te');
  assert.strictEqual(A.check('たべた', target, others).verdict, 'correct');
});

/* ---------- scheduler ---------- */
test('FSRS: success grows intervals, failure shrinks, Again stays short', () => {
  let st = S.review(null, 3, '2026-01-01');
  const i1 = CAL.daysBetween(st.last, st.due);
  st = S.review(st, 3, st.due); const i2 = CAL.daysBetween(st.last, st.due);
  st = S.review(st, 3, st.due); const i3 = CAL.daysBetween(st.last, st.due);
  assert.ok(i1 >= 1 && i2 > i1 && i3 > i2, `growing intervals ${i1} ${i2} ${i3}`);
  const f = S.review(st, 1, st.due);
  assert.ok(f.s < st.s && f.lapses === 1 && CAL.daysBetween(f.last, f.due) < i3, 'lapse shrinks stability');
});
test('FSRS: repeated failure never schedules beyond tomorrow and never goes below the floor', () => {
  let st = null, d = '2026-01-01';
  for (let n = 0; n < 8; n++) { st = S.review(st, 1, d); assert.strictEqual(CAL.daysBetween(d, st.due), 1); d = st.due; }
  assert.ok(st.s >= 0.1 && st.d <= 10);
});
test('FSRS: long absence — success after a long gap earns a bigger boost than an on-time one', () => {
  const base = S.review(S.review(null, 3, '2026-01-01'), 3, '2026-01-05');
  const onTime = S.review(base, 3, base.due);
  const late = S.review(base, 3, CAL.addDays(base.due, 120));
  assert.ok(late.s > onTime.s);
  const lateFail = S.review(base, 1, CAL.addDays(base.due, 120));
  assert.ok(lateFail.s <= base.s);
});
test('FSRS: same-day repeats change stability only modestly', () => {
  const a = S.review(null, 3, '2026-01-01');
  const b = S.review(a, 3, '2026-01-01');
  assert.ok(b.s > a.s && b.s < a.s * 2.5);
  const c = S.review(a, 1, '2026-01-01');
  assert.ok(c.s < a.s);
});
test('grade from evidence: hints, typos, guesses, speed', () => {
  assert.strictEqual(S.gradeFromEvidence({ verdict: 'wrong' }), 1);
  assert.strictEqual(S.gradeFromEvidence({ verdict: 'correct', hint: 2 }), 1);
  assert.strictEqual(S.gradeFromEvidence({ verdict: 'correct', hint: 1 }), 2);
  assert.strictEqual(S.gradeFromEvidence({ verdict: 'near' }), 2);
  assert.strictEqual(S.gradeFromEvidence({ verdict: 'correct', latencyMs: 2000, baselineMs: 8000 }), 4);
  assert.strictEqual(S.gradeFromEvidence({ verdict: 'correct', latencyMs: 2000, baselineMs: 8000, recognitionOnly: true }), 3, 'MC never Easy');
  assert.strictEqual(S.gradeFromEvidence({ verdict: 'correct' }), 3);
});

/* ---------- calendar ---------- */
test('calendar: date math across month/year/DST boundaries', () => {
  assert.strictEqual(CAL.addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(CAL.addDays('2026-03-08', 1), '2026-03-09');   // US DST start
  assert.strictEqual(CAL.daysBetween('2026-10-24', '2026-10-26'), 2);
  assert.strictEqual(CAL.weekday('2026-10-25'), 0);                 // a Sunday
});
test('calendar: local date follows the configured time zone', () => {
  const instant = Date.UTC(2026, 9, 24, 16, 30);                     // Sat 24 Oct 16:30 UTC
  assert.strictEqual(CAL.localDate(instant, 'Asia/Tokyo'), '2026-10-25');   // already Sunday 01:30 in Kyoto
  assert.strictEqual(CAL.localDate(instant, 'Europe/Paris'), '2026-10-24');
  assert.strictEqual(CAL.localDate(instant, 'Not/AZone'), CAL.localDate(instant, 'auto'), 'invalid zone falls back to device');
});
test('weekly: locked before Sunday, unlocked on Sunday, catch-up, done', () => {
  const base = { unlockWeekday: 0, completed: {}, firstActivity: '2026-10-19' };
  const sat = CAL.weeklyStatus(Object.assign({ today: '2026-10-24' }, base));
  assert.strictEqual(sat.state, 'locked'); assert.strictEqual(sat.unlocks, '2026-10-25'); assert.strictEqual(sat.daysUntil, 1);
  const sun = CAL.weeklyStatus(Object.assign({ today: '2026-10-25' }, base));
  assert.strictEqual(sun.state, 'available'); assert.strictEqual(sun.catchUp, false);
  const mon = CAL.weeklyStatus(Object.assign({ today: '2026-10-26' }, base));
  assert.strictEqual(mon.state, 'available'); assert.strictEqual(mon.catchUp, true, 'missed Sunday stays available');
  const done = CAL.weeklyStatus(Object.assign({ today: '2026-10-26' }, base, { completed: { '2026-10-25': {} } }));
  assert.strictEqual(done.state, 'done'); assert.strictEqual(done.unlocks, '2026-11-01');
  const fresh = CAL.weeklyStatus({ today: '2026-10-21', unlockWeekday: 0, completed: {}, firstActivity: '2026-10-21' });
  assert.strictEqual(fresh.state, 'locked', 'new learner mid-week: nothing to catch up on');
  const none = CAL.weeklyStatus({ today: '2026-10-25', unlockWeekday: 0, completed: {}, firstActivity: null });
  assert.strictEqual(none.state, 'locked', 'no learning history at all: nothing to assess');
});
test('weekly: time-zone change across the Saturday/Sunday boundary', () => {
  const instant = Date.UTC(2026, 9, 24, 16, 30);
  const st = tz => CAL.weeklyStatus({ today: CAL.localDate(instant, tz), unlockWeekday: 0, completed: {}, firstActivity: '2026-10-19' }).state;
  assert.strictEqual(st('Asia/Tokyo'), 'available');
  assert.strictEqual(st('America/New_York'), 'locked');
});

run('core: conjugation · answers · scheduler · calendar');
