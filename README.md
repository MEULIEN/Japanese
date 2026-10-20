# Michi 道 — daily Japanese for living in Kyoto

Static PWA (GitHub Pages, no build step), same shell as Qotoba: `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.json`, `scripts/bump-version.sh`; `scripts/audit.py` validates data. Run the bump script before each push so phones update.

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
Spaced repetition (boxes 1 day → 30 days) · pre-testing · self-generated hooks (you write your own memory story) · links between items (shared kanji, opposites) · interleaving domains · production before recognition as items mature (say aloud) · memory round (working-memory span with your words) · get-unstuck drill (finding another way when a word is missing) · pattern lab (one frame, many words).
Motivation: "days practised this week" instead of a fragile streak, can-do checkboxes ("I can now find the exit and entrance"), readiness bars per domain, capped review sizes so a missed week never becomes a mountain.

## Data format (`data/`)
- `index.json`: list of packs, domains, and `can_do` goals (each lists the item ids needed).
- `pack_*.json`: `{domain, status, sources, items:[…]}`. Pack values are defaults for each item.
- Item: `id, jp, kana, romaji, en, tier(1-3), kind(word|phrase|pattern), parts[], links[{id,rel}], say_when, note, status, sources[]`.
- `flex.json`: get-unstuck prompts (tips point to item ids). `patterns.json`: frames with fills.
- Items missing a required field, or with duplicate ids, are skipped (see browser console).

## Accuracy rule
Every item is `draft` until it has been checked against an official or trustworthy source and that source is listed in its `sources`. Nothing is promoted from memory. Anything that cannot be confirmed should be removed, not guessed.

Current state: 50 items, 36 verified, 14 drafts. `VERIFICATION_LOG.md` lists every item with its sources; regenerate it and validate the data with `python3 scripts/audit.py`. Settings > "Show unverified drafts" off = verified-only. Strength of sources varies (official pages, JMdict-based dictionaries, university materials), so each item's `sources` says which was used.

The audio is the phone's synthetic Japanese voice reading the kana, not a native recording.

## Not built yet
Scenario dialogues with branching, kanji stroke/radical views, native audio, place-name map links, speech recognition.
