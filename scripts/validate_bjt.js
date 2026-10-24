#!/usr/bin/env node
/* Validates the BJT practice bank (data/bjt/questions/*.json) and the BJT
   vocabulary (data/bjt/vocab.json) against data/bjt/SCHEMA.md.
   Errors → exit code 1. Warnings flag quality risks (answer-length clues,
   duplicate stems) without failing.
   Usage: node scripts/validate_bjt.js [file.json ...]   (default: all files)
   Also used as a module by the test-suite: validateQuestion(q) → [errors]. */
'use strict';
const fs = require('fs'), path = require('path');

const SECTIONS = { scene: 1, utterance: 1, listening: 1, situation: 2, document: 2, integrated: 2, vocab: 3, expression: 3, reading: 3 };
const SKILLS = ['vocab', 'grammar', 'keigo', 'intention', 'info', 'detail', 'numbers'];
const TRAPS = ['negation', 'intention', 'number', 'deadline', 'suggestion', 'relationship', 'integration', 'politeness', 'detail', 'sequence', 'speaker', 'change', 'vocab', 'grammar', 'inference', 'visual'];
const SPK = ['N', 'M1', 'M2', 'F1', 'F2'];
const VIS = ['scene', 'bar', 'line', 'pie', 'table', 'doc'];
const SETTINGS = ['office', 'meeting-room', 'reception', 'factory', 'warehouse', 'shop', 'outside', 'restaurant'];
const EL = ['person', 'desk', 'table', 'whiteboard', 'screen', 'laptop', 'phone', 'clock', 'boxes', 'door', 'shelf', 'document', 'cup', 'calendar', 'plant', 'window', 'truck', 'sign'];
const NEEDS_VISUAL = ['scene', 'utterance', 'situation', 'document', 'integrated'];
const KANA = /^[぀-ヿー・ー〜～\s]+$/;
const JP = /[぀-ヿ一-鿿]/;

function validateVisual(v, e) {
  if (!v || typeof v !== 'object') return e.push('visual missing');
  if (!VIS.includes(v.type)) return e.push('visual.type ' + v.type);
  if (v.type === 'scene') {
    if (!SETTINGS.includes(v.setting)) e.push('scene.setting ' + v.setting);
    if (!v.caption || v.caption.length < 15) e.push('scene.caption too short');
    if (!Array.isArray(v.elements) || !v.elements.length) e.push('scene.elements empty');
    for (const el of v.elements || []) {
      if (!EL.includes(el.kind)) e.push('scene element kind ' + el.kind);
      if (el.x != null && (el.x < 0 || el.x > 100)) e.push('scene element x out of range');
    }
  }
  if (v.type === 'bar' || v.type === 'line') {
    if (!Array.isArray(v.labels) || !v.labels.length) e.push(v.type + '.labels');
    if (!Array.isArray(v.series) || !v.series.length) e.push(v.type + '.series');
    for (const s of v.series || []) if (!Array.isArray(s.values) || s.values.length !== (v.labels || []).length || s.values.some(x => typeof x !== 'number')) e.push(v.type + ' series "' + s.name + '" values must be numbers, one per label');
  }
  if (v.type === 'pie') { if (!Array.isArray(v.values) || v.values.length !== (v.labels || []).length) e.push('pie values/labels'); }
  if (v.type === 'table') {
    if (!Array.isArray(v.columns) || !v.columns.length) e.push('table.columns');
    for (const r of v.rows || []) if (!Array.isArray(r) || r.length !== v.columns.length) e.push('table row width ≠ columns');
    if (!Array.isArray(v.rows) || !v.rows.length) e.push('table.rows');
  }
  if (v.type === 'doc') { if (!Array.isArray(v.lines) || !v.lines.length) e.push('doc.lines'); }
}

function validateQuestion(q) {
  const e = [];
  if (!q.id || typeof q.id !== 'string') e.push('id');
  const part = SECTIONS[q.section];
  if (!part) e.push('section ' + q.section);
  if (![1, 2, 3, 4, 5].includes(q.difficulty)) e.push('difficulty');
  if (!Array.isArray(q.skills) || !q.skills.length || q.skills.some(s => !SKILLS.includes(s))) e.push('skills ' + JSON.stringify(q.skills));
  if (!q.topic) e.push('topic');
  if (!q.stem || !JP.test(q.stem)) e.push('stem (Japanese) missing');
  if (!Array.isArray(q.options) || q.options.length !== 4) e.push('options must be 4');
  else {
    if (new Set(q.options.map(o => String(o).trim())).size !== 4) e.push('options not distinct');
    if (q.options.some(o => !String(o).trim())) e.push('empty option');
  }
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) e.push('answer index');
  if (!q.explanation || q.explanation.length < 30) e.push('explanation too short');
  if (!Array.isArray(q.whyWrong) || q.whyWrong.length !== 4) e.push('whyWrong must have 4 entries');
  else q.whyWrong.forEach((w, k) => { if (k === q.answer ? w : !w || w.length < 10) e.push('whyWrong[' + k + ']'); });
  if (!Array.isArray(q.traps) || q.traps.length !== 4) e.push('traps must have 4 entries');
  else q.traps.forEach((t, k) => { if (k === q.answer ? t !== null : !TRAPS.includes(t)) e.push('traps[' + k + '] ' + t); });
  if (!q.evidence || !JP.test(q.evidence)) e.push('evidence (Japanese) missing');
  if (!Array.isArray(q.vocab) || !q.vocab.length || q.vocab.length > 8) e.push('vocab 1–8 entries');
  else for (const v of q.vocab) { if (!v.jp || !v.kana || !v.en) e.push('vocab entry incomplete'); else if (!KANA.test(v.kana)) e.push('vocab kana not kana: ' + v.kana); }
  if (NEEDS_VISUAL.includes(q.section)) validateVisual(q.visual, e);
  else if (q.visual) validateVisual(q.visual, e);
  if (part === 1 || part === 2) {
    if (!q.audio || !Array.isArray(q.audio.lines)) e.push('audio.lines missing');
    else {
      for (const l of q.audio.lines) { if (!SPK.includes(l.spk)) e.push('audio spk ' + l.spk); if (!l.text || !JP.test(l.text)) e.push('audio line text'); }
      if (!q.audio.question || !JP.test(q.audio.question)) e.push('audio.question missing');
      if (['utterance', 'listening', 'situation', 'integrated'].includes(q.section) && !q.audio.lines.length) e.push('audio.lines empty for ' + q.section);
    }
  }
  if (q.section === 'vocab' || q.section === 'expression') { if (!q.passage || !/＿/.test(q.passage)) e.push('passage with ＿＿＿ blank required'); }
  if (q.section === 'reading' && !(q.visual && q.visual.type === 'doc') && !q.passage) e.push('reading needs a doc visual or passage');
  return e;
}

function validateVocab(v) {
  const e = [];
  for (const k of ['id', 'jp', 'kana', 'en', 'cat']) if (!v[k]) e.push(k);
  if (v.kana && !KANA.test(v.kana)) e.push('kana not kana');
  if (![1, 2, 3].includes(v.tier)) e.push('tier');
  if (!v.example || !v.example.jp || !v.example.en) e.push('example');
  if (!Array.isArray(v.sources) || !v.sources.length) e.push('sources');
  if (v.status !== 'verified' && v.status !== 'candidate') e.push('status');
  return e;
}

function loadAll(dir) {
  const qdir = path.join(dir, 'questions');
  return fs.readdirSync(qdir).filter(f => f.endsWith('.json')).sort().map(f => ({ file: 'questions/' + f, doc: JSON.parse(fs.readFileSync(path.join(qdir, f), 'utf8')) }));
}

function main() {
  const dir = path.join(__dirname, '..', 'data', 'bjt');
  const args = process.argv.slice(2);
  const files = args.length ? args.map(f => ({ file: f, doc: JSON.parse(fs.readFileSync(f, 'utf8')) })) : loadAll(dir);
  let errors = 0; const warnings = [];
  const ids = new Map(), stems = new Map();
  const bySec = {}, byDiff = {}, ansPos = [0, 0, 0, 0];
  let longest = 0, total = 0;
  for (const { file, doc } of files) {
    if (!doc || !Array.isArray(doc.questions)) { console.log('ERROR ' + file + ': no questions array'); errors++; continue; }
    for (const q of doc.questions) {
      const e = validateQuestion(q);
      if (ids.has(q.id)) e.push('duplicate id (also in ' + ids.get(q.id) + ')');
      ids.set(q.id, file);
      if (e.length) { errors += e.length; console.log('ERROR ' + file + ' ' + q.id + ': ' + e.join('; ')); }
      const sk = (q.stem || '') + '|' + (q.passage || '') + '|' + ((q.audio && q.audio.lines || []).map(l => l.text).join(''));
      if (stems.has(sk)) warnings.push(q.id + ' duplicates ' + stems.get(sk)); else stems.set(sk, q.id);
      bySec[q.section] = (bySec[q.section] || 0) + 1;
      byDiff[q.difficulty] = (byDiff[q.difficulty] || 0) + 1;
      if (Number.isInteger(q.answer)) ansPos[q.answer]++;
      if (Array.isArray(q.options) && q.options.length === 4) {
        total++;
        const L = q.options.map(o => String(o).length);
        const max = Math.max(...L), min = Math.min(...L);
        if (L[q.answer] === max && L.filter(x => x === max).length === 1) longest++;
        if (min && max / min > 3 && max > 12) warnings.push(q.id + ': option lengths unbalanced (' + L.join('/') + ')');
      }
    }
  }
  if (!args.length && fs.existsSync(path.join(dir, 'vocab.json'))) {
    const V = JSON.parse(fs.readFileSync(path.join(dir, 'vocab.json'), 'utf8'));
    const vids = new Set();
    for (const v of V.items || []) {
      const e = validateVocab(v);
      if (vids.has(v.id)) e.push('duplicate id'); vids.add(v.id);
      if (e.length) { errors += e.length; console.log('ERROR vocab ' + v.id + ': ' + e.join('; ')); }
    }
    console.log('vocab: ' + (V.items || []).length + ' items (' + (V.items || []).filter(v => v.status === 'verified').length + ' verified)');
  }
  console.log('questions: ' + ids.size + ' · by section ' + JSON.stringify(bySec) + ' · by difficulty ' + JSON.stringify(byDiff) + ' · authored answer positions ' + ansPos.join('/') + ' (shuffled at display)');
  const share = total ? longest / total : 0;
  console.log('correct option is uniquely the longest in ' + Math.round(share * 100) + '% of items (chance ≈ 25%)');
  if (share > 0.4) warnings.push('the correct answer is too often the longest option (' + Math.round(share * 100) + '%) — a test-wise clue');
  for (const w of warnings) console.log('WARN ' + w);
  console.log(errors ? errors + ' error(s)' : 'OK');
  if (errors) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { validateQuestion, validateVocab, SECTIONS, SKILLS, TRAPS, SPK };
