#!/usr/bin/env node
/* Builds data/kanji/radicals.json — the data for the Kanji (radicals) page.

   Sources (downloaded into a cache dir, never committed):
   • KANJIDIC2 (EDRDG, CC BY-SA 4.0) — https://www.edrdg.org/kanjidic/kanjidic2.xml.gz
     classical (Kangxi) radical each kanji is filed under, on/kun readings,
     meanings, grade, JLPT level, newspaper frequency.
   • Kanji alive radicals (CC BY 4.0) —
     https://raw.githubusercontent.com/kanjialive/kanji-data-media/master/language-data/japanese-radicals.csv
     Japanese radical names (さんずい…), meanings, positions (へん/かんむり…), variants.
   • Kanji alive kanji data (CC BY 4.0) —
     https://raw.githubusercontent.com/kanjialive/kanji-data-media/master/language-data/ka_data.csv
     example words (with readings + meanings) used only when a kanji has no
     word in the verified curriculum.
   • The verified curriculum itself (data/items/*.json): sample words are taken
     from it first, so radicals are taught through words met in lessons.

   Every sample word is labelled with the reading the kanji has IN THAT WORD
   (on / kun / special), computed by matching the word's kana against the
   kanji's dictionary readings (allowing the regular sound changes: rendaku
   k→g, s→z, t→d, h→b/p, and gemination つ/く/ち/き→っ). No reading is invented.

   Usage: node scripts/build_kanji.js [cacheDir]   (downloads if missing) */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const CACHE = process.argv[2] || path.join(require('os').tmpdir(), 'michi-kanji-cache');
const SRC = {
  kanjidic: 'https://www.edrdg.org/kanjidic/kanjidic2.xml.gz',
  radicals: 'https://raw.githubusercontent.com/kanjialive/kanji-data-media/master/language-data/japanese-radicals.csv',
  kadata: 'https://raw.githubusercontent.com/kanjialive/kanji-data-media/master/language-data/ka_data.csv'
};
const today = new Date().toISOString().slice(0, 10);

async function fetchCached(name, url) {
  fs.mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, name);
  if (!fs.existsSync(f)) {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (michi-data-build)' } });
    if (!r.ok) throw new Error(url + ' ' + r.status);
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  }
  return fs.readFileSync(f);
}
// Minimal RFC-4180 CSV parser (quoted fields, commas, newlines in quotes).
function csv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, k) => [h.trim(), (r[k] || '').trim()])));
}
const k2h = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const isKanji = ch => /[一-鿿㐀-䶿]/.test(ch);

/* ---------- reading analysis (exported for tests) ---------- */
const RENDAKU = { 'か': 'が', 'き': 'ぎ', 'く': 'ぐ', 'け': 'げ', 'こ': 'ご', 'さ': 'ざ', 'し': 'じ', 'す': 'ず', 'せ': 'ぜ', 'そ': 'ぞ', 'た': 'だ', 'ち': 'ぢ', 'つ': 'づ', 'て': 'で', 'と': 'ど', 'は': 'ば', 'ひ': 'び', 'ふ': 'ぶ', 'へ': 'べ', 'ほ': 'ぼ' };
const HANDAKU = { 'は': 'ぱ', 'ひ': 'ぴ', 'ふ': 'ぷ', 'へ': 'ぺ', 'ほ': 'ぽ' };
function variantsOf(r, first) {
  const out = new Set([r]);
  const add = x => { out.add(x); };
  if (!first) { const c = r[0]; if (RENDAKU[c]) add(RENDAKU[c] + r.slice(1)); if (HANDAKU[c]) add(HANDAKU[c] + r.slice(1)); if (c === 'ち') add('じ' + r.slice(1)); if (c === 'つ') add('ず' + r.slice(1)); }
  // Gemination: a final つ/く/ち/き may become っ (一本 いっぽん), and a short
  // reading may be followed by っ (切手 き+っ+て).
  for (const v of [...out]) { if (/[つくちき]$/.test(v) && v.length > 1) add(v.slice(0, -1) + 'っ'); add(v + 'っ'); }
  return [...out];
}
// readingsOf(kanji) -> [{r, type}] ; kun stems are the part before '.'
function readingTable(info) {
  const t = [];
  for (const o of info.on || []) t.push({ r: k2h(o.replace(/-/g, '')), type: 'on', affix: /-/.test(o) });
  // Kun readings: the stem; and, for verb readings written with okurigana,
  // the stem + masu-stem kana that compounds keep without okurigana
  // (差.す → さし in 差出人, 出.す → だし, 乗り換え → のり).
  const I = { 'う': 'い', 'く': 'き', 'ぐ': 'ぎ', 'す': 'し', 'つ': 'ち', 'ぬ': 'に', 'ぶ': 'び', 'む': 'み', 'る': 'り' };
  for (const k of info.kun || []) {
    const affix = /-/.test(k);                     // prefix/suffix-only readings (た- in 手綱)
    const [stem, oku] = k.replace(/-/g, '').split('.');
    if (!stem) continue;
    t.push({ r: stem, type: 'kun', affix });
    if (oku) {
      const last = oku.slice(-1), head = oku.slice(0, -1);
      if (I[last]) t.push({ r: stem + head + I[last], type: 'kun', affix });
      if (last === 'る' && head) t.push({ r: stem + head, type: 'kun', affix });   // ichidan: 食べる → たべ
    }
  }
  return t;
}
/* analyse(word, kana, target, KD): which reading does `target` have in `word`?
   Returns { reading, type: 'on'|'kun'|'special' }. */
function analyse(word, kana, target, KD) {
  // First try to explain every kanji with dictionary readings; only if that
  // fails let another irregular kanji absorb an unknown chunk.
  return analyse1(word, kana, target, KD, false) || analyse1(word, kana, target, KD, true) || { reading: null, type: 'special' };
}
function analyse1(word, kana, target, KD, wild) {
  const chars = [...word];
  const k = k2h(kana);
  const memo = new Map();
  function go(i, pos) {
    if (i === chars.length) return pos === k.length ? [] : null;
    const key = i + ':' + pos; if (memo.has(key)) return memo.get(key);
    let res = null;
    const ch = chars[i];
    if (!isKanji(ch) && ch !== '々') {
      const h = k2h(ch);
      if (k.startsWith(h, pos)) { const rest = go(i + 1, pos + h.length); if (rest) res = [{ ch, r: h, type: 'kana' }].concat(rest); }
      else if (/[ー〜・、。？！?!\s]/.test(ch)) { const rest = go(i + 1, pos); if (rest) res = rest; }
    } else {
      const base = ch === '々' ? chars[i - 1] : ch;
      const info = KD[base];
      if (info) {
        for (const { r, type, affix } of readingTable(info)) {
          for (const v of variantsOf(r, i === 0)) {
            if (v && k.startsWith(v, pos)) { const rest = go(i + 1, pos + v.length); if (rest) { res = [{ ch, r: v, type, affix }].concat(rest); break; } }
          }
          if (res) break;
        }
      }
      // Another kanji with an irregular reading (日本 にほん, 河原 かわら) may
      // absorb 1–4 kana as an unknown chunk so the TARGET kanji can still be
      // identified. The target itself must always match a dictionary reading.
      if (!res && wild && ch !== target) {
        for (let n = 1; n <= 4 && !res; n++) {
          if (pos + n > k.length) break;
          const rest = go(i + 1, pos + n);
          if (rest) res = [{ ch, r: k.slice(pos, pos + n), type: 'special' }].concat(rest);
        }
      }
    }
    memo.set(key, res);
    return res;
  }
  const seg = go(0, 0);
  if (!seg) return null;
  const hit = seg.find(s => s.ch === target);
  // If another kanji needed an irregular chunk, only trust a MAIN reading of
  // the target (otherwise 下手 へた would "match" 手 = た-).
  if (hit && hit.affix && seg.some(s => s.ch !== target && s.type === 'special')) return { reading: null, type: 'special' };
  return hit ? { reading: hit.r, type: hit.type } : { reading: null, type: 'special' };
}

async function main() {
  const kdXml = zlib.gunzipSync(await fetchCached('kanjidic2.xml.gz', SRC.kanjidic)).toString('utf8');
  const radCsv = csv((await fetchCached('japanese-radicals.csv', SRC.radicals)).toString('utf8'));
  const kaCsv = csv((await fetchCached('ka_data.csv', SRC.kadata)).toString('utf8'));

  /* KANJIDIC2 */
  const KD = {};
  for (const m of kdXml.matchAll(/<character>([\s\S]*?)<\/character>/g)) {
    const b = m[1];
    const lit = (b.match(/<literal>(.*?)<\/literal>/) || [])[1];
    const rad = +((b.match(/<rad_value rad_type="classical">(\d+)<\/rad_value>/) || [])[1] || 0);
    const g = re => [...b.matchAll(re)].map(x => x[1]);
    KD[lit] = {
      rad, grade: +((b.match(/<grade>(\d+)<\/grade>/) || [])[1] || 0) || null,
      freq: +((b.match(/<freq>(\d+)<\/freq>/) || [])[1] || 0) || null,
      jlpt: +((b.match(/<jlpt>(\d+)<\/jlpt>/) || [])[1] || 0) || null,
      strokes: +((b.match(/<stroke_count>(\d+)<\/stroke_count>/) || [])[1] || 0),
      on: g(/<reading r_type="ja_on">(.*?)<\/reading>/g),
      kun: g(/<reading r_type="ja_kun">(.*?)<\/reading>/g),
      meanings: g(/<meaning>(.*?)<\/meaning>/g).slice(0, 4)
    };
  }

  /* Radicals (Kanji alive): Kangxi rows + variants */
  const RAD = {};
  // Seven radicals are written in the source with characters outside the
  // Kangxi Radicals block (3 of them private-use glyphs). Mapped by their
  // meanings: lame leg 尢, young 幺, fang 牙, melon 瓜, feather 羽, long 長, leather 韋.
  const ODD = { '⺐': 43, '⺓': 52, '': 92, '': 97, '羽': 124, '⻑': 168, '': 178 };
  const numOf = ch => ch ? (ODD[ch] || ((ch.codePointAt(0) >= 0x2F00 && ch.codePointAt(0) <= 0x2FD5) ? ch.codePointAt(0) - 0x2F00 + 1 : null)) : null;
  for (const r of radCsv) {
    let num = null;
    if (r.Origin === 'Kangxi' && r.Radical) num = numOf(r.Radical);
    else if (r['Variant-of']) num = numOf(r['Variant-of']);
    if (!num || num < 1 || num > 214) continue;
    const R = RAD[num] || (RAD[num] = { num, form: null, name: null, nameRomaji: null, meaning: null, position: null, important: false, variants: [], strokes: +r['Stroke#'] || null });
    if (r.Origin === 'Kangxi') {
      R.form = String.fromCodePoint(0x2F00 + num - 1).normalize('NFKC'); R.name = r.Reading; R.nameRomaji = r['Reading-R'];
      R.meaning = r.Meaning; R.position = r['Position-J'] || null; R.important = R.important || r.Importance === 'Important';
    } else {
      const priv = r.Radical && /[-]/.test(r.Radical);   // no private-use glyphs in the app
      R.variants.push({ form: r.Radical && !priv ? r.Radical.normalize('NFKC') : null, glyph: r.Radical && !priv ? r.Radical : null, name: r.Reading, nameRomaji: r['Reading-R'], position: r['Position-J'] || null, meaning: r.Meaning });
      R.important = R.important || r.Importance === 'Important';
    }
  }

  /* Kanji alive example words (fallback samples) */
  const KA = {};
  for (const r of kaCsv) {
    let ex = []; try { ex = JSON.parse(r.examples); } catch (e) { }
    // "足跡（そくせき/あしあと）": keep the first reading only.
    KA[r.kanji] = ex.map(([w, en]) => { const mm = /^(.*?)（(.*?)）$/.exec(w); return mm ? { jp: mm[1], kana: mm[2].split(/[\/、]/)[0], en } : null; }).filter(Boolean);
  }

  /* Curriculum words */
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'), 'utf8'));
  const items = index.items.flatMap(f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')).items).filter(i => i.status === 'verified');
  const byKanji = {};
  for (const it of items) for (const ch of new Set([...it.jp].filter(isKanji))) (byKanji[ch] = byKanji[ch] || []).push(it);

  /* Kanji entries: every curriculum kanji with its samples */
  const KANJI = {};
  const problems = [];
  function entry(ch) {
    if (KANJI[ch]) return KANJI[ch];
    const info = KD[ch]; if (!info) { problems.push('no KANJIDIC entry: ' + ch); return null; }
    const samples = [];
    // curriculum words first (shortest words first: they show the reading most clearly)
    // Usable samples only: no digits/Latin/symbols (1階, 100円, ％) and a single
    // reading (not "しりつ/わたくしりつ"); single words before phrases.
    const usable = it => !/[0-9０-９A-Za-zＡ-Ｚａ-ｚ％%〜~\/／]/.test(it.jp + it.kana) && it.jp.length <= 12;
    const ranked = (byKanji[ch] || []).filter(usable).sort((a, b) => ((a.pos === 'phrase') - (b.pos === 'phrase')) || a.jp.length - b.jp.length || a.tier - b.tier);
    for (const it of ranked.slice(0, 8)) {
      const a = analyse(it.jp, it.kana, ch, KD);
      samples.push({ item: it.id, jp: it.jp, kana: it.kana, en: it.en, reading: a.reading, type: a.type });
    }
    if (samples.length < 2) {
      for (const ex of (KA[ch] || [])) {
        if (samples.length >= 3) break;
        if (samples.some(s => s.jp === ex.jp)) continue;
        const a = analyse(ex.jp, ex.kana, ch, KD);
        samples.push({ ext: 'kanjialive', jp: ex.jp, kana: ex.kana, en: ex.en, reading: a.reading, type: a.type });
      }
    }
    return (KANJI[ch] = { ch, rad: info.rad, on: info.on, kun: info.kun, meanings: info.meanings, grade: info.grade, jlpt: info.jlpt, freq: info.freq, strokes: info.strokes, inCurriculum: !!byKanji[ch], samples });
  }
  for (const ch of Object.keys(byKanji)) entry(ch);

  /* Radicals that file at least one curriculum kanji, most useful first */
  const members = {};
  for (const [ch, e] of Object.entries(KANJI)) if (e && e.rad) (members[e.rad] = members[e.rad] || []).push(ch);
  const score = n => (members[n] || []).reduce((t, ch) => t + Math.min(6, (byKanji[ch] || []).length), 0) * (RAD[n] && RAD[n].important ? 1.25 : 1);
  const used = Object.keys(members).map(Number).filter(n => RAD[n] && RAD[n].form).sort((a, b) => score(b) - score(a) || RAD[a].strokes - RAD[b].strokes);
  const radicals = [];
  for (const n of used) {
    const R = RAD[n];
    let list = members[n].slice().sort((a, b) => (byKanji[b] || []).length - (byKanji[a] || []).length || (KANJI[a].freq || 9999) - (KANJI[b].freq || 9999));
    // Too few members to see the pattern? Add common kanji (newspaper top 1000) filed under it.
    if (list.length < 3) {
      const extra = Object.entries(KD).filter(([ch, i]) => i.rad === n && !list.includes(ch) && i.freq && i.freq <= 1000 && (KA[ch] || []).length).sort((a, b) => a[1].freq - b[1].freq).slice(0, 3 - list.length).map(([ch]) => ch);
      for (const ch of extra) { entry(ch); list.push(ch); }
    }
    const self = KD[R.form];
    radicals.push({
      num: n, form: R.form, name: R.name, nameRomaji: R.nameRomaji, meaning: R.meaning, position: R.position,
      variants: R.variants.filter(v => v.glyph || v.name).map(v => ({ form: v.glyph, name: v.name, nameRomaji: v.nameRomaji, position: v.position })),
      readings: self ? { on: self.on, kun: self.kun } : null,       // the radical written as a kanji of its own
      important: R.important, members: list, score: +score(n).toFixed(2)
    });
  }
  const stats = { on: 0, kun: 0, special: 0 };
  for (const e of Object.values(KANJI)) for (const s of e.samples) stats[s.type]++;

  const out = {
    about: 'Generated by scripts/build_kanji.js. Radicals ordered by how many kanji in the verified curriculum they file (most useful first). Sample words come from the curriculum first; Kanji alive examples only fill gaps. The reading used in each sample is computed against KANJIDIC2 readings (allowing regular sound changes) — "special" means the word has a reading that cannot be split into the kanji\'s listed readings (e.g. 今日 きょう).',
    built: today,
    sources: {
      kanjidic: { type: 'dictionary', name: 'KANJIDIC2 (EDRDG), CC BY-SA 4.0', url: SRC.kanjidic, checked: today },
      radicals: { type: 'reference', name: 'Kanji alive — Japanese radicals, CC BY 4.0', url: SRC.radicals, checked: today },
      examples: { type: 'reference', name: 'Kanji alive — kanji data (example words), CC BY 4.0', url: SRC.kadata, checked: today },
      rule: { type: 'reference', name: 'Tae Kim — Kanji (on-yomi in compounds, kun-yomi alone / with okurigana; sound changes; special readings)', url: 'https://guidetojapanese.org/learn/grammar/kanji', checked: today }
    },
    rule: {
      on: 'In compounds of two or more kanji (熟語) a kanji is usually read with its 音読み (on-yomi, the Chinese-derived reading): 水道 すいどう.',
      kun: 'Standing alone, or followed by kana (okurigana) as in verbs and adjectives, a kanji is usually read with its 訓読み (kun-yomi, the native Japanese reading): 水 みず, 食べる たべる.',
      changes: 'In compounds the first sound can change (h→b/p, k→g, s→z, t→d) and つ/く/ち/き can become っ: 一本 いっぽん, 手紙 てがみ.',
      special: 'Some words have special readings that have nothing to do with the single kanji (今日 きょう). These are learned as whole words.'
    },
    stats: { radicals: radicals.length, kanji: Object.keys(KANJI).length, samples: stats },
    radicals, kanji: KANJI
  };
  fs.mkdirSync(path.join(ROOT, 'data', 'kanji'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'data', 'kanji', 'radicals.json'), JSON.stringify(out) + '\n');
  console.log(`radicals ${radicals.length}, kanji ${Object.keys(KANJI).length}, sample readings ${JSON.stringify(stats)}`);
  if (problems.length) console.log('problems:', problems.slice(0, 20).join(' | '));
}
module.exports = { analyse, variantsOf, readingTable, csv };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
