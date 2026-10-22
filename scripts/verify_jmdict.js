#!/usr/bin/env node
/* Verify candidate vocabulary against JMdict (EDRDG) through the jisho.org API.

   Usage: node scripts/verify_jmdict.js <candidates.json> [--out items_x.json] [--report report.json]

   Input: { "topic": "...", "items": [ { id, jp, kana, en, ... } ] }
   For every item the script queries the dictionary, requires an entry whose
   written form AND reading both match (kana-only words: the reading matches
   jp), and records what the dictionary actually says (senses, part of speech).
   It never invents anything: an item with no exact match, or whose English
   meaning shares no content word with the dictionary senses, is reported as
   NEEDS_REVIEW and is NOT marked verified. Verb/adjective classes are taken
   from the dictionary's part-of-speech tags, not guessed from the spelling.

   Items that already carry `"status": "verified"` and a non-dictionary source
   (e.g. an official traffic authority) are re-checked but keep their sources. */
'use strict';
const fs = require('fs');

const args = process.argv.slice(2);
const inFile = args[0];
const outIdx = args.indexOf('--out');
const repIdx = args.indexOf('--report');
if (!inFile) { console.error('usage: verify_jmdict.js <candidates.json> [--out f] [--report f]'); process.exit(2); }
const today = new Date().toISOString().slice(0, 10);

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function lookup(keyword) {
  const url = 'https://jisho.org/api/v1/search/words?keyword=' + encodeURIComponent(keyword);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (michi-curriculum-verifier; offline learning app data audit)' }, signal: AbortSignal.timeout(20000) });
      if (r.ok) return (await r.json()).data || [];
    } catch (e) { /* retry */ }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error('lookup failed: ' + keyword);
}

const kata2hira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

// Map JMdict part-of-speech strings (as jisho renders them) to the classes the
// conjugation engine understands.
function classify(posList) {
  const p = posList.join(' | ');
  const out = {};
  if (/Kuru verb/.test(p)) out.verb_class = 'kuru';
  else if (/Suru verb - included|suru verb - special class|Suru verb - irregular/i.test(p)) out.verb_class = 'suru';
  else if (/Iku\/Yuku special class/.test(p)) out.verb_class = 'iku';
  else if (/-aru special class/.test(p)) out.verb_class = 'aru-honorific';
  else if (/Godan verb/.test(p)) out.verb_class = 'godan';
  else if (/Ichidan verb/.test(p)) out.verb_class = 'ichidan';
  if (/yoi\/ii class/.test(p)) out.adj_class = 'ii';
  else if (/I-adjective/.test(p)) out.adj_class = 'i';
  else if (/Na-adjective/.test(p)) out.adj_class = 'na';
  if (/Suru verb$|Suru verb \||Noun or participle which takes the aux\. verb suru/.test(p)) out.takes_suru = true;
  return out;
}

const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'or', 'and', 'in', 'on', 'at', 'for', 'be', 'is', 'it', 'one', 'something', 'polite', 'e.g', 'eg', 'etc', 'with', 'by', 'as', 'not', 'your', 'you', 'please', 'from', 'this', 'that']);
const words = s => String(s).toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9']+/).filter(w => w.length > 1 && !STOP.has(w));
function stem(w) { return w.replace(/(ing|ed|es|s)$/, ''); }

// Find the entries whose written form and reading match. The reading must be
// the FIRST reading the dictionary lists for that written form, so a rare or
// archaic alternative reading (e.g. 傘 as からかさ) is never accepted.
// Several entries can match (homographs: いくら = 幾ら "how much" / イクラ
// "salmon roe"; する = 為る "to do" / 掏る "to pickpocket"), so all are
// returned and the caller picks the one whose senses support the gloss.
function matchAll(item, data, jp, kana) {
  jp = jp || item.jp; kana = kata2hira(kana || item.kana);
  const ok = []; let rare = null;
  for (const e of data) {
    const forms = e.japanese || [];
    for (const j of forms) {
      const w = j.word || null, r = j.reading ? kata2hira(j.reading) : null;
      const wordOk = w ? w === jp : (r === kata2hira(jp));
      const readOk = r === kana || (!j.reading && kata2hira(w || '') === kana);
      if (!(wordOk && readOk)) continue;
      const first = forms.find(f => (f.word || null) === w);
      if (w && first && first.reading && kata2hira(first.reading) !== kana) { rare = rare || { entry: e, form: j, primary: first.reading, nonPrimary: true }; continue; }
      ok.push({ entry: e, form: j }); break;
    }
  }
  return { ok, rare };
}
// Words normally written in kana (ある, ちょっと, ください): JMdict lists them
// under a kanji headword. A kana-only jp matches an entry when it is that
// entry's FIRST (primary) reading and JMdict tags the entry "Usually written
// using kana alone", or, if the item opts in with "kana_written": true (a human
// checked that the kana spelling is the normal one, e.g. きれい), when the entry
// is common. The kanji headword is recorded in the source.
function matchKana(item, data) {
  if (!/^[ぁ-ゖァ-ヺー]+$/.test(item.jp) || kata2hira(item.jp) !== kata2hira(item.kana)) return [];
  const out = [];
  for (const e of data) {
    const f = (e.japanese || [])[0];
    if (!f || !f.word || kata2hira(f.reading || '') !== kata2hira(item.jp)) continue;
    const uk = e.senses.some(s => (s.tags || []).includes('Usually written using kana alone'));
    if (uk || (item.kana_written && e.is_common)) out.push({ entry: e, form: f, kanaOnly: true });
  }
  return out;
}
// Prefer the candidate whose senses share the most words with the item's
// English (content words first, then any word, then common/real entries).
function pick(item, cands) {
  const all = s => String(s).toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9']+/).filter(w => w.length > 1).map(stem);
  const gs = words(item.en).map(stem), ga = all(item.en);
  let best = null, bestScore = -1;
  for (const c of cands) {
    const sw = new Set(c.entry.senses.map(x => x.english_definitions.join(' ')).join(' ').toLowerCase().split(/[^a-z0-9']+/).map(stem));
    // ties: prefer a common entry, then one with a real part of speech (not
    // only a Wikipedia stub such as "Ramen")
    const realPos = c.entry.senses.some(x => x.parts_of_speech.some(p => !/Wikipedia/.test(p)));
    const score = gs.filter(w => sw.has(w)).length * 100 + ga.filter(w => sw.has(w)).length * 10 + (c.entry.is_common ? 5 : 0) + (realPos ? 2 : 0);
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

(async () => {
  const src = JSON.parse(fs.readFileSync(inFile, 'utf8'));
  const report = { file: inFile, checked: today, verified: [], needs_review: [] };
  const out = [];
  for (const raw of src.items) {
    const item = Object.assign({}, raw);
    const keyword = item.lookup || item.jp;
    let data, m, suruStem = null;
    try { data = await lookup(keyword); } catch (e) { report.needs_review.push({ id: item.id, why: 'network' }); out.push(item); continue; }
    await sleep(350);
    const mm = matchAll(item, data);
    m = pick(item, mm.ok.concat(matchKana(item, data))) || mm.rare;
    // する-verbs (勉強する) are listed under their noun with a "Suru verb" tag.
    if (!m && /する$/.test(item.jp) && /する$/.test(item.kana)) {
      const sj = item.jp.slice(0, -2), sk = item.kana.slice(0, -2);
      let d2; try { d2 = await lookup(sj); } catch (e) { d2 = []; }
      await sleep(350);
      const m2 = pick(item, matchAll(item, d2, sj, sk).ok);
      if (m2 && m2.entry.senses.some(s => s.parts_of_speech.some(p => /Suru verb/i.test(p)))) { m = m2; suruStem = sj; }
    }
    const kanaOnly = !!(m && m.kanaOnly);
    // Same spelling, but a MORE common entry reads it differently (傘: かさ vs
    // the rare からかさ entry) -> the stored reading would mislead a learner.
    if (m && !m.nonPrimary && !m.entry.is_common) {
      const w = m.form.word;
      const rival = w && data.find(e => e !== m.entry && e.is_common && (e.japanese || []).some(j => j.word === w && kata2hira(j.reading || '') !== kata2hira(item.kana)));
      if (rival) { m.nonPrimary = true; m.primary = (rival.japanese.find(j => j.word === w) || {}).reading; }
    }
    if (m && m.nonPrimary) {
      item.status = 'needs_review';
      report.needs_review.push({ id: item.id, jp: item.jp, kana: item.kana, why: 'reading is not the primary dictionary reading (primary: ' + m.primary + ')' });
      out.push(item); continue;
    }
    if (!m) {
      item.status = item.status === 'verified' && item.keep_sources ? 'verified' : 'needs_review';
      report.needs_review.push({ id: item.id, jp: item.jp, kana: item.kana, why: 'no exact JMdict entry for this written form + reading', candidates: data.slice(0, 3).map(d => (d.japanese || []).map(j => (j.word || '') + '【' + (j.reading || '') + '】').join(' / ')) });
      out.push(item); continue;
    }
    const senses = m.entry.senses.map(s => s.english_definitions.join('; '));
    const pos = [...new Set(m.entry.senses.flatMap(s => s.parts_of_speech))];
    const senseWords = new Set(senses.join(' ').toLowerCase().split(/[^a-z0-9']+/).map(stem));
    const glossWords = words(item.en).map(stem);
    const overlap = glossWords.filter(w => senseWords.has(w));
    const cls = classify(pos);
    if (suruStem) { cls.verb_class = 'suru'; delete cls.takes_suru; }
    Object.assign(item, Object.fromEntries(Object.entries(cls).filter(([k]) => item[k] == null)));
    const dictSource = {
      type: 'dictionary', name: 'JMdict/EDRDG via jisho.org API', query: keyword,
      matched: (m.form.word || '') + '【' + (m.form.reading || '') + '】' + (suruStem ? ' + する (listed as suru verb)' : '') + (kanaOnly ? ' (written in kana: ' + item.jp + ')' : ''),
      common: !!m.entry.is_common, jlpt: m.entry.jlpt || [],
      senses: senses.slice(0, 4), pos: pos.slice(0, 4), checked: today
    };
    if (cls.verb_class && item.verb_class && item.verb_class !== cls.verb_class) {
      report.needs_review.push({ id: item.id, why: 'verb_class disagrees with dictionary: ' + item.verb_class + ' vs ' + cls.verb_class });
    }
    const keep = (item.sources || []).filter(s => typeof s === 'string' ? !/JMdict|jisho/i.test(s) : s.type !== 'dictionary');
    item.sources = keep.concat([dictSource]);
    if (!overlap.length && !item.gloss_reviewed) {
      item.status = 'needs_review';
      report.needs_review.push({ id: item.id, jp: item.jp, why: 'English meaning "' + item.en + '" shares no content word with dictionary senses', senses: senses.slice(0, 3) });
    } else {
      item.status = 'verified';
      report.verified.push(item.id);
    }
    out.push(item);
  }
  const result = Object.assign({}, src, { items: out });
  if (outIdx > 0) fs.writeFileSync(args[outIdx + 1], JSON.stringify(result, null, 1) + '\n');
  if (repIdx > 0) fs.writeFileSync(args[repIdx + 1], JSON.stringify(report, null, 1) + '\n');
  console.log(`${inFile}: verified ${report.verified.length}, needs review ${report.needs_review.length}`);
  for (const r of report.needs_review) console.log('  REVIEW', r.id, '-', r.why, r.candidates ? JSON.stringify(r.candidates) : r.senses ? JSON.stringify(r.senses) : '');
})();
