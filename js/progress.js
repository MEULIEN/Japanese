/* ============================================================
   Michi — progress analytics (pure)
   ------------------------------------------------------------
   Everything here is computed from SCHEDULED evidence (morning, evening,
   weekly) unless labelled "practice". There is deliberately no single
   fluency score: skills are reported separately, with sample sizes, and
   week-to-week comparisons are annotated when the material being tested
   changed (new topics), because accuracy on harder new material is not
   comparable with accuracy on old material.
   ============================================================ */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MichiProgress = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const SRS = node ? require('./srs.js') : root.MichiSRS;
  const CAL = node ? require('./calendar.js') : root.MichiCalendar;
  const P = node ? require('./policy.js') : root.MichiPolicy;
  const CUR = node ? require('./curriculum.js') : root.MichiCurriculum;

  const weekOf = d => CAL.onOrBefore(d, 1);          // weeks start Monday for charts

  // Item-level classification from the memory model.
  function classify(C, state, date) {
    const out = { durable: [], independent: [], familiar: [], deteriorated: [], contextLimited: [], learning: [] };
    for (const [id, m] of Object.entries(state.memory)) {
      const it = C.byId[id]; if (!it) continue;
      const prim = m.skills[CUR.primarySkill(it)];
      const rec = m.skills.recognition || m.skills.listening;
      const ctx = m.skills.context;
      const durable = prim && SRS.retrievability(CAL.daysBetween(prim.last, date) + P.mastery.durableHorizonDays, prim.s) >= P.mastery.durableProb;
      if (prim && prim.lapses > 0 && prim.streak === 0 && (prim.reps || 0) > 2 && prim.s < 1) out.deteriorated.push(id);
      else if (durable && prim.streak > 0) out.durable.push(id);
      else if (prim && prim.streak > 0) out.independent.push(id);
      else if (rec && rec.streak > 0) out.familiar.push(id);
      else out.learning.push(id);
      if (prim && prim.streak > 0 && ctx && ctx.streak === 0 && ctx.reps > 0) out.contextLimited.push(id);
    }
    return out;
  }

  // Weekly series per skill from daily aggregates (scheduled only).
  function skillSeries(state, weeks, date) {
    const start = CAL.addDays(weekOf(date), -7 * (weeks - 1));
    const keys = Array.from({ length: weeks }, (_, k) => CAL.addDays(start, 7 * k));
    const series = {};
    for (const [d, bySkill] of Object.entries(state.daily)) {
      if (d < start) continue;
      const wk = weekOf(d);
      for (const [sk, g] of Object.entries(bySkill)) {
        const s = series[sk] || (series[sk] = Object.fromEntries(keys.map(k => [k, { n: 0, ok: 0, unaided: 0, lat: 0, latN: 0, delayedN: 0, delayedOk: 0, ctxN: 0, ctxOk: 0 }])));
        const b = s[wk]; if (!b) continue;
        for (const f of Object.keys(b)) b[f] += g[f] || 0;
      }
    }
    return { weeks: keys, series };
  }
  function totals(daily, sinceDate) {
    const t = { n: 0, ok: 0, unaided: 0, delayedN: 0, delayedOk: 0, ctxN: 0, ctxOk: 0, lat: 0, latN: 0 };
    for (const [d, bySkill] of Object.entries(daily)) {
      if (sinceDate && d < sinceDate) continue;
      for (const g of Object.values(bySkill)) for (const f of Object.keys(t)) t[f] += g[f] || 0;
    }
    return t;
  }

  // Weeks in which new topics started — accuracy in those weeks is on new,
  // harder material, so a dip there is expected and annotated.
  function annotations(C, state) {
    const notes = [];
    const firstByTopic = {};
    for (const s of state.sessions) if (s.kind === 'morning' && s.topic && !firstByTopic[s.topic]) firstByTopic[s.topic] = s.date;
    for (const [t, d] of Object.entries(firstByTopic)) notes.push({ week: weekOf(d), text: 'Started: ' + ((C.topicById[t] || {}).name || t) });
    if (state.migratedFrom) notes.push({ week: weekOf(state.migratedFrom.at), text: 'Upgraded from the old app (history before this is approximate)' });
    for (const v of state.curriculumSeen || []) if (v.date) notes.push({ week: weekOf(v.date), text: 'Curriculum updated (' + v.version + ')' });
    return notes;
  }

  // Calibration: does predicted recall match what actually happened?
  function calibration(state) {
    const bins = [[0, 0.5], [0.5, 0.7], [0.7, 0.85], [0.85, 0.95], [0.95, 1.01]].map(([a, b]) => ({ a, b, n: 0, ok: 0 }));
    for (const r of state.log) {
      if (r.R == null || r.phase === 'diag' || r.phase === 'retry') continue;
      const bin = bins.find(x => r.R >= x.a && r.R < x.b); if (!bin) continue;
      bin.n++; if (r.verdict !== 'wrong') bin.ok++;
    }
    return bins;
  }

  // Items forgotten repeatedly (lapses across skills), worst first.
  function troublesome(C, state, n) {
    return Object.entries(state.memory).filter(([id]) => C.byId[id])
      .map(([id, m]) => ({ id, lapses: Object.values(m.skills).reduce((t, s) => t + (s.lapses || 0), 0) }))
      .filter(x => x.lapses >= 2).sort((a, b) => b.lapses - a.lapses).slice(0, n || 12);
  }

  // Median latency of correct typed production, per week (from detailed log).
  function speedSeries(state, weeks, date) {
    const start = CAL.addDays(weekOf(date), -7 * (weeks - 1));
    const by = {};
    for (const r of state.log) {
      if (r.ex !== 'type' || r.verdict !== 'correct' || !r.latencyMs || r.date < start || r.phase === 'diag') continue;
      (by[weekOf(r.date)] = by[weekOf(r.date)] || []).push(r.latencyMs);
    }
    return Array.from({ length: weeks }, (_, k) => { const w = CAL.addDays(start, 7 * k); return { week: w, median: by[w] ? SRS.median(by[w]) : null, n: by[w] ? by[w].length : 0 }; });
  }

  function milestones(C, state) {
    return C.milestones.map(m => {
      const rec = state.milestones[m.id] || {};
      const introduced = m.needs.filter(id => state.memory[id]).length;
      return { id: m.id, name: m.name, desc: m.desc, needs: m.needs.length, introduced, passed: rec.passed || null, lastTry: rec.lastTry || null, lastScore: rec.lastScore || null, assessable: !m.missing.length && m.steps && m.steps.length };
    });
  }

  function practiceSummary(state, sinceDate) {
    const t = totals(state.practice.daily, sinceDate);
    const sessions = state.sessions.filter(s => (s.kind === 'recall' || s.kind === 'training') && (!sinceDate || s.date >= sinceDate));
    return { attempts: t.n, ok: t.ok, sessions: sessions.length };
  }

  return { classify, skillSeries, totals, annotations, calibration, troublesome, speedSeries, milestones, practiceSummary, weekOf };
});
