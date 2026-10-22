/* ============================================================
   Michi — calendar (pure)
   All "what day is it" logic uses the learner's LOCAL calendar date in a
   configurable IANA time zone ('auto' = the device's current zone), and
   all date arithmetic is done on Y-M-D values in UTC so daylight-saving
   changes can never skip or repeat a day.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MichiCalendar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const DAY = 86400000;

  function deviceZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } }
  function validZone(z) { try { Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch (e) { return false; } }
  function zoneOf(setting) { return !setting || setting === 'auto' || !validZone(setting) ? deviceZone() : setting; }

  // Local calendar date 'YYYY-MM-DD' of instant `now` in zone `tz`.
  function localDate(now, tz) {
    const d = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zoneOf(tz), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const g = t => parts.find(p => p.type === t).value;
    return g('year') + '-' + g('month') + '-' + g('day');
  }
  function toUTC(s) { const p = s.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function fromUTC(ms) { const d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function addDays(s, n) { return fromUTC(toUTC(s) + n * DAY); }
  function daysBetween(a, b) { return Math.round((toUTC(b) - toUTC(a)) / DAY); }
  function weekday(s) { return new Date(toUTC(s)).getUTCDay(); }     // 0 = Sunday

  // The most recent date (on or before s) that falls on `wd`.
  function onOrBefore(s, wd) { return addDays(s, -((weekday(s) - wd + 7) % 7)); }
  function onOrAfter(s, wd) { return addDays(s, (wd - weekday(s) + 7) % 7); }

  /* Weekly assessment status.
     - Each assessment belongs to a Sunday (its "key") and covers material
       since the previous completed assessment, so missing a week never
       discards anything.
     - It unlocks at 00:00 on that Sunday in the learner's zone.
     - Before then it is locked and we say exactly when it opens.
     - If last Sunday's assessment was never taken it stays available
       (a catch-up) until it is done or the next Sunday replaces it —
       completion time of day never matters.
     args: { today, unlockWeekday, completed: {key: {...}}, firstActivity } */
  function weeklyStatus(a) {
    const wd = a.unlockWeekday == null ? 0 : a.unlockWeekday;
    const key = onOrBefore(a.today, wd);              // most recent unlock day (maybe today)
    const nextKey = addDays(key, 7);
    const done = !!(a.completed && a.completed[key]);
    const hasHistory = !!a.firstActivity && a.firstActivity <= key;
    if (!done && hasHistory) return { state: 'available', key, catchUp: key !== a.today, unlocks: key };
    if (!done && !hasHistory && a.today === key && a.firstActivity) return { state: 'available', key, catchUp: false, unlocks: key };
    return { state: done ? 'done' : 'locked', key, unlocks: nextKey, daysUntil: daysBetween(a.today, nextKey) };
  }

  const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function pretty(s) { const p = s.split('-').map(Number); const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][p[1] - 1]; return WEEKDAY_NAMES[weekday(s)] + ' ' + p[2] + ' ' + m; }

  return { deviceZone, validZone, zoneOf, localDate, addDays, daysBetween, weekday, onOrBefore, onOrAfter, weeklyStatus, pretty, WEEKDAY_NAMES };
});
