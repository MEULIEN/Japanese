/* ============================================================
   Michi — engine façade (pure logic + injected storage/clock)
   ------------------------------------------------------------
   The single path between the UI and learner state:
     start → current card → answer (grade → record → adapt) → advance → finish
   The recording path is chosen HERE from the session kind, so no UI code
   can accidentally send Recall or Training answers to the scheduler.
   Used by app.js and directly by the test-suite (same code paths).
   ============================================================ */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MichiEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const req = (n, g) => node ? require('./' + n) : root[g];
  const ST = req('store.js', 'MichiStore');
  const PL = req('planner.js', 'MichiPlanner');
  const X = req('exercises.js', 'MichiExercises');
  const CAL = req('calendar.js', 'MichiCalendar');
  const SRS = req('srs.js', 'MichiSRS');
  const P = req('policy.js', 'MichiPolicy');
  const CUR = req('curriculum.js', 'MichiCurriculum');

  /* opts: { C, storage, now: () => ms, rng, audio: () => bool } */
  function create(opts) {
    const E = {};
    const now = opts.now || (() => Date.now());
    const rng = opts.rng || Math.random;
    const loaded = ST.load(opts.storage, CAL.localDate(now(), 'auto'));
    E.state = loaded.state;
    E.loadNotes = loaded.notes;
    E.migrated = !!loaded.migrated;
    E.C = opts.C;
    E.session = null;
    E.lastSave = null;

    E.today = () => CAL.localDate(now(), E.state.settings.timeZone);
    E.ctx = () => ({ C: E.C, state: E.state, date: E.today(), audio: !!(opts.audio && opts.audio()), rng, now });
    E.save = () => { E.lastSave = ST.save(opts.storage, E.state); return E.lastSave; };
    E.saveSession = () => ST.saveSession(opts.storage, E.session && !E.session.finished ? E.session : null);

    // Record which curriculum version the learner has seen (progress annotations).
    const seen = E.state.curriculumSeen;
    if (E.C && (!seen.length || seen[seen.length - 1].version !== E.C.version)) { seen.push({ version: E.C.version, date: E.today(), items: E.C.items.length }); }
    if (E.migrated) E.save();

    /* ---------- weekly status ---------- */
    E.weeklyStatus = () => CAL.weeklyStatus({ today: E.today(), unlockWeekday: P.weekly.unlockWeekday, completed: E.state.weekly, firstActivity: ST.firstActivity(E.state) });

    /* ---------- availability of each activity on the home screen ---------- */
    E.availability = () => {
      const st = E.state, any = Object.keys(st.memory).some(id => E.C.byId[id]);
      const today = E.today();
      const doneToday = k => st.sessions.some(s => s.kind === k && s.date === today && !s.endedEarly);
      const topic = PL.pickTopic(E.ctx());
      const wk = E.weeklyStatus();
      const morning = { state: doneToday('morning') ? 'done' : 'available', topic: topic && topic.id };
      if (!topic && !any) morning.state = 'locked', morning.reason = 'No verified lesson material is loaded.';
      const pend = st.lesson.pendingEvening;
      const evening = { state: doneToday('evening') ? 'done' : (pend || any) ? 'available' : 'locked', reason: (pend || any) ? null : 'Opens after your first morning lesson.', fromMorning: pend ? pend.date : null };
      const recall = { state: any ? 'available' : 'locked', reason: any ? null : 'Opens once you have learned something.' };
      const training = { state: any ? 'available' : 'locked', reason: any ? null : 'Opens once you have learned something.' };
      const weekly = { state: wk.state === 'available' ? 'available' : wk.state === 'done' ? 'done' : 'locked', status: wk };
      // Recommendation: one obvious next step, never mandatory.
      let rec = null;
      if (weekly.state === 'available') rec = 'weekly';
      else if (morning.state === 'available' && !doneToday('morning')) rec = 'morning';
      else if (evening.state === 'available' && pend) rec = 'evening';
      else if (recall.state === 'available') rec = 'recall';
      return { morning, evening, recall, training, weekly, recommended: rec };
    };

    /* ---------- sessions ---------- */
    E.start = (kind, o) => {
      const ctx = E.ctx();
      let s;
      if (kind === 'morning') s = PL.startMorning(ctx, o);
      else if (kind === 'evening') s = PL.startEvening(ctx);
      else if (kind === 'weekly') {
        const wk = E.weeklyStatus();
        if (wk.state !== 'available') return { error: 'locked', status: wk };
        s = PL.startWeekly(ctx, wk.key);
      } else if (kind === 'recall' || kind === 'training') s = PL.startPractice(kind, ctx, o);
      else return { error: 'unknown-kind' };
      if (s.reason && !s.queue.length) return { error: s.reason, session: s };
      E.session = s; s.cardShownAt = now();
      E.saveSession();
      return { session: s };
    };
    E.resume = () => {
      const s = ST.loadSession(opts.storage);
      if (!s || s.finished || !s.queue) return null;
      // Drop a resumed card whose item no longer exists (curriculum shrank).
      s.queue = s.queue.filter((c, k) => k < s.i || !c.item || E.C.byId[c.item] || c.ex === 'match');
      E.session = s; s.cardShownAt = now();
      return s;
    };
    E.current = () => E.session ? PL.current(E.session) : null;

    /* Answer the current card. response depends on the card type:
         choice-like {index} | {dontKnow:true} · typed {text} · speak {self}
         build {sequence} · teach {} · span {won} · switch {text} · recovery {self, text}
       meta: { hint: 0|1|2 }  Returns { result, feedback, remediation }. */
    E.answer = (response, meta) => {
      const s = E.session, card = PL.current(s);
      if (!s || !card) return null;
      if (card._answered) return card._answered;                          // double tap guard
      meta = Object.assign({ latencyMs: now() - (s.cardShownAt || now()) }, meta || {});
      const ctx = E.ctx();
      // Non-graded cards
      if (card.ex === 'teach' || card.ex === 'teachpattern' || card.ex === 'study') {
        if (card.ex === 'teach' && s.objectives[card.item] && s.objectives[card.item].status === 'planned') s.objectives[card.item].status = 'taught';
        return (card._answered = { result: null });
      }
      let result;
      if (card.ex === 'span') result = { verdict: response.won ? 'correct' : 'wrong', kind: 'span' };
      else if (card.ex === 'switch') result = gradeSwitch(card, response.text);
      else if (card.ex === 'recovery') result = { verdict: response.self === 'yes' ? 'correct' : response.self === 'partly' ? 'near' : 'wrong', kind: 'self' };
      else if (card.ex === 'match') result = { verdict: response.mistakes ? (response.mistakes > 1 ? 'wrong' : 'near') : 'correct', kind: 'match' };
      else result = X.grade(card, response, E.C ? { C: E.C } : ctx);
      const sub = PL.submit(s, card, result, ctx, meta);
      // ROUTING: the only place an attempt reaches storage.
      if (card.item && card.skill && E.C.byId[card.item]) {
        if (PL.isScheduled(s)) ST.recordScheduled(E.state, sub.attempt);
        else ST.recordPractice(E.state.practice, sub.attempt);
      }
      trainStats(card, result, response);
      E.save(); E.saveSession();
      return (card._answered = { result, remediation: sub.remediation });
    };
    function gradeSwitch(card, text) {
      const A = req('answer.js', 'MichiAnswer');
      for (const id of card.members) { const it = E.C.byId[id]; if (it && A.check(text, it).verdict !== 'wrong') return { verdict: 'correct', kind: 'exact', matched: id }; }
      return { verdict: 'wrong', kind: 'not-in-category' };
    }
    // Training-game statistics (never touch memory).
    function trainStats(card, result, response) {
      const t = E.state.train;
      if (card.ex === 'span') { t.spanHistory.push({ date: E.today(), n: card.n, won: result.verdict === 'correct' }); if (t.spanHistory.length > 300) t.spanHistory.shift(); if (result.verdict === 'correct') t.spanBest = Math.max(t.spanBest || 0, card.n); }
      if (card.ex === 'recovery') { t.recoveryTries++; if (result.verdict === 'correct') t.recoveryWins++; (t.recoveryLog = t.recoveryLog || []).push({ date: E.today(), prompt: card.prompt, self: response.self, hints: response.hints || 0 }); if (t.recoveryLog.length > 300) t.recoveryLog.shift(); }
    }

    E.next = () => {
      const s = E.session; if (!s) return null;
      const c = PL.advance(s, E.ctx());
      s.cardShownAt = now();
      E.saveSession();
      return c;
    };
    E.endEarly = () => { if (E.session) PL.endEarly(E.session); return E.finish(); };

    /* ---------- finishing: apply lesson-level effects ---------- */
    E.finish = () => {
      const s = E.session; if (!s || s.finished) return s && s.summary;
      const ctx = E.ctx();
      const sum = PL.summarize(s, ctx);
      const st = E.state;
      if (s.kind === 'morning') {
        const items = sum.introduced.filter(id => st.memory[id]);
        // Record introduction for items that were taught but never graded.
        for (const id of sum.introduced) if (!st.memory[id] && E.C.byId[id]) st.memory[id] = { intro: ctx.date, introKind: 'morning', skills: {} };
        const status = {}, errors = {}, exUsed = {};
        for (const id of Object.keys(s.objectives)) { status[id] = s.objectives[id].status; errors[id] = s.objectives[id].errors; exUsed[id] = s.objectives[id].exUsed; }
        if (sum.introduced.length) st.lesson.pendingEvening = { sessionId: s.id, date: s.date, items: sum.introduced, status, errors, exUsed };
        st.lesson.carry = sum.carry;
        st.lesson.patternsSeen = Array.from(new Set((st.lesson.patternsSeen || []).concat(sum.patternsIntroduced || [])));
        if (s.topic) st.lesson.topicsStarted[s.topic] = st.lesson.topicsStarted[s.topic] || ctx.date;
        sum.uncertain = items.filter(id => !sum.established.includes(id));
      } else if (s.kind === 'evening') {
        const pend = st.lesson.pendingEvening;
        if (pend) {
          const practised = new Set(s.results.filter(r => r.phase === 'consolidate').map(r => r.item));
          const left = pend.items.filter(id => !practised.has(id));
          st.lesson.pendingEvening = left.length && s.endedEarly ? Object.assign({}, pend, { items: left }) : null;
        }
      } else if (s.kind === 'weekly') {
        sum.report = weeklyReport(s, ctx);
        st.weekly[s.weekKey] = Object.assign({ date: ctx.date, completedAt: now() }, sum.report);
        for (const [mid, r] of Object.entries(sum.report.milestones)) {
          const rec = st.milestones[mid] || (st.milestones[mid] = { passed: null, attempts: [] });
          rec.attempts.push({ date: ctx.date, ok: r.ok, of: r.of });
          rec.lastTry = ctx.date; rec.lastScore = r.ok + '/' + r.of;
          if (r.ok === r.of) rec.passed = ctx.date;
        }
      }
      sum.next = nextReviewPreview(ctx);
      st.sessions.push(Object.assign({ endedEarly: !!s.endedEarly }, sum, { report: undefined }));
      ST.compact(st, ctx.date);
      s.finished = true; s.summary = sum;
      E.save(); E.saveSession();
      return sum;
    };

    // Per-item weekly classification (see README "Weekly assessment").
    function weeklyReport(s, ctx) {
      const byItem = {};
      for (const r of s.results) if (r.item && r.phase !== 'teach') (byItem[r.item] = byItem[r.item] || []).push(r);
      const classes = { durable: [], familiar: [], deteriorated: [], contextLimited: [], needsPractice: [] };
      for (const [id, rs] of Object.entries(byItem)) {
        const it = E.C.byId[id]; if (!it) continue;
        const ok = r => r.verdict === 'correct' && !r.hint;
        const prim = rs.filter(r => r.skill === CUR.primarySkill(it));
        const recog = rs.filter(r => r.skill === 'recognition' || r.skill === 'listening');
        const ctxR = rs.filter(r => r.skill === 'context');
        const m = E.state.memory[id];
        const hadStreak = m && Object.values(m.skills).some(st => (st.reps || 0) >= 3);
        if (rs.every(ok)) classes.durable.push(id);
        else if (prim.length && prim.every(ok) && ctxR.length && !ctxR.every(ok)) classes.contextLimited.push(id);
        else if (recog.length && recog.every(ok) && rs.some(r => !ok(r))) classes.familiar.push(id);
        else if (hadStreak && rs.some(r => r.verdict === 'wrong')) classes.deteriorated.push(id);
        else classes.needsPractice.push(id);
      }
      const ms = {};
      for (const r of s.results) if (r.phase === 'scenario') {
        const card = s.queue.find(c => c.id === r.card);
        const mid = card && card.milestone; if (!mid) continue;
        const x = ms[mid] || (ms[mid] = { ok: 0, of: 0 });
        x.of++; if (r.verdict === 'correct' && !r.hint) x.ok++;
      }
      const skillAcc = {};
      for (const r of s.results) if (r.skill && r.phase !== 'retry') { const a = skillAcc[r.skill] || (skillAcc[r.skill] = { n: 0, ok: 0 }); a.n++; if (r.verdict === 'correct' && !r.hint) a.ok++; }
      const focus = classes.deteriorated.concat(classes.needsPractice, classes.familiar, classes.contextLimited).slice(0, 10);
      return { classes, milestones: ms, skillAcc, focus, untested: (s.plan && s.plan.untested) || [], tested: Object.keys(byItem).length };
    }
    function nextReviewPreview(ctx) {
      const up = PL.upcoming(ctx, 2).filter(x => x.st.due > ctx.date);
      const byDate = {};
      for (const u of up) (byDate[u.st.due] = byDate[u.st.due] || new Set()).add(u.item.id);
      const reasons = [];
      const items = new Set(up.map(u => u.item.id));
      const lapsed = new Set(up.filter(u => (u.st.lapses || 0) > 0).map(u => u.item.id)).size;   // count words, not skills
      if (lapsed) reasons.push(lapsed === 1 ? '1 of these words was missed before, so it comes back sooner' : lapsed + ' of these ' + items.size + ' words were missed before, so they come back sooner');
      return { byDate: Object.fromEntries(Object.entries(byDate).map(([d, s2]) => [d, s2.size])), reasons };
    }

    /* ---------- settings / backup ---------- */
    E.exportJSON = () => JSON.stringify({ app: 'michi', exported: new Date(now()).toISOString(), state: E.state }, null, 1);
    E.importJSON = (text) => {
      const doc = JSON.parse(text);
      const raw = doc && doc.state ? doc.state : doc;
      if (raw && raw.schema === ST.SCHEMA) E.state = ST.normalize(raw, E.today());
      else if (raw && raw.items) E.state = ST.migrateV1(raw, E.today());
      else throw new Error('not a Michi backup');
      E.session = null; E.saveSession(); E.save();
      return true;
    };
    E.restoreV1Backup = () => {
      const raw = opts.storage.getItem(ST.V1_BACKUP) || opts.storage.getItem(ST.V1);
      if (!raw) return false;
      E.state = ST.migrateV1(JSON.parse(raw), E.today());
      E.save(); return true;
    };
    E.reset = () => { E.state = ST.blank(E.today()); E.session = null; E.saveSession(); E.save(); };
    return E;
  }

  return { create };
});
