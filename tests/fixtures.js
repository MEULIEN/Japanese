/* Test fixtures: a scalable synthetic curriculum + a simulated learner.
   The fixture words are real Japanese (so conjugation is meaningful), but
   the fixture is TEST-ONLY; the app never loads it. `scale(n)` clones items
   with distinct ids and meanings to test curricula of any size. */
const CUR = require('../js/curriculum.js');
const fs = require('fs');
const path = require('path');

const src = [{ type: 'dictionary', name: 'test fixture' }];
const base = [
  // restaurant
  ['f_omizu', 'お水', 'おみず', 'water (polite)', 'noun', 'restaurant', { tags: ['drink', 'orderable'], gloss: 'water' }],
  ['f_menu', 'メニュー', 'メニュー', 'menu', 'noun', 'restaurant', { tags: ['orderable'] }],
  ['f_okaikei', 'お会計', 'おかいけい', 'the bill (polite)', 'noun', 'restaurant', { tags: ['orderable'], gloss: 'the bill' }],
  ['f_udon', 'うどん', 'うどん', 'udon noodles', 'noun', 'restaurant', { tags: ['food', 'orderable'] }],
  ['f_ocha', 'お茶', 'おちゃ', 'tea (green tea)', 'noun', 'restaurant', { tags: ['drink', 'orderable'], gloss: 'tea' }],
  ['f_gohan', 'ご飯', 'ごはん', 'cooked rice; meal', 'noun', 'restaurant', { tags: ['food', 'orderable'], gloss: 'rice' }],
  ['f_hashi', '箸', 'はし', 'chopsticks', 'noun', 'restaurant', { tags: ['thing', 'orderable'], tts: 'kana' }],
  ['f_mochikaeri', '持ち帰り', 'もちかえり', 'takeout', 'noun', 'restaurant', {}],
  ['t_koko', 'ここで召し上がりますか', 'ここでめしあがりますか', 'will you eat here?', 'phrase', 'restaurant', { use: 'hear' }],
  // daily verbs
  ['v_taberu', '食べる', 'たべる', 'to eat', 'verb', 'daily', { verb_class: 'ichidan', obj: ['food'] }],
  ['v_nomu', '飲む', 'のむ', 'to drink', 'verb', 'daily', { verb_class: 'godan', obj: ['drink'] }],
  ['v_iku', '行く', 'いく', 'to go', 'verb', 'daily', { verb_class: 'iku' }],
  ['v_kaeru', '帰る', 'かえる', 'to go home', 'verb', 'daily', { verb_class: 'godan' }],
  ['v_miru', '見る', 'みる', 'to see; to watch', 'verb', 'daily', { verb_class: 'ichidan' }],
  ['v_kau', '買う', 'かう', 'to buy', 'verb', 'daily', { verb_class: 'godan', obj: ['food', 'drink', 'shop_item'] }],
  ['v_matsu', '待つ', 'まつ', 'to wait', 'verb', 'daily', { verb_class: 'godan' }],
  ['v_suru', 'する', 'する', 'to do', 'verb', 'daily', { verb_class: 'suru' }],
  ['v_kuru', '来る', 'くる', 'to come', 'verb', 'daily', { verb_class: 'kuru' }],
  // directions
  ['d_eki', '駅', 'えき', 'station', 'noun', 'directions', { tags: ['place', 'destination'] }],
  ['d_migi', '右', 'みぎ', 'right (direction)', 'noun', 'directions', {}],
  ['d_hidari', '左', 'ひだり', 'left (direction)', 'noun', 'directions', {}],
  ['d_massugu', 'まっすぐ', 'まっすぐ', 'straight ahead', 'adverb', 'directions', {}],
  ['d_toire', 'お手洗い', 'おてあらい', 'toilet; restroom', 'noun', 'directions', { tags: ['place'] }],
  ['d_kado', '角', 'かど', 'corner', 'noun', 'directions', { tts: 'kana' }],
  // describe
  ['a_takai', '高い', 'たかい', 'expensive; high', 'i-adj', 'describe', { adj_class: 'i' }],
  ['a_ii', 'いい', 'いい', 'good', 'i-adj', 'describe', { adj_class: 'ii' }],
  ['a_shizuka', '静か', 'しずか', 'quiet', 'na-adj', 'describe', { adj_class: 'na' }],
  ['a_kirei', 'きれい', 'きれい', 'pretty; clean', 'na-adj', 'describe', { adj_class: 'na' }],
  // signs (read)
  ['s_deguchi', '出口', 'でぐち', 'exit', 'sign', 'signs', { use: 'read' }],
  ['s_iriguchi', '入口', 'いりぐち', 'entrance', 'sign', 'signs', { use: 'read' }],
  ['s_kinen', '禁煙', 'きんえん', 'no smoking', 'sign', 'signs', { use: 'read' }]
];
function makeItem(r, k) {
  const [id, jp, kana, en, pos, topic, extra] = r;
  return Object.assign({ id, jp, kana, romaji: '', en, pos, topic, tier: 1 + (k % 3), use: 'say', status: 'verified', sources: src }, extra);
}
const topics = [
  { id: 'restaurant', name: 'Restaurant', icon: '🍜', order: 2, prereq: [], patterns: [] },
  { id: 'daily', name: 'Daily verbs', icon: '🏠', order: 3, prereq: [] },
  { id: 'directions', name: 'Directions', icon: '🧭', order: 4, prereq: [] },
  { id: 'describe', name: 'Describing', icon: '🎨', order: 5, prereq: [] },
  { id: 'signs', name: 'Signs', icon: '🪧', order: 1, prereq: [] }
];
const real = name => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', name), 'utf8'));

// Build a curriculum from the base items, optionally truncated or scaled.
function curriculum(opts) {
  opts = opts || {};
  let items = base.map(makeItem);
  if (opts.take != null) items = items.slice(0, opts.take);
  if (opts.scale) {
    const out = [];
    for (let k = 0; k < opts.scale; k++) {
      const b = items[k % items.length];
      out.push(Object.assign({}, b, { id: b.id + '_' + k, en: b.en + ' #' + k, gloss: (b.gloss || b.en) + ' ' + k }));
    }
    items = out;
  }
  const byTopic = {};
  for (const it of items) (byTopic[it.topic] = byTopic[it.topic] || []).push(it);
  return CUR.build({
    index: { curriculum_version: 'test' },
    topics: { topics },
    itemFiles: Object.entries(byTopic).map(([topic, its]) => ({ topic, items: its })),
    grammar: opts.noGrammar ? { patterns: [] } : real('grammar.json'),
    conjugation: real('conjugation.json'),
    recovery: real('recovery.json'),
    milestones: { milestones: opts.milestones || [] }
  });
}

class MemStorage {
  constructor() { this.m = {}; }
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.m, k) ? this.m[k] : null; }
  setItem(k, v) { this.m[k] = String(v); }
  removeItem(k) { delete this.m[k]; }
}

function seededRng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// A controllable clock: each answer advances time by `step` ms.
function clock(startIso, step) { let t = Date.parse(startIso); const c = () => t; c.tick = ms => { t += ms == null ? step : ms; }; c.set = iso => { t = Date.parse(iso); }; return c; }

/* Simulated learner: answers the current card correctly with probability p. */
function respond(E, card, p, rng) {
  const ok = rng() < p;
  switch (card.ex) {
    case 'teach': case 'teachpattern': case 'study': return {};
    case 'diag': case 'choice': case 'listen': case 'pick': case 'kanjipick':
      return ok ? { index: card.correct } : { index: (card.correct + 1) % card.options.length };
    case 'speak': case 'recovery': return { self: ok ? 'yes' : 'no' };
    case 'build': { const seq = card.chunks.map((_, i) => i); return { sequence: ok ? seq : seq.slice().reverse() }; }
    case 'span': return { won: ok };
    case 'switch': { const it = E.C.byId[card.members[0]]; return { text: ok ? it.kana : 'zzz' }; }
    case 'match': return { mistakes: ok ? 0 : 2 };
    default: return { text: ok ? card.answer.kana : 'まちがい' };
  }
}
// Run the engine's current session to the end (or `max` cards for endless modes).
function drive(E, p, rng, clk, max) {
  let n = 0;
  while (E.current()) {
    const c = E.current();
    E.answer(respond(E, c, p, rng));
    if (clk) clk.tick();
    E.next();
    if (++n >= (max || 2000)) break;
  }
  return n;
}

module.exports = { base, makeItem, topics, curriculum, MemStorage, seededRng, clock, respond, drive };
