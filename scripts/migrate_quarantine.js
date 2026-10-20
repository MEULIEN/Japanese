/* One-shot migration: promote source-verified drafts and physically move
   the rest into data/quarantine.json (NOT referenced by index.json, so the
   app never serves it). Re-runnable: promoted items already carry their
   sources; quarantined ids are simply absent from packs on a second run.
   Run: node scripts/migrate_quarantine.js */
const fs = require('fs');
const path = require('path');
const DATA = path.join(__dirname, '..', 'data');

const CHECKED = '2026-10-20';
// Each promotion cites the exact JMdict/EDRDG entry (via jisho.org API) that
// supports the item's form, reading and meaning — confirmed this session.
const PROMOTE = {
  f_omizu:  ['JMdict/EDRDG via jisho.org API (keyword=お水): お水 【おみず】 water; (drinking) water; (glass of) water — checked ' + CHECKED],
  f_suito:  ['JMdict/EDRDG via jisho.org API (keyword=水筒): 水筒 【すいとう】 canteen; flask; water bottle — checked ' + CHECKED],
  f_udon:   ['JMdict/EDRDG via jisho.org API (keyword=うどん): 饂飩 【うどん】 udon; thick Japanese wheat noodles — checked ' + CHECKED],
  f_menu:   ['JMdict/EDRDG via jisho.org API (keyword=メニュー): メニュー menu — checked ' + CHECKED],
  t_arigato:['JMdict/EDRDG via jisho.org API (keyword=ありがとうございます): 有り難うございます 【ありがとうございます】 thank you (expression) — checked ' + CHECKED]
};
// Kept OUT of the served curriculum, each with the reason it failed verification.
const QUARANTINE = {
  t_kore:       'これ = "this; this one" (JMdict); stored meaning "this one, please" adds "please" the source does not support. Needs rephrasing or a phrase-level source.',
  t_mouichido:  'Constructed request. JMdict verifies もう一度 ("once more; again") but not the full もう一度お願いします. Needs a learner/grammar source for the whole phrase.',
  t_yukkuri:    'Constructed sentence. JMdict verifies ゆっくり ("slowly") but not ゆっくり話してください as a whole.',
  t_korenani:   'Textbook sentence これは何ですか — no single dictionary entry covers the whole sentence. Needs a phrase-level source.',
  t_nihongode:  'Frame 〜は日本語で何ですか — components are verifiable, the whole frame needs a grammar/learner source.',
  t_suito_ireru:'Long constructed request 水筒に水を入れてもらえますか — needs native/usage confirmation of naturalness and politeness.',
  s_tomare:     'Road-sign text 止まれ. Per policy, road signs must cite an official Japanese traffic authority, not a dictionary. Pending official source.',
  p_kawaramachi:'Generic dictionary 河原町 gives reading かわはらちょう (a place in Tottori), NOT the Kyoto reading かわらまち. Needs an official Kyoto/transit source before promotion — do not guess the reading.',
  p_gion:       '祇園: reading ぎおん is only indirectly supported (via 祇園祭) and the district sense is a Wikipedia tag. Per place-name policy, needs an official Kyoto source.'
};

const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
const quarantined = [];
let promoted = 0, moved = 0;

for (const f of idx.packs) {
  const file = path.join(DATA, f);
  const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
  const keep = [];
  for (const it of pack.items) {
    if (QUARANTINE[it.id]) {
      const full = Object.assign({ domain: pack.domain }, it, { quarantine_reason: QUARANTINE[it.id], from_pack: f });
      quarantined.push(full); moved++;
      continue;
    }
    if (PROMOTE[it.id]) { it.status = 'verified'; it.sources = PROMOTE[it.id]; promoted++; }
    keep.push(it);
  }
  pack.items = keep;
  fs.writeFileSync(file, JSON.stringify(pack, null, 1) + '\n');
}

// Drop quarantined ids from any can_do goal so the index stays consistent.
let canDoFixed = 0;
for (const d of idx.domains) {
  for (const c of (d.can_do || [])) {
    const before = c.needs.length;
    c.needs = c.needs.filter(id => !QUARANTINE[id]);
    canDoFixed += before - c.needs.length;
  }
  // remove now-empty goals
  d.can_do = (d.can_do || []).filter(c => c.needs.length);
}
fs.writeFileSync(path.join(DATA, 'index.json'), JSON.stringify(idx, null, 1) + '\n');

fs.writeFileSync(path.join(DATA, 'quarantine.json'), JSON.stringify({
  note: 'NOT loaded by the app (absent from index.json packs). Items held here failed source verification; each lists why. Promote back into a pack only after an authoritative source confirms the exact wording, reading and meaning.',
  generated: CHECKED,
  items: quarantined
}, null, 1) + '\n');

console.log('promoted=' + promoted + ' quarantined=' + moved + ' can_do_refs_removed=' + canDoFixed);
console.log('quarantined ids: ' + quarantined.map(i => i.id).join(', '));
