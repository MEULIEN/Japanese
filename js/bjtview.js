/* ============================================================
   Michi — BJT Training page (UI only)
   ------------------------------------------------------------
   Screens: dashboard · session runner (questions, vocabulary, exam mode)
   · summary / mock report · 36-day plan · about & sources.
   All logic lives in js/bjt.js (tested) behind E.bjt (js/engine.js); this
   file only renders and forwards taps. It is created by app.js, which
   passes its shared helpers (escaping, buttons, routing, speech status).

   Listening is a core feature: Parts I and II play multi-speaker audio
   (MichiSpeech.speakLines). The transcript and spoken options stay hidden
   until the question is answered. With no Japanese voice, a question can
   only be read as a transcript, and that answer is flagged "assisted" and
   never counted as listening evidence. Mock exams need audio.
   ============================================================ */
(function (root) {
  'use strict';
  const BJ = root.MichiBJT, SP = root.MichiSpeech, CAL = root.MichiCalendar;

  function create(H) {
    const { esc, btn, topbar, settingsBtn, toast, go, render, audioOk, pct } = H;
    const V = H.V;
    const E = () => H.E();
    let SRC = null;                                     // data/bjt/sources.json
    const fmt = d => CAL.pretty(d);
    const P100 = x => x == null ? '—' : Math.round(x * 100) + '%';

    /* ============================================================
       VISUALS
       ============================================================ */
    const PAL = ['#3F5C8C', '#C98A2A', '#5B8C5A', '#8C4A6B'];
    function visual(v) {
      if (!v) return '';
      if (v.type === 'scene') return sceneSVG(v);
      if (v.type === 'bar' || v.type === 'line') return chartSVG(v);
      if (v.type === 'pie') return pieSVG(v);
      if (v.type === 'table') return `<figure class="bjt-fig"><figcaption lang="ja">${esc(v.title || '')}</figcaption><div class="table-wrap"><table class="conj bjt-table" lang="ja"><thead><tr>${v.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${v.rows.map(r => `<tr>${r.map((x, k) => k ? `<td>${esc(x)}</td>` : `<th>${esc(x)}</th>`).join('')}</tr>`).join('')}</tbody></table></div>${v.note ? `<p class="small muted" lang="ja">${esc(v.note)}</p>` : ''}</figure>`;
      if (v.type === 'doc') return `<article class="bjt-doc ${esc(v.kind || '')}" lang="ja">${v.title ? `<h4>${esc(v.title)}</h4>` : ''}${(v.meta || []).length ? `<div class="doc-meta">${v.meta.map(m => `<div>${esc(m)}</div>`).join('')}</div>` : ''}${v.lines.map(l => `<p>${esc(l)}</p>`).join('')}</article>`;
      return '';
    }
    // Simple scene drawing from the element list (data/bjt/SCHEMA.md). The
    // caption states what matters, so the picture never has to be guessed.
    function sceneSVG(v) {
      const W = 320, Hh = 180, floor = 152;
      const bg = { outside: ['#DCEBF5', '#CFE0C3'], factory: ['#E6E6E2', '#C9C9C4'], warehouse: ['#ECE6DA', '#CDC3B0'], shop: ['#F5EEDF', '#DCCFB5'], restaurant: ['#F4E9DD', '#D9C3A8'], reception: ['#EEF1F4', '#D3D8DE'], 'meeting-room': ['#EEF0F2', '#D5D9DE'], office: ['#F1F2EE', '#D6D8D0'] }[v.setting] || ['#F1F2EE', '#D6D8D0'];
      const X = x => 22 + (x == null ? 50 : x) * 2.76;
      let g = `<rect width="${W}" height="${floor}" fill="${bg[0]}"/><rect y="${floor}" width="${W}" height="${Hh - floor}" fill="${bg[1]}"/>`;
      const els = (v.elements || []).slice().sort((a, b) => (a.kind === 'person') - (b.kind === 'person'));
      let pi = 0;
      for (const el of els) g += drawEl(el, X(el.x), floor, pi += el.kind === 'person' ? 1 : 0);
      return `<figure class="bjt-fig scene"><svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${esc(v.caption)}">${g}</svg><figcaption class="small">🖼 ${esc(v.caption)}</figcaption></figure>`;
    }
    function drawEl(el, x, fl, pi) {
      const ink = '#2B3A52';
      switch (el.kind) {
        case 'desk': return `<rect x="${x - 38}" y="${fl - 44}" width="76" height="7" fill="#9B7B55"/><rect x="${x - 34}" y="${fl - 37}" width="4" height="37" fill="#7D6243"/><rect x="${x + 30}" y="${fl - 37}" width="4" height="37" fill="#7D6243"/>`;
        case 'table': return `<rect x="${x - 55}" y="${fl - 40}" width="110" height="8" rx="3" fill="#A88A62"/><rect x="${x - 4}" y="${fl - 32}" width="8" height="32" fill="#7D6243"/>`;
        case 'whiteboard': case 'screen': {
          const dark = el.kind === 'screen';
          let s = `<rect x="${x - 42}" y="22" width="84" height="56" fill="${dark ? '#F8F8F8' : '#FFFFFF'}" stroke="${dark ? '#333' : '#999'}" stroke-width="${dark ? 3 : 2}"/>`;
          const ch = el.chart;
          if (ch) {
            const pts = { up: [70, 62, 55, 44, 32], down: [32, 40, 50, 60, 70], flat: [52, 50, 53, 51, 52], peak: [66, 48, 30, 48, 64] }[ch] || [50, 50, 50, 50, 50];
            s += `<polyline fill="none" stroke="#C0392B" stroke-width="2.5" points="${pts.map((y, k) => (x - 34 + k * 17) + ',' + y).join(' ')}"/><line x1="${x - 36}" y1="72" x2="${x + 36}" y2="72" stroke="#888"/>`;
          }
          if (el.text) s += `<text x="${x}" y="40" font-size="9" text-anchor="middle" fill="#333">${esc(el.text)}</text>`;
          return s;
        }
        case 'laptop': return `<rect x="${x - 13}" y="${fl - 60}" width="26" height="16" rx="2" fill="#4A5568"/><rect x="${x - 16}" y="${fl - 45}" width="32" height="3" fill="#2D3748"/>`;
        case 'phone': return `<rect x="${x - 8}" y="${fl - 50}" width="16" height="6" rx="2" fill="#333"/><rect x="${x - 10}" y="${fl - 53}" width="20" height="4" rx="2" fill="#555"/>`;
        case 'document': return `<rect x="${x - 7}" y="${fl - 48}" width="14" height="4" fill="#fff" stroke="#999"/>`;
        case 'cup': return `<rect x="${x - 4}" y="${fl - 52}" width="8" height="8" rx="1" fill="#fff" stroke="#777"/>`;
        case 'clock': {
          const [h, m] = String(el.time || '3:00').split(':').map(Number);
          const a1 = ((h % 12) + m / 60) / 12 * 2 * Math.PI, a2 = m / 60 * 2 * Math.PI, cy = 30;
          return `<circle cx="${x}" cy="${cy}" r="14" fill="#fff" stroke="${ink}" stroke-width="2"/><line x1="${x}" y1="${cy}" x2="${x + 7 * Math.sin(a1)}" y2="${cy - 7 * Math.cos(a1)}" stroke="${ink}" stroke-width="2.5"/><line x1="${x}" y1="${cy}" x2="${x + 11 * Math.sin(a2)}" y2="${cy - 11 * Math.cos(a2)}" stroke="${ink}" stroke-width="1.5"/>`;
        }
        case 'boxes': { let s = ''; const n = Math.max(1, Math.min(9, el.n || 3)); for (let k = 0; k < n; k++) { const col = k % 3, row = Math.floor(k / 3); s += `<rect x="${x - 27 + col * 18}" y="${fl - 17 - row * 17}" width="17" height="16" fill="#C9A26B" stroke="#8A6A3C"/>`; } return s; }
        case 'door': return `<rect x="${x - 16}" y="${fl - 92}" width="32" height="92" fill="#B89B74" stroke="#7D6243"/><circle cx="${x + 10}" cy="${fl - 46}" r="2" fill="#555"/>`;
        case 'shelf': return `<rect x="${x - 22}" y="${fl - 90}" width="44" height="90" fill="none" stroke="#7D6243" stroke-width="3"/>${[30, 60].map(d => `<line x1="${x - 22}" y1="${fl - 90 + d}" x2="${x + 22}" y2="${fl - 90 + d}" stroke="#7D6243" stroke-width="3"/>`).join('')}`;
        case 'window': return `<rect x="${x - 26}" y="20" width="52" height="44" fill="#CFE6F5" stroke="#888" stroke-width="2"/><line x1="${x}" y1="20" x2="${x}" y2="64" stroke="#888"/>`;
        case 'plant': return `<rect x="${x - 7}" y="${fl - 16}" width="14" height="16" fill="#A0522D"/><circle cx="${x}" cy="${fl - 26}" r="12" fill="#5B8C5A"/>`;
        case 'calendar': return `<rect x="${x - 15}" y="18" width="30" height="34" fill="#fff" stroke="#999"/><rect x="${x - 15}" y="18" width="30" height="8" fill="#C0392B"/>${el.mark ? `<text x="${x}" y="45" font-size="13" text-anchor="middle" fill="#C0392B">${esc(el.mark)}</text>` : ''}`;
        case 'truck': return `<rect x="${x - 40}" y="${fl - 40}" width="52" height="30" fill="#E8E8E8" stroke="#666"/><rect x="${x + 12}" y="${fl - 30}" width="24" height="20" fill="#3F5C8C"/><circle cx="${x - 26}" cy="${fl - 8}" r="7" fill="#333"/><circle cx="${x + 24}" cy="${fl - 8}" r="7" fill="#333"/>`;
        case 'sign': return `<rect x="${x - 30}" y="24" width="60" height="22" fill="#fff" stroke="${ink}"/><text x="${x}" y="39" font-size="10" text-anchor="middle" fill="${ink}">${esc(el.text || '')}</text>`;
        case 'person': return person(el, x, fl, pi);
      }
      return '';
    }
    function person(el, x, fl, pi) {
      const shirt = ['#3F5C8C', '#8C4A6B', '#5B8C5A', '#6B6B6B', '#A0662A'][(pi - 1) % 5];
      const f = el.g === 'f', dir = el.facing === 'left' ? -1 : 1, skin = '#F2D2B6', hair = '#2E2A28';
      const pose = el.pose || 'stand';
      const sit = pose === 'sit', bow = pose === 'bow';
      const hip = sit ? fl - 42 : fl - 50, sh = sit ? hip - 34 : hip - 38;
      const lean = bow ? 16 * dir : 0;
      const hx = x + lean, hy = sh - 12 + (bow ? 8 : 0);
      let s = '';
      if (sit) s += `<rect x="${x - 12 * dir - 9}" y="${hip}" width="18" height="6" fill="#555"/><rect x="${x - 12 * dir - 9}" y="${hip - 26}" width="5" height="26" fill="#555"/><rect x="${x - 12 * dir - 2}" y="${hip + 6}" width="3" height="${fl - hip - 6}" fill="#555"/>`;
      // legs
      s += sit ? `<path d="M${x - 4} ${hip} h${16 * dir} v${fl - hip}" stroke="${ink2()}" stroke-width="6" fill="none"/>` : `<line x1="${x - 4}" y1="${hip}" x2="${x - 5}" y2="${fl}" stroke="${ink2()}" stroke-width="6"/><line x1="${x + 4}" y1="${hip}" x2="${x + 5}" y2="${fl}" stroke="${ink2()}" stroke-width="6"/>`;
      // torso
      s += `<path d="M${x - 9} ${hip} L${x - 10 + lean} ${sh} L${x + 10 + lean} ${sh} L${x + 9} ${hip} Z" fill="${shirt}"/>`;
      if (f) s += `<path d="M${x - 11} ${hip} L${x + 11} ${hip} L${x + 12} ${hip + 14} L${x - 12} ${hip + 14} Z" fill="${shirt}" opacity=".85"/>`;
      // head + hair
      s += `<circle cx="${hx}" cy="${hy}" r="10" fill="${skin}"/>`;
      s += f ? `<path d="M${hx - 11} ${hy + 8} Q${hx - 12} ${hy - 13} ${hx} ${hy - 12} Q${hx + 12} ${hy - 13} ${hx + 11} ${hy + 8} L${hx + 7} ${hy} Q${hx} ${hy - 6} ${hx - 7} ${hy} Z" fill="${hair}"/>` : `<path d="M${hx - 10} ${hy - 2} Q${hx} ${hy - 16} ${hx + 10} ${hy - 2} Q${hx} ${hy - 8} ${hx - 10} ${hy - 2} Z" fill="${hair}"/>`;
      // arm + held object
      const handX = x + lean + 16 * dir, handY = pose === 'point' ? sh - 18 : sh + 18;
      const holds = el.holds || 'none';
      const toHead = holds === 'phone';
      const ax = toHead ? hx + 9 * dir : handX, ay = toHead ? hy + 2 : handY;
      s += `<line x1="${x + 8 * dir + lean}" y1="${sh + 3}" x2="${ax}" y2="${ay}" stroke="${shirt}" stroke-width="5" stroke-linecap="round"/>`;
      const obj = {
        card: `<rect x="${ax + (dir > 0 ? 0 : -10)}" y="${ay - 4}" width="10" height="6" fill="#fff" stroke="#333"/>`,
        document: `<rect x="${ax + (dir > 0 ? -2 : -14)}" y="${ay - 10}" width="16" height="20" fill="#fff" stroke="#555"/><line x1="${ax + (dir > 0 ? 1 : -11)}" y1="${ay - 5}" x2="${ax + (dir > 0 ? 11 : -1)}" y2="${ay - 5}" stroke="#999"/>`,
        phone: `<rect x="${ax - 3}" y="${ay - 8}" width="6" height="13" rx="2" fill="#222"/>`,
        cup: `<rect x="${ax - 4}" y="${ay - 8}" width="8" height="9" fill="#fff" stroke="#777"/>`,
        box: `<rect x="${ax + (dir > 0 ? -4 : -18)}" y="${ay - 12}" width="22" height="18" fill="#C9A26B" stroke="#8A6A3C"/>`,
        pen: `<line x1="${ax}" y1="${ay}" x2="${ax + 6 * dir}" y2="${ay - 8}" stroke="#222" stroke-width="2"/>`,
        pointer: `<line x1="${ax}" y1="${ay}" x2="${ax + 22 * dir}" y2="${ay - 20}" stroke="#555" stroke-width="2"/>`,
        laptop: `<rect x="${ax + (dir > 0 ? -4 : -22)}" y="${ay - 6}" width="26" height="14" fill="#4A5568"/>`
      }[holds] || '';
      s += obj;
      if (el.label) s += `<text x="${hx}" y="${hy - 16}" font-size="10" font-weight="700" text-anchor="middle" fill="${ink2()}">${esc(el.label)}</text>`;
      return s;
    }
    const ink2 = () => '#2B3A52';
    function chartSVG(v) {
      const W = 320, Hh = 190, pl = 40, pr = 10, pt = 14, pb = 34;
      const all = v.series.flatMap(s => s.values);
      const max = Math.max(...all, 0), min = Math.min(0, ...all);
      const span = (max - min) || 1, iw = W - pl - pr, ih = Hh - pt - pb;
      const y = val => pt + ih - (val - min) / span * ih;
      const n = v.labels.length, gw = iw / n;
      let g = '';
      for (let k = 0; k <= 4; k++) { const val = min + span * k / 4, yy = y(val); g += `<line x1="${pl}" y1="${yy}" x2="${W - pr}" y2="${yy}" stroke="#ddd"/><text x="${pl - 4}" y="${yy + 3}" font-size="8" text-anchor="end" fill="#666">${+val.toFixed(span < 10 ? 1 : 0)}</text>`; }
      if (v.type === 'bar') {
        const bw = Math.min(26, (gw - 8) / v.series.length);
        v.series.forEach((s, si) => s.values.forEach((val, k) => {
          const x0 = pl + k * gw + (gw - bw * v.series.length) / 2 + si * bw;
          g += `<rect x="${x0}" y="${Math.min(y(val), y(0))}" width="${bw - 2}" height="${Math.abs(y(0) - y(val))}" fill="${PAL[si % 4]}"/><text x="${x0 + bw / 2 - 1}" y="${y(val) - 3}" font-size="7.5" text-anchor="middle" fill="#333">${esc(val)}</text>`;
        }));
      } else {
        v.series.forEach((s, si) => {
          g += `<polyline fill="none" stroke="${PAL[si % 4]}" stroke-width="2" points="${s.values.map((val, k) => (pl + k * gw + gw / 2) + ',' + y(val)).join(' ')}"/>`;
          s.values.forEach((val, k) => { g += `<circle cx="${pl + k * gw + gw / 2}" cy="${y(val)}" r="2.5" fill="${PAL[si % 4]}"/><text x="${pl + k * gw + gw / 2}" y="${y(val) - 5}" font-size="7.5" text-anchor="middle" fill="#333">${esc(val)}</text>`; });
        });
      }
      v.labels.forEach((l, k) => { g += `<text x="${pl + k * gw + gw / 2}" y="${Hh - pb + 12}" font-size="8.5" text-anchor="middle" fill="#333">${esc(l)}</text>`; });
      const legend = v.series.length > 1 || v.series[0].name ? `<div class="legend" lang="ja">${v.series.map((s, si) => `<span><i style="background:${PAL[si % 4]}"></i>${esc(s.name || '')}</span>`).join('')}</div>` : '';
      return `<figure class="bjt-fig chart-fig"><figcaption lang="ja">${esc(v.title || '')}${v.unit ? ` <span class="muted">（${esc(v.unit)}）</span>` : ''}</figcaption><svg viewBox="0 0 ${W} ${Hh}" lang="ja" role="img" aria-label="${esc(v.title || 'chart')}">${g}</svg>${legend}</figure>`;
    }
    function pieSVG(v) {
      const tot = v.values.reduce((a, b) => a + b, 0) || 1; let a0 = -Math.PI / 2, g = '';
      v.values.forEach((val, k) => {
        const a1 = a0 + val / tot * 2 * Math.PI, large = a1 - a0 > Math.PI ? 1 : 0;
        g += `<path d="M90 90 L${90 + 70 * Math.cos(a0)} ${90 + 70 * Math.sin(a0)} A70 70 0 ${large} 1 ${90 + 70 * Math.cos(a1)} ${90 + 70 * Math.sin(a1)} Z" fill="${PAL[k % 4]}" opacity="${0.6 + 0.4 * ((k + 1) % 2)}" stroke="#fff"/>`;
        a0 = a1;
      });
      return `<figure class="bjt-fig chart-fig"><figcaption lang="ja">${esc(v.title || '')}</figcaption><svg viewBox="0 0 180 180" class="pie" role="img" aria-label="${esc(v.title || '')}">${g}</svg><div class="legend" lang="ja">${v.labels.map((l, k) => `<span><i style="background:${PAL[k % 4]};opacity:${0.6 + 0.4 * ((k + 1) % 2)}"></i>${esc(l)} ${esc(v.values[k])}${v.unit ? esc(v.unit) : ''}</span>`).join('')}</div></figure>`;
    }

    /* ============================================================
       AUDIO
       ============================================================ */
    const SPK = { N: 'Narrator', M1: 'Man', M2: 'Man 2', F1: 'Woman', F2: 'Woman 2' };
    // Speed rises with item difficulty and in the exam-practice phases, from the learner's own base speed.
    function rateFor(q) {
      const base = E().state.settings.voiceRate || 1;
      const ph = BJ.dayInfo(E().today()).phase;
      return Math.min(1.35, base * ({ 1: 0.9, 2: 0.95, 3: 1, 4: 1.05, 5: 1.1 }[q.difficulty] || 1) * (ph && ph.id >= 4 ? 1.05 : 1));
    }
    function scriptFor(q, withOptions) {
      const lines = (q.audio.lines || []).slice();
      lines.push({ spk: 'N', text: q.audio.question });
      if (withOptions) q.options.forEach((o, k) => lines.push({ spk: 'N', text: (k + 1) + '。' + o }));
      return lines;
    }
    let player = null;
    function stopAudio() { if (player) { player.stop(); player = null; } SP.stop(); V.ui.playing = false; }
    function play(c, q, what) {
      const s = E().bjt.session;
      const limit = s && s.exam ? s.plays : Infinity;
      if (what !== 'options' && (c.plays || 0) >= limit) { toast('Mock rule: this audio can be played ' + limit + ' time' + (limit > 1 ? 's' : '') + '.'); return; }
      stopAudio();
      const spoken = BJ.SECTIONS[q.section].spokenOptions;
      // Spoken options are read with the question, in the shuffled display order.
      const qq = Object.assign({}, q, { options: c.perm.map(k => q.options[k]) });
      const lines = what === 'options' ? qq.options.map((o, k) => ({ spk: 'N', text: (k + 1) + '。' + o })) : scriptFor(qq, spoken);
      const st = E().state.settings;
      player = SP.speakLines(lines, {
        uri: st.voiceURI, rate: rateFor(q),
        onLine: k => { const el = document.getElementById('bjt-aline'); if (el) el.textContent = (lines[k].spk === 'N' ? (k >= lines.length - (spoken ? 4 : 0) && spoken && what !== 'options' ? 'Options' : 'Narrator') : SPK[lines[k].spk] || '') + ' · ' + (k + 1) + '/' + lines.length; },
        onend: () => { player = null; V.ui.playing = false; if (what !== 'options') { E().bjt.audioEnded(); V.ui.heard = true; } refreshAudio(); }
      });
      if (!player) { toast(SP.status(st.voiceURI).reason || 'Audio unavailable'); return; }
      if (what !== 'options') { c.plays = (c.plays || 0) + 1; E().bjt.save(); }
      V.ui.playing = true; refreshAudio();
    }
    function refreshAudio() { const box = document.getElementById('bjt-audio'); const c = E().bjt.current(); if (box && c && c.type === 'q') box.outerHTML = audioPanel(c, E().bjt.q(c.qid)); else H.rerenderKeep(); }
    function audioPanel(c, q) {
      const s = E().bjt.session;
      const limit = s.exam ? s.plays : null, used = c.plays || 0;
      const left = limit == null ? null : Math.max(0, limit - used);
      const cast = SP.cast(E().state.settings.voiceURI);
      const voices = cast ? (cast.distinct >= 3 ? '' : cast.genderVoices.male && cast.genderVoices.female ? '' : '<span class="small muted"> · one voice on this device: speakers differ by pitch</span>') : '';
      return `<div class="bjt-audio" id="bjt-audio">
        ${V.ui.playing ? `<button type="button" class="btn primary" data-action="bjt-stop">■ Stop</button><span class="aline" id="bjt-aline" aria-live="polite">Playing…</span>`
          : `<button type="button" class="btn primary" data-action="bjt-play" ${left === 0 ? 'disabled' : ''}>▶ ${used ? 'Play again' : 'Play audio'}</button>`}
        ${!s.exam && BJ.SECTIONS[q.section].spokenOptions && used && !V.ui.playing && !c._answered ? btn('Options only', 'bjt-play-opts', 'ghost small') : ''}
        <span class="small muted">${limit != null ? `${left} play${left === 1 ? '' : 's'} left (mock rule)` : used ? `played ${used}×` : 'replay allowed in practice'} · ${rateFor(q).toFixed(2)}×${voices}</span></div>`;
    }

    /* ============================================================
       DASHBOARD
       ============================================================ */
    const STATUS_TXT = { 'on-track': 'On track', borderline: 'Borderline', 'not-yet': 'Not yet', insufficient: 'Insufficient data' };
    const STATUS_CLS = { 'on-track': 'done', borderline: 'rec', 'not-yet': 'warn', insufficient: '' };
    function renderDash() {
      const e = E();
      if (!e.bjt.ready()) return `${topbar('BJT', null, settingsBtn())}<p class="banner warn">The BJT question bank could not be loaded.</p>`;
      const D = e.bjt.dashboard(), info = D.info, day = D.day;
      const s = e.bjt.session, resum = s && !s.finished;
      const budgets = [20, 30, 45, 60, 90, 120];
      const head = info.state === 'before' ? `Starts <b>${fmt(BJ.PLAN.start)}</b> (in ${info.daysToStart} day${info.daysToStart > 1 ? 's' : ''}). You can take the diagnostic now.`
        : info.state === 'after' ? `The 36-day programme ended on ${fmt(BJ.PLAN.end)}. Practice and reports remain available.`
          : `Day <b>${info.dayNo}</b> of ${info.total} · <b>${info.daysLeft}</b> day${info.daysLeft === 1 ? '' : 's'} left · Phase ${info.phase.id}: ${esc(info.phase.name)}${info.light ? ' · lighter day' : ''}`;
      return `${topbar('BJT Training', null, settingsBtn())}
        <section class="bjt-target"><div class="bjt-goal"><span class="big-n">400+</span><span>target by ${fmt(BJ.PLAN.end)} 2026</span></div><p>${head}</p></section>
        ${resum ? `<div class="banner">Unfinished: ${esc(s.label)} (${s.i}/${s.queue.length}). ${btn('Resume', 'bjt-resume', 'primary small')} ${s.exam ? '' : btn('Discard', 'bjt-discard', 'ghost small')}</div>` : ''}
        ${!audioOk() ? `<div class="banner warn">🔇 ${esc(SP.status(e.state.settings.voiceURI).reason || 'No Japanese voice.')} Listening is two-thirds of the BJT: install an on-device Japanese voice (<a href="#" data-action="go" data-view="settings">Settings → Voice</a>). Until then, listening questions can only be read as transcripts and don’t count as listening practice, and mock exams are unavailable.</div>` : ''}
        <h3>Today</h3>
        <div class="chip-row scroll" role="group" aria-label="Time available today">${budgets.map(b => `<button type="button" class="chip ${e.bjt.budget() === b ? 'on' : ''}" data-action="bjt-budget" data-v="${b}">${b} min</button>`).join('')}</div>
        <ul class="plain bjt-tasks">${day.tasks.map(t => taskRow(t, D)).join('')}</ul>
        <p class="hint">Core tasks fit the time you chose; optional ones are extra. Missed practice isn’t piled onto later days — each day is planned from your current weaknesses. Assessments and mocks carry forward until done.</p>
        <div class="row">${btn('36-day plan', 'go', 'ghost small', 'data-view="bjtplan"')}${btn('About the BJT & scoring', 'go', 'ghost small', 'data-view="bjtabout"')}</div>
        ${readinessBlock(D)}
        ${sectionsBlock(D)}
        ${weakBlock(D)}
        ${vocabBlock(D)}
        ${historyBlock(D)}
        <h3>Training modes</h3>
        <div class="bjt-modes">${modeBtn('listening', '聴', 'Listening', 'Part I · scene, utterance, conversations')}${modeBtn('listenread', '聴読', 'Listening & reading', 'Part II · charts, schedules, documents')}${modeBtn('reading', '読', 'Reading', 'Part III · vocabulary, expression, texts')}${modeBtn('vocab', '語', 'Vocabulary', 'Business words & expressions')}${modeBtn('keigo', '敬', 'Keigo & workplace', 'Register, keigo, uchi/soto')}${modeBtn('timed', '⏱', 'Timed mixed', '15 questions against the clock')}${modeBtn('mock', '模', 'Mock exam', '80 questions · 3 parts')}${modeBtn('review', '復', 'Mistake review', D.reviewDue ? D.reviewDue + ' due' : 'nothing due')}</div>`;
    }
    function taskRow(t, D) {
      const st = D.status(t), rec = D.rec && D.rec.id === t.id;
      const pill = st === 'done' ? '<span class="pill done">✓ Done</span>' : st === 'started' ? '<span class="pill">Started</span>' : rec ? '<span class="pill rec">Next</span>' : t.core ? '' : '<span class="pill locked">Optional</span>';
      return `<li><button type="button" class="act bjt-task ${rec ? 'rec' : ''} ${st === 'done' ? 'done' : ''} ${t.milestone ? 'milestone' : ''}" data-action="bjt-task" data-id="${esc(t.id)}">
        <span class="act-head"><span class="act-title">${esc(t.label)}${t.overdue ? ' <span class="pill warn">overdue</span>' : ''}</span>${pill}</span>
        <span class="act-sub">~${t.est} min · ${esc(t.why)}</span></button></li>`;
    }
    const modeBtn = (k, g, title, sub) => `<button type="button" class="act bjt-mode" data-action="bjt-mode" data-kind="${k}"><span class="act-title"><span class="mg" lang="ja">${g}</span> ${title}</span><span class="act-sub">${sub}</span></button>`;
    function readinessBlock(D) {
      const r = D.readiness;
      const row = p => { const x = r.parts[p]; return `<li><div class="rp-head"><b>${['', 'I', 'II', 'III'][p]} · ${BJ.PARTS[p].en}</b><span class="pill ${STATUS_CLS[x.status]}">${STATUS_TXT[x.status]}</span></div><div class="small">${x.n} first-time answer${x.n === 1 ? '' : 's'} · raw accuracy ${x.acc.n ? P100(x.acc.raw) : '—'}${x.status === 'insufficient' ? '' : ` · est. success on target-band items <b>${P100(x.pTarget)}</b> <span class="muted">(${P100(x.lo)}–${P100(x.hi)})</span>`}</div></li>`; };
      return `<h3>Am I on track for 400+?</h3>
        <div class="bjt-ready"><div class="ready-head"><span class="pill big ${STATUS_CLS[r.overall]}">${STATUS_TXT[r.overall]}</span><span class="small muted">practice indicator — not a BJT score</span></div>
        <ul class="plain bjt-parts">${[1, 2, 3].map(row).join('')}</ul>
        <p class="small">${r.timedN ? `Accuracy under time pressure: <b>${P100(r.timedAcc)}</b> (${r.timedN} timed answers).` : 'No timed answers yet.'}</p>
        <details><summary>How this is worked out (and what it is not)</summary><ul class="small">${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}<li>“On track” needs about ${Math.round(BJ.POLICY.targetP * 100)}% predicted success on target-band questions in every part (the range in brackets is a 90% interval). This threshold is an assumption of this app, not an official conversion.</li><li>400 lies in band J3 (320–419): “able to achieve some degree of communication in Japanese in a limited range of business situations”. J2 starts at 420.</li></ul></details></div>`;
    }
    function bar(x) { return x == null ? '<span class="muted">—</span>' : `<span class="mbar" aria-hidden="true"><i style="width:${Math.round(x * 100)}%"></i></span> ${P100(x)}`; }
    function sectionsBlock(D) {
      const pr = D.profile;
      const any = BJ.SECTION_ORDER.some(s => pr.sections[s].n);
      if (!any) return `<h3>By section</h3><p class="muted">No answers yet — the diagnostic fills this in.</p>`;
      return `<h3>By section <small class="muted">(last 3 weeks, recent answers weigh more)</small></h3>
        <div class="table-wrap"><table class="conj bjt-stable"><tbody>${BJ.SECTION_ORDER.map(s => { const a = pr.sections[s]; return `<tr><th><span lang="ja">${BJ.SECTIONS[s].jp}</span><br><small class="muted">${['', 'I', 'II', 'III'][BJ.SECTIONS[s].part]} · ${esc(BJ.SECTIONS[s].en)}</small></th><td>${a.n ? bar(a.recent) : '<span class="muted">—</span>'}</td><td class="muted">${a.n ? a.correct + '/' + a.n : ''}</td></tr>`; }).join('')}</tbody></table></div>
        <h3>By skill</h3><div class="table-wrap"><table class="conj bjt-stable"><tbody>${Object.entries(BJ.CATEGORIES).map(([k, c]) => { const a = pr.cats[k]; return `<tr><th>${esc(c.en)}</th><td>${a.n ? bar(a.recent) : '<span class="muted">—</span>'}</td><td class="muted">${a.n ? a.correct + '/' + a.n : ''}</td></tr>`; }).join('')}<tr><th>Business vocabulary (word trainer)</th><td>${D.vocab.retention.n ? bar(D.vocab.retention.rate) : '<span class="muted">—</span>'}</td><td class="muted">${D.vocab.retention.n ? 'retention, ' + D.vocab.retention.n + ' reviews' : ''}</td></tr></tbody></table></div>`;
    }
    function weakBlock(D) {
      const pr = D.profile;
      const pats = pr.patterns.slice(0, 4), ws = pr.weakSections.slice(0, 3);
      if (!pats.length && !ws.length) return `<h3>Weaknesses</h3><p class="muted">${pr.partAcc[1].n + pr.partAcc[2].n + pr.partAcc[3].n < 10 ? 'Not enough answers yet to identify patterns.' : 'No recurring weakness right now.'}</p>`;
      return `<h3>Weaknesses that need attention</h3><ul class="plain bjt-weak">
        ${ws.map(s => `<li>📉 <b lang="ja">${BJ.SECTIONS[s].jp}</b> ${esc(BJ.SECTIONS[s].en)} — ${P100(pr.sections[s].recent)} recently</li>`).join('')}
        ${pats.map(p => `<li>⚠ <b>${esc(p.label)}</b> — ${p.errors} mistake${p.errors > 1 ? 's' : ''} of this kind (${P100(p.rate)} of chances) · practice now favours questions that test it</li>`).join('')}</ul>`;
    }
    function vocabBlock(D) {
      const v = D.vocab;
      return `<h3>Vocabulary & expressions</h3><div class="stat-grid three"><div class="stat"><b>${v.introduced}/${v.total}</b><span>met</span></div><div class="stat"><b>${v.strong}</b><span>stable ≥ 1 week</span></div><div class="stat"><b>${v.retention.n ? P100(v.retention.rate) : '—'}</b><span>recall after ≥1 day</span><small>${v.due} due</small></div></div>`;
    }
    function historyBlock(D) {
      const ss = E().state.bjt.sessions.slice(-6).reverse();
      const mocks = D.mocks;
      return `<h3>Recent sessions</h3>${ss.length ? `<ul class="plain bjt-hist">${ss.map(x => `<li><span>${esc(x.label)}</span><span class="muted">${fmt(x.date)}</span><span>${x.answered ? x.correct + '/' + x.answered + ' · ' + pct(x.correct, x.answered) + '%' : x.vocab.n ? 'words ' + x.vocab.ok + '/' + x.vocab.n : '—'}${x.endedEarly ? ' <small class="muted">(stopped early)</small>' : ''}</span></li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}
        <h3>Practice-test history</h3>${mocks.length ? `<ul class="plain bjt-hist">${mocks.map(m => `<li><button type="button" class="link" data-action="bjt-mockrep" data-id="${esc(m.id)}">${esc(m.label)}</button><span class="muted">${fmt(m.date)}${m.split ? ' · split' : ''}</span><span>${m.correct}/${m.total} raw · ${[1, 2, 3].map(p => m.byPart[p] ? ['', 'I', 'II', 'III'][p] + ' ' + pct(m.byPart[p].ok, m.byPart[p].n) + '%' : '').filter(Boolean).join(' · ')}</span></li>`).join('')}</ul><p class="small muted">Raw percentages of correct answers on this app’s questions. They are not BJT scores.</p>` : '<p class="muted">No mock or timed assessment yet.</p>'}`;
    }

    /* ============================================================
       SESSION RUNNER
       ============================================================ */
    function renderRun() {
      const e = E(), s = e.bjt.session, c = e.bjt.current();
      if (!s) return `${topbar('BJT', 'bjt-home')}<p>No session running.</p>`;
      if (!c) { finishRun(); return renderSum(); }
      const u = V.ui;
      // Exam: between parts, an interstitial (split mode allows a break here).
      if (s.exam && s.i > 0 && s.queue[s.i - 1].part !== c.part && !u.partGo && !(s.parts.find(p => p.part === c.part).startedAt)) {
        return `${topbar(s.label, null)}<section class="prompt"><div class="tag">Part ${['', 'I', 'II', 'III'][c.part]} next</div><h2 lang="ja">第${c.part}部 ${BJ.PARTS[c.part].jp}</h2><p>${BJ.PARTS[c.part].en} · ${s.queue.filter(x => x.part === c.part).length} questions · ${Math.round(s.parts.find(p => p.part === c.part).limitSec / 60)} minutes. The clock starts when you continue.</p>
          <div class="row">${btn('Start Part ' + ['', 'I', 'II', 'III'][c.part], 'bjt-partgo', 'primary', 'data-autofocus')}${s.split ? btn('Take a break — continue later', 'bjt-shelve', 'ghost') : ''}</div></section>`;
      }
      const head = s.exam ? `<div class="bjt-clock"><span>Part ${['', 'I', 'II', 'III'][c.part]} · Q${s.i + 1}/${s.queue.length}</span><span id="bjt-timer" class="timer" aria-live="off"></span></div>`
        : s.timed ? `<div class="bjt-clock"><span>${s.i + 1}/${s.queue.length}</span><span id="bjt-timer" class="timer"></span></div>`
          : `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${s.queue.length}" aria-valuenow="${s.i}"><div style="width:${pct(s.i, s.queue.length)}%"></div></div>`;
      const right = `<button type="button" class="icon-btn" data-action="bjt-end">${s.exam ? 'Stop' : 'Finish'}</button>`;
      return `${topbar(s.label, null, right)}${head}<section class="card-stage">${c.type === 'q' ? qCard(c, e.bjt.q(c.qid), s, u) : vCard(c, s, u)}</section>`;
    }
    function qCard(c, q, s, u) {
      const sec = BJ.SECTIONS[q.section];
      const res = c._answered && c._answered.result;
      const listening = q.part < 3;
      const noAudio = listening && !audioOk();
      const showText = !!res || u.assist || u.transcript;
      const spoken = sec.spokenOptions;
      let h = `<div class="tag">${['', 'Part I', 'Part II', 'Part III'][q.part]} · <span lang="ja">${sec.jp}</span> · ${esc(sec.en)}${s.exam ? '' : ' · level ' + q.difficulty}</div>`;
      if (q.visual) h += visual(q.visual);
      if (listening) {
        if (noAudio && !res) h += `<div class="banner warn">No Japanese voice on this device, so this can't be practised as listening. ${s.exam ? '' : btn('Read the transcript instead', 'bjt-transcript', 'ghost small')}<br><small>Answers given from the transcript count as reading, not listening.</small></div>`;
        else if (!res) h += audioPanel(c, q);
        if (u.transcript && !res) h += transcriptBlock(q, null);
      }
      if (q.passage) h += `<div class="prompt bjt-passage" lang="ja">${esc(q.passage).replace(/\n/g, '<br>').replace(/＿+/g, m => `<span class="blank">${m}</span>`)}</div>`;
      if (!listening || showText) h += `<p class="q bjt-stem" lang="ja">${esc(q.stem)}</p>`;
      else h += `<p class="q muted">${spoken ? 'Listen to the question and the four options, then choose a number.' : 'Listen, then choose.'}${!s.exam && !res ? ` <button type="button" class="link" data-action="bjt-assist">Show the ${spoken ? 'question and options' : 'question'} as text</button><small class="muted"> (counts as assisted)</small>` : ''}</p>`;
      // Options
      const pick = u.pick;
      const opt = (k) => {
        const orig = c.perm[k], txt = q.options[orig];
        const hide = spoken && !showText && !res;
        const cls = res && !s.exam ? (k === c.correct ? 'correct' : k === res.chose ? 'incorrect' : '') : pick === k ? 'picked' : '';
        return `<button type="button" class="choice bjt-choice ${cls}" data-action="bjt-choose" data-k="${k}" ${res ? 'disabled' : ''} lang="ja"><span class="onum">${k + 1}</span>${hide ? '' : `<span class="otxt">${esc(txt)}</span>`}</button>`;
      };
      h += `<div class="choices ${spoken && !showText && !res ? 'numgrid' : 'bjt-opts'}">${[0, 1, 2, 3].map(opt).join('')}</div>`;
      if (!res) {
        h += `<div class="row bjt-actions"><button type="button" class="chip ${u.unc ? 'on' : ''}" data-action="bjt-unc" aria-pressed="${!!u.unc}">${u.unc ? '✓ ' : ''}Not sure — review later</button>${s.exam ? btn('Next →', 'bjt-commit', 'primary', pick == null ? 'disabled' : '') : `<button type="button" class="choice dk small-dk" data-action="bjt-dk">I don’t know</button>`}</div>`;
      } else if (s.exam) {
        h += `<div class="row">${btn('Next →', 'bjt-next', 'primary', 'data-autofocus')}</div>`;
      } else h += feedback(c, q, res);
      return h;
    }
    function transcriptBlock(q, ev) {
      const mark = t => ev && t.includes(ev) ? esc(t).replace(esc(ev), `<mark>${esc(ev)}</mark>`) : esc(t);
      return `<div class="bjt-transcript" lang="ja"><div class="small muted">Transcript</div>${q.audio.lines.map(l => `<p><b>${l.spk === 'N' ? '' : esc(SPK[l.spk]) + '：'}</b>${mark(l.text)}</p>`).join('')}<p class="muted">${esc(q.audio.question)}</p></div>`;
    }
    // Full teaching feedback (also used in the mock review).
    function feedback(c, q, res) {
      const ok = res.ok;
      const chosenOrig = res.origChose != null ? res.origChose : (res.chose != null ? c.perm[res.chose] : null);
      const pr = E().bjt.dashboard().profile;
      const pat = !ok && res.trap ? pr.patterns.find(p => p.trap === res.trap) : null;
      const sec = BJ.SECTIONS[q.section];
      return `<div class="feedback ${ok ? 'good' : 'bad'}" role="status">
        <div class="fb-head">${ok ? '✓ Correct' : chosenOrig == null ? '— Not answered' : '✗ Not correct'}</div>
        <p>Answer: <b>${c.correct + 1}</b> <span lang="ja">${esc(q.options[q.answer])}</span></p>
        <p>${esc(q.explanation)}</p>
        ${q.audio ? transcriptBlock(q, q.evidence) : `<p class="small">Key words: <mark lang="ja">${esc(q.evidence)}</mark></p>`}
        <details ${ok ? '' : 'open'}><summary>Why the other options are wrong</summary><ol class="bjt-why">${[0, 1, 2, 3].map(k => { const o = c.perm[k]; return `<li class="${o === q.answer ? 'ok' : o === chosenOrig ? 'chosen' : ''}"><span lang="ja">${esc(q.options[o])}</span>${o === q.answer ? ' ✓' : `<br><small>${esc(q.whyWrong[o])}${q.traps[o] ? ` <span class="pill">${esc(BJ.TRAPS[q.traps[o]])}</span>` : ''}</small>`}</li>`; }).join('')}</ol></details>
        ${q.vocab && q.vocab.length ? `<div class="bjt-vocab">${q.vocab.map(v => `<span class="chip static" lang="ja">${esc(v.jp)} <small>${esc(v.kana)}</small> <small class="muted">${esc(v.en)}</small></span>`).join(' ')}</div>` : ''}
        ${q.nuance ? `<p class="small note">💡 ${esc(q.nuance)}</p>` : ''}
        <p class="small muted">Tests: ${esc(sec.en)} · ${q.skills.map(k => esc(k)).join(', ')}${!ok && res.trap ? ` · your choice: <b>${esc(BJ.TRAPS[res.trap])}</b>${pat && pat.errors >= 2 ? ` — a recurring pattern (${pat.errors}×); upcoming practice will include more of it` : ''}` : ''}${!ok ? ' · added to mistake review' : ''} · <span class="src">id ${esc(q.id)} · original practice item</span></p>
        ${H.V.view === 'bjtrun' ? `<div class="row">${btn('Continue →', 'bjt-next', 'primary', 'data-autofocus')}</div>` : ''}</div>`;
    }
    function vCard(c, s, u) {
      const v = E().bjt.v(c.vid); if (!v) return '';
      const say = (t) => audioOk() ? `<button type="button" class="btn ghost audio" data-action="say" data-say="${esc(t)}" aria-label="Play">🔊</button>` : '';
      if (c.type === 'vteach') return `<div class="prompt teach"><div class="tag">New · ${esc(v.cat)}${v.register && v.register !== 'neutral' ? ' · ' + esc(v.register) : ''}</div>
        <div class="big-jp" lang="ja">${esc(v.jp)}</div><div class="kana" lang="ja">${esc(v.kana)}</div><div class="meaning">${esc(v.en)}</div>${say(v.jp)}
        ${v.note ? `<p class="when">${esc(v.note)}</p>` : ''}${v.example ? `<div class="ex"><span lang="ja">${esc(v.example.jp)}</span> ${say(v.example.jp)}<br><small>${esc(v.example.en)}${v.example.constructed ? ' <span class="muted">(constructed example)</span>' : ''}</small></div>` : ''}
        <p class="src">Source: ${(v.sources || []).map(x => esc(x.name || x.type || '')).filter(Boolean).join(' · ')}</p></div><div class="row">${btn('Got it →', 'bjt-ack', 'primary', 'data-autofocus')}</div>`;
      const res = c._answered && c._answered.result;
      let q;
      if (c.type === 'vmean') q = `<p class="q">What does this mean?</p><div class="big-jp" lang="ja">${esc(v.jp)}</div>`;
      else if (c.type === 'vjp') q = `<p class="q">Which Japanese expression means…</p><div class="big-en">${esc(v.en)}</div>${v.note ? `<p class="small muted">${esc(v.note.split('.')[0])}.</p>` : ''}`;
      else q = `<p class="q">Listen. What does it mean?</p>${audioOk() ? `<button type="button" class="btn primary" data-action="say" data-say="${esc(v.jp)}">▶ Play</button>` : ''}`;
      const opts = c.options.map((o, k) => `<button type="button" class="choice ${res ? (k === c.correct ? 'correct' : k === res.chose ? 'incorrect' : '') : ''}" data-action="bjt-vchoose" data-k="${k}" ${res ? 'disabled' : ''} ${c.type === 'vjp' ? 'lang="ja"' : ''}>${esc(o)}</button>`).join('');
      const fb = res ? `<div class="feedback ${res.ok ? 'good' : 'bad'}" role="status"><div class="fb-head">${res.ok ? '✓ Correct' : '✗ Not quite'}</div><div class="answer-jp" lang="ja">${esc(v.jp)}</div><div class="answer-kana" lang="ja">${esc(v.kana)} — ${esc(v.en)}</div>${v.note ? `<p class="small">${esc(v.note)}</p>` : ''}${v.example ? `<p class="small" lang="ja">${esc(v.example.jp)}<br><span class="muted">${esc(v.example.en)}</span></p>` : ''}<div class="row">${say(v.jp)}${btn('Continue →', 'bjt-next', 'primary', 'data-autofocus')}</div></div>` : '';
      return `<div class="prompt">${q}</div><div class="choices">${opts}${res ? '' : '<button type="button" class="choice dk" data-action="bjt-vdk">I don’t know</button>'}</div>${fb}`;
    }

    /* ---------- clocks: exam part time, timed-question countdown ---------- */
    let clock = null;
    function startClock() {
      if (clock) return;
      clock = setInterval(() => {
        const e = E(); const s = e.bjt.session;
        if (V.view !== 'bjtrun' || !s || s.finished) { clearInterval(clock); clock = null; return; }
        const el = document.getElementById('bjt-timer');
        if (s.exam) {
          const c = e.bjt.current();
          const pt = c && s.parts.find(p => p.part === c.part);
          if (!pt || !pt.startedAt && !V.ui.partGo && s.i > 0 && s.queue[s.i - 1].part !== c.part) return;   // interstitial
          const before = s.i;
          const t = e.bjt.tick();
          if (s.i !== before || (t && t.expired)) { stopAudio(); V.ui = {}; toast('Time is up for this part.'); render(); return; }
          if (el && t) { el.textContent = '⏱ ' + mmss(t.leftSec); el.classList.toggle('low', t.leftSec < 120); }
        } else if (s.timed) {
          const c = e.bjt.current(); if (!c || c._answered) { if (el) el.textContent = ''; return; }
          if (c.type !== 'q') return;
          const q = e.bjt.q(c.qid);
          if (q.part < 3 && !s.answerFrom) { if (el) el.textContent = 'listen…'; return; }
          const left = Math.round(BJ.SECTIONS[q.section].sec - (Date.now() - (s.answerFrom || s.shownAt)) / 1000);
          if (el) { el.textContent = '⏱ ' + mmss(Math.max(0, left)); el.classList.toggle('low', left < 10); }
          if (left <= 0) { stopAudio(); const out = e.bjt.answer({ skip: true }); V.ui.res = out && out.result; toast('Time’s up — counted as unanswered.'); H.rerenderKeep(); }
        }
      }, 1000);
    }
    const mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    document.addEventListener('visibilitychange', () => {
      const e = E(); if (!e || !e.bjt || !e.bjt.session || !e.bjt.session.exam) return;
      if (document.hidden) { stopAudio(); e.bjt.pause(); } else e.bjt.resumeClock();
    });

    function finishRun() { stopAudio(); const sum = E().bjt.finish(); V.view = 'bjtsum'; V.p = { sum, sid: sum && sum.id }; V.ui = {}; }

    /* ============================================================
       SUMMARY / MOCK REPORT / REVIEW
       ============================================================ */
    function renderSum() {
      const e = E();
      const sum = V.p.sum || (e.bjt.session && e.bjt.session.summary);
      if (!sum) return `${topbar('BJT', 'bjt-home')}<p>Nothing to show.</p>`;
      const rows = e.state.bjt.responses.filter(r => r.sid === sum.id);
      const total = sum.exam ? rows.length : sum.answered;
      const partRows = [1, 2, 3].filter(p => sum.byPart[p]).map(p => `<tr><th>${['', 'I', 'II', 'III'][p]} ${BJ.PARTS[p].en}</th><td>${sum.byPart[p].ok}/${sum.byPart[p].n}</td><td>${pct(sum.byPart[p].ok, sum.byPart[p].n)}%</td>${sum.parts ? `<td>${(() => { const x = sum.parts.find(y => y.part === p); return x ? mmss(x.usedSec) + ' / ' + mmss(x.limitSec) + (x.expired ? ' ⏱' : '') : ''; })()}</td>` : ''}</tr>`).join('');
      const secRows = BJ.SECTION_ORDER.filter(s => sum.bySec[s]).map(s => `<tr><th><span lang="ja">${BJ.SECTIONS[s].jp}</span> <small class="muted">${esc(BJ.SECTIONS[s].en)}</small></th><td>${sum.bySec[s].ok}/${sum.bySec[s].n}</td></tr>`).join('');
      const review = rows.filter(r => !r.ok || r.unc);
      const traps = Object.entries(sum.traps).sort((a, b) => b[1] - a[1]);
      return `${topbar(sum.label + ' — done', 'bjt-home')}<section class="summary">
        ${sum.answered ? `<div class="stat-row"><div><b>${sum.correct}/${total}</b><span>correct (raw)</span></div><div><b>${pct(sum.correct, total)}%</b><span>raw accuracy</span></div><div><b>${sum.uncertain}</b><span>marked unsure</span></div></div>` : ''}
        ${sum.vocab.n ? `<p>Vocabulary: ${sum.vocab.ok}/${sum.vocab.n} correct.</p>` : ''}
        ${sum.exam ? `<p class="banner">Raw accuracy on this app’s original questions — <b>not a BJT score</b>. The official score is IRT-scaled; see “About the BJT & scoring”.${sum.seenBefore ? ` ${sum.seenBefore} question${sum.seenBefore > 1 ? 's were' : ' was'} seen before in practice, which can inflate the result.` : ''}${sum.interruptions ? ` The attempt was interrupted ${sum.interruptions}×.` : ''}${sum.notReached ? ` ${sum.notReached} question${sum.notReached > 1 ? 's' : ''} not reached before time ran out (counted wrong).` : ''}</p>` : ''}
        ${partRows ? `<div class="table-wrap"><table class="conj"><thead><tr><th>Part</th><th>Correct</th><th>%</th>${sum.parts ? '<th>Time</th>' : ''}</tr></thead><tbody>${partRows}</tbody></table></div>` : ''}
        ${secRows ? `<details ${sum.exam ? 'open' : ''}><summary>By section</summary><div class="table-wrap"><table class="conj"><tbody>${secRows}</tbody></table></div></details>` : ''}
        ${traps.length ? `<h3>Error patterns in this session</h3><ul class="plain">${traps.map(([t, n]) => `<li>${esc(BJ.TRAPS[t])} — ${n}×</li>`).join('')}</ul>` : ''}
        ${sum.exam && review.length ? `<h3>Review: incorrect and unsure (${review.length})</h3>${review.map(r => reviewItem(r)).join('')}` : ''}
        <p class="muted">${sum.answered ? 'Mistakes and “not sure” answers come back in Mistake review on later days.' : ''}</p></section>
        <div class="row">${btn('Back to BJT', 'bjt-home', 'primary', 'data-autofocus')}</div>`;
    }
    function reviewItem(r) {
      const q = E().bjt.q(r.q); if (!q) return '';
      const c = { perm: [0, 1, 2, 3], correct: q.answer };
      const res = { ok: r.ok, chose: r.chose, origChose: r.chose, trap: r.trap };
      return `<details class="bjt-rev"><summary><span class="pill ${r.ok ? '' : 'warn'}">${r.ok ? 'unsure' : r.nr ? 'not reached' : r.skip ? 'timed out' : 'wrong'}</span>&nbsp;<span lang="ja">${esc(BJ.SECTIONS[q.section].jp)}</span>&nbsp;<span class="muted small">${esc(q.stem.slice(0, 30))}</span></summary>${q.visual ? visual(q.visual) : ''}${q.passage ? `<div class="prompt bjt-passage" lang="ja">${esc(q.passage).replace(/\n/g, '<br>')}</div>` : ''}<p class="q" lang="ja">${esc(q.stem)}</p><ol class="bjt-why plain-num">${q.options.map(o => `<li lang="ja">${esc(o)}</li>`).join('')}</ol>${feedback(c, q, res)}</details>`;
    }
    function renderMockRep() {
      const m = E().state.bjt.mocks.find(x => x.id === V.p.id);
      if (!m) return `${topbar('Mock', 'bjt-home')}<p>Not found.</p>`;
      V.p.sum = Object.assign({ kind: m.kind, label: m.label, uncertain: E().state.bjt.responses.filter(r => r.sid === m.id && r.unc).length, vocab: { n: 0 }, exam: true, traps: {}, notReached: E().state.bjt.responses.filter(r => r.sid === m.id && r.nr).length }, m);
      for (const r of E().state.bjt.responses.filter(r => r.sid === m.id && r.trap)) V.p.sum.traps[r.trap] = (V.p.sum.traps[r.trap] || 0) + 1;
      return renderSum();
    }

    /* ============================================================
       MOCK SETUP · PLAN · ABOUT
       ============================================================ */
    function renderMock() {
      const e = E(), st = e.bjt.st();
      const t = V.p.taskId ? e.bjt.findTask(V.p.taskId) : null;
      return `${topbar(t ? t.label : 'Mock exam', 'bjt-home')}
        <p class="lead">80 original BJT-style questions in the official three-part structure: Part I listening (25, 45 min), Part II listening & reading (25, 30 min), Part III reading (30, 30 min). No answers are shown until the end; then you review every wrong or unsure answer.</p>
        <ul class="small"><li>Each part has its own time limit. When it runs out, the rest of that part counts as unanswered.</li><li>The clock only runs while the app is open; interruptions are noted in the result.</li><li>Answers go forward only. Flag “not sure” to find a question again in the review.</li><li>Audio plays when you tap Play; you can play each recording <b>${st.prefs.mockPlays}</b> time${st.prefs.mockPlays > 1 ? 's' : ''}.</li></ul>
        <h3>Audio rule</h3><div class="chip-row">${[1, 2].map(n => `<button type="button" class="chip ${st.prefs.mockPlays === n ? 'on' : ''}" data-action="bjt-plays" data-v="${n}">${n === 1 ? 'Play once (strict)' : 'Up to twice'}</button>`).join('')}</div>
        <p class="small muted">The official pages don’t say how many times audio is played; “once” is the stricter practice setting.</p>
        ${!audioOk() ? '<p class="banner warn">A mock exam needs a Japanese voice on this device (Settings → Voice).</p>' : ''}
        <div class="row">${btn('Start — one sitting (~105 min)', 'bjt-mockgo', 'primary', (audioOk() ? '' : 'disabled ') + 'data-split="0"')}${btn('Start — one part per sitting', 'bjt-mockgo', 'ghost', (audioOk() ? '' : 'disabled ') + 'data-split="1"')}</div>`;
    }
    function renderPlan() {
      const e = E(), ov = e.bjt.overview(), st = e.bjt.st();
      const PH = BJ.PHASES;
      const cell = d => `<li class="pday ${d.status} ${d.light ? 'light' : ''}"><span class="pd">${fmt(d.date)}<small> · day ${d.dayNo}</small></span><span class="ps">${{ done: '✓ done', partial: '◐ partly', missed: '○ missed', practised: '✓ practised', today: '● today', upcoming: '' }[d.status]}${d.planned ? ` <small class="muted">${d.done}/${d.planned} core</small>` : ''}</span>${d.milestones.map(m => `<span class="pill ${m.done ? 'done' : ''}">${esc(m.label)}${m.done ? ' ✓' : ''}</span>`).join('')}${d.light ? '<span class="pill">lighter</span>' : ''}</li>`;
      return `${topbar('36-day plan', 'bjt-home')}<p class="lead">Mon 26 Oct → Mon 30 Nov 2026. Each day’s tasks are generated from your results on the day you open it, so the plan adapts as weaknesses change.</p>
        ${PH.map(p => `<h3>Phase ${p.id} · ${esc(p.name)} <small class="muted">${fmt(p.from)}${p.to !== p.from ? ' – ' + fmt(p.to) : ''}</small></h3><ul class="small">${p.goals.map(g => `<li>${esc(g)}</li>`).join('')}</ul><ul class="plain plan-days">${ov.filter(d => d.phase === p.id).map(cell).join('')}</ul>`).join('')}
        <details><summary>How missed days are handled</summary><p class="small">Missed practice blocks are not piled onto later days (that would just make the next day impossible). The next plan is built from your current weaknesses, so the most important work is already in it; the single most valuable missed block from the previous three days is offered as an optional catch-up. The diagnostic, the timed assessment and the mocks carry forward until done (each until the next one replaces it).</p></details>
        ${st.milestones.final || e.today() >= BJ.PLAN.end ? `<div class="row">${btn('Final readiness report', 'go', 'primary', 'data-view="bjtreport"')}</div>` : ''}`;
    }
    function renderReport() {
      const rep = E().bjt.report(), r = rep.readiness;
      return `${topbar('Readiness report', 'bjt-home')}
        <p class="banner"><b>${STATUS_TXT[r.overall]}</b> — ${esc(rep.recommendation)}</p>
        <p class="small muted">${r.notes.map(esc).join(' ')}</p>
        <h3>By part</h3><div class="table-wrap"><table class="conj"><thead><tr><th>Part</th><th>First-time answers</th><th>Raw accuracy</th><th>Est. on target band</th></tr></thead><tbody>${[1, 2, 3].map(p => `<tr><th>${BJ.PARTS[p].en}</th><td>${r.parts[p].n}</td><td>${P100(r.parts[p].acc.raw)}</td><td>${r.parts[p].status === 'insufficient' ? 'insufficient data' : P100(r.parts[p].pTarget) + ' (' + P100(r.parts[p].lo) + '–' + P100(r.parts[p].hi) + ')'}</td></tr>`).join('')}</tbody></table></div>
        <h3>Strengths</h3><p>${rep.strengths.length ? rep.strengths.map(s => esc(BJ.SECTIONS[s].en)).join(', ') : '<span class="muted">None clearly established yet.</span>'}</p>
        <h3>Weaknesses</h3><p>${rep.weak.length ? rep.weak.map(s => esc(BJ.SECTIONS[s].en)).join(', ') : '<span class="muted">None below the benchmark.</span>'}</p>
        ${rep.patterns.length ? `<ul class="plain">${rep.patterns.map(p => `<li>${esc(p.label)} — ${p.errors}×</li>`).join('')}</ul>` : ''}
        <h3>Raw accuracy by study day</h3>${rep.trend.length ? `<ul class="plain bjt-hist">${rep.trend.map(t => `<li><span>${fmt(t.date)}</span><span>${bar(t.acc)}</span><span class="muted">${t.n} q</span></li>`).join('')}</ul>` : '<p class="muted">No data.</p>'}
        <h3>Mocks</h3>${rep.mocks.length ? `<ul class="plain">${rep.mocks.map(m => `<li>${fmt(m.date)} · ${esc(m.label)} · ${m.correct}/${m.total} raw</li>`).join('')}</ul>` : '<p class="muted">None.</p>'}`;
    }
    function renderAbout() {
      const S = SRC || { sources: {}, facts: [], levels: [] };
      const link = k => S.sources[k] ? `<a href="${esc(S.sources[k].url || '#')}" target="_blank" rel="noopener">${esc(S.sources[k].name)}</a>` : '';
      return `${topbar('About the BJT', 'bjt-home')}
        <h3>The test</h3><div class="table-wrap"><table class="conj"><thead><tr><th>Part</th><th>Section</th><th>Qs</th></tr></thead><tbody>${BJ.SECTION_ORDER.map(s => `<tr><th>${['', 'I', 'II', 'III'][BJ.SECTIONS[s].part]} ${BJ.PARTS[BJ.SECTIONS[s].part].jp} (${BJ.PARTS[BJ.SECTIONS[s].part].minutes} min)</th><td><span lang="ja">${BJ.SECTIONS[s].jp}</span> · ${esc(BJ.SECTIONS[s].en)}</td><td>${BJ.SECTIONS[s].mock}</td></tr>`).join('')}</tbody></table></div>
        <p>80 four-option questions. About two-thirds of the test (Parts I and II) involves listening.</p>
        <h3>Scores</h3><p>The BJT reports a scaled score from 0 to 800, computed with Item Response Theory from the difficulty of each question. There is no pass/fail. 400 is a personal target, inside band J3.</p>
        <ul class="plain bjt-levels">${(S.levels || []).map(l => `<li class="${l.min <= 400 && l.max >= 400 ? 'here' : ''}"><b>${esc(l.band)}</b> ${l.min}–${l.max} · ${esc(l.en)}</li>`).join('')}</ul>
        <h3>What this page measures</h3><ul class="small"><li><b>Raw accuracy</b>: percentage correct on this app’s questions.</li><li><b>By section and over time</b>: the same, split up and dated.</li><li><b>Readiness indicator</b>: estimated success on questions the authors placed in the target band, with an uncertainty range. Shown only with enough first-time answers.</li><li><b>Never</b> a converted 0–800 score. Only the official test can give that.</li></ul>
        <h3>The practice questions</h3><p class="small">All questions are <b>original BJT-style practice</b> written for this app, modelled on the official samples’ formats and reasoning demands. None is an official BJT question. Difficulty levels are the authors’ judgement. Audio is generated by your device’s text-to-speech engine: it is not, and does not imitate, official exam audio.</p>
        <h3>Sources (checked ${esc(S.checked || '')})</h3><ul class="small">${(S.facts || []).map(f => `<li>${esc(f.fact)} <span class="src">— ${link(f.source) || esc(f.source)}</span></li>`).join('')}</ul>`;
    }

    /* ============================================================
       EVENTS
       ============================================================ */
    function startSpec(spec) {
      const e = E();
      if (e.bjt.session && !e.bjt.session.finished) { toast('Finish or discard the unfinished session first.'); go('bjt'); return; }
      const r = e.bjt.start(spec);
      if (r.error) { toast(r.error === 'nothing-due' ? 'No mistakes are due for review today.' : r.error === 'no-material' ? 'No suitable questions left for this mode.' : 'Can’t start: ' + r.error); return; }
      V.ui = {}; go('bjtrun'); startClock();
    }
    function handle(action, d) {
      const e = E();
      switch (action) {
        case 'bjt-home': stopAudio(); go('bjt'); return true;
        case 'bjt-budget': e.bjt.setBudget(+d.v); H.rerenderKeep(); return true;
        case 'bjt-task': {
          const t = e.bjt.findTask(d.id); if (!t) return true;
          if (e.bjt.dashboard().status(t) === 'done' && !confirm('Already done today. Do another round?')) return true;
          if (t.kind === 'mock') { go('bjtmock', { taskId: t.id }); return true; }
          if (['midcheck', 'final'].includes(t.kind) && !audioOk()) { toast('This timed assessment includes listening and needs a Japanese voice (Settings → Voice).'); return true; }
          if (t.done) return true;
          const st = e.bjt.st();
          if (st.done[t.id] && st.done[t.id].at) { startSpec(Object.assign(BJ.specForTask(e.BI, st, t, e.today()), { taskId: null })); return true; }
          startSpec(t.id); return true;
        }
        case 'bjt-mode': {
          const k = d.kind;
          if (k === 'mock') { go('bjtmock', {}); return true; }
          const spec = { kind: k, n: k === 'timed' ? 15 : 8, timed: k === 'timed' };
          if (k === 'timed') spec.weights = Object.fromEntries(BJ.SECTION_ORDER.map(s => [s, BJ.SECTIONS[s].mock]));
          startSpec(spec); return true;
        }
        case 'bjt-plays': e.bjt.st().prefs.mockPlays = +d.v; e.save(); H.rerenderKeep(); return true;
        case 'bjt-mockgo': {
          if (!audioOk()) return true;
          const t = V.p.taskId ? e.bjt.findTask(V.p.taskId) : null;
          const used = new Set(Object.keys(e.bjt.st().milestones));
          const ms = t ? t.milestone : null;
          startSpec({ kind: 'mock', split: d.split === '1', taskId: t ? t.id : null, milestone: ms && !used.has(ms) ? ms : null, label: t ? t.label : 'Mock exam' });
          return true;
        }
        case 'bjt-resume': V.ui = {}; if (e.bjt.session && e.bjt.session.exam) e.bjt.resumeClock(); go('bjtrun'); startClock(); return true;
        case 'bjt-discard': if (confirm('Discard this session? Answers already given stay recorded.')) { e.bjt.discard(); go('bjt'); } return true;
        case 'bjt-shelve': e.bjt.shelve(); stopAudio(); go('bjt'); toast('Saved. Resume from the BJT page; the clock is stopped.'); return true;
        case 'bjt-partgo': V.ui.partGo = true; e.bjt.resumeClock(); e.bjt.tick(); H.rerenderKeep(); return true;
        case 'bjt-end': {
          const s = e.bjt.session;
          if (!s || s.finished) { stopAudio(); go('bjt'); return true; }
          if (s.exam) {
            if (s.split && confirm('Save and continue this mock later? (OK = save for later, Cancel = more options)')) { e.bjt.shelve(); stopAudio(); go('bjt'); return true; }
            if (!confirm('End the mock now? Unanswered questions will count as wrong.')) return true;
            while (e.bjt.current()) { if (!e.bjt.current()._answered) e.bjt.answer({ skip: true }); e.bjt.next(); }
          } else if (s.i > 0 && !confirm('Finish now? Your answers are saved.')) return true;
          finishRun(); render(); return true;
        }
        case 'bjt-play': { const c = e.bjt.current(); play(c, e.bjt.q(c.qid), 'all'); return true; }
        case 'bjt-play-opts': { const c = e.bjt.current(); play(c, e.bjt.q(c.qid), 'options'); return true; }
        case 'bjt-stop': stopAudio(); refreshAudio(); return true;
        case 'bjt-assist': V.ui.assist = true; H.rerenderKeep(); return true;
        case 'bjt-transcript': V.ui.transcript = true; H.rerenderKeep(); return true;
        case 'bjt-unc': V.ui.unc = !V.ui.unc; H.rerenderKeep(); return true;
        case 'bjt-choose': {
          const s = e.bjt.session, c = e.bjt.current(); if (!c || c._answered) return true;
          if (s.exam) { V.ui.pick = +d.k; H.rerenderKeep(); return true; }
          stopAudio();
          e.bjt.answer({ index: +d.k, uncertain: !!V.ui.unc, plays: c.plays || 0, assisted: !!V.ui.assist, transcript: !!V.ui.transcript });
          H.rerenderKeep(); return true;
        }
        case 'bjt-commit': {
          const c = e.bjt.current(); if (!c || V.ui.pick == null) return true;
          stopAudio();
          e.bjt.answer({ index: V.ui.pick, uncertain: !!V.ui.unc, plays: c.plays || 0 });
          e.bjt.next(); V.ui = {}; render(); window.scrollTo(0, 0); return true;
        }
        case 'bjt-dk': { stopAudio(); const c = e.bjt.current(); e.bjt.answer({ dontKnow: true, plays: (c && c.plays) || 0, assisted: !!V.ui.assist, transcript: !!V.ui.transcript }); H.rerenderKeep(); return true; }
        case 'bjt-ack': e.bjt.answer({}); e.bjt.next(); V.ui = {}; if (!e.bjt.current()) finishRun(); render(); window.scrollTo(0, 0); return true;
        case 'bjt-vchoose': { const c = e.bjt.current(); if (c._answered) return true; e.bjt.answer({ index: +d.k }); H.rerenderKeep(); return true; }
        case 'bjt-vdk': e.bjt.answer({ dontKnow: true }); H.rerenderKeep(); return true;
        case 'bjt-next': stopAudio(); e.bjt.next(); V.ui = {}; if (!e.bjt.current()) finishRun(); render(); window.scrollTo(0, 0); return true;
        case 'bjt-mockrep': go('bjtmockrep', { id: d.id }); return true;
      }
      return false;
    }
    // Enter continues after feedback (desktop convenience).
    document.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' || V.view !== 'bjtrun') return;
      if (ev.target && ev.target.matches && ev.target.matches('button, input, textarea, select, summary')) return;
      const c = E().bjt.current();
      if (c && c._answered) { ev.preventDefault(); handle('bjt-next', {}); }
    });

    return {
      views: { bjt: renderDash, bjtrun: renderRun, bjtsum: renderSum, bjtmock: renderMock, bjtplan: renderPlan, bjtabout: renderAbout, bjtreport: renderReport, bjtmockrep: renderMockRep },
      tabbed: ['bjt', 'bjtplan', 'bjtabout', 'bjtmock', 'bjtreport', 'bjtmockrep'],
      handle, setSources: s => { SRC = s; }, startClock, stopAudio, visual
    };
  }
  root.MichiBJTView = { create };
})(typeof window !== 'undefined' ? window : globalThis);
