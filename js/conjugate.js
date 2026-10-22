/* ============================================================
   Michi — conjugation engine (pure, data-driven, tested)
   ------------------------------------------------------------
   Every conjugated form shown anywhere in the app (reference tables,
   drills, generated sentences) comes from THIS file, so tables can never
   disagree with each other. Verb class comes from the dictionary
   part-of-speech recorded on the item (JMdict), never from guessing by
   spelling — so 帰る (godan) and 食べる (ichidan) are not confused.

   A word is { jp, kana, verb_class | adj_class }. Results are
   { jp, kana, alt: [{jp,kana}] } where `alt` holds genuinely equivalent
   variants (e.g. 〜じゃない / 〜ではない) that answer checking accepts.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MichiConjugate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Godan ending → its a/i/e/o-row kana. う's a-row is わ (買わない, not 買あない).
  const ROWS = {
    'う': { a: 'わ', i: 'い', e: 'え', o: 'お' },
    'く': { a: 'か', i: 'き', e: 'け', o: 'こ' },
    'ぐ': { a: 'が', i: 'ぎ', e: 'げ', o: 'ご' },
    'す': { a: 'さ', i: 'し', e: 'せ', o: 'そ' },
    'つ': { a: 'た', i: 'ち', e: 'て', o: 'と' },
    'ぬ': { a: 'な', i: 'に', e: 'ね', o: 'の' },
    'ぶ': { a: 'ば', i: 'び', e: 'べ', o: 'ぼ' },
    'む': { a: 'ま', i: 'み', e: 'め', o: 'も' },
    'る': { a: 'ら', i: 'り', e: 'れ', o: 'ろ' }
  };
  // て-form sound changes (音便) by godan ending.
  const TE = { 'う': 'って', 'つ': 'って', 'る': 'って', 'む': 'んで', 'ぶ': 'んで', 'ぬ': 'んで', 'く': 'いて', 'ぐ': 'いで', 'す': 'して' };

  const VERB_CLASSES = ['godan', 'ichidan', 'suru', 'kuru', 'iku', 'aru-honorific'];

  // Forms whose output is a verb that itself conjugates as ichidan (so the
  // reference can show polite variants such as 食べられます).
  const ICHIDAN_DERIVED = { potential: 1, passive: 1, causative: 1 };

  /* ---------- the stem model ----------
     A verb is split into an unchanging prefix (kanji part / suru-noun) and a
     handful of bases, each with a jp and kana spelling. Kuru is the one verb
     whose kanji stays while its reading changes (来ない=こない, 来ます=きます). */
  function pair(jp, kana) { return { jp, kana }; }
  function add(p, s) { return pair(p.jp + s, p.kana + s); }

  function verbBases(w) {
    const cls = w.verb_class, jp = w.jp, kana = w.kana;
    if (VERB_CLASSES.indexOf(cls) < 0) throw new Error('unknown verb_class ' + cls + ' for ' + jp);
    const last = kana.slice(-1);
    if (cls === 'suru') {
      if (!/する$/.test(jp) || !/する$/.test(kana)) throw new Error('suru verb must end in する: ' + jp);
      const P = pair(jp.slice(0, -2), kana.slice(0, -2));
      return {
        cls, dict: add(P, 'する'), masu: add(P, 'し'), nai: add(P, 'し'),
        te: add(P, 'して'), e: add(P, 'すれ'), vol: add(P, 'しよう'), imp: add(P, 'しろ'),
        pot: add(P, 'できる'), pass: add(P, 'される'), caus: add(P, 'させる')
      };
    }
    if (cls === 'kuru') {
      // 来る / くる (and compounds like 持って来る keep the prefix).
      const kanji = /来る$/.test(jp);
      const pj = jp.slice(0, kanji ? -2 : -2), pk = kana.slice(0, -2);
      const b = (kj, kk) => pair(pj + (kanji ? '来' + kj : kk + kj), pk + kk + kj);
      return {
        cls, dict: b('る', 'く'), masu: b('', 'き'), nai: b('', 'こ'), te: b('て', 'き'),
        e: b('れ', 'く'), vol: b('よう', 'こ'), imp: b('い', 'こ'),
        pot: b('られる', 'こ'), pass: b('られる', 'こ'), caus: b('させる', 'こ')
      };
    }
    if (jp.slice(-1) !== last) throw new Error('written form and reading must share the conjugating ending: ' + jp + ' / ' + kana);
    const P = pair(jp.slice(0, -1), kana.slice(0, -1));
    if (cls === 'ichidan') {
      if (last !== 'る') throw new Error('ichidan verb must end in る: ' + jp);
      return {
        cls, dict: add(P, 'る'), masu: P, nai: P, te: add(P, 'て'), e: add(P, 'れ'),
        vol: add(P, 'よう'), imp: add(P, 'ろ'), pot: add(P, 'られる'), pass: add(P, 'られる'), caus: add(P, 'させる'),
        alt: { pot: [add(P, 'れる')] }  // ら抜き (見れる): common in speech, flagged as casual
      };
    }
    const row = ROWS[last];
    if (!row) throw new Error('not a godan ending: ' + jp);
    const base = {
      cls, last, dict: add(P, last), masu: add(P, row.i), nai: add(P, row.a), te: add(P, TE[last]),
      e: add(P, row.e), vol: add(P, row.o + 'う'), imp: add(P, row.e),
      pot: add(P, row.e + 'る'), pass: add(P, row.a + 'れる'), caus: add(P, row.a + 'せる')
    };
    if (cls === 'iku') base.te = add(P, 'って');               // 行って, not 行いて
    if (cls === 'aru-honorific') { base.masu = add(P, 'い'); base.imp = add(P, 'い'); } // いらっしゃいます / いらっしゃい
    return base;
  }

  const teToTa = p => pair(p.jp.replace(/て$/, 'た').replace(/で$/, 'だ'), p.kana.replace(/て$/, 'た').replace(/で$/, 'だ'));
  const teToTewa = p => pair(p.jp.replace(/て$/, 'ては').replace(/で$/, 'では'), p.kana.replace(/て$/, 'ては').replace(/で$/, 'では'));
  const isAru = w => w.verb_class === 'godan' && w.kana === 'ある';

  // The plain negative stem: ある's negative is simply ない (not あらない).
  function negBase(w, B) { return isAru(w) ? pair(w.jp.slice(0, -2), '') : B.nai; }
  function neg(w, B, s) { const n = negBase(w, B); return isAru(w) ? pair(s, s) : add(n, s); }

  /* ---------- verb forms ---------- */
  const VERB_FORMS = {
    dict:          (w, B) => B.dict,
    masu:          (w, B) => add(B.masu, 'ます'),
    masen:         (w, B) => add(B.masu, 'ません'),
    mashita:       (w, B) => add(B.masu, 'ました'),
    masen_deshita: (w, B) => add(B.masu, 'ませんでした'),
    mashou:        (w, B) => add(B.masu, 'ましょう'),
    nai:           (w, B) => neg(w, B, 'ない'),
    ta:            (w, B) => teToTa(B.te),
    nakatta:       (w, B) => neg(w, B, 'なかった'),
    te:            (w, B) => B.te,
    te_iru:        (w, B) => add(B.te, 'いる'),
    te_imasu:      (w, B) => add(B.te, 'います'),
    te_kudasai:    (w, B) => add(B.te, 'ください'),
    naide_kudasai: (w, B) => neg(w, B, 'ないでください'),
    potential:     (w, B) => B.pot,
    passive:       (w, B) => B.pass,
    causative:     (w, B) => B.caus,
    volitional:    (w, B) => B.vol,
    imperative:    (w, B) => B.imp,
    prohibitive:   (w, B) => add(B.dict, 'な'),
    ba:            (w, B) => add(B.e, 'ば'),
    tara:          (w, B) => add(teToTa(B.te), 'ら'),
    to:            (w, B) => add(B.dict, 'と'),
    nara:          (w, B) => add(B.dict, 'なら'),
    tai:           (w, B) => add(B.masu, 'たい'),
    te_mo_ii:      (w, B) => add(B.te, 'もいいです'),
    te_wa_ikenai:  (w, B) => add(teToTewa(B.te), 'いけません'),
    nakereba:      (w, B) => neg(w, B, 'なければなりません'),
    nakute_mo_ii:  (w, B) => neg(w, B, 'なくてもいいです'),
    ta_koto:       (w, B) => add(teToTa(B.te), 'ことがあります')
  };
  // Genuine equivalent variants accepted alongside the main answer.
  const VERB_ALT = {
    te_wa_ikenai: (w, B) => [add(teToTewa(B.te), 'いけない'), add(B.te.jp.endsWith('で') ? pair(B.te.jp.slice(0, -1) + 'じゃ', B.te.kana.slice(0, -1) + 'じゃ') : pair(B.te.jp.slice(0, -1) + 'ちゃ', B.te.kana.slice(0, -1) + 'ちゃ'), 'いけません')],
    nakereba: (w, B) => [neg(w, B, 'なければいけません'), neg(w, B, 'なければならない'), neg(w, B, 'なければいけない'), neg(w, B, 'なきゃ'), neg(w, B, 'ないといけません'), neg(w, B, 'ないといけない')],
    te_mo_ii: (w, B) => [add(B.te, 'もいい'), add(B.te, 'もいいですか')],
    nakute_mo_ii: (w, B) => [neg(w, B, 'なくてもいい')],
    ta_koto: (w, B) => [add(teToTa(B.te), 'ことがある')],
    potential: (w, B) => (B.alt && B.alt.pot) || []
  };

  /* ---------- adjective forms ---------- */
  function adjBase(w) {
    const cls = w.adj_class;
    if (cls === 'i' || cls === 'ii') {
      if (!/い$/.test(w.jp) || !/い$/.test(w.kana)) throw new Error('i-adjective must end in い: ' + w.jp);
      // いい conjugates from よい: よくない, よかった (never いくない).
      if (cls === 'ii') {
        const pj = w.jp.slice(0, -2), pk = w.kana.slice(0, -2);
        return { cls, dict: pair(w.jp, w.kana), stem: pair(pj + 'よ', pk + 'よ') };
      }
      return { cls, dict: pair(w.jp, w.kana), stem: pair(w.jp.slice(0, -1), w.kana.slice(0, -1)) };
    }
    if (cls === 'na') return { cls, dict: pair(w.jp, w.kana), stem: pair(w.jp, w.kana) };
    throw new Error('unknown adj_class ' + cls + ' for ' + w.jp);
  }
  const I_FORMS = {
    plain:       (B) => B.dict,
    polite:      (B) => add(B.dict, 'です'),
    neg:         (B) => add(B.stem, 'くない'),
    neg_polite:  (B) => add(B.stem, 'くないです'),
    past:        (B) => add(B.stem, 'かった'),
    past_polite: (B) => add(B.stem, 'かったです'),
    past_neg:    (B) => add(B.stem, 'くなかった'),
    te:          (B) => add(B.stem, 'くて'),
    adverb:      (B) => add(B.stem, 'く'),
    attributive: (B) => B.dict,
    ba:          (B) => add(B.stem, 'ければ'),
    tara:        (B) => add(B.stem, 'かったら'),
    naru:        (B) => add(B.stem, 'くなる'),
    sugiru:      (B) => add(B.stem, 'すぎる'),
    // "looks …" (appearance). いい → よさそう (not よそう).
    sou:         (B) => B.cls === 'ii' ? add(B.stem, 'さそう') : add(B.stem, 'そう')
  };
  const I_ALT = {
    neg_polite: (B) => [add(B.stem, 'くありません')],
    past_neg: () => []
  };
  const NA_FORMS = {
    plain:       (B) => add(B.stem, 'だ'),
    polite:      (B) => add(B.stem, 'です'),
    neg:         (B) => add(B.stem, 'じゃない'),
    neg_polite:  (B) => add(B.stem, 'じゃないです'),
    past:        (B) => add(B.stem, 'だった'),
    past_polite: (B) => add(B.stem, 'でした'),
    past_neg:    (B) => add(B.stem, 'じゃなかった'),
    te:          (B) => add(B.stem, 'で'),
    adverb:      (B) => add(B.stem, 'に'),
    attributive: (B) => add(B.stem, 'な'),
    ba:          (B) => add(B.stem, 'なら'),
    tara:        (B) => add(B.stem, 'だったら'),
    naru:        (B) => add(B.stem, 'になる'),
    sugiru:      (B) => add(B.stem, 'すぎる'),
    sou:         (B) => add(B.stem, 'そう')
  };
  const NA_ALT = {
    neg: (B) => [add(B.stem, 'ではない')],
    neg_polite: (B) => [add(B.stem, 'ではありません'), add(B.stem, 'じゃありません'), add(B.stem, 'ではないです')],
    past_neg: (B) => [add(B.stem, 'ではなかった')],
    plain: (B) => [B.stem]   // bare stem is fine in casual speech: 静か。
  };

  function isVerb(w) { return !!(w && w.verb_class); }
  function isAdj(w) { return !!(w && w.adj_class); }

  // Main entry: conjugate(word, formId) -> {jp,kana,alt} or null if the form
  // does not apply to this kind of word.
  function conjugate(w, form) {
    if (isVerb(w)) {
      const f = VERB_FORMS[form]; if (!f) return null;
      const B = verbBases(w);
      const main = f(w, B);
      const alt = VERB_ALT[form] ? VERB_ALT[form](w, B) : [];
      return { jp: main.jp, kana: main.kana, alt };
    }
    if (isAdj(w)) {
      const na = w.adj_class === 'na';
      const f = (na ? NA_FORMS : I_FORMS)[form]; if (!f) return null;
      const B = adjBase(w);
      const main = f(B);
      const altF = (na ? NA_ALT : I_ALT)[form];
      return { jp: main.jp, kana: main.kana, alt: altF ? altF(B) : [] };
    }
    return null;
  }

  // Polite (ます) version of a derived ichidan verb, e.g. potential 食べられる
  // → 食べられます. Used by the reference to show register pairs.
  function politeOf(w, form) {
    const r = conjugate(w, form);
    if (!r || !ICHIDAN_DERIVED[form]) return null;
    return conjugate({ jp: r.jp, kana: r.kana, verb_class: 'ichidan' }, 'masu');
  }

  function formsFor(w) { return Object.keys(isVerb(w) ? VERB_FORMS : isAdj(w) ? (w.adj_class === 'na' ? NA_FORMS : I_FORMS) : {}); }

  // Godan ending pattern of a verb, for grouping examples in the reference
  // ('u','ku','gu','su','tsu','nu','bu','mu','ru'; iku/aru are exceptions).
  const ENDING_ROMA = { 'う': 'u', 'く': 'ku', 'ぐ': 'gu', 'す': 'su', 'つ': 'tsu', 'ぬ': 'nu', 'ぶ': 'bu', 'む': 'mu', 'る': 'ru' };
  function godanEnding(w) { return w.verb_class === 'godan' || w.verb_class === 'iku' || w.verb_class === 'aru-honorific' ? ENDING_ROMA[w.kana.slice(-1)] || null : null; }

  // Which reference group a word belongs to.
  function groupOf(w) {
    if (isVerb(w)) {
      if (w.verb_class === 'ichidan') return 'group2';
      if (w.verb_class === 'suru' || w.verb_class === 'kuru') return 'irregular';
      return 'group1';
    }
    if (isAdj(w)) return w.adj_class === 'na' ? 'na' : 'i';
    return null;
  }

  // Class of the verb a form produces, so forms can be chained
  // (potential → polite: 話せる → 話せます; adjective すぎる → すぎます).
  const DERIVED_CLASS = { potential: 'ichidan', passive: 'ichidan', causative: 'ichidan', te_iru: 'ichidan', tai: 'i-adj', sugiru: 'ichidan', naru: 'godan' };
  function realize(spec) {
    const r = conjugate(spec.lemma, spec.form);
    if (!r) return null;
    if (!spec.then) return r;
    const d = DERIVED_CLASS[spec.form];
    if (!d) throw new Error('form ' + spec.form + ' cannot be chained');
    const w = d === 'i-adj' ? { jp: r.jp, kana: r.kana, adj_class: 'i' } : { jp: r.jp, kana: r.kana, verb_class: d };
    return conjugate(w, spec.then);
  }

  return { ROWS, TE, VERB_CLASSES, VERB_FORMS: Object.keys(VERB_FORMS), I_FORMS: Object.keys(I_FORMS), NA_FORMS: Object.keys(NA_FORMS), DERIVED_CLASS, conjugate, realize, politeOf, formsFor, godanEnding, groupOf, isVerb, isAdj };
});
