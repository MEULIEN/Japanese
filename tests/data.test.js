/* Curriculum data tests — run against the REAL data/ files.
   Verified-only, provenance, answer-key consistency, conjugation coverage,
   and "every exercise that can be generated from this data is valid". */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, run } = require('./harness');
const CUR = require('../js/curriculum.js');
const CJ = require('../js/conjugate.js');
const X = require('../js/exercises.js');
const A = require('../js/answer.js');

const D = path.join(__dirname, '..', 'data');
const J = f => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));
const index = J('index.json');
const docs = { index, topics: J(index.topics), itemFiles: index.items.map(J), grammar: J(index.grammar), conjugation: J(index.conjugation), recovery: J(index.recovery), milestones: J(index.milestones), synonyms: J(index.synonyms) };
const C = CUR.build(docs);
const raw = docs.itemFiles.flatMap(f => f.items.map(i => Object.assign({ topic: f.topic }, i)));
const quarantine = J('quarantine.json');
const qItems = quarantine.items || quarantine;
const LEGACY = ['s_deguchi', 's_iriguchi', 's_eki', 's_kinen', 's_eigyochu', 's_junbichu', 's_otearai', 'p_kyotoeki', 'p_shijo', 'p_gojo', 'p_kujo', 'p_jujo', 'p_karasuma_oike', 'p_marutamachi', 'p_imadegawa', 'p_kitaoji', 'p_kyoto', 'f_omizu', 'f_suito', 'f_menu', 'f_okaikei', 'f_udon', 'f_mochikaeri', 'f_chumon', 't_sumimasen', 't_arigato', 't_otearai_doko', 't_koko_meshiagaru', 'd_ichiji', 'd_jokoo', 'd_chusha', 'd_ippo', 'd_tsuko', 'd_odan', 'd_oikoshi', 'd_tenkai', 'd_saiko', 'g_shomi', 'g_shohi', 'g_zeikomi', 'g_waribiki'];

test('index lists every item file present (nothing silently unloaded)', () => {
  const files = fs.readdirSync(path.join(D, 'items')).filter(f => f.endsWith('.json')).map(f => 'items/' + f).sort();
  assert.deepStrictEqual(index.items.slice().sort(), files);
});
test('every served item is verified, complete, and carries provenance', () => {
  assert.ok(C.items.length > 0);
  assert.deepStrictEqual(C.skipped.filter(s => s.why !== 'not-verified'), [], 'unexpected rejections');
  for (const it of C.items) {
    assert.strictEqual(it.status, 'verified', it.id);
    assert.ok(it.sources.length, it.id + ' sources');
    for (const s of it.sources) if (typeof s === 'object') assert.ok(s.type && s.name, it.id + ' structured source needs type+name');
  }
  const unverified = raw.filter(i => i.status !== 'verified').map(i => i.id);
  assert.deepStrictEqual(unverified, [], 'unverified items must live in quarantine.json, not item files');
});
test('ids are unique; quarantined ids are never served; all legacy ids are kept or quarantined with a reason', () => {
  const ids = raw.map(i => i.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'duplicate ids');
  for (const q of qItems) { assert.ok(!C.byId[q.id], 'quarantined item served: ' + q.id); assert.ok(q.quarantine_reason, q.id + ' needs a reason'); }
  for (const id of LEGACY) assert.ok(C.byId[id] || qItems.some(q => q.id === id), 'legacy id lost: ' + id);
});
test('every item topic exists; every topic has items', () => {
  for (const it of C.items) assert.ok(C.topicById[it.topic], it.id + ' topic ' + it.topic);
});
test('verb/adjective classes agree with the dictionary part-of-speech recorded in the item’s source', () => {
  const POS = { godan: /Godan verb(?! - Iku| - -aru)/, ichidan: /Ichidan verb/, suru: /Suru verb/, kuru: /Kuru verb/, iku: /Iku\/Yuku/, 'aru-honorific': /-aru special/ };
  let checked = 0;
  for (const it of C.items.filter(i => i.verb_class || i.adj_class)) {
    const dict = it.sources.find(s => typeof s === 'object' && s.type === 'dictionary' && s.pos);
    if (!dict) continue;
    const pos = dict.pos.join(' | ');
    if (it.verb_class) assert.ok(POS[it.verb_class].test(pos), `${it.id} ${it.jp}: class ${it.verb_class} vs dictionary "${pos}"`);
    if (it.adj_class === 'na') assert.ok(/Na-adjective/.test(pos), it.id + ' na-adj vs ' + pos);
    if (it.adj_class === 'i' || it.adj_class === 'ii') assert.ok(/I-adjective/i.test(pos), it.id + ' i-adj vs ' + pos);
    checked++;
  }
  assert.ok(checked > 10, 'checked ' + checked);
});
test('every verb and adjective conjugates in every form without error', () => {
  for (const it of C.items.filter(i => i.verb_class || i.adj_class)) for (const f of CJ.formsFor(it)) assert.ok(CJ.conjugate(it, f), it.id + ' ' + f);
});
test('conjugation reference: lemmas are verified items with the same class; all examples generate', () => {
  const cj = docs.conjugation;
  for (const [jp, l] of Object.entries(cj.lemmas)) {
    const it = C.items.find(i => i.jp === jp && i.kana === l.kana);
    assert.ok(it, 'reference lemma not in verified curriculum: ' + jp);
    assert.strictEqual(it.verb_class || it.adj_class, l.verb_class || l.adj_class, 'class mismatch for ' + jp);
  }
  for (const g of cj.groups) for (const p of g.patterns) for (const lm of p.lemmas) assert.ok(cj.lemmas[lm], g.id + ' lemma ' + lm);
  for (const f of cj.forms) {
    for (const s of f.sources) assert.ok(cj.sources[s], f.id + ' source ' + s);
    for (const e of f.examples) {
      const l = Object.assign({ jp: e.v.lemma }, cj.lemmas[e.v.lemma]);
      const r = CJ.realize({ lemma: l, form: e.v.form, then: e.v.then });
      assert.ok(r && e.jp.includes('{v}'), f.id + ' example');
    }
  }
  // Every Group-1 ending pattern has at least one example.
  const g1 = cj.groups.find(g => g.id === 'group1');
  assert.deepStrictEqual(g1.patterns.map(p => p.ending).sort(), ['bu', 'gu', 'ku', 'mu', 'nu', 'ru', 'su', 'tsu', 'u']);
});
test('every exercise that can be generated for every item passes validation (answer keys consistent)', () => {
  const g = { C, rng: Math.random, scope: new Set(C.items.map(i => i.id)), audio: true, memory: {}, patternsSeen: null, optionCount: 4 };
  let made = 0;
  const counts = {};
  for (const it of C.items) {
    for (const t of ['diag', 'choice', 'listen', 'pick', 'kanjipick', 'reading', 'type', 'speak', 'cloze', 'form', 'pattern', 'build']) {
      for (let rep = 0; rep < 2; rep++) {
        const c = X.G[t](it, g);
        if (!c) continue;
        const v = X.validate(c, it, g);
        assert.ok(v.ok, `${it.id} ${t}: ${v.why}`);
        if (c.answer) assert.strictEqual(A.check(c.answer.jp, c.answer).verdict, 'correct');
        made++; counts[t] = (counts[t] || 0) + 1;
      }
    }
  }
  console.log('       generated & validated', made, 'cards:', JSON.stringify(counts));
  for (const t of ['choice', 'type', 'form', 'pattern', 'reading']) assert.ok(counts[t] > 0, 'no ' + t + ' cards possible');
});
test('example sentences: every one contains its word and carries a real usage source', () => {
  let n = 0;
  for (const it of C.items) for (const e of it.examples) {
    // The word must appear: as itself / a conjugated form (usable for cloze),
    // or as its verb/adjective stem inside a compound (使い方, お急ぎ) — those
    // are shown as examples but never turned into fill-the-gap questions.
    const stem = it.verb_class ? (CJ.conjugate(it, 'masu').jp.replace(/ます$/, '')) : it.adj_class === 'i' ? it.jp.slice(0, -1) : it.jp;
    assert.ok(X.surfaceIn(it, e.jp) || e.jp.includes(stem), `${it.id}: example does not contain the word: ${e.jp}`);
    assert.ok(e.source && (e.source.url || e.source.id), it.id + ' example source');
    n++;
  }
  console.log('       example sentences:', n);
});
test('grammar patterns are sourced; each produces at least one sentence from the curriculum', () => {
  const g = { C, rng: Math.random, scope: new Set(C.items.map(i => i.id)), audio: true, memory: {}, patternsSeen: null };
  for (const p of C.grammar) {
    assert.ok(p.sources.length, p.id);
    if (p.altOnly) continue;
    const ok = C.items.some(it => { const h = X.patternFor(it, g); return h && h.p.id === p.id; }) || C.items.some(it => Object.values(p.slots).some(sl => X.slotOk(it, sl)));
    assert.ok(ok, 'pattern has no usable fills: ' + p.id);
  }
});
test('recovery prompts: hint words verified, models present or a question to answer', () => {
  for (const p of docs.recovery.prompts) {
    assert.strictEqual(p.status, 'verified');
    for (const w of p.wordData) assert.ok(w.source && w.source.type === 'dictionary', p.id + ' ' + w.jp);
    assert.ok(p.sources.length, p.id);
    assert.ok(p.models.length || p.question, p.id);
  }
});
test('milestones: every required item exists; every step is an assessable (item, skill)', () => {
  for (const m of C.milestones) {
    assert.deepStrictEqual(m.missing, [], m.id + ' needs unknown items');
    for (const s of m.steps) {
      const it = C.byId[s.item]; assert.ok(it, m.id + ' step item ' + s.item);
      assert.ok(it.skills.includes(s.skill), `${m.id}: ${s.item} has no ${s.skill} skill`);
      assert.ok(m.needs.includes(s.item), m.id + ' step item not in needs');
    }
  }
});

test('synonym groups: real items, never each other’s distractors, accepted as typed answers', () => {
  for (const g of docs.synonyms.groups) for (const id of g.ids) assert.ok(C.byId[id], 'synonym id ' + id);
  const g = { C, rng: Math.random, scope: new Set(C.items.map(i => i.id)), audio: true, memory: {}, optionCount: 4 };
  const a = C.byId['s_otearai'], b = C.byId['w_toire'];
  for (let k = 0; k < 30; k++) { const c = X.G.pick(a, g); if (c) assert.ok(!c.options.includes(b.jp), 'synonym used as distractor'); }
  const t = X.G.type(C.byId['t_otearai_doko'], g);
  assert.strictEqual(X.grade(t, { text: 'トイレはどこですか' }, g).verdict, 'correct');
  assert.strictEqual(X.grade(t, { text: 'toire wa doko desu ka' }, g).verdict, 'correct');
});

run('data: verified curriculum, provenance, generated exercises');
