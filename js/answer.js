/* ============================================================
   Michi — answer checking (pure)
   ------------------------------------------------------------
   Classifies a typed answer instead of returning a bare true/false, so
   the scheduler and the learner can tell an accidental typo from a real
   recall failure:

     exact        matches the expected form (kanji, kana or rōmaji)
     alt          matches a listed, genuinely acceptable alternative
     long-vowel   only a long-vowel / small-っ slip (おきい for おおきい)
     typo         one kana off in a word long enough that it is clearly
                  the intended word (not a different word)
     wrong-form   a valid OTHER form of the right word (conjugation error)
     wrong        anything else (including empty)

   Harmless differences are ignored: whitespace, full/half width,
   katakana vs hiragana, trailing punctuation, 〜 placeholders.
   Meaningful differences are kept: voicing (か/が), particles, small
   ゃゅょ, and — outside the narrow cases above — long vowels.
   ============================================================ */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MichiAnswer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const K = (typeof module !== 'undefined' && module.exports) ? require('./kana.js') : root.MichiKana;

  function clean(s) {
    return K.width(s).trim()
      .replace(/[\s　]/g, '')
      .replace(/[〜~・。、，,．.！!？?「」『』（）()]/g, '');
  }
  // Canonical comparable kana-or-kanji string.
  function canon(s) { return K.kata2hira(clean(s)); }

  // rōmaji input → candidate hiragana strings (ō can be おう or おお).
  function romajiCandidates(input) {
    const s = clean(input).toLowerCase();
    if (!s || !K.isLatin(s)) return [];
    const parts = s.split(/(ō|ô)/);
    let vars = [''];
    for (const p of parts) {
      if (p === 'ō' || p === 'ô') vars = vars.flatMap(v => [v + 'ou', v + 'oo']);
      else vars = vars.map(v => v + p);
    }
    return vars.map(K.romajiToKana).filter(Boolean);
  }

  // Strip long-vowel and gemination marks to detect "only a length slip".
  function lengthless(k) {
    return k.replace(/ー/g, '').replace(/っ/g, '')
      .replace(/([おこそとのほもよろごぞどぼぽょ])[うお]/g, '$1')
      .replace(/([えけせてねへめれげぜでべぺ])[いえ]/g, '$1')
      .replace(/([あかさたなはまやらわがざだばぱゃ])あ/g, '$1')
      .replace(/([いきしちにひみりぎじぢびぴ])い/g, '$1')
      .replace(/([うくすつぬふむゆるぐずづぶぷゅ])う/g, '$1');
  }

  function particleSpellings(k) {
    let vars = [''];
    for (const ch of k) {
      const sub = { 'は': 'わ', 'を': 'お', 'へ': 'え' }[ch];
      vars = sub && vars.length < 64 ? vars.flatMap(v => [v + ch, v + sub]) : vars.map(v => v + ch);
    }
    return vars;
  }

  function editDistance(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m || !n) return m || n;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }

  /* expected: { jp, kana, romaji?, accept?: [], alt?: [{jp,kana}] }
     otherForms: [{jp,kana,form}] other valid forms of the same word, used to
     recognise a conjugation error. Returns { verdict, kind, matched, note }. */
  function check(input, expected, otherForms) {
    const raw = clean(input);
    if (!raw) return { verdict: 'wrong', kind: 'empty' };
    const latin = K.isLatin(raw);
    const cands = latin ? romajiCandidates(raw) : [canon(raw)];
    if (latin && !cands.length) return { verdict: 'wrong', kind: 'wrong', note: 'Could not read that rōmaji.' };

    const exact = [expected.jp, expected.kana].filter(Boolean).map(canon);
    const alts = (expected.accept || []).concat((expected.alt || []).flatMap(a => [a.jp, a.kana])).filter(Boolean).map(canon);
    if (expected.romaji && latin) exact.push(...romajiCandidates(expected.romaji));
    // Rōmaji spells particles by sound (は→wa, を→o, へ→e); accept that
    // only for rōmaji input — typed kana must still use the right kana.
    if (latin) exact.push(...exact.filter(K.isKana).flatMap(particleSpellings));

    for (const c of cands) {
      if (exact.includes(c)) return { verdict: 'correct', kind: 'exact' };
      if (alts.includes(c)) return { verdict: 'correct', kind: 'alt', note: 'Also correct.' };
    }
    // Comparisons below use readings only (kana), never kanji shape.
    const targets = [expected.kana].concat((expected.alt || []).map(a => a.kana)).concat((expected.accept || []).filter(K.isKana)).filter(Boolean).map(canon);
    for (const c of cands) {
      if (!K.isKana(c)) continue;
      for (const t of targets) {
        if (lengthless(c) === lengthless(t) && c !== t) return { verdict: 'near', kind: 'long-vowel', note: 'Check the vowel length / small っ: ' + t };
      }
    }
    for (const of of otherForms || []) {
      for (const c of cands) if (c === canon(of.kana) || c === canon(of.jp)) return { verdict: 'wrong', kind: 'wrong-form', matched: of.form, note: 'That is a real form of the word, but not the one asked for.' };
    }
    for (const c of cands) {
      if (!K.isKana(c)) continue;
      for (const t of targets) {
        // A single-kana slip only counts as a typo in words of 4+ kana —
        // in short words one kana usually makes a different word.
        if (t.length >= 4 && editDistance(c, t) === 1) return { verdict: 'near', kind: 'typo', note: 'Small typo — the answer is ' + t };
      }
    }
    return { verdict: 'wrong', kind: 'wrong' };
  }

  return { clean, canon, romajiCandidates, lengthless, editDistance, check };
});
