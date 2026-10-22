/* ============================================================
   Michi — curriculum loading, validation and indexing (pure)
   ------------------------------------------------------------
   Turns raw data files into an indexed, VERIFIED-ONLY curriculum. Nothing
   downstream assumes sizes: generators query these indexes.
   ============================================================ */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MichiCurriculum = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const CJ = node ? require('./conjugate.js') : root.MichiConjugate;
  const K = node ? require('./kana.js') : root.MichiKana;

  const REQ = ['id', 'jp', 'kana', 'en', 'pos', 'topic', 'tier', 'use', 'status', 'sources'];
  const POS = ['noun', 'verb', 'i-adj', 'na-adj', 'adverb', 'expression', 'phrase', 'pronoun', 'question', 'counter', 'sign', 'place'];

  // Skills tracked separately in the memory model.
  const SKILLS = {
    recognition: { name: 'Recognition', desc: 'See Japanese → know the meaning' },
    listening:   { name: 'Listening', desc: 'Hear Japanese → know the meaning' },
    reading:     { name: 'Kanji reading', desc: 'See kanji → produce the reading' },
    production:  { name: 'Recall (typed)', desc: 'Meaning → produce the Japanese' },
    speaking:    { name: 'Speaking', desc: 'Meaning → say it aloud (self-assessed)' },
    form:        { name: 'Conjugation', desc: 'Produce the right form' },
    context:     { name: 'In context', desc: 'Use it in a sentence or reply' }
  };

  function skillsFor(it) {
    const s = [];
    if (it.use === 'say') {
      s.push('recognition', 'listening', 'production', 'speaking');
      if (K.hasKanji(it.jp)) s.push('reading');
      if (it.verb_class || it.adj_class) s.push('form');
      if ((it.examples && it.examples.length) || (it.tags && it.tags.length) || it.verb_class) s.push('context');
    } else if (it.use === 'hear') {
      s.push('listening', 'recognition');
    } else {
      s.push('recognition');
      if (K.hasKanji(it.jp)) s.push('reading');
    }
    return s;
  }
  // The skill that best represents "can use it independently".
  function primarySkill(it) { return it.use === 'say' ? 'production' : it.use === 'hear' ? 'listening' : 'recognition'; }

  /* Validate one raw item. Returns { item } or { skip: reason }. */
  function prepareItem(raw, file, seen) {
    const it = Object.assign({ topic: file.topic }, raw);
    const miss = REQ.filter(k => it[k] == null || it[k] === '' || (k === 'sources' && !(Array.isArray(it.sources) && it.sources.length)));
    if (miss.length) return { skip: 'missing:' + miss.join(',') };
    if (seen && seen.has(it.id)) return { skip: 'duplicate-id' };
    if (it.status !== 'verified') return { skip: 'not-verified' };
    if (POS.indexOf(it.pos) < 0) return { skip: 'bad-pos:' + it.pos };
    if (['say', 'hear', 'read'].indexOf(it.use) < 0) return { skip: 'bad-use:' + it.use };
    if (it.pos === 'verb' && !it.verb_class) return { skip: 'verb-without-class' };
    if ((it.pos === 'i-adj' || it.pos === 'na-adj') && !it.adj_class) return { skip: 'adjective-without-class' };
    if (it.verb_class || it.adj_class) {
      try { CJ.conjugate(it, it.verb_class ? 'masu' : 'neg'); } catch (e) { return { skip: 'conjugation-invalid:' + e.message }; }
    }
    it.gloss = it.gloss || it.en;
    it.skills = skillsFor(it);
    it.lesson = it.lesson !== false;
    it.examples = (it.examples || []).filter(e => e && e.jp && e.en && e.source);
    return { item: it };
  }

  /* Build the curriculum from already-fetched JSON documents.
     docs = { index, topics, itemFiles: [ {topic, items} ], grammar, conjugation, recovery, milestones } */
  function build(docs) {
    const C = { version: (docs.index && docs.index.curriculum_version) || 'unknown', topics: [], topicById: {}, items: [], byId: {}, byTopic: {}, byTag: {}, skipped: [], grammar: [], grammarById: {}, conjugation: docs.conjugation || { forms: [] }, recovery: [], milestones: [], milestoneById: {} };
    const seen = new Set();
    for (const f of docs.itemFiles || []) {
      for (const raw of (f && f.items) || []) {
        const r = prepareItem(raw, f, seen);
        if (r.skip) { C.skipped.push({ id: raw && raw.id, why: r.skip }); continue; }
        seen.add(r.item.id); C.items.push(r.item); C.byId[r.item.id] = r.item;
      }
    }
    // Links pointing at unserved items are dropped (no dangling references).
    for (const it of C.items) it.links = (it.links || []).filter(l => C.byId[l.id]);
    const topics = ((docs.topics && docs.topics.topics) || []).slice().sort((a, b) => (a.order || 99) - (b.order || 99));
    for (const t of topics) {
      const items = C.items.filter(i => i.topic === t.id);
      if (!items.length) continue;
      C.topics.push(t); C.topicById[t.id] = t; C.byTopic[t.id] = items;
    }
    for (const it of C.items) {
      if (!C.byTopic[it.topic]) { C.byTopic[it.topic] = [it]; if (!C.topicById[it.topic]) { const t = { id: it.topic, name: it.topic, icon: '•', order: 999, prereq: [], patterns: [] }; C.topics.push(t); C.topicById[t.id] = t; } }
      for (const tag of it.tags || []) (C.byTag[tag] = C.byTag[tag] || []).push(it);
    }
    for (const g of (docs.grammar && docs.grammar.patterns) || []) {
      if (g.status !== 'verified' || !g.sources || !g.sources.length) { C.skipped.push({ id: g.id, why: 'pattern-not-verified' }); continue; }
      C.grammar.push(g); C.grammarById[g.id] = g;
    }
    C.recovery = ((docs.recovery && docs.recovery.prompts) || []).filter(p => p.status === 'verified');
    C.milestones = ((docs.milestones && docs.milestones.milestones) || []).map(m => Object.assign({}, m, { needs: (m.needs || []).filter(id => C.byId[id]), missing: (m.needs || []).filter(id => !C.byId[id]) }));
    for (const m of C.milestones) C.milestoneById[m.id] = m;
    return C;
  }

  // Items that may be taught in lessons (reference-only items excluded).
  function lessonItems(C) { return C.items.filter(i => i.lesson); }

  return { REQ, POS, SKILLS, skillsFor, primarySkill, prepareItem, build, lessonItems };
});
