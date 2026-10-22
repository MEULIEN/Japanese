/* ============================================================
   Michi — learning POLICY parameters
   ------------------------------------------------------------
   These are deliberate, documented safeguards and starting preferences,
   kept apart from curriculum data. None of them states how much content
   exists: every session size is DERIVED at run time from the eligible
   material, the learner's due reviews, the learner's own measured speed
   and the time the learner says they have. Change a value here and the
   generators adapt; add curriculum and nothing here needs to change.

   Values marked [tune] are initial assumptions that should be adjusted
   from the learner's logged performance (see Progress → "Calibration").
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MichiPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return {
    srs: {
      targetRetention: 0.9,     // schedule a skill when predicted recall drops to 90% (FSRS default)
      minStability: 0.1,        // numerical floor (days)
      maxStability: 3650,
      minIntervalDays: 1,       // never schedule the same skill twice in one day via the scheduler
      maxIntervalDays: 365,     // safeguard: everything resurfaces at least yearly
      sameDayGain: 0.5,         // [tune] short-term (same-day) stability change, FSRS-5 shaped
      sameDayOffset: 0.5,       // [tune]
      easyLatencyRatio: 0.6     // [tune] "Easy" = correct production in < 60% of YOUR median time
    },

    // Default time the learner has for each session (minutes). The learner
    // can change these in Settings; session SIZE is derived from them.
    availableMinutes: { morning: 20, evening: 15, weekly: 40, kanji: 10 },

    morning: {
      // Design preference for a normal morning (not a quota). The planner
      // shrinks below it for hard topics / heavy review load / weak recent
      // retention and grows above it for easy, well-connected topics — but
      // never pads with items outside the lesson's topic.
      preferredNew: [7, 14],
      absoluteMaxNew: 20,       // safeguard against overload even when everything is easy
      reviewShare: 0.35,        // at most this share of the session goes to older due reviews
      remediationShare: 0.2     // time reserved for re-practising mistakes
    },
    evening: {
      // The evening session opens at this local time (minutes after
      // midnight, learner's configured time zone): it consolidates the
      // morning, so it needs a gap after the morning lesson.
      unlockMinute: 12 * 60,
      reviewShare: 0.45,        // the rest goes to consolidating today's morning material
      remediationShare: 0.2,
      // Each morning item gets between these many evening exercises; the
      // actual number grows with how uncertain the morning left it.
      perItem: [1, 3]
    },
    weekly: {
      unlockWeekday: 0,         // 0 = Sunday, in the learner's local time zone
      remediationShare: 0.1,
      maxSkillsPerItem: 2       // breadth over depth: avoid testing one word in trivial variations
    },
    // Working-memory chunk: new items are taught in groups of this size
    // before being tested, after Cowan's ~4-chunk estimate.
    teachChunk: 4,
    // Mistake handling safeguards (no runaway lessons):
    maxRetriesPerItem: 2,       // per item, per session
    minRetryGap: 3,             // cards between a mistake and its retry (a gap aids retention)

    // Prior estimates (seconds) used ONLY until the learner has their own
    // timing history for an exercise type; then their median replaces it.
    priorSeconds: {
      teach: 30, diagnostic: 10, choice: 10, listen: 13, reading: 14, type: 22,
      speak: 20, cloze: 22, form: 22, respond: 24, build: 30, circumlocution: 60,
      span: 45, contrast: 16, match: 30, kana: 14
    },
    // How many recent latencies per exercise type are kept for the baseline.
    latencyWindow: 40,

    mastery: {
      // An item counts as "durable" for a skill when its predicted recall
      // 30 days after the last review is at least 80% (equivalently, its
      // FSRS stability is long enough to survive a month).
      durableHorizonDays: 30,
      durableProb: 0.8
    },

    // Kanji radicals page: daily lesson safeguards. The number of radicals
    // and member kanji per lesson is derived from the minutes available and
    // the learner's speed; these only cap it.
    kanji: { minutes: 10, reviewShare: 0.4, maxNewRadicals: 4, maxMembersPerRadical: 6 },

    // Topic priorities (Settings): share of mornings that start new material
    // from one of the learner's preferred topics. The rest stay broad.
    topicPriority: { max: 3, share: 0.75, window: 4 },

    training: {
      recentAvoid: 6,           // an item is not repeated within this many cards
      failedReturnGap: 4        // a missed item returns after this many other cards (once)
    },

    log: {
      detailedDays: 120,        // detailed attempt rows kept this long; older ones are folded into daily aggregates
      maxSessions: 400
    }
  };
});
