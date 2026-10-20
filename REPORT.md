# Michi 道 — engine-repair & hardening report

Date: 2026-10-20. Scope of this pass: reproduce and fix the named learning-engine
bugs, enforce the data-provenance rule, and stand up a real, executed test suite.
Everything below was actually run; commands and outputs are reproducible from the repo.

> Honest scope note: this was a single focused working session, not two days of
> autonomous runtime. I prioritised the correctness/engine work (section 9 of the
> brief) and the non-negotiable data rule (section 8) over curriculum volume,
> exactly as the brief asks ("quality over quantity").

## 1. Project status — what works
Michi is a static, offline-first PWA (no build step, no npm to run it). This pass:
- Extracted all scheduling/mastery/session logic into a pure, tested `engine.js`; `app.js` is now a thin UI shell over it.
- Fixed the three named bugs (recall, memory round, lesson duration) plus the mastery and provenance issues.
- Added 28 automated tests (engine unit + jsdom DOM end-to-end), all passing, and a hardened data audit, also passing.
- Curriculum is now **verified-only**: 41 served items, 9 quarantined with documented reasons.

## 2. Critical bug fixes (cause → fix)
- **Bug A — "Recall does nothing."** *Cause:* `midday`/`mini` sessions pulled only strictly-due items; the same day you learn something, every new item is scheduled for *tomorrow*, so the queue was empty and `startSession` silently bounced to Home. *Fix:* `engine.reviewPool(..., allowAhead)` pulls the least-mature **learned** items forward when nothing is strictly due, so Recall always has material once you've learned anything; a genuinely empty state (nothing ever learned) now shows an honest message instead of a dead button. Proven by `dom.test.js` ("Recall is NOT empty right after a morning").
- **Bug B — memory round required ≥6 words.** *Cause:* `spanStart` hardcoded `pool.length < 6` and built a grid of `n+3` distractors. *Fix:* `engine.spanSetup` needs only `SPAN_MIN = 3`, adds **0–3** distractors (only as many as the pool can spare), never duplicates an item, and `buildSession` simply omits the round when too few items exist (the slot isn't wasted). Proven by engine tests (0/1/2/3/large pools) and a DOM test that runs the round with exactly 3 items.
- **Bug C — lessons far shorter than the stated minutes.** *Cause:* the "15 min" was a hardcoded label; early queues were ~15 quick recognition taps with no reviews. *Fix:* duration is now **estimated from the real queue** (`estimateMinutes`) and shown as `~N min`; the summary reports the **actual** elapsed time; new items get an added within-session **delayed retrieval** so the lesson is substantive without padding.
- **Bug D — progress counted recognition as mastery.** *Cause:* a four-choice tap advanced an item identically to unaided production, and `isKnown` only checked the box. *Fix:* grading records *production* only for `type`/`say` modes; `isKnown` now requires `box ≥ 3` **and** `prod ≥ 1`. The recognition→production ladder (`read → listen → type → say`) ensures every item is eventually produced before it counts.
- **Bug E / provenance — unverified-data toggle removed.** The `Show unverified drafts` setting and `S.settings.drafts` are gone; `loadData` serves `verified` items only via `engine.prepareItem`; the 14 former drafts are split into 5 source-verified promotions and 9 quarantined items.

## 3. Testing evidence (all executed this session)
```
$ node tests/engine.test.js      → 22 passed, 0 failed, 22 total
$ node tests/dom.test.js         → 6 passed, 0 failed, 6 total   (real app.js in jsdom)
$ npm test                       → runs both: 28 passed total
$ python scripts/audit.py        → served verified=41 quarantined=9 unverified-in-packs=0 ; audit OK
```
- Engine unit tests cover: date math, grade/scheduling, production-gated mastery, tier gating, `pickNew` interleave, **recall fallback (Bug A)**, **span eligibility 0/1/2/3/large (Bug B)**, duration estimation (Bug C), answer-checking with valid alternatives, verified-only loading, and a full simulated session.
- DOM tests boot the **real `app.js`** in jsdom with `fetch` served from the real `data/` files and drive sessions with dispatched clicks: fresh-install load, full morning lesson + persistence, Bug A (both the fixed and honest-empty cases), Bug B at 3 items, and the typed-production flow counting toward mastery.
- Not covered by automation: real device/browser rendering, speech synthesis/recognition, and visual layout — these need a manual pass on a phone.

## 4. Curriculum statistics (unique served records)
- **41 verified items** across 6 domains: signs 7, places 10, food 7, talk 4, drive 9, grocery 4.
- By tier: tier 1 = 18, tier 2 = 17, tier 3 = 6.
- 1 grammar pattern (pattern lab), 2 get-unstuck prompts, 6 domains, 13 `can_do` goals.
- **9 quarantined** (not served), each with a reason in `data/quarantine.json` and `VERIFICATION_LOG.md`.

## 5. Data verification
- Source standard: official/authoritative first; for ordinary vocabulary, JMdict/EDRDG via the jisho.org API (the same standard already used in the repo).
- Promoted this session (5), each citing the exact entry (form/reading/meaning), checked 2026-10-20: お水, 水筒, うどん, メニュー, ありがとうございます.
- **Insufficiently verified → quarantined (9):** road sign 止まれ (needs an official traffic authority, not a dictionary); place names 河原町/祇園 (dictionary reading disagreed with / only indirectly supported the Kyoto reading — must not guess); and five constructed request/question sentences whose full wording no single dictionary entry supports (もう一度お願いします, ゆっくり話してください, これは何ですか, 〜は日本語で何ですか, 水筒に水を入れてもらえますか) plus これ (stored meaning overreached the source). These need a phrase-level learner/grammar or official source before promotion.

## 6. Learning schedule (recommended)
Evidence-informed, not a claimed optimum (spacing, retrieval practice, sleep between sessions, short sessions):
- **Morning · Learn ~ (shown per-queue, ~6–15 min):** pretest → teach ≤5 new → first-pass retrieval + due reviews → delayed re-test of the new items.
- **Midday · Recall (~8 min):** reviews only (now always non-empty once you've learned anything).
- **Evening · Speak & Flex (~15 min):** say-aloud reviews, a get-unstuck drill, a memory round.
- **Weekly · Kyoto Walk (~40 min)** and a **5-min Minimum day** for low-energy days. None over ~15 min except the optional weekly long one; a missed day never creates a backlog mountain (review sizes are capped).

## 7. How progress is measured honestly
"Recalled reliably" = mature in the Leitner schedule **and** produced unaided (typed or spoken) at least once. Recognition taps advance scheduling but never, by themselves, mark an item known; the home readiness count and the "I can now…" checkboxes both use this stricter definition.

## 8. Offline verification
- `grep` across the shipped shell found **no** external runtime URLs (no CDN, fonts, analytics, or runtime API). The only network calls are to local `data/*.json`, which the service worker precaches (`engine.js` added to the precache + shell lists, build bumped `v4 → v5`).
- The DOM tests exercise the entire learning workflow with `fetch` served **from disk only** — a de-facto offline run of load → lesson → persistence → restart (state is read back from `localStorage`).
- Not yet done: installing the PWA on a real device with the network physically disabled.

## 9. Launch instructions
The app needs no build and no server features — any static file server works.
- Quickest: `python -m http.server 8080` in the repo root, then open `http://localhost:8080/`. (A plain `file://` open will not register the service worker, but the app still runs.)
- First run: open **Learn** (morning). Then try **Recall** (midday) — it now has cards. The Train tab has the memory round, get-unstuck drill, and pattern lab.
- Dev: `npm install` then `npm test`; `python scripts/audit.py` to re-validate data. Bump the build before a push with `scripts/bump-version.sh`.

## 10. Known limitations
- Speaking is self-graded; there is **no** offline speech recognition or objective pronunciation scoring (and none is claimed). Reference audio is the device's synthetic JA voice reading the kana.
- The get-unstuck drill's example tips are thinner than before because its best phrases (もう一度, ゆっくり, これは何ですか) are quarantined pending phrase-level verification; the drill still functions (missing tips are filtered gracefully).
- Curriculum is deliberately small (41 verified) — correctness was prioritised over volume this pass.
- No automated visual/device testing; branching scenario dialogues, kanji stroke/radical views, and native audio remain unbuilt.

## 11. Next priorities
1. Verify and restore the high-value quarantined survival phrases against an authoritative learner/grammar source (and 河原町/祇園 against an official Kyoto/transit source) — this directly re-enables the get-unstuck drill content and place-name goals.
2. Expand tier-1 verified vocabulary for restaurants, convenience stores, and directions (highest daily utility).
3. Add branching restaurant/counter dialogues and more `patterns.json` frames.
4. Manual on-device offline test + a brief accessibility/layout pass.

## 12. Files changed
- **New:** `engine.js` (pure engine), `tests/engine.test.js`, `tests/dom.test.js`, `scripts/migrate_quarantine.js`, `data/quarantine.json`, `package.json`, `.gitignore`, `REPORT.md`.
- **Rewritten/updated:** `app.js` (delegates to engine; typed-production card; honest duration; verified-only load; drafts toggle removed; Bug-A empty states), `scripts/audit.py` (provenance enforcement + quarantine scan), `README.md`, `VERIFICATION_LOG.md` (regenerated), `index.html` + `sw.js` (load/cache `engine.js`, build `v5`), `data/pack_food.json` & `data/pack_talk.json` (5 promotions), `data/pack_signs.json`/`pack_places.json`/`pack_talk.json` (9 items moved to quarantine), `data/index.json` (dropped quarantined ids from `can_do`).
- Baseline safety checkpoint: git commit `c2b6950` ("Checkpoint: baseline before learning-engine repair").
