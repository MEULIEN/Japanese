#!/usr/bin/env node
/* Builds data/recovery.json from the prompt definitions below plus the
   JMdict-verified hint words (scripts/verify_jmdict.js output).
   Usage: node scripts/build_recovery.js <verified-hints.json> */
'use strict';
const fs = require('fs');
const hints = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).items.filter(i => i.status === 'verified');
const H = Object.fromEntries(hints.map(h => [h.id, { id: h.id, jp: h.jp, kana: h.kana, en: h.en, source: h.sources[h.sources.length - 1] }]));
const T = (id, text, translation) => ({ type: 'usage', name: 'Tatoeba', id, url: 'https://tatoeba.org/en/sentences/show/' + id, license: 'CC BY 2.0 FR', text, translation, checked: '2026-10-22' });
const EV = {
  tsukau: T(218482, 'これは何に使うものですか。', 'What are these for?'),
  nanto: T(220315, 'この動物は日本語で何と言いますか。', 'What do you call this animal in Japanese?'),
  imi: T(218573, 'これはどういう意味ですか。', 'What does this mean?'),
  mouichido: T(214165, 'もう一度お願いします。', 'I beg your pardon?'),
  yukkuri: T(8795518, 'ゆっくり話してください。', 'Please speak slowly.'),
  matte: T(10901614, 'ちょっと待ってください。', 'Please wait a moment.'),
  arimasuka: T(9681765, '鉛筆はありますか？', 'Do you have any pencils?'),
  doko: T(10049610, 'お寺はどこですか？', "Where's the temple?"),
  toiukoto: T(194483, 'もうこの案に決まったということですか。', 'Do you mean that you have already decided on this plan?'),
  etto: T(227963, 'えっと。', 'Let me see.'),
  shigoto: T(227125, 'お仕事は何ですか。', "What do you do? / What's your job?"),
  shumi: T(148465, '趣味は何ですか。', "What's your hobby?"),
  dokokara: T(5323, 'どこから来ましたか？', 'Where are you from?')
};
const REF = {
  compound: { type: 'reference', name: 'Tae Kim — Compound Sentences (adjective て-form)', url: 'https://guidetojapanese.org/learn/grammar/compound', checked: '2026-10-22' },
  teform: { type: 'reference', name: 'Tae Kim — Other uses of the te-form (〜ている)', url: 'https://guidetojapanese.org/learn/grammar/teform', checked: '2026-10-22' },
  desire: { type: 'reference', name: 'Tae Kim — Desire and Suggestions (たい)', url: 'https://guidetojapanese.org/learn/grammar/desire', checked: '2026-10-22' },
  clause: { type: 'reference', name: 'Tae Kim — Relative clauses and sentence order', url: 'https://guidetojapanese.org/learn/grammar/clause', checked: '2026-10-22' }
};
const constructed = (refs) => ({ type: 'constructed', note: 'Constructed for this app from the evidenced pattern(s) listed and reviewed for grammar and naturalness.', patterns: refs, checked: '2026-10-22' });
const MARKERS = {
  function: ['使う', '使い', '使います', 'ための', 'する', '切る', '入れる', '出す', '買う'],
  category: ['もの', '物', '道具', '袋', '箱'],
  place: ['ところ', '所', '場所'],
  person: ['人', 'ひと', 'さん'],
  appearance: ['長い', '長く', '短い', '大きい', '大きく', '小さい', '小さく', '色', '形', '黒い', '白い', '赤い', '丸い', '四角い', '冷たい'],
  comparison: ['みたい', 'ような', 'のよう', '似て'],
  ask: ['何と言', '何て言', '日本語で', 'どういう意味'],
  clarify: ['もう一度', 'ゆっくり', 'ちょっと待って', 'わかりません', '分かりません', 'えっと'],
  confirm: ['ということ', 'ってこと', 'ですか']
};
const prompts = [
  { id: 'rc_umbrella', type: 'describe', situation: "You left your umbrella at a café. You go back to ask for it, but the word \"umbrella\" won't come.", target: { en: 'umbrella', jp: '傘', kana: 'かさ' }, goal: 'Make the staff understand which object you mean.',
    strategies: ['function', 'appearance', 'ask'], words: ['h_ame', 'h_hi', 'h_tsukau', 'h_mono', 'h_nagai', 'h_kuroi'],
    models: [{ jp: '雨の日に使うものです。', en: "It's a thing you use on rainy days.", strategy: 'function' }, { jp: '長くて黒いものです。', en: "It's a long, black thing.", strategy: 'appearance' }, { jp: 'これは日本語で何と言いますか。', en: 'What do you call this in Japanese? (pointing or miming)', strategy: 'ask' }],
    sources: [EV.tsukau, EV.nanto, REF.compound, constructed(['〜に使うもの (Tatoeba 218482)', 'い-adjective て-form 長くて'])] },
  { id: 'rc_scissors', type: 'describe', situation: "At a ¥100 shop you need scissors, but you can't remember the word.", target: { en: 'scissors', jp: 'はさみ', kana: 'はさみ' }, goal: 'Get a clerk to show you where they are.',
    strategies: ['function', 'category', 'ask'], words: ['h_kami', 'h_kiru', 'h_dougu', 'h_tsukau'],
    models: [{ jp: '紙を切る道具です。', en: "It's a tool for cutting paper.", strategy: 'function' }, { jp: '紙を切るものはありますか。', en: 'Do you have something for cutting paper?', strategy: 'function' }],
    sources: [EV.tsukau, EV.arimasuka, REF.clause, constructed(['verb + noun relative clause (紙を切る道具)', '〜はありますか'])] },
  { id: 'rc_pharmacy', type: 'describe', situation: "You need a pharmacy and ask a passer-by, but \"pharmacy\" is gone from your head.", target: { en: 'pharmacy', jp: '薬局', kana: 'やっきょく' }, goal: 'Find out where to go.',
    strategies: ['place', 'function'], words: ['h_kusuri', 'h_kau', 'h_tokoro'],
    models: [{ jp: '薬を買うところはどこですか。', en: 'Where is a place to buy medicine?', strategy: 'place' }],
    sources: [EV.doko, REF.clause, constructed(['verb + ところ (place)', '〜はどこですか'])] },
  { id: 'rc_postoffice', type: 'describe', situation: "You need to send a letter home and ask the way, but \"post office\" won't come.", target: { en: 'post office', jp: '郵便局', kana: 'ゆうびんきょく' }, goal: 'Find out where to go.',
    strategies: ['place', 'function'], words: ['h_tegami', 'h_dasu', 'h_tokoro'],
    models: [{ jp: '手紙を出すところはどこですか。', en: 'Where is the place where you send letters?', strategy: 'place' }],
    sources: [EV.doko, REF.clause, constructed(['verb + ところ', '〜はどこですか'])] },
  { id: 'rc_garbagebag', type: 'describe', situation: 'At the supermarket you want the special rubbish bags for your area, but the word escapes you.', target: { en: 'rubbish bag', jp: 'ごみ袋', kana: 'ごみぶくろ' }, goal: 'Get the clerk to understand.',
    strategies: ['function', 'category'], words: ['h_gomi', 'h_ireru', 'h_fukuro'],
    models: [{ jp: 'ごみを入れる袋はありますか。', en: 'Do you have bags for putting rubbish in?', strategy: 'function' }],
    sources: [EV.arimasuka, REF.clause, constructed(['verb + noun relative clause', '〜はありますか'])] },
  { id: 'rc_landlord', type: 'describe', situation: "You want to tell a neighbour you will call your landlord, but \"landlord\" won't come.", target: { en: 'landlord', jp: '大家', kana: 'おおや' }, goal: 'Make clear who you mean.',
    strategies: ['person', 'function'], words: ['h_heya', 'h_kasu', 'h_hito'],
    models: [{ jp: 'この部屋を貸している人です。', en: 'The person who rents out this room.', strategy: 'person' }],
    sources: [REF.teform, REF.clause, constructed(['〜ている + 人 relative clause'])] },
  { id: 'rc_fridge', type: 'describe', situation: "You must tell the landlord your fridge is broken, but \"fridge\" won't come.", target: { en: 'fridge', jp: '冷蔵庫', kana: 'れいぞうこ' }, goal: 'Make clear which appliance is broken.',
    strategies: ['appearance', 'place', 'function'], words: ['h_daidokoro', 'h_ookii', 'h_tsumetai', 'h_hako', 'h_tabemono', 'h_ireru'],
    models: [{ jp: '台所にある、大きくて冷たい箱です。', en: "It's the big, cold box in the kitchen.", strategy: 'appearance' }, { jp: '食べ物を入れる、冷たい箱です。', en: "It's the cold box you put food in.", strategy: 'function' }],
    sources: [REF.compound, REF.clause, constructed(['い-adjective て-form', 'verb + noun relative clause'])] },
  { id: 'rc_dentist', type: 'describe', situation: "You have toothache and ask a coworker to recommend someone, but \"dentist\" won't come.", target: { en: 'dentist', jp: '歯医者', kana: 'はいしゃ' }, goal: 'Get a recommendation.',
    strategies: ['person', 'comparison'], words: ['h_ha', 'h_isha'],
    models: [{ jp: '歯の医者さんを探しています。', en: "I'm looking for a tooth doctor.", strategy: 'person' }],
    sources: [REF.teform, constructed(['〜ている (ongoing)'])] },
  { id: 'rc_exchange', type: 'describe', situation: "At the bank you want to exchange money, but you can't remember 両替.", target: { en: 'to exchange money', jp: '両替', kana: 'りょうがえ' }, goal: 'Explain what you want to do.',
    strategies: ['function'], words: ['h_okane', 'h_en', 'h_kaeru2'],
    models: [{ jp: 'お金を円に変えたいです。', en: 'I want to change my money into yen.', strategy: 'function' }],
    sources: [REF.desire, constructed(['〜たいです'])] },
  { id: 'rc_clarify', type: 'clarify', situation: 'A clerk asks you something very quickly. You caught only a few sounds.', target: null, goal: 'Get them to say it again, more slowly — without freezing.',
    strategies: ['clarify'], words: ['h_etto'],
    models: [{ jp: 'すみません、もう一度お願いします。', en: 'Sorry, once more please.', strategy: 'clarify' }, { jp: 'ゆっくり話してください。', en: 'Please speak slowly.', strategy: 'clarify' }, { jp: 'ちょっと待ってください。', en: 'Just a moment, please.', strategy: 'clarify' }],
    sources: [EV.mouichido, EV.yukkuri, EV.matte] },
  { id: 'rc_ask_word', type: 'ask', situation: "You see a vegetable at the market and want to know what it's called.", target: null, goal: 'Learn the word on the spot.',
    strategies: ['ask'], words: [],
    models: [{ jp: 'これは日本語で何と言いますか。', en: 'What do you call this in Japanese?', strategy: 'ask' }],
    sources: [EV.nanto, constructed(['この動物は → これは (Tatoeba 220315)'])] },
  { id: 'rc_ask_meaning', type: 'ask', situation: "Your colleague uses a word you don't know in the middle of a conversation.", target: null, goal: 'Find out what it means without stopping the conversation for long.',
    strategies: ['ask'], words: ['h_imi'],
    models: [{ jp: 'すみません、それはどういう意味ですか。', en: 'Sorry, what does that mean?', strategy: 'ask' }],
    sources: [EV.imi] },
  { id: 'rc_confirm', type: 'confirm', situation: 'A staff member explains something; you think they mean the shop closes at eight but you are not sure.', target: null, goal: 'Check your guess politely.',
    strategies: ['confirm'], words: [],
    models: [{ jp: '八時に閉まるということですか。', en: 'You mean it closes at eight?', strategy: 'confirm' }],
    sources: [EV.toiukoto, constructed(['〜ということですか (Tatoeba 194483)'])] },
  { id: 'rc_unexpected_job', type: 'unexpected', situation: 'At a party someone suddenly asks you this. Answer anything true and simple — or ask them to repeat.', target: null, question: { jp: 'お仕事は何ですか。', en: "What's your job?" }, goal: 'Keep the conversation going.',
    strategies: ['clarify'], words: ['h_etto'],
    models: [{ jp: 'えっと…', en: 'Um… (buying yourself a second is fine)', strategy: 'clarify' }],
    sources: [EV.shigoto, EV.etto] },
  { id: 'rc_unexpected_hobby', type: 'unexpected', situation: 'In an interview you are suddenly asked this.', target: null, question: { jp: '趣味は何ですか。', en: "What's your hobby?" }, goal: 'Give a short, true answer (〜が好きです works).',
    strategies: ['clarify'], words: ['h_etto'],
    models: [{ jp: 'えっと…', en: 'Um…', strategy: 'clarify' }],
    sources: [EV.shumi, EV.etto] },
  { id: 'rc_unexpected_from', type: 'unexpected', situation: 'A taxi driver asks you this.', target: null, question: { jp: 'どこから来ましたか？', en: 'Where are you from?' }, goal: 'Answer simply — or ask them to repeat.',
    strategies: ['clarify'], words: [],
    models: [], sources: [EV.dokokara] }
];
for (const p of prompts) {
  const missing = p.words.filter(w => !H[w]);
  if (missing.length) { console.error('unverified hint words', p.id, missing); process.exit(1); }
  p.wordData = p.words.map(w => H[w]);
  delete p.words;
  p.status = 'verified';
}
fs.writeFileSync('data/recovery.json', JSON.stringify({ about: 'Get-unstuck (circumlocution & recovery) prompts. Hint words are JMdict-verified; model sentences are exact Tatoeba sentences or constructed from evidenced patterns (labelled). Offline, the app cannot judge the meaning of a free description: it detects describing strategies and asks the learner to self-assess.', markers: MARKERS, prompts }, null, 1) + '\n');
console.log('wrote', prompts.length, 'prompts');
