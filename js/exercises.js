/* ============================================================
   Michi — exercise generators & validation (pure)
   ------------------------------------------------------------
   Every exercise type is a generator `make(item, ctx)` that returns a
   card or null. It returns null — and the planner picks another type —
   whenever any validation fails:
     1 required data missing (no example sentence, no kanji to read…)
     2 prompt would be ambiguous (another known word has the same meaning
       → those answers are accepted, or the prompt is disambiguated)
     3 answer key inconsistent with the item (checked by recomputing it)
     4 required asset missing (no Japanese voice → no listening card)
     5 prerequisites missing (a form not yet taught)
     6 it would require material the learner hasn't met (distractors and
       sentence chunks only come from material in scope)
     7 the UI cannot present it (too few options for a choice/match)
   Cards are plain JSON so an interrupted session can be restored.
   ============================================================ */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MichiExercises = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const CJ = node ? require('./conjugate.js') : root.MichiConjugate;
  const K = node ? require('./kana.js') : root.MichiKana;
  const A = node ? require('./answer.js') : root.MichiAnswer;

  let seq = 0;
  const cid = () => 'c' + Date.now().toString(36) + (seq++).toString(36);
  function shuffle(a, rng) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  const norm = s => String(s || '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const contentWords = s => norm(s).split(' ').filter(w => w.length > 2 && !/^(the|and|for|with|polite|something|one|please)$/.test(w));

  // Meanings that would make two options both correct ("bill" vs "the bill / check").
  function meaningsClash(a, b) {
    if ((a.synonyms && a.synonyms.includes(b.id)) || (b.synonyms && b.synonyms.includes(a.id))) return true;
    if (norm(a.en) === norm(b.en) || norm(a.gloss) === norm(b.gloss)) return true;
    const wa = new Set(contentWords(a.gloss || a.en)), wb = contentWords(b.gloss || b.en);
    return wb.length > 0 && wb.every(w => wa.has(w));
  }

  // Forms taught for a word, in order. A form becomes eligible for drills
  // once the learner's form-skill history shows the earlier ones.
  const VERB_STAGES = [['masu', 'masen', 'mashita', 'te'], ['nai', 'ta', 'masen_deshita', 'te_kudasai', 'tai', 'te_iru'], ['potential', 'tara', 'ba', 'volitional', 'mashou', 'te_mo_ii', 'nakereba', 'naide_kudasai', 'ta_koto'], ['passive', 'causative', 'to', 'nara', 'te_wa_ikenai', 'nakute_mo_ii', 'nakatta']];
  const ADJ_STAGES = [['polite', 'neg', 'past'], ['neg_polite', 'past_polite', 'te', 'attributive'], ['adverb', 'past_neg', 'tara', 'ba', 'naru', 'sugiru', 'sou']];
  function formStage(ctx, item) {
    const st = ctx.memory && ctx.memory[item.id] && ctx.memory[item.id].skills.form;
    if (!st) return 0;
    return Math.min((item.verb_class ? VERB_STAGES : ADJ_STAGES).length - 1, Math.floor((st.streak || 0) / 2) + (st.reps > 6 ? 1 : 0));
  }
  function formsAvailable(ctx, item) {
    const stages = item.verb_class ? VERB_STAGES : ADJ_STAGES;
    const upto = formStage(ctx, item);
    const out = [];
    for (let s = 0; s <= upto; s++) out.push(...stages[s]);
    return out.filter(f => { try { return !!CJ.conjugate(item, f); } catch (e) { return false; } });
  }

  const FORM_CUES = {
    masu: 'polite present (do / will do)', masen: "polite negative (don't)", mashita: 'polite past (did)', masen_deshita: "polite past negative (didn't)",
    te: 'て-form (…and / please…)', nai: "plain negative (don't — casual)", ta: 'plain past (did — casual)', nakatta: "plain past negative (didn't — casual)",
    te_kudasai: 'please do… (polite request)', naide_kudasai: "please don't…", tai: 'want to…', te_iru: 'is …-ing / ongoing state',
    potential: 'can / be able to', passive: 'be …-ed (passive)', causative: 'make / let someone…', volitional: "let's… (casual)", mashou: "let's… (polite)",
    imperative: 'blunt command', prohibitive: "blunt \"don't!\"", ba: 'if… (ば)', tara: 'if / when… (たら)', to: 'whenever… (と)', nara: 'if it is the case… (なら)',
    te_mo_ii: 'may I / it is OK to…', te_wa_ikenai: 'must not…', nakereba: 'have to…', nakute_mo_ii: "don't have to…", ta_koto: 'have done before',
    plain: 'plain (is …)', polite: 'polite (is …)', neg: 'not … (casual)', neg_polite: 'not … (polite)', past: 'was … (casual)', past_polite: 'was … (polite)',
    past_neg: 'was not … (casual)', adverb: 'adverb (…ly)', attributive: 'before a noun', naru: 'become …', sugiru: 'too …', sou: 'looks …'
  };

  function speechText(item) { return item.tts === 'kana' ? item.kana : item.jp; }

  /* ---------- distractors (validation 6 & 7) ---------- */
  function meaningOptions(item, ctx, n) {
    const pool = ctx.C.items.filter(x => x.id !== item.id && !meaningsClash(x, item));
    const same = shuffle(pool.filter(x => x.topic === item.topic && x.pos === item.pos), ctx.rng);
    const near = shuffle(pool.filter(x => x.pos === item.pos && x.topic !== item.topic), ctx.rng);
    const rest = shuffle(pool, ctx.rng);
    const out = [item], seen = new Set([norm(item.en)]);
    for (const x of same.concat(near, rest)) {
      if (out.length >= n) break;
      if (seen.has(norm(x.en)) || out.some(o => meaningsClash(o, x))) continue;
      seen.add(norm(x.en)); out.push(x);
    }
    return out;
  }
  function jpOptions(item, ctx, n) {
    // Japanese options must be things the learner has met (or is meeting now).
    const known = ctx.scope;
    const pool = ctx.C.items.filter(x => x.id !== item.id && known.has(x.id) && !meaningsClash(x, item) && x.jp !== item.jp);
    const look = shuffle(pool.filter(x => x.topic === item.topic || [...x.jp].some(ch => K.hasKanji(ch) && item.jp.includes(ch))), ctx.rng);
    const out = [item];
    for (const x of look.concat(shuffle(pool, ctx.rng))) { if (out.length >= n) break; if (!out.includes(x)) out.push(x); }
    return out;
  }

  // Other known words with the same meaning → accepted for production (validation 2).
  function synonymsInScope(item, ctx) {
    return ctx.C.items.filter(x => x.id !== item.id && (ctx.scope.has(x.id) || (item.synonyms || []).includes(x.id)) && ((item.synonyms || []).includes(x.id) || norm(x.en) === norm(item.en) || norm(x.gloss) === norm(item.gloss)));
  }

  /* ---------- generators ---------- */
  const G = {};

  G.teach = (item) => ({ ex: 'teach', item: item.id, skill: null });
  G.teachpattern = (p) => ({ ex: 'teachpattern', item: null, pattern: p.id, skill: null });

  // Diagnostic: "do you know this?" — meaning choice with an honest "I don't know".
  G.diag = (item, ctx) => {
    const opts = meaningOptions(item, ctx, ctx.optionCount || 4);
    if (opts.length < 3) return null;
    const o = shuffle(opts, ctx.rng);
    return { ex: 'diag', item: item.id, skill: item.use === 'hear' ? 'listening' : 'recognition', options: o.map(x => x.en), correct: o.indexOf(item), audio: ctx.audio ? speechText(item) : null, recognitionOnly: true };
  };

  G.choice = (item, ctx) => {
    const opts = meaningOptions(item, ctx, ctx.optionCount || 4);
    if (opts.length < 3) return null;
    const o = shuffle(opts, ctx.rng);
    return { ex: 'choice', item: item.id, skill: 'recognition', options: o.map(x => x.en), correct: o.indexOf(item), recognitionOnly: true };
  };

  G.listen = (item, ctx) => {
    if (!ctx.audio) return null;                                  // validation 4
    const opts = meaningOptions(item, ctx, ctx.optionCount || 4);
    if (opts.length < 3) return null;
    const o = shuffle(opts, ctx.rng);
    return { ex: 'listen', item: item.id, skill: 'listening', audio: speechText(item), options: o.map(x => x.en), correct: o.indexOf(item), recognitionOnly: true };
  };

  // Reverse direction: meaning → pick the Japanese (only known Japanese as options).
  G.pick = (item, ctx) => {
    const opts = jpOptions(item, ctx, ctx.optionCount || 4);
    if (opts.length < 3) return null;
    const o = shuffle(opts, ctx.rng);
    return { ex: 'pick', item: item.id, skill: 'recognition', prompt: item.en, options: o.map(x => x.jp), correct: o.indexOf(item), recognitionOnly: true };
  };

  // Reading → written form: given the reading (and meaning), pick the right
  // kanji spelling among known look-alikes (shared kanji first).
  G.kanjipick = (item, ctx) => {
    if (!K.hasKanji(item.jp)) return null;
    const others = shuffle(ctx.C.items.filter(x => x.id !== item.id && ctx.scope.has(x.id) && K.hasKanji(x.jp) && x.jp !== item.jp && x.kana !== item.kana), ctx.rng);
    const share = others.filter(x => [...x.jp].some(ch => K.hasKanji(ch) && item.jp.includes(ch)));
    const opts = [item].concat(share.concat(others).filter((x, i, a) => a.indexOf(x) === i).slice(0, (ctx.optionCount || 4) - 1));
    if (opts.length < 3) return null;
    const o = shuffle(opts, ctx.rng);
    return { ex: 'kanjipick', item: item.id, skill: 'reading', prompt: item.kana, meaning: item.en, options: o.map(x => x.jp), correct: o.indexOf(item), recognitionOnly: true };
  };

  G.reading = (item) => {
    if (!K.hasKanji(item.jp)) return null;                         // validation 1
    return { ex: 'reading', item: item.id, skill: 'reading', prompt: item.jp, answer: { jp: item.kana, kana: item.kana, accept: [] } };
  };

  G.type = (item, ctx) => {
    if (item.use !== 'say') return null;
    const syn = synonymsInScope(item, ctx);
    return {
      ex: 'type', item: item.id, skill: 'production', prompt: item.en, hint: item.say_when || null,
      answer: { jp: item.jp, kana: item.kana, romaji: item.romaji, accept: (item.accept || []).concat(syn.flatMap(s => [s.jp, s.kana])) },
      synonyms: syn.map(s => s.id)
    };
  };

  G.speak = (item) => {
    if (item.use !== 'say') return null;
    return { ex: 'speak', item: item.id, skill: 'speaking', prompt: item.en, hint: item.say_when || null, audio: speechText(item), selfAssessed: true };
  };

  // Find the surface form of the item inside a sentence (dictionary form or
  // any conjugated form) so the blank is always exactly one word.
  function surfaceIn(item, sentence) {
    const cands = [{ jp: item.jp, kana: item.kana, form: 'dict' }].concat((item.accept || []).filter(a => a !== item.kana).map(a => ({ jp: a, kana: item.kana, form: 'dict' })));
    if (item.verb_class || item.adj_class) for (const f of CJ.formsFor(item)) {
      const r = CJ.conjugate(item, f); if (!r) continue;
      cands.push({ jp: r.jp, kana: r.kana, form: f });
      // chained forms, e.g. 小さすぎます (すぎる → polite), 話せます (potential → polite)
      if (CJ.DERIVED_CLASS[f]) {
        const d = CJ.DERIVED_CLASS[f];
        const w = d === 'i-adj' ? { jp: r.jp, kana: r.kana, adj_class: 'i' } : { jp: r.jp, kana: r.kana, verb_class: d };
        for (const g of CJ.formsFor(w)) { const r2 = CJ.realize({ lemma: item, form: f, then: g }); if (r2) cands.push({ jp: r2.jp, kana: r2.kana, form: f + '+' + g }); }
      }
    }
    cands.sort((a, b) => b.jp.length - a.jp.length);           // longest match first (食べました before 食べ)
    return cands.find(c => sentence.includes(c.jp)) || null;
  }
  G.cloze = (item, ctx) => {
    if (item.use !== 'say' || !item.examples.length) return null;
    const ex = shuffle(item.examples, ctx.rng).find(e => surfaceIn(item, e.jp));
    if (!ex) return null;
    const s = surfaceIn(item, ex.jp);
    return { ex: 'cloze', item: item.id, skill: 'context', sentence: ex.jp.replace(s.jp, '＿＿'), translation: ex.en, source: ex.source, answer: { jp: s.jp, kana: s.kana, accept: [] }, form: s.form, novelContext: true };
  };

  G.form = (item, ctx, want) => {
    if (!(item.verb_class || item.adj_class)) return null;
    const avail = formsAvailable(ctx, item);
    const choices = want ? avail.filter(f => want.includes(f)) : avail;
    if (!choices.length) return null;                               // validation 5
    const f = choices[Math.floor(ctx.rng() * choices.length)];
    const r = CJ.conjugate(item, f);
    const others = CJ.formsFor(item).filter(x => x !== f).map(x => Object.assign({ form: x }, CJ.conjugate(item, x)))
      .filter(o => o.jp !== r.jp && !(r.alt || []).some(a => a.jp === o.jp));
    return { ex: 'form', item: item.id, skill: 'form', form: f, cue: FORM_CUES[f] || f, prompt: item.jp, answer: { jp: r.jp, kana: r.kana, alt: r.alt || [] }, others };
  };

  /* Pattern sentences: verified pattern × verified items whose tags match
     the slot. Every chunk of the sentence is either fixed pattern text or a
     word in scope (validation 6). */
  function realizePattern(p, fills) {
    let jp = '', kana = '';
    const chunks = [];
    for (const part of p.parts) {
      if (part.slot) {
        const f = fills[part.slot]; if (!f) return null;
        let w = { jp: f.item.jp, kana: f.item.kana };
        if (part.form) { const r = CJ.conjugate(f.item, part.form); if (!r) return null; w = r; }
        jp += w.jp; kana += w.kana; chunks.push(w.jp);
      } else { jp += part.jp; kana += part.kana || part.jp; chunks.push(part.jp); }
    }
    return { jp, kana, chunks };
  }
  function englishFor(p, fills) {
    return p.en.replace(/\{(\w+)\}/g, (_, k) => fills[k] ? String(fills[k].item.gloss || fills[k].item.en).split(/[;,/]/)[0].trim().replace(/^to /, '') : '…');
  }
  function slotOk(item, slot) {
    if (item.use !== 'say' && item.use !== 'read') return false;
    if (slot.pos && item.pos !== slot.pos) return false;
    if (slot.lemmas && !slot.lemmas.includes(item.jp)) return false;
    if (slot.hasObj && !(item.obj && item.obj.length)) return false;
    if (slot.tags && !(item.tags || []).some(t => slot.tags.includes(t))) return false;
    if (slot.form) { try { if (!CJ.conjugate(item, slot.form)) return false; } catch (e) { return false; } }
    return true;
  }
  // A pattern can be practised once it has been taught (its fixed words —
  // ください, いくら… — are then known), or inside the lesson teaching it.
  const patternUsable = (p, ctx) => !p.altOnly && p.parts && (ctx.patternsSeen ? ctx.patternsSeen.has(p.id) : true);
  // Partner words from the same topic as the practised word make coherent
  // sentences (bank verbs with bank nouns); other topics only as a fallback.
  function sameTopicFirst(pool, item) {
    const same = pool.filter(x => x.topic === item.topic);
    return same.length ? same : pool;
  }
  // Patterns that can feature this item, with other slots filled from scope.
  function patternFor(item, ctx) {
    const cands = [];
    for (const p of ctx.C.grammar) {
      if (!patternUsable(p, ctx)) continue;
      for (const [name, slot] of Object.entries(p.slots || {})) {
        if (!slotOk(item, slot)) continue;
        const fills = { [name]: { item } };
        let ok = true;
        for (const [other, s2] of Object.entries(p.slots)) {
          if (other === name) continue;
          const pool = sameTopicFirst(ctx.C.items.filter(x => ctx.scope.has(x.id) && slotOk(x, s2)), item);
          if (!pool.length) { ok = false; break; }
          fills[other] = { item: pool[Math.floor(ctx.rng() * pool.length)] };
        }
        // verb–object agreement: the object must fit the verb's `obj` tags
        if (ok && p.objectSlot && p.verbSlot) {
          const v = fills[p.verbSlot].item;
          const fitsV = o => (v.obj || []).some(t => (o.tags || []).includes(t));
          if (!fitsV(fills[p.objectSlot].item)) {
            if (name === p.objectSlot) ok = false;
            else {
              const objs = sameTopicFirst(ctx.C.items.filter(x => ctx.scope.has(x.id) && slotOk(x, p.slots[p.objectSlot]) && fitsV(x)), v);
              if (objs.length) fills[p.objectSlot] = { item: objs[Math.floor(ctx.rng() * objs.length)] }; else ok = false;
            }
          }
        }
        if (ok) cands.push({ p, fills });
      }
    }
    return cands.length ? cands[Math.floor(ctx.rng() * cands.length)] : null;
  }
  G.pattern = (item, ctx) => {
    if (item.use !== 'say') return null;
    const hit = patternFor(item, ctx); if (!hit) return null;
    const r = realizePattern(hit.p, hit.fills); if (!r) return null;
    // Equivalent patterns (same intent) are accepted too.
    const alts = ctx.C.grammar.filter(g => g !== hit.p && g.parts && g.intent && g.intent === hit.p.intent && Object.keys(g.slots).every(k => hit.fills[k])).map(g => realizePattern(g, hit.fills)).filter(Boolean);
    return { ex: 'pattern', item: item.id, skill: 'context', pattern: hit.p.id, prompt: englishFor(hit.p, hit.fills), register: hit.p.register, answer: { jp: r.jp, kana: r.kana, alt: alts.map(a => ({ jp: a.jp, kana: a.kana })) }, chunks: r.chunks, novelContext: true };
  };
  G.build = (item, ctx) => {
    const hit = item.use === 'say' && patternFor(item, ctx); if (!hit) return null;
    const r = realizePattern(hit.p, hit.fills); if (!r || r.chunks.length < 3) return null;   // validation 7
    let order = shuffle(r.chunks.map((c, i) => i), ctx.rng);
    if (order.every((v, i) => v === i)) order = order.slice(1).concat(order[0]);
    return { ex: 'build', item: item.id, skill: 'context', pattern: hit.p.id, prompt: englishFor(hit.p, hit.fills), chunks: r.chunks, order, answer: { jp: r.jp, kana: r.kana }, novelContext: true };
  };

  // Matching: as many pairs as there are suitable items, up to what fits on
  // a phone screen (a UI limit, not a content assumption).
  G.match = (items, ctx, maxPairs) => {
    const pool = [];
    for (const x of shuffle(items, ctx.rng)) { if (pool.length >= maxPairs) break; if (!pool.some(p => meaningsClash(p, x) || p.jp === x.jp)) pool.push(x); }
    if (pool.length < 3) return null;
    return { ex: 'match', items: pool.map(p => p.id), left: shuffle(pool.map(p => p.id), ctx.rng), right: shuffle(pool.map(p => p.id), ctx.rng), skill: 'recognition', recognitionOnly: true };
  };

  // Which generators can exercise which skill (planner chooses among them).
  const BY_SKILL = {
    recognition: ['choice', 'pick'],
    listening: ['listen'],
    reading: ['reading', 'kanjipick'],
    production: ['type'],
    speaking: ['speak'],
    form: ['form'],
    context: ['pattern', 'cloze', 'build']
  };
  // Try the generators for a skill in (shuffled-with-preference) order;
  // returns the first valid card, else null.
  function forSkill(item, skill, ctx, avoid) {
    const list = (BY_SKILL[skill] || []).filter(e => !(avoid && avoid.includes(e)));
    const order = list.length > 1 ? shuffle(list, ctx.rng) : list;
    for (const e of order.concat((BY_SKILL[skill] || []).filter(x => !order.includes(x)))) {
      const c = G[e](item, ctx);
      if (c && validate(c, item, ctx).ok) return Object.assign({ id: cid() }, c);
    }
    return null;
  }
  function make(type, item, ctx, extra) {
    const c = G[type] && G[type](item, ctx, extra);
    if (!c) return null;
    if (!validate(c, item, ctx).ok) return null;
    return Object.assign({ id: cid() }, c);
  }

  /* ---------- final card validation (defence in depth) ---------- */
  function validate(c, item, ctx) {
    const fail = why => ({ ok: false, why });
    if (!c.ex) return fail('no-type');
    if (c.ex === 'match') return c.items.length >= 3 ? { ok: true } : fail('too-few-pairs');
    if (!item || !ctx.C.byId[item.id]) return fail('unknown-item');
    if (['choice', 'listen', 'diag', 'pick', 'kanjipick'].includes(c.ex)) {
      if (!c.options || c.options.length < 3 || c.correct < 0) return fail('options');
      if (new Set(c.options).size !== c.options.length) return fail('duplicate-options');
      const key = c.ex === 'pick' || c.ex === 'kanjipick' ? item.jp : item.en;
      if (c.options[c.correct] !== key) return fail('answer-key');
    }
    if ((c.ex === 'listen' || c.ex === 'speak') && !ctx.audio && c.ex === 'listen') return fail('no-audio');
    if (c.answer) {
      if (!c.answer.jp || !c.answer.kana) return fail('answer-missing');
      // The key must be accepted by our own checker (catches inconsistent keys).
      if (A.check(c.answer.jp, c.answer).verdict !== 'correct' || A.check(c.answer.kana, c.answer).verdict !== 'correct') return fail('answer-unacceptable');
    }
    if (c.ex === 'form') {
      const r = CJ.conjugate(item, c.form);
      if (!r || r.jp !== c.answer.jp) return fail('form-key-mismatch');
    }
    if (c.ex === 'build' && c.chunks.join('') !== c.answer.jp) return fail('chunks-mismatch');
    return { ok: true };
  }

  // Grade a card's response → { verdict, kind, note }.
  function grade(card, response, ctx) {
    if (['choice', 'listen', 'diag', 'pick', 'kanjipick'].includes(card.ex)) {
      if (response.dontKnow) return { verdict: 'wrong', kind: 'dont-know' };
      return response.index === card.correct ? { verdict: 'correct', kind: 'exact' } : { verdict: 'wrong', kind: 'wrong-choice', chose: card.options[response.index] };
    }
    if (card.ex === 'speak') {
      const g = response.self;   // 'yes' | 'partly' | 'no'
      return { verdict: g === 'yes' ? 'correct' : g === 'partly' ? 'near' : 'wrong', kind: 'self', selfGrade: g === 'yes' ? 3 : g === 'partly' ? 2 : 1 };
    }
    if (card.ex === 'build') {
      const got = (response.sequence || []).map(i => card.chunks[i]).join('');
      return got === card.answer.jp ? { verdict: 'correct', kind: 'exact' } : { verdict: 'wrong', kind: 'order' };
    }
    if (response.dontKnow) return { verdict: 'wrong', kind: 'dont-know' };
    const r = A.check(response.text, card.answer, card.others);
    if (r.verdict === 'correct' && card.synonyms && card.synonyms.length) {
      const item = ctx.C.byId[card.item];
      if (![item.jp, item.kana].map(A.canon).includes(A.canon(response.text)) && !(A.romajiCandidates(response.text).includes(A.canon(item.kana)))) r.note = 'Also correct. The word being practised here is ' + item.jp + '.';
    }
    return r;
  }

  return { G, make, forSkill, validate, grade, BY_SKILL, FORM_CUES, VERB_STAGES, ADJ_STAGES, formsAvailable, speechText, meaningsClash, surfaceIn, realizePattern, patternFor, englishFor, slotOk, shuffle };
});
