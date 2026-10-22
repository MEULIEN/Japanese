/* ============================================================
   Michi — session planner (pure; reads state, never writes memory)
   ------------------------------------------------------------
   Builds and adapts the five session kinds. No session has a fixed
   length: every size is derived from
     • the learner's available minutes (Settings),
     • the learner's OWN median time per exercise type (falls back to
       policy priors until there is history),
     • which skills are due and how much they matter,
     • recent retention (struggling → fewer new items),
     • and what eligible, verified material actually exists.
   A session ends when its objectives are met or its time budget is
   used up; leftovers are carried forward explicitly, never silently
   marked as learned.

   Kinds:  morning · evening · weekly   → scheduled (update memory)
           recall · training            → practice (never update memory)
   ============================================================ */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MichiPlanner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const P = node ? require('./policy.js') : root.MichiPolicy;
  const SRS = node ? require('./srs.js') : root.MichiSRS;
  const CAL = node ? require('./calendar.js') : root.MichiCalendar;
  const X = node ? require('./exercises.js') : root.MichiExercises;
  const CUR = node ? require('./curriculum.js') : root.MichiCurriculum;
  const K = node ? require('./kana.js') : root.MichiKana;

  const SCHEDULED = ['morning', 'evening', 'weekly'];
  const shuffle = X.shuffle;

  /* ---------- context ---------- */
  // ctx = { C, state, date, audio, rng, now }
  function scopeOf(ctx, extraIds) {
    const s = new Set(Object.keys(ctx.state.memory).filter(id => ctx.C.byId[id]));
    for (const id of extraIds || []) s.add(id);
    return s;
  }
  // allPatterns: inside a morning lesson any verified pattern may be used,
  // because the lesson inserts a "teach the pattern" card before its first
  // use. Everywhere else only patterns the learner has been taught are used.
  function gctx(ctx, extraIds, allPatterns, sessionPatterns) {
    const seen = new Set((ctx.state.lesson.patternsSeen || []).concat(sessionPatterns || []));
    return { C: ctx.C, memory: ctx.state.memory, audio: ctx.audio, rng: ctx.rng, scope: scopeOf(ctx, extraIds), optionCount: 4, patternsSeen: allPatterns ? null : seen };
  }
  // Insert a teachpattern card before the first use of each pattern the
  // learner has not been taught yet.
  function introducePatterns(q, ctx, s) {
    const seen = new Set((ctx.state.lesson.patternsSeen || []).concat(s.patternsIntroduced || []));
    s.patternsIntroduced = s.patternsIntroduced || [];
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      if (!c.pattern || c.ex === 'teachpattern' || seen.has(c.pattern)) continue;
      const p = ctx.C.grammarById[c.pattern]; if (!p) continue;
      q.splice(k, 0, Object.assign({ id: 'tp-' + p.id + '-' + k, phase: 'teach' }, X.G.teachpattern(p)));
      seen.add(p.id); s.patternsIntroduced.push(p.id); k++;
    }
    return q;
  }
  const nowMs = ctx => (ctx.now ? ctx.now() : Date.now());

  /* ---------- time estimates (from the learner's own history) ---------- */
  const EX_PRIOR = { teach: 'teach', diag: 'diagnostic', choice: 'choice', pick: 'choice', listen: 'listen', reading: 'reading', type: 'type', speak: 'speak', cloze: 'cloze', pattern: 'respond', build: 'build', form: 'form', match: 'match', recovery: 'circumlocution', span: 'span', kanjipick: 'choice', switch: 'type', scenario: 'respond' };
  function estSec(ctx, ex) {
    const own = (ctx.state.latency || {})[ex];
    if (own && own.length >= 5) return Math.max(3, SRS.median(own) / 1000 * 1.5);    // answer time + reading the feedback
    return P.priorSeconds[EX_PRIOR[ex] || 'choice'] || 15;
  }
  const cardSec = (ctx, c) => c.estSec || (c.estSec = estSec(ctx, c.ex));
  const sumSec = (ctx, cards) => cards.reduce((s, c) => s + cardSec(ctx, c), 0);

  /* ---------- review selection ---------- */
  const TIER_WEIGHT = { 1: 1, 2: 0.8, 3: 0.6 };
  // Every introduced (item, skill) with its recall probability and priority.
  function skillStates(ctx) {
    const out = [];
    for (const [id, m] of Object.entries(ctx.state.memory)) {
      const it = ctx.C.byId[id]; if (!it) continue;
      for (const sk of it.skills) {
        const st = m.skills[sk];
        const R = st ? SRS.recallProb(st, ctx.date) : 0;
        const due = st ? st.due <= ctx.date : CAL.daysBetween(m.intro, ctx.date) >= 1;   // untested skill: due from the day after introduction
        const prio = (1 - R) * (TIER_WEIGHT[it.tier] || 0.6) * (1 + 0.3 * Math.min(5, (st && st.lapses) || 0)) * (sk === CUR.primarySkill(it) ? 1.3 : 1);
        out.push({ item: it, skill: sk, st, R, due, prio, untested: !st });
      }
    }
    return out;
  }
  // Due reviews, best first, at most one skill per item per session (breadth),
  // until `budgetSec` is filled. Exclude ids in `exclude`.
  function selectReviews(ctx, budgetSec, exclude, g) {
    const ex = new Set(exclude || []);
    const due = skillStates(ctx).filter(s => s.due && !ex.has(s.item.id)).sort((a, b) => b.prio - a.prio);
    const picked = [], usedItems = new Set();
    let sec = 0;
    for (const s of due) {
      if (usedItems.has(s.item.id)) continue;
      const card = X.forSkill(s.item, s.skill, g);
      if (!card) continue;                                   // no valid exercise for this skill now → try the next
      const t = cardSec(ctx, card);
      if (sec + t > budgetSec && picked.length) break;
      Object.assign(card, { phase: 'review' });
      picked.push(card); usedItems.add(s.item.id); sec += t;
      if (sec >= budgetSec) break;
    }
    return { cards: picked, sec, dueTotal: new Set(due.map(d => d.item.id)).size };
  }

  // Recent scheduled accuracy (non-diagnostic) — null when too little data.
  function recentRetention(ctx) {
    const since = CAL.addDays(ctx.date, -7);
    const rows = ctx.state.log.filter(r => r.date >= since && r.phase !== 'diag' && r.phase !== 'teach');
    if (rows.length < 20) return null;
    return rows.filter(r => r.verdict !== 'wrong').length / rows.length;
  }

  /* ---------- morning ---------- */
  const introduced = ctx => new Set(Object.keys(ctx.state.memory));
  function topicProgress(ctx, t) {
    const items = (ctx.C.byTopic[t.id] || []).filter(i => i.lesson);
    const intro = items.filter(i => ctx.state.memory[i.id]).length;
    return { total: items.length, intro, left: items.length - intro };
  }
  /* Which topic the next morning should teach, and WHY (shown to the learner).
     Order of considerations:
       1. carried-forward objectives from an unfinished lesson ('carry');
       2. topic priorities (Settings): about `share` of recent mornings go to a
          preferred topic, highest-ranked first; if a preferred topic needs a
          prerequisite topic that hasn't been started, that comes first
          ('priority' / 'prereq');
       3. otherwise keep learning broad: continue a started topic, else the
          next topic in curriculum order whose prerequisites are started
          ('balance' when priorities exist, else 'continue' / 'next').
     Reviews (spaced repetition) are untouched by this: every topic's due
     items keep coming back. Returns { topic, why, forTopic? }. */
  function pickTopicInfo(ctx, want, exclude) {
    const ex = new Set(exclude || []);
    const open = ctx.C.topics.filter(t => !ex.has(t.id) && topicProgress(ctx, t).left > 0);
    if (want) { const t = open.find(x => x.id === want); return { topic: t || null, why: 'chosen' }; }
    const carry = (ctx.state.lesson.carry || []).map(id => ctx.C.byId[id]).filter(i => i && !ctx.state.memory[i.id]);
    if (carry.length) { const t = open.find(x => x.id === carry[0].topic); if (t) return { topic: t, why: 'carry' }; }
    const started = t => topicProgress(ctx, t).intro > 0;
    const prereqsMet = t => (t.prereq || []).every(p => !ctx.C.topicById[p] || started(ctx.C.topicById[p]));
    const prios = (ctx.state.settings.topicPriorities || []).filter(id => ctx.C.topicById[id]);
    if (prios.length) {
      const recent = ctx.state.sessions.filter(x => x.kind === 'morning' && x.topic && !x.legacy).slice(-P.topicPriority.window);
      const share = recent.length ? recent.filter(x => prios.includes(x.topic) || prios.includes(x.forTopic)).length / recent.length : 0;
      if (share < P.topicPriority.share || recent.length < P.topicPriority.window) {
        // Rotate among the chosen topics weighted by rank (3 : 2 : 1): the
        // first choice comes up most often, but none is starved.
        const W = [3, 2, 1];
        const lastN = ctx.state.sessions.filter(x => x.kind === 'morning' && !x.legacy).slice(-9);
        const used = id => lastN.filter(x => x.topic === id || x.forTopic === id).length;
        const order = prios.map((id, k) => ({ id, k, load: used(id) / W[k] })).sort((a, b) => a.load - b.load || a.k - b.k).map(x => x.id);
        for (const id of order) {
          const t = open.find(x => x.id === id); if (!t) continue;
          if (prereqsMet(t)) return { topic: t, why: 'priority' };
          const need = (t.prereq || []).map(pid => open.find(x => x.id === pid)).find(x => x && !started(x));
          if (need) return { topic: need, why: 'prereq', forTopic: t.id };
          return { topic: t, why: 'priority' };
        }
      }
      // Broad learning: something outside the priorities (falls back to a
      // priority topic only if nothing else has material left).
      const others = open.filter(t => !prios.includes(t.id));
      const pick = others.find(started) || others.find(prereqsMet) || others[0];
      if (pick) return { topic: pick, why: 'balance' };
      const anyP = open.find(t => prios.includes(t.id));
      return anyP ? { topic: anyP, why: 'priority' } : { topic: null, why: 'none' };
    }
    const st = open.filter(started);
    if (st.length) return { topic: st[0], why: 'continue' };
    const ready = open.filter(prereqsMet);
    const t = ready[0] || open[0] || null;
    return { topic: t, why: t ? 'next' : 'none' };
  }
  function pickTopic(ctx, want) { return pickTopicInfo(ctx, want).topic; }

  // The card sequence an item needs when first taught (used both to build
  // the lesson and to estimate its cost). Depends on the item's data.
  function learnCards(item, g) {
    const seq = [];
    const push = (type, phase, extra) => { const c = X.make(type, item, g, extra); if (c) { c.phase = phase; seq.push(c); } return c; };
    push('teach', 'teach');
    if (item.use === 'hear') { push('listen', 'learn') || push('choice', 'learn'); push('choice', 'learn'); }
    else if (item.use === 'read') { push('choice', 'learn'); if (K.hasKanji(item.jp)) push('reading', 'learn'); }
    else {
      push('choice', 'learn') || push('pick', 'learn');
      push('listen', 'learn');
      push('type', 'learn');
      if (item.verb_class || item.adj_class) push('form', 'learn');
      push('pattern', 'learn') || push('cloze', 'learn');
      push('speak', 'learn');
    }
    return seq;
  }
  function delayedCard(item, g) {
    const skill = CUR.primarySkill(item);
    const c = X.forSkill(item, skill, g) || X.forSkill(item, 'recognition', g);
    if (c) c.phase = 'delayed';
    return c;
  }

  function newSession(kind, ctx, extra) {
    return Object.assign({ id: kind + '-' + ctx.date + '-' + nowMs(ctx).toString(36), kind, date: ctx.date, startTs: nowMs(ctx), queue: [], i: 0, results: [], objectives: {}, retries: {}, remediationSec: 0, budgetSec: 0, carry: [], notes: [] }, extra || {});
  }

  function startMorning(ctx, opts) {
    opts = opts || {};
    const budget = (ctx.state.settings.minutes.morning || P.availableMinutes.morning) * 60;
    const info = pickTopicInfo(ctx, opts.topic);
    const topic = info.topic;
    const s = newSession('morning', ctx, { budgetSec: budget, phase: 'diag', topic: topic && topic.id, topicWhy: info.why, forTopic: info.forTopic || null });
    if (!topic) {
      // Curriculum fully introduced: a morning becomes a review session.
      const g = gctx(ctx);
      s.queue = selectReviews(ctx, budget * (1 - P.morning.remediationShare), [], g).cards;
      s.phase = 'learn'; s.notes.push('all-topics-introduced');
      if (!s.queue.length) s.reason = 'nothing-to-do';
      return s;
    }
    const carry = new Set(ctx.state.lesson.carry || []);
    const poolOf = t => (ctx.C.byTopic[t.id] || []).filter(i => i.lesson && !ctx.state.memory[i.id])
      .map((it, idx) => ({ it, idx })).sort((a, b) => (carry.has(b.it.id) - carry.has(a.it.id)) || (a.it.tier - b.it.tier) || (a.idx - b.idx)).map(x => x.it);
    let pool = poolOf(topic);
    // Too little left in this topic for a normal lesson? Top up from the next
    // suitable topic rather than teaching a near-empty lesson.
    if (pool.length < P.morning.preferredNew[0]) {
      const second = pickTopicInfo(ctx, null, [topic.id]).topic;
      if (second) { s.topic2 = second.id; pool = pool.concat(poolOf(second).slice(0, P.morning.preferredNew[0] - pool.length)); }
    }
    const g = gctx(ctx, pool.map(i => i.id), true);
    // Time for older reviews first (bounded share), remediation reserve, rest for new items.
    const rev = selectReviews(ctx, budget * P.morning.reviewShare, pool.map(i => i.id), g);
    const learnSec = Math.max(0, budget - rev.sec - budget * P.morning.remediationShare);
    const retention = recentRetention(ctx);
    const factor = retention == null ? 1 : Math.max(0.5, Math.min(1, retention / P.srs.targetRetention));
    const costs = pool.map(it => sumSec(ctx, learnCards(it, g)) + estSec(ctx, 'diag') + estSec(ctx, 'type'));
    const median = costs.slice().sort((a, b) => a - b)[costs.length >> 1] || 0;
    const chosen = []; let used = 0;
    for (let k = 0; k < pool.length; k++) {
      if (chosen.length >= P.morning.absoluteMaxNew) break;
      if (chosen.length && used + costs[k] > learnSec * factor) break;
      chosen.push(pool[k]); used += costs[k];
    }
    // Preferred range: a lesson of easy, quick items may exceed the preferred
    // maximum (up to the absolute safeguard); otherwise cap it there.
    const easy = chosen.length && (used / chosen.length) <= median * 0.85;
    const cap = easy ? P.morning.absoluteMaxNew : P.morning.preferredNew[1];
    while (chosen.length > cap) chosen.pop();
    const reserve = pool.slice(chosen.length, chosen.length + Math.ceil(chosen.length / 3));
    s.reasons = { topic: info.why, forTopic: info.forTopic || null, topic2: s.topic2 || null };
    s.plan = { newIds: chosen.map(i => i.id), reserveIds: reserve.map(i => i.id), reviewCards: rev.cards, dueTotal: rev.dueTotal, retentionFactor: factor, learnSec };
    for (const it of chosen.concat(reserve)) s.objectives[it.id] = { status: 'planned', diag: null, errors: 0, exUsed: [], reserve: reserve.includes(it) };
    // Diagnostic covers ONLY this lesson's candidate material.
    for (const it of chosen.concat(reserve)) {
      const c = X.make('diag', it, g);
      if (c) { c.phase = 'diag'; s.queue.push(c); }
      else s.objectives[it.id].diag = 'none';                 // can't diagnose → simply teach it
    }
    if (!s.queue.length) afterDiag(s, ctx);
    return s;
  }

  // Called when the diagnostic phase is finished: decide what to teach.
  function afterDiag(s, ctx) {
    if (s.phase !== 'diag') return;
    s.phase = 'learn';
    const ids = s.plan.newIds.concat(s.plan.reserveIds);
    const g = gctx(ctx, ids, true);
    const obj = s.objectives;
    const known = s.plan.newIds.filter(id => obj[id].diag === 'known');
    // Budget freed by already-known items lets reserve items in (they were diagnosed too).
    let freed = known.reduce((t, id) => t + sumSec(ctx, learnCards(ctx.C.byId[id], g)), 0);
    const teach = s.plan.newIds.filter(id => obj[id].diag !== 'known');
    for (const id of s.plan.reserveIds) {
      const it = ctx.C.byId[id];
      const cost = obj[id].diag === 'known' ? estSec(ctx, 'type') : sumSec(ctx, learnCards(it, g));
      if (freed >= cost) { freed -= cost; (obj[id].diag === 'known' ? known : teach).push(id); obj[id].reserve = false; }
      else { delete obj[id]; }
    }
    s.plan.teachIds = teach; s.plan.knownIds = known;
    const reviews = s.plan.reviewCards.slice();
    const chunks = [];
    for (let k = 0; k < teach.length; k += P.teachChunk) chunks.push(teach.slice(k, k + P.teachChunk));
    const q = [];
    const reviewsPerGap = chunks.length ? Math.ceil(reviews.length / (chunks.length + 1)) : reviews.length;
    for (const ch of chunks) {
      const seqs = ch.map(id => learnCards(ctx.C.byId[id], g));
      q.push(...seqs.map(sq => sq[0]).filter(c => c && c.ex === 'teach'));                // teach the chunk
      const rest = seqs.map(sq => sq.filter(c => c.ex !== 'teach'));
      // interleave the chunk's practice so the same word never appears twice in a row
      for (let r = 0; rest.some(x => x[r]); r++) q.push(...shuffle(rest.map(x => x[r]).filter(Boolean), g.rng));
      q.push(...reviews.splice(0, reviewsPerGap));
    }
    q.push(...reviews.splice(0));
    // Known items: one brief production/context check, not a full lesson.
    for (const id of known) { const it = ctx.C.byId[id]; const c = X.forSkill(it, 'context', g) || X.forSkill(it, CUR.primarySkill(it), g); if (c) { c.phase = 'reinforce'; q.push(c); } }
    // Delayed retrieval of every newly taught item — the "can you still
    // produce it after a gap?" check that decides if an objective is met.
    for (const id of shuffle(teach, g.rng)) { const c = delayedCard(ctx.C.byId[id], g); if (c) q.push(c); }
    s.queue = s.queue.slice(0, s.i).concat(introducePatterns(q, ctx, s));
  }

  /* ---------- evening ---------- */
  function startEvening(ctx) {
    const budget = (ctx.state.settings.minutes.evening || P.availableMinutes.evening) * 60;
    const src = ctx.state.lesson.pendingEvening;
    const s = newSession('evening', ctx, { budgetSec: budget, phase: 'learn', source: src ? src.sessionId : null });
    const g = gctx(ctx);
    const morningIds = src ? src.items.filter(id => ctx.C.byId[id] && ctx.state.memory[id]) : [];
    const consolidation = [];
    for (const id of morningIds) {
      const it = ctx.C.byId[id];
      const m = ctx.state.memory[id];
      const st = m.skills[CUR.primarySkill(it)];
      const R = st ? SRS.recallProb(st, ctx.date) : 0;
      const errs = (src.errors && src.errors[id]) || 0;
      const status = (src.status || {})[id];
      // More exercises for what the morning left uncertain.
      const [lo, hi] = P.evening.perItem;
      const n = Math.max(lo, Math.min(hi, lo + Math.round((1 - R) * (hi - lo)) + (errs ? 1 : 0) + (status === 'established' ? -1 : 0)));
      const usedEx = new Set((src.exUsed && src.exUsed[id]) || []);
      // Productive and transfer skills first; different exercise types from the morning.
      const order = it.use === 'say' ? ['context', 'production', 'listening', 'speaking', 'form', 'reading', 'recognition'] : it.use === 'hear' ? ['listening', 'recognition'] : ['reading', 'recognition'];
      const skills = order.filter(sk => it.skills.includes(sk));
      // One candidate per skill (productive first), preferring exercise types
      // the morning didn't use; fill with fresh ones first, then the rest.
      // Rank: productive skills first; among them, avoid repeating a
      // fixed-prompt exercise the morning already used (pattern/cloze/form/
      // build generate a new sentence or form each time, so they never count
      // as exact repetition).
      const cands = skills.map(sk => X.forSkill(it, sk, g, [...usedEx])).filter(Boolean);
      const PRODUCTIVE = ['production', 'context', 'speaking', 'form', 'reading'];
      const FIXED = ['type', 'speak', 'choice', 'listen', 'pick', 'reading'];
      const rank = c => (PRODUCTIVE.includes(c.skill) ? 0 : 2) + (usedEx.has(c.ex) && FIXED.includes(c.ex) ? 1 : 0);
      const pick = cands.map((c, k) => ({ c, k })).sort((a, b) => rank(a.c) - rank(b.c) || a.k - b.k).slice(0, n).map(x => x.c);
      for (const c of pick) { c.phase = 'consolidate'; consolidation.push(c); }
      s.objectives[id] = { status: status || 'taught', errors: 0, exUsed: [] };
    }
    const consSec = sumSec(ctx, consolidation);
    const revBudget = Math.max(budget * P.evening.reviewShare, budget * (1 - P.evening.remediationShare) - consSec);
    const rev = selectReviews(ctx, revBudget, morningIds, g);
    // Interleave consolidation (productive first) with reviews.
    const q = [], cons = consolidation.slice();
    const rv = rev.cards.slice();
    while (cons.length || rv.length) {
      if (cons.length) q.push(cons.shift());
      if (cons.length) q.push(cons.shift());
      if (rv.length) q.push(rv.shift());
    }
    s.queue = q;
    s.plan = { morningIds, dueTotal: rev.dueTotal };
    if (!q.length) s.reason = Object.keys(ctx.state.memory).length ? 'nothing-to-do' : 'nothing-learned';
    return s;
  }

  /* ---------- weekly ---------- */
  function startWeekly(ctx, key) {
    const budget = (ctx.state.settings.minutes.weekly || P.availableMinutes.weekly) * 60;
    const s = newSession('weekly', ctx, { budgetSec: budget, phase: 'assess', weekKey: key });
    const g = gctx(ctx);
    const lastKey = Object.keys(ctx.state.weekly).filter(k => k < key).sort().pop();
    const since = lastKey || '0000-00-00';
    const all = skillStates(ctx);
    const byItem = {};
    for (const s2 of all) (byItem[s2.item.id] = byItem[s2.item.id] || []).push(s2);
    // Scope: everything introduced since the last assessment, plus older
    // material ranked by forgetting risk × importance (+ untested skills).
    const recentIds = Object.keys(ctx.state.memory).filter(id => byItem[id] && ctx.state.memory[id].intro > since);
    const olderIds = Object.keys(byItem).filter(id => !recentIds.includes(id))
      .sort((a, b) => Math.max(...byItem[b].map(x => x.prio)) - Math.max(...byItem[a].map(x => x.prio)));
    const order = recentIds.sort((a, b) => Math.max(...byItem[b].map(x => x.prio)) - Math.max(...byItem[a].map(x => x.prio))).concat(olderIds);
    // Greedy coverage: each item gets its most informative skills (primary
    // first, then the skill dimension least covered so far), at most
    // maxSkillsPerItem — so no word is tested in trivial variations while
    // others go untested.
    const skillCount = {};
    const cards = [];
    let sec = 0;
    const reserve = budget * P.weekly.remediationShare;
    const scen = scenarioCards(ctx, g);
    const scenSec = sumSec(ctx, scen.cards);
    for (const id of order) {
      const it = ctx.C.byId[id];
      const opts = byItem[id].slice().sort((a, b) => ((a.skill === CUR.primarySkill(it)) ? -1 : 0) - ((b.skill === CUR.primarySkill(it)) ? -1 : 0) || (skillCount[a.skill] || 0) - (skillCount[b.skill] || 0) || b.prio - a.prio);
      let n = 0;
      for (const o of opts) {
        if (n >= P.weekly.maxSkillsPerItem) break;
        const c = X.forSkill(it, o.skill, g);
        if (!c) continue;
        const t = cardSec(ctx, c);
        if (sec + t + scenSec > budget - reserve) break;
        c.phase = 'assess'; c.recent = recentIds.includes(id);
        cards.push(c); sec += t; n++; skillCount[o.skill] = (skillCount[o.skill] || 0) + 1;
      }
      if (sec + scenSec >= budget - reserve) break;
    }
    const tested = new Set(cards.map(c => c.item));
    s.plan = { recentIds, olderCount: olderIds.length, untested: recentIds.filter(id => !tested.has(id)), skillCount, scenarios: scen.ids };
    // Mix skills so similar exercise types don't cluster; scenarios at the end.
    s.queue = interleaveBy(cards, c => c.skill, g.rng).concat(scen.cards);
    if (!s.queue.length) s.reason = 'nothing-learned';
    return s;
  }
  function interleaveBy(cards, keyFn, rng) {
    const groups = {};
    for (const c of shuffle(cards, rng)) (groups[keyFn(c)] = groups[keyFn(c)] || []).push(c);
    const lists = Object.values(groups).sort((a, b) => b.length - a.length);
    const out = [];
    let lastItem = null;
    while (lists.some(l => l.length)) {
      for (const l of lists) {
        if (!l.length) continue;
        let k = l.findIndex(c => c.item !== lastItem); if (k < 0) k = 0;
        const c = l.splice(k, 1)[0]; out.push(c); lastItem = c.item;
      }
    }
    return out;
  }
  // Real-world milestone checks: a milestone is assessed once every item it
  // needs has been introduced; each step is an (item, skill) task.
  function scenarioCards(ctx, g) {
    const cards = [], ids = [];
    for (const m of ctx.C.milestones) {
      if (!m.steps || !m.steps.length || m.missing.length) continue;
      if (!m.needs.every(id => ctx.state.memory[id])) continue;
      const rec = ctx.state.milestones[m.id];
      if (rec && rec.passed && CAL.daysBetween(rec.passed, ctx.date) < 28) continue;      // re-check monthly
      const steps = [];
      for (const st of m.steps) {
        const it = ctx.C.byId[st.item]; if (!it) { steps.length = 0; break; }
        const c = X.forSkill(it, st.skill, g);
        if (!c) { steps.length = 0; break; }
        Object.assign(c, { phase: 'scenario', milestone: m.id, stepText: st.say || null });
        steps.push(c);
      }
      if (steps.length) { cards.push(...steps); ids.push(m.id); }
    }
    return { cards, ids };
  }

  /* ---------- practice: Recall & Training (endless, adaptive) ---------- */
  // Weakness ranks what independent study should offer first. It READS the
  // official memory and the practice history; it never writes either.
  function weakness(ctx, id) {
    const it = ctx.C.byId[id]; const m = ctx.state.memory[id];
    let w = 0;
    for (const sk of it.skills) { const st = m && m.skills[sk]; w = Math.max(w, st ? 1 - SRS.recallProb(st, ctx.date) : 0.6); }
    const lapses = m ? Math.max(0, ...Object.values(m.skills).map(s => s.lapses || 0)) : 0;
    const since = CAL.addDays(ctx.date, -14);
    const recentWrong = ctx.state.log.filter(r => r.item === id && r.date >= since && r.verdict === 'wrong').length;
    const pr = ctx.state.practice.items[id] || {};
    const pMiss = Object.values(pr).reduce((t, s) => t + (s.misses || 0), 0), pOk = Object.values(pr).reduce((t, s) => t + (s.ok || 0), 0);
    return w + 0.4 * Math.min(5, lapses) + 0.5 * Math.min(4, recentWrong) + 0.2 * Math.max(0, pMiss - pOk * 0.5);
  }
  const RECALL_DIRECTIONS = {
    mixed: null,
    meaning: ['choice'], produce: ['type'], kanji: ['reading'], spelling: ['kanjipick'], listen: ['listen'],
    intent: ['pattern', 'type'], context: ['cloze', 'pattern', 'form'], conjugation: ['form'], explain: ['recovery']
  };
  function practicePool(ctx, opts) {
    let ids = Object.keys(ctx.state.memory).filter(id => ctx.C.byId[id]);
    if (opts.topic) ids = ids.filter(id => ctx.C.byId[id].topic === opts.topic);
    if (opts.direction === 'kanji' || opts.direction === 'spelling') ids = ids.filter(id => K.hasKanji(ctx.C.byId[id].jp));
    if (opts.direction === 'conjugation') ids = ids.filter(id => ctx.C.byId[id].verb_class || ctx.C.byId[id].adj_class);
    if (opts.direction === 'listen' && !ctx.audio) ids = [];
    if (opts.direction === 'produce' || opts.direction === 'intent' || opts.direction === 'context') ids = ids.filter(id => ctx.C.byId[id].use === 'say');
    return ids;
  }
  function startPractice(kind, ctx, opts) {
    opts = Object.assign({ focus: 'weak', direction: 'mixed', activity: 'mixed' }, opts || {});
    const s = newSession(kind, ctx, { phase: 'practice', opts, seen: [], returnQ: [], stats: { n: 0, ok: 0 } });
    const pool = practicePool(ctx, opts);
    s.poolSize = pool.length;
    if (!Object.keys(ctx.state.memory).length) s.reason = 'nothing-learned';
    else if (!pool.length) s.reason = 'empty-filter';
    if (!s.reason) nextPractice(s, ctx);
    return s;
  }
  // Generate the next practice card on demand (no predetermined end).
  function nextPractice(s, ctx) {
    const g = gctx(ctx);
    const opts = s.opts;
    if (opts.activity === 'span' || opts.activity === 'switch' || opts.activity === 'recovery' || opts.activity === 'reconstruct') {
      const c = activityCard(s, ctx, g);
      if (c) { s.queue.push(c); return c; }
    }
    const pool = practicePool(ctx, opts);
    if (!pool.length) return null;
    // A missed item comes back once, after a gap.
    const back = s.returnQ.findIndex(r => r.at <= s.queue.length);
    let id = null;
    if (back >= 0) id = s.returnQ.splice(back, 1)[0].item;
    const last = s.seen[s.seen.length - 1];
    if (id === last && pool.length > 1) { s.returnQ.push({ item: id, at: s.queue.length + 1 }); id = null; }
    if (!id) {
      // Avoid anything seen in the last few cards (as many as the pool allows).
      const n = Math.min(P.training.recentAvoid, Math.max(0, pool.length - 1));
      const recent = new Set(n ? s.seen.slice(-n) : []);
      const cands = pool.filter(x => !recent.has(x));
      const w = cands.map(x => opts.focus === 'mixed' ? 1 : 0.15 + weakness(ctx, x));
      let r = ctx.rng() * w.reduce((a, b) => a + b, 0);
      for (let k = 0; k < cands.length; k++) { r -= w[k]; if (r <= 0) { id = cands[k]; break; } }
      id = id || cands[cands.length - 1];
    }
    const it = ctx.C.byId[id];
    const dirs = RECALL_DIRECTIONS[opts.direction] || null;
    const types = dirs || mixedTypes(it, s, ctx);
    let c = null;
    for (const t of shuffle(types, ctx.rng)) {
      if (t === 'recovery') c = recoveryCard(ctx, g, it);
      else c = X.make(t, it, g);
      if (c) break;
    }
    if (!c) for (const sk of shuffle(it.skills, ctx.rng)) { c = X.forSkill(it, sk, g); if (c) break; }
    if (!c) { s.seen.push(id); return s.queue.length < 2000 ? nextPractice(s, ctx) : null; }
    c.phase = 'practice';
    s.seen.push(id); s.queue.push(c);
    return c;
  }
  // Mixed practice rotates exercise types and avoids the type just used.
  function mixedTypes(it, s, ctx) {
    const last = (s.queue[s.queue.length - 1] || {}).ex;
    const base = it.use === 'say' ? ['choice', 'type', 'listen', 'pattern', 'cloze', 'speak', 'build', 'reading', 'form', 'pick'] : it.use === 'hear' ? ['listen', 'choice'] : ['choice', 'reading', 'kanjipick'];
    const t = base.filter(x => x !== last);
    return t.length ? t : base;
  }
  function recoveryCard(ctx, g, nearItem) {
    const list = ctx.C.recovery.filter(r => !r.needs || r.needs.every(id => ctx.state.memory[id] || !ctx.C.byId[id]));
    if (!list.length) return null;
    const r = list[Math.floor(g.rng() * list.length)];
    return { id: 'r' + Date.now().toString(36) + Math.floor(g.rng() * 1e6), ex: 'recovery', item: null, skill: 'circumlocution', prompt: r.id, selfAssessed: true };
  }
  function activityCard(s, ctx, g) {
    const learned = Object.keys(ctx.state.memory).filter(id => ctx.C.byId[id]).map(id => ctx.C.byId[id]);
    if (s.opts.activity === 'recovery') return recoveryCard(ctx, g);
    if (s.opts.activity === 'span') {
      const pool = learned.filter(i => i.use !== 'hear');
      if (pool.length < 3) return null;
      const hist = ctx.state.train.spanHistory.slice(-5);
      const lastLen = s.lastSpan || (hist.length ? hist[hist.length - 1].n : 3);
      const won = s.lastSpanWon;
      const n = Math.max(2, Math.min(pool.length, won == null ? lastLen : won ? lastLen + 1 : lastLen - 1));
      const seq = shuffle(pool, g.rng).slice(0, n);
      const extra = shuffle(pool.filter(x => !seq.includes(x)), g.rng).slice(0, Math.min(3, pool.length - n));
      return { id: 's' + Date.now().toString(36), ex: 'span', item: null, skill: 'memory', n, seq: seq.map(x => x.id), grid: shuffle(seq.concat(extra), g.rng).map(x => x.id) };
    }
    if (s.opts.activity === 'switch') {
      // Category switching: alternate categories; any learned word of that category counts.
      const cats = {};
      for (const it of learned) for (const t of it.tags || []) if (it.use === 'say') (cats[t] = cats[t] || []).push(it.id);
      const usable = Object.keys(cats).filter(t => cats[t].length >= 2);
      if (usable.length < 2) return null;
      const prev = s.lastCat;
      const choices = usable.filter(t => t !== prev);
      const cat = choices[Math.floor(g.rng() * choices.length)];
      s.lastCat = cat;
      return { id: 'w' + Date.now().toString(36) + Math.floor(g.rng() * 1e6), ex: 'switch', item: null, skill: 'flexibility', category: cat, members: cats[cat] };
    }
    if (s.opts.activity === 'reconstruct') {
      // Study a sentence, do something else, then rebuild it from memory.
      const cands = shuffle(learned.filter(i => i.use === 'say'), g.rng);
      for (const it of cands) {
        const c = X.make('build', it, g);
        if (c) {
          const study = { id: 'v' + Date.now().toString(36), ex: 'study', item: it.id, skill: null, sentence: c.answer.jp, prompt: c.prompt };
          const filler = learned.filter(x => x.id !== it.id && x.use !== 'hear').slice(0, 1).map(x => X.make('choice', x, g)).filter(Boolean);
          c.phase = 'practice'; c.delayedReconstruct = true;
          s.queue.push(study, ...filler.map(f => Object.assign(f, { phase: 'practice' })));
          return c;
        }
      }
      return null;
    }
    return null;
  }

  /* ---------- answering & adaptation ---------- */
  const isScheduled = s => SCHEDULED.includes(s.kind);
  function current(s) { return s.queue[s.i] || null; }

  /* Apply a graded response. Returns { attempt, remediation } — the caller
     records `attempt` with recordScheduled or recordPractice according to
     the session kind. */
  function submit(s, card, res, ctx, meta) {
    meta = meta || {};
    const g = gctx(ctx, s.plan ? (s.plan.newIds || []).concat(s.plan.reserveIds || []) : [], false, s.patternsIntroduced);
    const obj = card.item ? s.objectives[card.item] : null;
    const attempt = {
      item: card.item, skill: card.skill, ex: card.ex, kind: s.kind, phase: card.phase, session: s.id,
      verdict: res.verdict, errorKind: res.kind, hint: meta.hint || 0, selfGrade: res.selfGrade,
      latencyMs: meta.latencyMs || null, date: ctx.date, ts: nowMs(ctx), novelContext: !!card.novelContext,
      recognitionOnly: !!card.recognitionOnly
    };
    s.results.push({ card: card.id, item: card.item, skill: card.skill, ex: card.ex, phase: card.phase, verdict: res.verdict, kind: res.kind, hint: meta.hint || 0 });
    if (s.stats) { s.stats.n++; if (res.verdict !== 'wrong') s.stats.ok++; }
    if (obj) {
      obj.exUsed.push(card.ex);
      if (res.verdict === 'wrong') obj.errors++;
      if (card.phase === 'diag') {
        if (card.ex === 'diag') {
          if (res.verdict === 'correct') {
            // A correct multiple-choice answer may be a guess: confirm with a
            // second, harder format before treating the item as known —
            // unaided production for words to say, the reading (or picking
            // the right Japanese) for signs, a fresh listening check for
            // phrases to understand.
            const it = ctx.C.byId[card.item];
            const order = it.use === 'say' ? ['type'] : it.use === 'read' ? ['reading', 'pick'] : ['listen', 'pick'];
            let c = null;
            for (const t of order) { c = X.make(t, it, g); if (c) break; }
            obj.diag = 'partial';
            if (c) { c.phase = 'diag'; c.confirm = true; s.queue.splice(s.i + 1, 0, c); }
          } else obj.diag = 'none';
        } else if (card.confirm) obj.diag = res.verdict === 'correct' && !(meta.hint > 0) ? 'known' : 'partial';
      } else if (card.phase === 'teach') obj.status = 'taught';
      else if (card.phase === 'delayed') obj.status = res.verdict === 'correct' && !(meta.hint > 0) ? 'established' : (obj.status === 'produced' ? 'produced' : 'uncertain');
      else if (res.verdict !== 'wrong') {
        if (['type', 'speak', 'pattern', 'cloze', 'reading', 'form', 'build'].includes(card.ex) && obj.status !== 'established') obj.status = 'produced';
        else if (!['produced', 'established'].includes(obj.status)) obj.status = 'recognized';
      }
      if (card.phase === 'reinforce') obj.status = res.verdict === 'correct' ? 'established' : 'uncertain';
    }
    const remediation = res.verdict === 'correct' ? null : remediate(s, card, res, ctx, g);
    if (s.kind === 'recall' || s.kind === 'training') {
      if (res.verdict === 'wrong' && card.item && !s.returnQ.some(r => r.item === card.item)) s.returnQ.push({ item: card.item, at: s.queue.length + P.training.failedReturnGap });
      if (card.ex === 'span') { s.lastSpan = card.n; s.lastSpanWon = res.verdict === 'correct'; }
    }
    return { attempt, remediation };
  }

  // Bounded, purposeful extra practice after a mistake.
  function remediate(s, card, res, ctx, g) {
    if (!card.item || !isScheduled(s) || card.phase === 'diag') return null;
    if (res.verdict === 'near' && res.kind !== 'self') return null;            // a typo is feedback, not a reason to re-drill
    const used = s.retries[card.item] || 0;
    if (used >= P.maxRetriesPerItem) return { deferred: true };
    const policyShare = s.kind === 'weekly' ? P.weekly.remediationShare : s.kind === 'evening' ? P.evening.remediationShare : P.morning.remediationShare;
    const it = ctx.C.byId[card.item];
    let c = null;
    if (res.kind === 'wrong-form') c = X.make('form', it, g, [card.form]);       // same form again, after a gap
    if (!c) c = X.forSkill(it, card.skill, g, [card.ex]);                        // same skill, a different exercise
    if (!c) c = X.forSkill(it, card.skill, g);
    if (!c) return { deferred: true };
    const t = cardSec(ctx, c);
    if (s.remediationSec + t > s.budgetSec * policyShare) return { deferred: true };
    // Out of time already: the mistake goes to the schedule (it was recorded
    // as a lapse), not into an ever-longer session.
    if ((nowMs(ctx) - s.startTs) / 1000 >= s.budgetSec) return { deferred: true };
    c.phase = 'retry';
    const at = Math.min(s.queue.length, s.i + 1 + P.minRetryGap);
    s.queue.splice(at, 0, c);
    s.retries[card.item] = used + 1; s.remediationSec += t;
    return { inserted: c.id, at };
  }

  // Advance; at the end of the diagnostic build the lesson; for practice
  // modes generate the next card. Keeps scheduled sessions within budget.
  function advance(s, ctx) {
    s.i++;
    if (s.phase === 'diag' && !s.queue.slice(s.i).some(c => c.phase === 'diag')) afterDiag(s, ctx);
    if ((s.kind === 'recall' || s.kind === 'training') && s.i >= s.queue.length) nextPractice(s, ctx);
    if (isScheduled(s)) trimToBudget(s, ctx);
    return current(s);
  }
  // If what's left can't fit the remaining time, drop the least important
  // cards first: plain reviews, then reinforcement/consolidation extras;
  // untaught new items are carried forward with all their cards. Delayed
  // checks of items already taught are kept to the end.
  function trimToBudget(s, ctx) {
    const elapsed = (nowMs(ctx) - s.startTs) / 1000;
    const left = s.budgetSec - elapsed;
    const rest = s.queue.slice(s.i);
    let need = sumSec(ctx, rest);
    if (need <= left * 1.1 || rest.length <= 1) return;
    // 'diag-reserve' = diagnostic cards of reserve items (only taught if time frees up).
    const dropOrder = ['review', 'retry', 'diag-reserve', 'reinforce', 'consolidate', 'assess', 'learn'];
    const phaseOf = c => c.phase === 'diag' && s.objectives[c.item] && s.objectives[c.item].reserve ? 'diag-reserve' : c.phase;
    for (const ph of dropOrder) {
      for (let k = s.queue.length - 1; k > s.i && need > left; k--) {
        const c = s.queue[k];
        if (phaseOf(c) !== ph) continue;
        if (ph === 'learn' && s.objectives[c.item] && s.objectives[c.item].status !== 'planned') continue;
        need -= cardSec(ctx, c); s.queue.splice(k, 1);
        s.dropped = (s.dropped || 0) + 1;
      }
    }
    // Still over: carry untaught items forward (remove their remaining cards).
    if (need > left && s.kind === 'morning') {
      const untaught = Object.keys(s.objectives).filter(id => s.objectives[id].status === 'planned' && !s.queue.slice(0, s.i).some(c => c.item === id && c.phase === 'teach'));
      for (const id of untaught.reverse()) {
        if (need <= left) break;
        const before = s.queue.length;
        s.queue = s.queue.filter((c, k) => k <= s.i || c.item !== id);
        need = sumSec(ctx, s.queue.slice(s.i));
        if (s.queue.length !== before) { s.carry.push(id); s.objectives[id].status = 'carried'; }
      }
    }
  }
  function endEarly(s) {
    const rest = s.queue.slice(s.i);
    for (const id of Object.keys(s.objectives)) {
      const o = s.objectives[id];
      if (o.status === 'planned' && !s.queue.slice(0, s.i).some(c => c.item === id && c.phase === 'teach')) { o.status = 'carried'; if (!s.carry.includes(id)) s.carry.push(id); }
    }
    s.queue = s.queue.slice(0, s.i);
    s.endedEarly = rest.length;
  }

  /* ---------- session summary & lesson-state effects ---------- */
  function summarize(s, ctx) {
    const by = {};
    for (const r of s.results) if (r.item) (by[r.item] = by[r.item] || []).push(r);
    const independent = [], assisted = [], errors = [];
    for (const [id, rs] of Object.entries(by)) {
      const graded = rs.filter(r => r.phase !== 'diag' && r.phase !== 'teach');
      if (!graded.length) continue;
      const prod = graded.filter(r => ['type', 'speak', 'pattern', 'cloze', 'reading', 'form', 'build'].includes(r.ex));
      // Independent = the FIRST production attempt was correct and unaided
      // (a correct retry after a miss is progress, but it was assisted).
      const firstProd = prod[0];
      const struggled = graded.some(r => r.verdict !== 'correct' || r.hint);
      if (firstProd && firstProd.verdict === 'correct' && !firstProd.hint && !struggled) independent.push(id);
      else if (struggled) assisted.push(id);
      for (const r of graded) if (r.verdict === 'wrong') errors.push({ item: id, ex: r.ex, kind: r.kind, skill: r.skill });
    }
    const introduced = Object.keys(s.objectives).filter(id => ['taught', 'recognized', 'produced', 'established', 'uncertain'].includes(s.objectives[id].status) || s.objectives[id].diag === 'known');
    return {
      id: s.id, kind: s.kind, date: s.date, topic: s.topic || null, topicWhy: s.topicWhy || null, forTopic: s.forTopic || null, topic2: s.topic2 || null,
      minutes: Math.max(1, Math.round((nowMs(ctx) - s.startTs) / 60000)), budgetMin: Math.round(s.budgetSec / 60),
      answered: s.results.filter(r => r.phase !== 'teach').length,
      correct: s.results.filter(r => r.phase !== 'teach' && r.phase !== 'diag' && r.verdict === 'correct').length,
      graded: s.results.filter(r => r.phase !== 'teach' && r.phase !== 'diag').length,
      introduced, established: introduced.filter(id => s.objectives[id].status === 'established' || s.objectives[id].diag === 'known'),
      patternsIntroduced: (s.patternsIntroduced || []).slice(),
      knownBefore: Object.keys(s.objectives).filter(id => s.objectives[id].diag === 'known'),
      independent, assisted, errors, carry: s.carry.slice(), endedEarly: s.endedEarly || 0, dropped: s.dropped || 0,
      reviewsDueTotal: s.plan && s.plan.dueTotal || 0
    };
  }

  // What the learner should be offered next (recommendation, not a rule).
  function nextUp(ctx) {
    const sessions = ctx.state.sessions;
    const today = sessions.filter(x => x.date === ctx.date);
    const did = k => today.some(x => x.kind === k);
    return {
      morningDone: did('morning'), eveningDone: did('evening'),
      eveningMaterial: !!ctx.state.lesson.pendingEvening,
      anyLearned: Object.keys(ctx.state.memory).length > 0
    };
  }
  function upcoming(ctx, days) {
    const out = [];
    for (const s of skillStates(ctx)) if (s.st && s.st.due <= CAL.addDays(ctx.date, days)) out.push(s);
    return out;
  }

  return { SCHEDULED, estSec, skillStates, selectReviews, recentRetention, pickTopic, pickTopicInfo, topicProgress, learnCards, startMorning, afterDiag, startEvening, startWeekly, startPractice, nextPractice, weakness, current, submit, advance, trimToBudget, endEarly, summarize, nextUp, upcoming, RECALL_DIRECTIONS, isScheduled };
});
