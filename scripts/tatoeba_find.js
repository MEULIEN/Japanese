#!/usr/bin/env node
/* Look up exact Japanese sentences on Tatoeba (usage evidence).
   Usage: node scripts/tatoeba_find.js "お会計をお願いします" "これはいくらですか" ...
   Prints id, text and English translations for approved sentences that
   contain the query. Nothing is written; the caller records evidence. */
'use strict';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  for (const q of process.argv.slice(2)) {
    const url = 'https://tatoeba.org/en/api_v0/search?from=jpn&to=eng&orphans=no&unapproved=no&query=' + encodeURIComponent('="' + q + '"');
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (michi-curriculum-verifier)' }, signal: AbortSignal.timeout(90000) });
      const j = await r.json();
      const rows = (j.results || []).filter(s => s.text.includes(q.replace(/[。？！]/g, ''))).slice(0, 4);
      console.log('### ' + q + ' — ' + ((j.paging && j.paging.Sentences && j.paging.Sentences.count) || 0) + ' hits');
      for (const s of rows) {
        const en = (s.translations || []).flat().filter(t => t && t.lang === 'eng').map(t => t.text).slice(0, 2);
        console.log('  #' + s.id + ' ' + s.text + '  =>  ' + en.join(' | '));
      }
    } catch (e) { console.log('### ' + q + ' — error ' + e.message); }
    await sleep(1500);
  }
})();
