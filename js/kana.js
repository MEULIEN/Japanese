/* ============================================================
   Michi — kana utilities (pure)
   Width/katakana normalisation and a rōmaji → hiragana converter so a
   learner without a Japanese keyboard can still answer production
   questions ("taberu" = たべる). Meaningful distinctions are kept:
   long vowels, small っ, voicing marks and particles are NOT erased.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MichiKana = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const kata2hira = s => String(s).replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const hira2kata = s => String(s).replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
  const isKana = s => /^[ぁ-ゖァ-ーー]+$/.test(s);
  const hasKanji = s => /[一-鿿々]/.test(s);
  const isLatin = s => /^[a-zA-Z' \-āīūēōâîûêô]+$/.test(s);

  // Full-width ASCII → half-width; NFKC also folds half-width katakana.
  function width(s) { return String(s == null ? '' : s).normalize('NFKC'); }

  const TABLE = {
    a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
    ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ', kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',
    ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご', gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
    sa: 'さ', shi: 'し', si: 'し', su: 'す', se: 'せ', so: 'そ', sha: 'しゃ', shu: 'しゅ', sho: 'しょ', she: 'しぇ', sya: 'しゃ', syu: 'しゅ', syo: 'しょ',
    za: 'ざ', ji: 'じ', zi: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ', ja: 'じゃ', ju: 'じゅ', jo: 'じょ', je: 'じぇ', zya: 'じゃ', zyu: 'じゅ', zyo: 'じょ', jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ',
    ta: 'た', chi: 'ち', ti: 'ち', tsu: 'つ', tu: 'つ', te: 'て', to: 'と', cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ', che: 'ちぇ', tya: 'ちゃ', tyu: 'ちゅ', tyo: 'ちょ',
    da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
    na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の', nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
    ha: 'は', hi: 'ひ', fu: 'ふ', hu: 'ふ', he: 'へ', ho: 'ほ', hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ', fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',
    ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ', bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
    pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ', pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
    ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も', mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
    ya: 'や', yu: 'ゆ', yo: 'よ',
    ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ', rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
    wa: 'わ', wo: 'を', vu: 'ゔ', ti_: 'てぃ', di_: 'でぃ',
    '-': 'ー'
  };
  const MACRON = { 'ā': 'aa', 'ī': 'ii', 'ū': 'uu', 'ē': 'ee', 'ō': 'ou', 'â': 'aa', 'î': 'ii', 'û': 'uu', 'ê': 'ee', 'ô': 'ou' };

  // Hepburn/kunrei rōmaji → hiragana. Returns null if any part cannot be
  // converted (so we never accept garbage as a match).
  function romajiToKana(input) {
    let s = String(input).toLowerCase().replace(/[āīūēōâîûêô]/g, c => MACRON[c]).replace(/[\s']/g, m => (m === "'" ? "'" : ''));
    let out = '', i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === "'") { i++; continue; }                                  // n' separator
      // doubled consonant → っ (but "nn" is ん)
      if (i + 1 < s.length && c === s[i + 1] && /[bcdfghjkmpqrstvwxyz]/.test(c) && c !== 'n') { out += 'っ'; i++; continue; }
      if (c === 't' && s.slice(i, i + 3) === 'tch') { out += 'っ'; i++; continue; }
      if (c === 'n') {
        const nx = s[i + 1];
        if (nx === undefined || nx === "'" || (!/[aiueoy]/.test(nx))) { out += 'ん'; i += (nx === 'n' && !/[aiueoy]/.test(s[i + 2] || '') ? 2 : 1); if (nx === "'") i++; continue; }
      }
      let hit = false;
      for (const L of [3, 2, 1]) {
        const k = s.slice(i, i + L);
        if (TABLE[k]) { out += TABLE[k]; i += L; hit = true; break; }
      }
      if (!hit) return null;
    }
    return out;
  }

  return { kata2hira, hira2kata, isKana, hasKanji, isLatin, width, romajiToKana };
});
