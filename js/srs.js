/* ============================================================
   Michi — memory model & scheduler (pure)
   ------------------------------------------------------------
   Algorithm: FSRS-4.5 (Free Spaced Repetition Scheduler, J. Ye et al.,
   open-spaced-repetition/fsrs4anki; the scheduler used by Anki) with its
   published default parameters. Each (item, skill) pair has its own
   memory state — stability S (days until recall probability falls to
   90%) and difficulty D (1–10) — so recognising a word and producing it
   are tracked separately.

   Why FSRS rather than fixed boxes: the next interval depends on the
   actual memory state, on how hard the answer was (grade), and on how
   long it had been since the last review (a success after a long gap
   raises stability more than one the next morning). A failure after a
   long absence is handled by the same formulas — no special cases.

   Same-day repeats (morning → evening) use a short-term update shaped
   like FSRS-5's: S·e^(gain·(G−3+offset)). Its two parameters live in
   policy.js and are initial values to be tuned against learner data.

   Grades: 1 Again · 2 Hard · 3 Good · 4 Easy. They are DERIVED from the
   evidence (correctness, hints, typo vs real error, response time
   relative to the learner's own baseline) by gradeFromEvidence(); the
   learner never has to pick a number.
   ============================================================ */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MichiSRS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const POLICY = (typeof module !== 'undefined' && module.exports) ? require('./policy.js') : root.MichiPolicy;
  const CAL = (typeof module !== 'undefined' && module.exports) ? require('./calendar.js') : root.MichiCalendar;

  // FSRS-4.5 default weights.
  const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
  const DECAY = -0.5;
  const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;   // 19/81

  const clampD = d => Math.min(10, Math.max(1, d));
  function retrievability(elapsedDays, S) { return S > 0 ? Math.pow(1 + FACTOR * Math.max(0, elapsedDays) / S, DECAY) : 0; }
  // Days until recall probability falls to `r`.
  function intervalFor(S, r) { return S / FACTOR * (Math.pow(r, 1 / DECAY) - 1); }
  const initS = G => W[G - 1];
  const initD = G => clampD(W[4] - (G - 3) * W[5]);
  function nextD(D, G) { const d = D - W[6] * (G - 3); return clampD(W[7] * initD(4) + (1 - W[7]) * d); }
  function successS(S, D, R, G) {
    const hard = G === 2 ? W[15] : 1, easy = G === 4 ? W[16] : 1;
    return S * (1 + Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) * (Math.exp(W[10] * (1 - R)) - 1) * hard * easy);
  }
  function failS(S, D, R) {
    return Math.min(S, W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R)));
  }

  /* One scheduled review of one skill. `st` may be null (first test).
     now: { date: 'YYYY-MM-DD' }. Returns a NEW state object. */
  function review(st, G, date, opts) {
    opts = opts || {};
    const P = POLICY.srs;
    if (!st || !st.s) {
      const s0 = initS(G), d0 = initD(G);
      return withDue({ s: s0, d: d0, last: date, first: date, reps: 1, lapses: G === 1 ? 1 : 0, streak: G > 1 ? 1 : 0, aided: opts.aided ? 1 : 0 }, P);
    }
    const elapsed = CAL.daysBetween(st.last, date);
    const out = Object.assign({}, st, { reps: (st.reps || 0) + 1, last: date });
    if (opts.aided) out.aided = (st.aided || 0) + 1;
    if (elapsed <= 0) {
      // Same-day repeat: short-term adjustment, no long-term "spacing" credit.
      out.s = Math.max(P.minStability, st.s * Math.exp(P.sameDayGain * (G - 3 + P.sameDayOffset)));
      out.d = nextD(st.d, G);
      if (G === 1) { out.lapses = (st.lapses || 0) + (st.streak > 0 ? 1 : 0); out.streak = 0; } else out.streak = (st.streak || 0) + 1;
      return withDue(out, P);
    }
    const R = retrievability(elapsed, st.s);
    if (G === 1) {
      out.s = Math.max(P.minStability, failS(st.s, st.d, R));
      out.lapses = (st.lapses || 0) + 1; out.streak = 0;
    } else {
      out.s = successS(st.s, st.d, R, G);
      out.streak = (st.streak || 0) + 1;
    }
    out.d = nextD(st.d, G);
    return withDue(out, P);
  }
  function withDue(st, P) {
    const days = Math.max(P.minIntervalDays, Math.round(intervalFor(st.s, P.targetRetention)));
    st.due = CAL.addDays(st.last, Math.min(days, P.maxIntervalDays));
    st.s = Math.min(st.s, P.maxStability);
    return st;
  }

  // Recall probability of a skill today (0 if never tested).
  function recallProb(st, date) { return st && st.s ? retrievability(CAL.daysBetween(st.last, date), st.s) : 0; }

  /* Evidence → grade.
     ev = { verdict: 'correct'|'near'|'wrong', hint: 0|1|2, selfGrade?,
            latencyMs, baselineMs, recognitionOnly }
     - wrong / "don't know"                         → 1 Again
     - correct only after a strong hint (hint ≥ 2)  → 1 Again (not unaided)
     - near miss (typo / vowel length) or light hint→ 2 Hard
     - correct, unaided                             → 3 Good
     - correct, unaided, production, and clearly faster than the learner's
       OWN typical time for this exercise type      → 4 Easy
     Recognition (multiple choice) can never earn Easy: a quick tap can be
     a guess, and it says nothing about producing the word. */
  function gradeFromEvidence(ev) {
    if (ev.selfGrade) return ev.selfGrade;
    if (ev.verdict === 'wrong') return 1;
    if ((ev.hint || 0) >= 2) return 1;
    if (ev.verdict === 'near' || (ev.hint || 0) === 1) return 2;
    const fast = ev.baselineMs && ev.latencyMs && ev.latencyMs < ev.baselineMs * POLICY.srs.easyLatencyRatio;
    if (fast && !ev.recognitionOnly) return 4;
    return 3;
  }

  // Median of recent latencies — the learner's own baseline.
  function median(xs) { if (!xs || !xs.length) return 0; const a = xs.slice().sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }

  return { W, DECAY, FACTOR, retrievability, intervalFor, review, recallProb, gradeFromEvidence, median, initS, initD };
});
