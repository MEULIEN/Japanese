# Michi 道 — daily Japanese for living in Kyoto

Static PWA (GitHub Pages, **no build step, no npm to run**): `index.html`, `engine.js`, `app.js`, `style.css`, `sw.js`, `manifest.json`, `scripts/bump-version.sh`. All learning/scheduling logic lives in **`engine.js`** (pure, no DOM/network) so it can be unit-tested; `app.js` is the UI shell around it. Run the bump script before each push so phones update.

**Dev tooling (not needed to run the app):** `npm test` runs the engine unit tests (`tests/engine.test.js`, Node) and the DOM end-to-end tests (`tests/dom.test.js`, jsdom — `npm install` first). `python scripts/audit.py` validates data + provenance and regenerates `VERIFICATION_LOG.md`.

## Recommended rhythm (for poor memory + low motivation)
Evidence-based principles (spacing, retrieval practice, short sessions, sleep between sessions) point to **several short sessions rather than one long one**. There is no single proven "optimal" number, so this is a recommendation, not a fact:

| Slot | Length | What happens |
|---|---|---|
| Morning · Learn | 15 min | Pre-test ("do you know this?"), teach up to 5 new items, retrieve them, a few reviews |
| Midday · Recall | 8 min | Reviews only (listen/read/say) |
| Evening · Speak & Flex | 15 min | Say-aloud reviews, 1 get-unstuck drill, 1 memory round |
| Weekly · Kyoto Walk | 40 min | Wide review + 3 drills (never above your 1 h limit) |
| Minimum day | 5 min | Counts as a kept day when you are tired |

About 40 min/day. If life only allows two slots, keep Morning + Evening.

## Techniques built in
Spaced repetition (Leitner boxes, 0 → 30 days) · pre-testing · self-generated hooks (you write your own memory story) · links between items (shared kanji, opposites) · interleaving domains · get-unstuck drill (finding another way when a word is missing) · pattern lab (one frame, many words).

**Recognition → production ladder.** An item climbs through four exercise types as it matures: `read` (box 1, see Japanese → choose meaning) → `listen` (box 2, hear it → choose meaning) → `type` (box 3, see English → **type** the reading) → `say` (box 4+, say it aloud, self-grade). Typed/spoken answers are *production*; a four-choice tap is only *recognition*.

**Honest mastery.** The home screen's "recalled reliably" count and the "I can now…" checkboxes require an item to be both mature in the schedule **and** produced unaided at least once — recognition alone never marks something known.

**Honest duration.** Each session card shows `~N min` computed from the *actual* cards in the queue, not a fixed label; the summary reports the time you actually took. New items also get a within-session **delayed retrieval** (tested again after a gap) so a lesson is substantive without busy-work.

**Memory round** adapts to how many items you've learned (works from 3 items; no fixed 6-item gate) and never duplicates a word to pad the grid.

Motivation: "days practised this week" instead of a fragile streak, can-do checkboxes, readiness bars per domain, capped review sizes so a missed week never becomes a mountain.

## Data format (`data/`)
- `index.json`: list of packs, domains, and `can_do` goals (each lists the item ids needed).
- `pack_*.json`: `{domain, status, sources, items:[…]}`. Pack values are defaults for each item.
- Item: `id, jp, kana, romaji, en, tier(1-3), kind(word|phrase|pattern), parts[], links[{id,rel}], say_when, note, status, sources[], alt[]` (`alt` = extra acceptable typed answers).
- `flex.json`: get-unstuck prompts (tips point to item ids). `patterns.json`: frames with fills.
- `quarantine.json`: items that **failed verification**, each with a `quarantine_reason`. **Not referenced by `index.json`, so the app never loads it.**
- Items missing a required field, with a duplicate id, or not `verified` are skipped at load (see browser console) and flagged by the audit.

## Accuracy rule — verified only, no toggle
The app serves **verified items only**. There is no setting to show unverified material (the old "Show unverified drafts" toggle has been removed). An item is served only after it has been checked against an official or trustworthy source and that exact source is listed in its `sources`. Nothing is promoted from memory; anything that cannot be confirmed is moved to `quarantine.json` with a reason, not guessed.

A *trustworthy source* is not the same as a *supported claim*: the cited source must support the item's actual wording, reading and meaning. (Example caught this build: the generic dictionary reads 河原町 as かわはらちょう — a place in Tottori — not the Kyoto かわらまち, so it stays quarantined pending an official Kyoto/transit source.)

Current state: **41 verified items served, 9 quarantined.** `VERIFICATION_LOG.md` lists every served item with its sources and every quarantined item with why it failed; regenerate it and validate everything with `python scripts/audit.py` (fails if anything unverified is served or provenance is missing). Source strength varies (official pages, JMdict/EDRDG dictionaries, university materials); each item's `sources` says which was used.

The audio is the phone's synthetic Japanese voice reading the kana, not a native recording.

## Not built yet
Scenario dialogues with branching, kanji stroke/radical views, native audio, place-name map links, speech recognition.
