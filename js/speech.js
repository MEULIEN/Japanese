/* ============================================================
   Michi — Japanese speech output (Web Speech API)
   ------------------------------------------------------------
   Root causes of the old "hard to understand" audio, fixed here:
   1. getVoices() is EMPTY until the browser fires `voiceschanged`, so the
      old code usually spoke with the DEFAULT voice — on many phones/PCs a
      non-Japanese voice reading Japanese text. We now wait for the list.
   2. It took the first voice whose lang started with "ja", which may be a
      network-only voice (fails offline) or a low-quality compact voice.
      Voices are now ranked (on-device first, enhanced/premium/natural
      first) and the learner can choose and compare them.
   3. It read the KANA string. Speech engines segment words and assign
      pitch accent from their dictionaries, which works far better from
      the normal written form (kanji); kana-only input loses word
      boundaries. We speak the written form, except where the item asks
      for kana (place names, ambiguous single kanji).
   4. A fixed 0.85 rate; now a learner setting, default natural speed.

   Only voices that actually exist on the device are listed — never a
   label that points to the same voice. Network voices are marked and are
   not used automatically, so lessons never depend on the internet.
   ============================================================ */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MichiSpeech = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const FEMALE = ['kyoko', 'haruka', 'ayumi', 'sayaka', 'nanami', 'mayu', 'shiori', 'aoi', 'o-ren', 'oren', 'mizuki', 'tomoko', 'kaori', 'risa'];
  const MALE = ['otoya', 'ichiro', 'keita', 'hattori', 'daichi', 'naoki', 'takumi', 'kenji'];

  let cache = [];
  const synth = () => (root && root.speechSynthesis) || null;
  function supported() { return !!(synth() && root.SpeechSynthesisUtterance); }

  function describe(v) {
    const n = (v.name || '').toLowerCase();
    const gender = FEMALE.some(x => n.includes(x)) ? 'female' : MALE.some(x => n.includes(x)) ? 'male' : (/female|女性/.test(n) ? 'female' : /male|男性/.test(n) ? 'male' : null);
    const quality = /premium|enhanced|natural|neural|online \(natural\)/.test(n) ? 'high' : /compact/.test(n) ? 'low' : 'standard';
    return { uri: v.voiceURI, name: v.name, lang: v.lang, local: v.localService !== false, gender, quality, voice: v };
  }
  function rank(d) { return (d.local ? 0 : 100) + (d.quality === 'high' ? 0 : d.quality === 'standard' ? 10 : 20) + (/ja[-_]jp/i.test(d.lang) ? 0 : 5); }

  function listJapanese() {
    const s = synth(); if (!s) return [];
    const seen = new Set();
    cache = s.getVoices().filter(v => /^ja/i.test(String(v.lang || '').replace('_', '-')))
      .map(describe).filter(d => { const k = d.uri + '|' + d.name; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    return cache;
  }
  // Resolves once the voice list is populated (or after a timeout, with
  // whatever exists — possibly nothing).
  function ready(timeoutMs) {
    return new Promise(resolve => {
      if (!supported()) return resolve([]);
      const now = listJapanese();
      if (now.length) return resolve(now);
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(listJapanese()); };
      try { synth().addEventListener('voiceschanged', finish, { once: true }); } catch (e) { }
      let tries = 0;
      const poll = setInterval(() => { if (listJapanese().length || ++tries > 20) { clearInterval(poll); finish(); } }, 100);
      setTimeout(finish, timeoutMs || 2500);
    });
  }
  // The voice to use: the saved choice if still installed, else the best
  // ON-DEVICE Japanese voice. Never silently picks a network voice.
  function choose(uri) {
    const list = cache.length ? cache : listJapanese();
    return list.find(v => v.uri === uri) || list.find(v => v.local) || null;
  }
  function status(uri) {
    if (!supported()) return { ok: false, reason: 'This browser has no speech synthesis.' };
    const list = cache.length ? cache : listJapanese();
    if (!list.length) return { ok: false, reason: 'No Japanese voice is installed on this device.' };
    const v = choose(uri);
    if (!v) return { ok: false, reason: 'Only online Japanese voices were found. Install an offline Japanese voice (see Settings → Voice).', onlineOnly: true };
    return { ok: true, voice: v };
  }

  let speaking = null;
  function speak(text, opts) {
    opts = opts || {};
    const s = synth(); if (!s || !text) return false;
    const v = opts.voice || choose(opts.uri);
    if (!v && !opts.allowDefault) return false;
    try {
      s.cancel();
      const u = new root.SpeechSynthesisUtterance(String(text).replace(/[〜~]/g, ''));
      u.lang = (v && v.lang) || 'ja-JP';
      if (v) u.voice = v.voice;
      u.rate = Math.min(1.5, Math.max(0.5, opts.rate || 1));
      u.pitch = 1;
      if (opts.onend) { u.onend = opts.onend; u.onerror = opts.onend; }
      speaking = u;
      s.speak(u);
      // Chrome can stall after long idle periods; resume() un-sticks it.
      if (s.paused) s.resume();
      return true;
    } catch (e) { return false; }
  }
  function stop() { try { const s = synth(); if (s) s.cancel(); } catch (e) { } }

  return { supported, listJapanese, ready, choose, status, speak, stop, describe, rank };
});
