/* ============================================================
   Michi — learner state: schema, migration, persistence, recording
   ------------------------------------------------------------
   Canonical content (data/*.json) and learner state are separate: state
   refers to content only by stable item ids.

   ISOLATION OF INDEPENDENT STUDY (enforced here, not in the UI):
     state.memory   — the official per-item, per-skill memory model
                      (FSRS state, due dates, lapses). Written ONLY by
                      recordScheduled(), which is called only for the
                      scheduled sessions: morning, evening, weekly.
     state.practice — Recall / Training / conjugation-drill history.
                      Written ONLY by recordPractice(), which receives
                      the practice sub-object and nothing else, so it
                      cannot change a due date, an interval or mastery.
   Tests deep-freeze state.memory and run whole Recall and Training
   sessions to prove nothing writes to it.

   Persistence: localStorage, one atomic setItem per save of the whole
   document (no partial writes), plus a rolling previous copy used for
   automatic recovery if the main copy is ever unreadable. The legacy v1
   document is never modified or deleted by migration.
   ============================================================ */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MichiStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const SRS = node ? require('./srs.js') : root.MichiSRS;
  const CAL = node ? require('./calendar.js') : root.MichiCalendar;
  const POLICY = node ? require('./policy.js') : root.MichiPolicy;

  const KEY = 'michi_v2', PREV = 'michi_v2_prev', SESSION = 'michi_v2_session';
  const V1 = 'michi_v1', V1_BACKUP = 'michi_v1_backup';
  const SCHEMA = 2;
  const SCHEDULED_KINDS = ['morning', 'evening', 'weekly'];
  const PRACTICE_KINDS = ['recall', 'training', 'conjugation', 'span', 'recovery'];

  function blank(today) {
    return {
      schema: SCHEMA, created: today || null,
      settings: {
        theme: 'light', background: null, shade: null,
        timeZone: 'auto', voiceURI: null, voiceRate: 1.0,
        minutes: Object.assign({}, POLICY.availableMinutes),
        showRomaji: true
      },
      memory: {},          // official: { [itemId]: { intro, introKind, diag, skills: { [skill]: fsrsState } } }
      log: [],             // official detailed attempts (recent)
      daily: {},           // official per-day per-skill aggregates (kept forever, small)
      latency: {},         // official per-exercise-type recent latencies (ms)
      sessions: [],        // completed session summaries (all kinds)
      lesson: { carry: [], pendingEvening: null, topicsStarted: {} },
      weekly: {},          // { [sundayKey]: report }
      milestones: {},      // { [id]: { passed, attempts: [] } }
      practice: { items: {}, log: [], daily: {}, latency: {} },
      train: { spanBest: 0, spanHistory: [], recoveryTries: 0, recoveryWins: 0 },
      hooks: {},
      curriculumSeen: []   // curriculum versions seen (annotates progress charts)
    };
  }

  /* ---------- shape repair (tolerates partial / older documents) ---------- */
  function normalize(s, today) {
    const b = blank(today);
    const out = Object.assign(b, s);
    out.settings = Object.assign(blank().settings, s.settings || {});
    out.settings.minutes = Object.assign({}, POLICY.availableMinutes, (s.settings && s.settings.minutes) || {});
    out.lesson = Object.assign(blank().lesson, s.lesson || {});
    out.practice = Object.assign(blank().practice, s.practice || {});
    out.train = Object.assign(blank().train, s.train || {});
    for (const k of ['memory', 'daily', 'latency', 'weekly', 'milestones', 'hooks']) if (!out[k] || typeof out[k] !== 'object') out[k] = {};
    for (const k of ['log', 'sessions', 'curriculumSeen']) if (!Array.isArray(out[k])) out[k] = [];
    out.schema = SCHEMA;
    return out;
  }

  /* ---------- v1 → v2 migration ----------
     v1: { items: {id: {box, due, reps, lapses, prod}}, days: {date: {kinds, reviews}},
           hooks, settings, span, flex }
     A Leitner box maps to the interval it represented; with FSRS at 90%
     target retention, stability == interval, so the learner keeps their
     place: nothing they had learned is reset, nothing becomes falsely
     mastered (production state is created only where v1 recorded unaided
     production). */
  const V1_BOX_DAYS = { 1: 0.5, 2: 1, 3: 3, 4: 7, 5: 14, 6: 30 };
  function migrateV1(v1, today) {
    const s = blank(today);
    const days = Object.keys(v1.days || {}).sort();
    const first = days[0] || today;
    s.created = first;
    for (const id of Object.keys(v1.items || {})) {
      const r = v1.items[id] || {};
      const box = Math.min(6, Math.max(1, r.box || 1));
      const stab = V1_BOX_DAYS[box];
      const due = typeof r.due === 'string' ? r.due : today;
      const last = CAL.addDays(due, -Math.max(0, Math.round(box === 1 ? 0 : stab)));
      const base = { s: stab, d: Math.min(10, 5 + 0.5 * (r.lapses || 0)), last: last < first ? first : last, first, due, reps: r.reps || 0, lapses: r.lapses || 0, streak: box > 1 ? 1 : 0, aided: 0, migrated: true };
      const skills = { recognition: Object.assign({}, base) };
      if ((r.prod || 0) >= 1) skills.production = Object.assign({}, base, { reps: r.prod });
      s.memory[id] = { intro: first, introKind: 'legacy', skills };
    }
    const kindMap = { morning: 'morning', midday: 'recall', evening: 'evening', weekly: 'weekly', mini: 'recall' };
    for (const d of days) {
      for (const k of (v1.days[d].kinds || [])) s.sessions.push({ id: 'legacy-' + d + '-' + k, kind: kindMap[k] || 'recall', date: d, legacy: true });
    }
    s.hooks = Object.assign({}, v1.hooks || {});
    if (v1.settings) { s.settings.theme = v1.settings.theme || 'light'; s.settings.background = v1.settings.background || null; s.settings.shade = v1.settings.shade == null ? null : v1.settings.shade; }
    s.train.spanBest = v1.span || 0;
    s.train.recoveryWins = v1.flex || 0;
    s.migratedFrom = { schema: 1, at: today, items: Object.keys(v1.items || {}).length, backupKey: V1_BACKUP };
    return s;
  }

  /* ---------- load / save ---------- */
  function parse(raw) { try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  function load(storage, today) {
    const notes = [];
    let doc = parse(storage.getItem(KEY));
    if (storage.getItem(KEY) && !doc) {
      const prev = parse(storage.getItem(PREV));
      if (prev) { doc = prev; notes.push('recovered-from-previous-copy'); }
      else notes.push('main-copy-unreadable');
    }
    if (doc && doc.schema === SCHEMA) return { state: normalize(doc, today), notes };
    const v1 = parse(storage.getItem(V1));
    if (v1 && v1.items) {
      // Backup first (never overwrite an existing backup), then migrate.
      if (!storage.getItem(V1_BACKUP)) storage.setItem(V1_BACKUP, storage.getItem(V1));
      const st = migrateV1(v1, today);
      notes.push('migrated-from-v1');
      return { state: st, notes, migrated: true };
    }
    return { state: blank(today), notes, fresh: true };
  }
  function save(storage, state) {
    const json = JSON.stringify(state);
    try {
      const cur = storage.getItem(KEY);
      if (cur) storage.setItem(PREV, cur);
      storage.setItem(KEY, json);
      return { ok: true, bytes: json.length };
    } catch (e) {
      // Quota: drop the previous copy and old detail rows, retry once.
      try { storage.removeItem(PREV); compact(state, null, true); storage.setItem(KEY, JSON.stringify(state)); return { ok: true, compacted: true }; }
      catch (e2) { return { ok: false, error: String(e2 && e2.message || e2) }; }
    }
  }
  function saveSession(storage, sess) { try { if (sess) storage.setItem(SESSION, JSON.stringify(sess)); else storage.removeItem(SESSION); } catch (e) { } }
  function loadSession(storage) { return parse(storage.getItem(SESSION)); }

  /* ---------- aggregates ---------- */
  function bumpDaily(daily, date, skill, a) {
    const d = daily[date] || (daily[date] = {});
    const g = d[skill] || (d[skill] = { n: 0, ok: 0, unaided: 0, near: 0, lat: 0, latN: 0, delayedN: 0, delayedOk: 0, ctxN: 0, ctxOk: 0 });
    g.n++;
    if (a.verdict === 'correct') g.ok++;
    if (a.verdict === 'near') g.near++;
    if (a.verdict === 'correct' && !(a.hint > 0)) g.unaided++;
    if (a.latencyMs && a.verdict !== 'wrong') { g.lat += a.latencyMs; g.latN++; }
    if (a.elapsedDays >= 1) { g.delayedN++; if (a.verdict !== 'wrong') g.delayedOk++; }
    if (a.novelContext) { g.ctxN++; if (a.verdict !== 'wrong') g.ctxOk++; }
  }
  function pushLatency(store, ex, ms) {
    if (!ms || ms < 300 || ms > 120000) return;           // ignore impossible / walked-away timings
    const a = store[ex] || (store[ex] = []);
    a.push(Math.round(ms));
    if (a.length > POLICY.latencyWindow) a.splice(0, a.length - POLICY.latencyWindow);
  }

  /* ---------- the two recording paths ---------- */
  // attempt: { item, skill, ex, kind, phase, verdict, errorKind, hint,
  //            selfGrade, latencyMs, date, ts, novelContext, recognitionOnly }
  function recordScheduled(state, a) {
    if (SCHEDULED_KINDS.indexOf(a.kind) < 0) throw new Error('recordScheduled called from a non-scheduled mode: ' + a.kind);
    // Diagnostic answers (before teaching) are logged for analysis but never
    // enter the memory model: a guess must not make a word "introduced" or
    // "known", and a miss on unfamiliar material is not a lapse.
    if (a.phase === 'diag') { const row = Object.assign({}, a, { grade: null }); state.log.push(row); return row; }
    const m = state.memory[a.item] || (state.memory[a.item] = { intro: a.date, introKind: a.kind, skills: {} });
    const prev = m.skills[a.skill] || null;
    const elapsedDays = prev && prev.last ? CAL.daysBetween(prev.last, a.date) : 0;
    const baseline = SRS.median(state.latency[a.ex]);
    const grade = SRS.gradeFromEvidence({ verdict: a.verdict, hint: a.hint, selfGrade: a.selfGrade, latencyMs: a.latencyMs, baselineMs: baseline, recognitionOnly: a.recognitionOnly });
    m.skills[a.skill] = SRS.review(prev, grade, a.date, { aided: a.hint > 0 });
    m.lastSeen = a.date;
    const row = Object.assign({}, a, { grade, elapsedDays, R: prev ? +SRS.recallProb(prev, a.date).toFixed(3) : null });
    state.log.push(row);
    bumpDaily(state.daily, a.date, a.skill, Object.assign({}, a, { elapsedDays }));
    pushLatency(state.latency, a.ex, a.latencyMs);
    return row;
  }
  // Practice receives ONLY the practice sub-store. It has no reference to
  // state.memory, so it cannot alter scheduling or mastery.
  function recordPractice(practice, a) {
    if (SCHEDULED_KINDS.indexOf(a.kind) >= 0) throw new Error('recordPractice called from a scheduled mode: ' + a.kind);
    const it = practice.items[a.item] || (practice.items[a.item] = {});
    const sk = it[a.skill] || (it[a.skill] = { n: 0, ok: 0, last: null, lastOk: null, misses: 0 });
    sk.n++; sk.last = a.date;
    if (a.verdict !== 'wrong') { sk.ok++; sk.lastOk = a.date; } else sk.misses++;
    practice.log.push(Object.assign({}, a));
    bumpDaily(practice.daily, a.date, a.skill, a);
    pushLatency(practice.latency, a.ex, a.latencyMs);
    return a;
  }

  // Fold old detailed rows into the (already maintained) daily aggregates.
  function compact(state, today, aggressive) {
    const keep = aggressive ? 30 : POLICY.log.detailedDays;
    const cutoff = today ? CAL.addDays(today, -keep) : null;
    const trim = arr => cutoff ? arr.filter(r => r.date >= cutoff) : arr.slice(-Math.max(200, Math.floor(arr.length / 2)));
    state.log = trim(state.log);
    state.practice.log = trim(state.practice.log);
    if (state.sessions.length > POLICY.log.maxSessions) state.sessions = state.sessions.slice(-POLICY.log.maxSessions);
  }

  function firstActivity(state) {
    const intro = Object.values(state.memory).map(m => m.intro).filter(Boolean).sort();
    return intro[0] || null;
  }

  return { KEY, PREV, SESSION, V1, V1_BACKUP, SCHEMA, SCHEDULED_KINDS, PRACTICE_KINDS, blank, normalize, migrateV1, load, save, saveSession, loadSession, recordScheduled, recordPractice, compact, firstActivity };
});
