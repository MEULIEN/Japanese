# Michi content schema (v2)

Canonical learning content lives in `data/`. Learner state never lives here
(it is in the browser, see `js/store.js`). Nothing in the engine assumes how
many topics, items, examples or patterns exist; adding a file listed in
`index.json` is enough for every lesson generator to use it.

## `index.json`
```json
{ "schema": 2, "curriculum_version": "YYYY.MM.DD",
  "topics": "topics.json",
  "items": ["items/survival.json", "..."],
  "grammar": "grammar.json", "conjugation": "conjugation.json",
  "recovery": "recovery.json", "milestones": "milestones.json" }
```

## `topics.json`
```json
{ "topics": [ {
  "id": "restaurant", "name": "Ordering at a restaurant", "icon": "🍜",
  "goal": "Order a meal, ask for water and the bill, answer staff questions",
  "order": 2,               // suggested curriculum order (lower first)
  "prereq": ["survival"],   // topics that should be started first (soft)
  "patterns": ["g_o_onegai"] // grammar.json ids practised in this topic
} ] }
```

## Item files (`items/<topic>.json`)
`{ "topic": "<topic id>", "items": [ item, ... ] }`

| field | req | meaning |
|---|---|---|
| `id` | ✓ | stable id, never reused or renamed (learner history is keyed on it) |
| `jp` | ✓ | written form as normally written (kanji/kana) |
| `kana` | ✓ | reading in kana (katakana words: katakana) |
| `romaji` |  | Hepburn with macrons |
| `en` | ✓ | meaning shown to the learner; must be supported by the sources |
| `gloss` |  | short English used inside generated sentences ("water"); defaults to `en` |
| `pos` | ✓ | `noun` `verb` `i-adj` `na-adj` `adverb` `expression` `phrase` `pronoun` `question` `counter` `sign` `place` |
| `verb_class` | verbs | from the dictionary POS: `godan` `ichidan` `suru` `kuru` `iku` `aru-honorific` |
| `adj_class` | adjs | `i`, `ii` (いい/よい), `na` |
| `topic` | ✓ | primary topic id |
| `tags` |  | semantic slot tags used by grammar patterns: `food` `drink` `orderable` `shop_item` `place` `destination` `thing` `person` `time` `activity` `hobby` `transport` `country` `clothing` `language` |
| `obj` |  | (verbs) tags of nouns that can be its direct object, e.g. `["food"]` for 食べる |
| `tier` | ✓ | 1 essential · 2 useful · 3 nice-to-have (importance, used for priority) |
| `use` | ✓ | `say` (learner should produce it) · `hear` (comprehension: staff/announcements) · `read` (signs/labels) |
| `register` |  | `casual` `neutral` `polite` `honorific` `formal` |
| `say_when` / `note` |  | usage note / caution shown when teaching |
| `tts` |  | `"kana"` to have speech read the kana instead of `jp` (place names, ambiguous kanji) |
| `accept` |  | extra typed answers that are genuinely correct (variant spellings) |
| `examples` |  | `[{ "jp", "en", "source": {...} }]` real usage sentences |
| `links` |  | `[{ "id", "rel" }]` related items |
| `status` | ✓ | only `verified` is ever served |
| `sources` | ✓ | provenance, objects (preferred) or legacy strings |

### Source objects
```json
{ "type": "dictionary", "name": "JMdict/EDRDG via jisho.org API", "query": "傘",
  "matched": "傘【かさ】", "senses": ["umbrella; parasol"], "pos": ["Noun"],
  "common": true, "jlpt": ["jlpt-n5"], "checked": "2026-10-22" }
{ "type": "usage", "name": "Tatoeba", "id": 12345,
  "url": "https://tatoeba.org/en/sentences/show/12345", "license": "CC BY 2.0 FR",
  "checked": "2026-10-22" }
{ "type": "official", "name": "MLIT 道路標識一覧", "url": "...", "checked": "..." }
{ "type": "reference", "name": "...", "url": "...", "checked": "..." }
```
Rules: never invent a source, URL, reading or rule. A source must support the
item's actual written form, reading and meaning. Items that cannot be verified
go to `quarantine.json` with a `quarantine_reason` and are never loaded.

## `grammar.json` — sentence patterns
```json
{ "id": "g_o_kudasai", "frame": "{N}をください", "en": "{N}, please",
  "slots": { "N": { "tags": ["orderable", "shop_item"] } },
  "register": "polite", "explain": "...", "topics": ["restaurant"],
  "sources": [ ... ] }
```
Generated sentences combine a verified pattern with verified items whose
`tags` match the slot. Verb slots may request a conjugated form
(`{ "pos": "verb", "form": "te" }`), produced by the conjugation engine.

## `conjugation.json` — forms and explanations (rules live in `js/conjugate.js`)
## `recovery.json` — get-unstuck / circumlocution prompts
## `milestones.json` — real-world can-do goals, each with an assessment
