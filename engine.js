/* ============================================================
   Michi 道 — pure learning engine (no DOM, no storage, no network)
   ------------------------------------------------------------
   Every function here takes its data explicitly and returns a value;
   nothing reads globals or mutates hidden state. This is what makes the
   learning logic testable in Node (see tests/engine.test.js) and keeps
   scheduling/mastery rules in ONE place instead of scattered through the
   UI (fixes the "duplicated scheduling logic" problem).

   Dual-mode: attaches to window.MichiEngine in the browser and exports
   via module.exports under Node — no build step either way.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MichiEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- constants ---------- */
  // Leitner boxes with expanding gaps (days until an item is due again).
  const BOX_DAYS = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 14, 6: 30 };
  const MAX_BOX = 6;
  const KNOWN_BOX = 3;      // scheduling threshold for "mature"
  const SPAN_MIN = 3;       // fewest learned items for a real memory round
  const SPAN_MAX = 9;       // working-memory ceiling

  // Required fields for an item to be served at all.
  const REQ = ['id', 'jp', 'kana', 'en', 'domain', 'tier', 'status', 'sources'];

  // Recommended day: 3 short sessions (~40 min total, none over 15) plus an
  // optional weekly long one. newMax/reviewMax cap working-memory load.
  const PLAN = {
    morning: { icon: '🌅', cls: 'morning', name: 'Learn',   min: 15, desc: 'Guess first, then learn up to 5 new items', newMax: 5, reviewMax: 6, delayed: true },
    midday:  { icon: '☀️', cls: 'free',    name: 'Recall',  min: 8,  desc: 'Quick retrieval of what you learned',       newMax: 0, reviewMax: 10, ahead: true },
    evening: { icon: '🌙', cls: 'evening', name: 'Speak & Flex', min: 15, desc: 'Say it aloud, memory round, get-unstuck drill', newMax: 0, reviewMax: 8, flex: 1, span: true, ahead: true },
    weekly:  { icon: '🚶', cls: 'test',    name: 'Kyoto Walk', min: 40, desc: 'Weekly long session: wide review, 3 drills', newMax: 3, reviewMax: 20, flex: 3, span: true, ahead: true, delayed: true },
    mini:    { icon: '⚡', cls: 'free',    name: 'Minimum day', min: 5, desc: 'Tired? 5 minutes still counts as a kept day', newMax: 0, reviewMax: 6, ahead: true }
  };

  // Rough seconds a learner spends on each card. Used to ESTIMATE duration
  // from the real queue, never to pad time — a lesson ends when its
  // objectives are met, and the summary reports the ACTUAL elapsed time.
  const STEP_SECONDS = {
    pretest: 18, teach: 26,
    'quiz:read': 12, 'quiz:listen': 15, 'quiz:type': 28, 'quiz:say': 26,
    flex: 45, span: 50
  };

  /* ---------- date helpers (today is injectable for tests) ---------- */
  const pad = n => String(n).padStart(2, '0');
  function ds(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return ds(new Date()); }
  function addDays(s, n) { const p = s.split('-').map(Number); return ds(new Date(p[0], p[1] - 1, p[2] + n)); }

  /* ---------- rng (injectable so tests are deterministic) ---------- */
  function shuffle(a, rng) {
    rng = rng || Math.random;
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ---------- item validation / loading ---------- */
  // Validate+merge one raw item against its pack defaults. Returns
  // {item} or {skip:reason}. Only 'verified' items are ever accepted into
  // the served curriculum — there is no toggle to admit drafts.
  function prepareItem(raw, pack, seenIds) {
    const it = Object.assign({ domain: pack.domain, status: pack.status, sources: pack.sources }, raw);
    const miss = REQ.filter(k => it[k] == null || it[k] === '' || (k === 'sources' && !(it.sources && it.sources.length)));
    if (miss.length) return { skip: 'missing:' + miss.join(',') };
    if (seenIds && seenIds.has(it.id)) return { skip: 'duplicate-id' };
    if (it.status !== 'verified') return { skip: 'not-verified' };
    return { item: it };
  }

  /* ---------- spaced repetition (pure) ---------- */
  function newRecord(todayStr) { return { box: 1, due: todayStr, reps: 0, lapses: 0, prod: 0 }; }

  // Grade a single item. `mode` is the exercise it was graded under; a
  // correct answer in a PRODUCTION mode (type/say) is what counts toward
  // mastery, so recognition alone can never mark an item "known".
  function gradeRecord(rec, g, todayStr, mode) {
    rec = rec ? Object.assign({}, rec) : newRecord(todayStr);
    rec.reps++;
    if (g === 'again') {
      rec.box = 1; rec.lapses++; rec.due = todayStr;
    } else {
      rec.box = Math.min(MAX_BOX, rec.box + (g === 'easy' ? 2 : 1));
      rec.due = addDays(todayStr, BOX_DAYS[rec.box]);
      if (mode === 'type' || mode === 'say') rec.prod = (rec.prod || 0) + 1;
    }
    return rec;
  }

  const boxOf = (items, id) => (items[id] ? items[id].box : 0);
  // "Reliably recalled": mature in the schedule AND produced unaided at
  // least once. This is what the home screen counts, so progress reflects
  // demonstrated production, not familiarity.
  function isKnown(items, id) { const r = items[id]; return !!r && r.box >= KNOWN_BOX && (r.prod || 0) >= 1; }

  // Which exercise an item gets, as a recognition→production ladder:
  //   box1 read (recognise meaning) → box2 listen (audio→meaning)
  //   → box3 type (produce the reading) → box4+ say (produce aloud).
  // Falls back to read/type when no speech synthesis is available.
  function modeFor(items, id, hasSpeech) {
    const b = boxOf(items, id);
    if (b <= 1) return 'read';
    if (b === 2) return hasSpeech ? 'listen' : 'read';
    if (b === 3) return 'type';
    return hasSpeech ? 'say' : 'type';
  }

  /* ---------- selection ---------- */
  // A tier opens once 80% of the previous tier has been introduced, so new
  // material is gated behind earlier material (avoids overload).
  function tierOpen(live, items, t) {
    if (t <= 1) return true;
    const prev = live.filter(i => i.tier === t - 1);
    return !prev.length || prev.filter(i => items[i.id]).length / prev.length >= 0.8;
  }

  // Pick up to n brand-new items, lowest tier first, rotating across
  // domains so topics interleave rather than arriving in blocks.
  function pickNew(live, items, n, rng) {
    if (n <= 0) return [];
    const by = {};
    live.filter(i => !items[i.id] && tierOpen(live, items, i.tier))
      .sort((a, b) => a.tier - b.tier)
      .forEach(i => (by[i.domain] = by[i.domain] || []).push(i));
    const lists = Object.values(by), out = [];
    while (out.length < n && lists.some(l => l.length)) {
      for (const l of lists) if (l.length && out.length < n) out.push(l.shift());
    }
    return out;
  }

  // Items strictly due for review today, most-overdue first.
  function dueItems(live, items, n, todayStr) {
    return live.filter(i => items[i.id] && items[i.id].due <= todayStr)
      .sort((a, b) => items[a.id].due.localeCompare(items[b.id].due) || items[a.id].box - items[b.id].box)
      .slice(0, n);
  }

  // Review pool for a session. Fix for Bug A: when nothing is strictly due
  // (the normal case the same day you learned something, since new items
  // are scheduled for tomorrow), optionally pull the least-mature LEARNED
  // items forward so a "Recall" session always has something to do. Only
  // when the learner has literally never learned anything does this return
  // empty — and the caller then shows an honest "learn first" message.
  function reviewPool(live, items, n, todayStr, allowAhead) {
    const due = dueItems(live, items, n, todayStr);
    if (due.length || !allowAhead) return due;
    return live.filter(i => items[i.id])
      .sort((a, b) => (a.box === b.box ? items[a.id].due.localeCompare(items[b.id].due) : items[a.id].box - items[b.id].box) || 0)
      .sort((a, b) => items[a.id].box - items[b.id].box)
      .slice(0, n);
  }

  /* ---------- memory round (span) ---------- */
  // Fix for Bug B: adapt to however many items are learned. Needs >= SPAN_MIN
  // to be worth running; distractors are only as many as the pool can spare,
  // and the same item is never repeated to inflate the grid.
  function spanEligible(pool) { return pool.length >= SPAN_MIN; }
  function spanSetup(pool, want, rng) {
    if (!spanEligible(pool)) return null;
    const n = Math.max(2, Math.min(want || 3, SPAN_MAX, pool.length));
    const pick = shuffle(pool, rng);
    const seq = pick.slice(0, n);
    const extra = pick.slice(n, n + 3);              // 0..3 real distractors
    const grid = shuffle(seq.concat(extra), rng);
    return { n, seq, grid, phase: 'show', k: 0, picks: [] };
  }

  /* ---------- answer checking (production, fair to alternatives) ---------- */
  // Normalise a typed Japanese answer: trim, drop spaces and the 〜
  // placeholder, strip long-vowel macrons so "sumimasen"/"sumimasén" and
  // "おねがい"/"お願い" compare fairly.
  function normAnswer(s) {
    return String(s == null ? '' : s)
      .trim().toLowerCase()
      .replace(/[\s　]/g, '')
      .replace(/[〜~・。、！？!?.]/g, '')
      .replace(/[āâ]/g, 'a').replace(/[īî]/g, 'i').replace(/[ūû]/g, 'u')
      .replace(/[ēê]/g, 'e').replace(/[ōô]/g, 'o')
      .replace(/ou/g, 'o').replace(/oo/g, 'o');
  }
  // Accept a typed production answer if it matches the kanji/kana/romaji
  // form OR any explicitly listed acceptable alternative (item.alt[]). A
  // genuine alternative is never marked wrong just because it differs from
  // the stored primary form.
  function acceptAnswer(input, item) {
    const n = normAnswer(input);
    if (!n) return false;
    const ok = [item.jp, item.kana, item.romaji].concat(item.alt || []).filter(Boolean).map(normAnswer);
    return ok.includes(n);
  }

  // Build 4 distractor-plus-answer choices for a recognition quiz, same
  // domain first. Degrades gracefully to however many distinct meanings
  // exist (never throws on a tiny pool).
  function choices(live, item, rng) {
    const o = live.filter(x => x.id !== item.id && x.en !== item.en);
    const pool = shuffle(o.filter(x => x.domain === item.domain), rng).concat(shuffle(o.filter(x => x.domain !== item.domain), rng));
    const seen = new Set([item.en]), out = [item.en];
    for (const x of pool) { if (out.length >= 4) break; if (!seen.has(x.en)) { seen.add(x.en); out.push(x.en); } }
    return shuffle(out, rng);
  }

  /* ---------- session building ---------- */
  // Build the full card queue for a session from live items + state.
  // Returns { kind, queue, stats, reason } — `reason` tells the caller why
  // a queue is empty so it can show an honest message instead of silently
  // bouncing. ctx = { live, items, flex, hasSpeech, rng }.
  function buildSession(kind, ctx) {
    const live = ctx.live, items = ctx.items, flex = ctx.flex || [];
    const rng = ctx.rng || Math.random;
    const todayStr = ctx.today || today();
    const hasSpeech = !!ctx.hasSpeech;
    const q = [], stats = { total: 0, correct: 0, newCount: 0, flex: 0 };

    if (kind === 'flexdrill') {
      if (!flex.length) return { kind, queue: [], stats, reason: 'no-flex' };
      shuffle(flex, rng).slice(0, 3).forEach(f => q.push({ step: 'flex', f }));
      return { kind, queue: q, stats, reason: null };
    }

    const P = PLAN[kind];
    if (!P) return { kind, queue: [], stats, reason: 'unknown-kind' };

    const fresh = pickNew(live, items, P.newMax, rng);
    let rev = reviewPool(live, items, P.reviewMax, todayStr, P.ahead);
    if (kind === 'mini' && !rev.length) {
      rev = live.filter(i => items[i.id]).sort((a, b) => boxOf(items, a.id) - boxOf(items, b.id)).slice(0, P.reviewMax);
    }
    stats.newCount = fresh.length;

    // 1. Teach new items (pretest → teach).
    fresh.forEach(i => { q.push({ step: 'pretest', item: i }); q.push({ step: 'teach', item: i }); });

    // 2. Interleave first-pass quiz of new items (recognition) with due reviews
    //    (at each item's ladder mode).
    const firstPass = shuffle(
      fresh.map(i => ({ step: 'quiz', item: i, mode: 'read', isNew: true }))
        .concat(rev.map(i => ({ step: 'quiz', item: i, mode: modeFor(items, i.id, hasSpeech) }))),
      rng
    );
    q.push.apply(q, firstPass);

    // 3. Get-unstuck (circumlocution) drills.
    if (flex.length) for (let k = 0; k < (P.flex || 0); k++) q.push({ step: 'flex', f: flex[Math.floor(rng() * flex.length)] });

    // 4. Memory round, only if eligible (Bug B) — otherwise the slot is
    //    filled by an extra review below rather than wasted.
    const learned = live.filter(i => items[i.id]);
    if (P.span && spanEligible(learned)) q.push({ step: 'span' });

    // 5. Delayed retrieval: re-test today's new items once more, AFTER the
    //    gap created by the reviews/drills above (spacing within the
    //    session). This both deepens encoding and gives the lesson an
    //    honest, substantive length (Bug C) without busy-work.
    if (P.delayed && fresh.length) {
      shuffle(fresh, rng).forEach(i => q.push({ step: 'quiz', item: i, mode: hasSpeech ? 'listen' : 'read', delayed: true }));
    }

    let reason = null;
    if (!q.length) reason = learned.length ? 'nothing-due' : 'nothing-learned';
    return { kind, queue: q, stats, reason };
  }

  // Estimated minutes for a queue, from real card composition (not a label).
  function estimateSeconds(queue) {
    return queue.reduce((s, c) => {
      const key = c.step === 'quiz' ? 'quiz:' + (c.mode || 'read') : c.step;
      return s + (STEP_SECONDS[key] || 15);
    }, 0);
  }
  function estimateMinutes(queue) { return Math.max(1, Math.round(estimateSeconds(queue) / 60)); }

  return {
    BOX_DAYS, MAX_BOX, KNOWN_BOX, SPAN_MIN, SPAN_MAX, REQ, PLAN, STEP_SECONDS,
    ds, today, addDays, shuffle,
    prepareItem,
    newRecord, gradeRecord, boxOf, isKnown, modeFor,
    tierOpen, pickNew, dueItems, reviewPool,
    spanEligible, spanSetup,
    normAnswer, acceptAnswer, choices,
    buildSession, estimateSeconds, estimateMinutes
  };
});
