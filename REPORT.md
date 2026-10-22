# Michi — rebuild report (2026-10-22)

Branch `rebuild-v2` (baseline kept at `abf99b9` on `master`). Everything below was
executed in this session; numbers are from the actual runs.

## 1. Defects found and their root causes
| Defect | Root cause (in the old code) | Fix |
|---|---|---|
| Daily review / Recall / Weekly / memory round too short | Fixed caps in `engine.js` `PLAN` (`newMax 5`, `reviewMax 6/10/8/20`, `flex 1/3`), `slice(0,3)` drills, fixed `STEP_SECONDS` | Sizes derived from available minutes × the learner's own median time per exercise × due load × recent retention × eligible material (`js/planner.js`, `js/policy.js`) |
| Recall changed the official schedule | `midday` sessions called `gradeRecord` → advanced Leitner boxes and postponed due dates | Separate practice store; `recordScheduled` throws for practice modes; `recordPractice` never sees `memory` (`js/store.js`); tests freeze memory during Recall/Training |
| One multiple-choice tap counted toward mastery; schedule ignored speed/hints | 6-box Leitner, fixed day gaps, one record per word | FSRS-4.5 per (word, skill); grades from evidence; MC never "Easy"; diagnostics need a second, harder confirmation |
| Keyboard / typing problems | `keydown Enter` submitted during IME conversion (destroying the input); input rebuilt by every `innerHTML` render; <16px font; no `lang`/`enterkeyhint` | `<form>` + real `<input lang="ja" enterkeyhint="done">`, composition-aware Enter, focus inside the tap, draft preserved across renders, viewport-resize scroll-into-view, 20px text |
| Voice hard to understand | Spoke before `getVoices()` was populated (default, often non-Japanese voice); first "ja" voice even if online-only; read the kana string; fixed 0.85 rate | Wait for voices; rank on-device/enhanced first; never auto-use online voices; speak written form (kana only where marked); learner-selectable voice + speed with samples |
| Found during this rebuild (fixed, regression-tested) | diagnostic answers created memory entries; evening dropped productive skills; summary called a corrected retry "recalled on your own"; `slice(-0)` returned the whole history for 1-item pools; rōmaji particles (wa/o/e) rejected for accepted alternatives; synonyms (トイレ/お手洗い) marked wrong and usable as each other's distractors; chained forms (小さすぎます) not found in examples | see `tests/engine.test.js`, `tests/data.test.js` "regression" tests |

## 2. Architecture
Pure, Node-testable modules under `js/` (no build step): `policy` (tunable safeguards) ·
`calendar` (time-zone-aware dates, Sunday unlock) · `kana`/`answer` (answer classification:
exact/alt/typo/long-vowel/wrong-form/wrong) · `conjugate` (data-driven rules) · `srs` (FSRS-4.5) ·
`curriculum` (verified-only loading) · `exercises` (12 generators, each validated before use) ·
`planner` (sessions, adaptation, budget) · `store` (schema v2, migration, isolation) ·
`progress` · `speech` · `engine` (single façade for UI and tests) · `app` (UI).
Canonical content in `data/`; learner state in `localStorage` keyed by stable ids.

## 3. The modes
- **Morning**: next topic (carry-forward first) → diagnostic on *this lesson's candidates only* (MC + a harder confirmation; a guess never establishes knowledge) → teach in chunks of 4 → varied practice per item (recognition, listening, typed recall, form, sentence pattern/cloze, speaking) interleaved with due reviews → delayed production check. Unfinished objectives are carried forward.
- **Evening**: no teaching, no new items (tested). Each morning item gets 1–3 exercises by uncertainty, productive first, avoiding exact repeats; plus due reviews; summary lists independent / assisted / errors / what's next and why.
- **Weekly**: Sunday 00:00 local (configurable zone), catch-up if missed. Scope = everything since the last assessment + at-risk older items; ≤2 skills per item for breadth; integrated milestone scenarios; per-item classes (durable / familiar / context-limited / slipping / needs practice) and a plan.
- **Recall / Training**: endless, adaptive, isolated. Recall: weak-first/topic/mixed × 10 directions. Training: mixed, rapid, conjugation, listening, sentences, memory span (adapts ±1), category switching, rebuild-later, get-unstuck (16 prompts, graduated hints, strategy detection, self-assessment — no claim of semantic grading).

## 4. Curriculum (from `node scripts/audit.js`)
455 verified items in 16 topics, 513 Tatoeba example sentences, 12 sentence patterns, 16 get-unstuck prompts (36 JMdict-verified hint words), 11 milestones, 8 reviewed synonym groups, 15 quarantined items. Every item carries structured provenance; verb/adjective classes come from JMdict part-of-speech and are cross-checked by tests. 7,924 generated exercise cards validated. All 41 legacy ids kept (40) or quarantined with reasons (1).

## 5. Tests executed
- `npm test`: core 23/23 · speech 4/4 · engine 33/33 · data 13/13 — all pass.
- `npm run test:e2e` (Chrome 155 headless, iPhone 390×844, small Android 320×568, landscape): 10/10 pass — layout/touch-target/overflow audit on every tab at 3 sizes; full day by touch; isolation verified in the browser; IME composition via `Input.imeSetComposition` (Enter while composing does not submit); draft survives re-render; input visible with a simulated keyboard; Sunday unlock at 00:00 without restart; conjugation tab; v1→v2 migration; voices; **offline** (network disabled after first visit: morning, recall, all tabs).
- Failures seen and fixed during the work are listed in §1.

## 6. Limitations (honest)
- **No real phone was available.** Mobile behaviour was tested with Chrome device emulation; emulation has no software keyboard, so "keyboard opens" is verified as "a native text input receives focus from the user's tap". iOS Safari and Android IMEs should be checked by hand.
- **Voices** were tested only on Windows (Ayumi, Haruka, Sayaka — female; Ichiro — male). Voice quality and pitch accent depend on the device's engine; the app cannot bundle a voice offline in a static PWA. Speech recognition / pronunciation scoring is not implemented; speaking is self-assessed.
- FSRS parameters are published defaults; same-day and "Easy"-speed parameters are initial values (Progress → Calibration shows predicted vs actual to tune them).
- Example sentences come from Tatoeba (crowd-sourced, reviewed); conjugation-reference examples and get-unstuck models are constructed and labelled as such.
- Kyoto place names with readings that dictionaries contradict (河原町, 祇園) remain quarantined pending an official source.

## 7. Next priorities
1. Hand test on an iPhone and an Android phone (typing with the Japanese IME, voices, home-screen install, offline).
2. Tune FSRS same-day/Easy parameters from a few weeks of real calibration data.
3. More dialogue-style scenarios and more `obj` tags so sentence patterns cover more verbs (見る, 聞く).
4. Resolve quarantined phrases (袋はいりますか, 温めますか…) with an official/learner-reference source.
