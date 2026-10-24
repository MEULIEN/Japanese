# BJT practice content schema

All questions here are **original BJT-style practice items** written for this app.
None is an official BJT question. The format (parts, sections, counts) follows the
official sources listed in `sources.json`. Validate with `node scripts/validate_bjt.js`.

## Official structure being modelled (CBT, since April 2017; 80 questions)

| Part | Section id | Official name | Count | Presentation in this app |
|---|---|---|---|---|
| I 聴解 (~45 min) | `scene` | 場面把握問題 (描写問題) | 5 | picture + spoken question; **4 spoken options** |
| | `utterance` | 発言聴解問題 (表現力問題) | 10 | picture + spoken situation; **4 spoken options** (what to say) |
| | `listening` | 総合聴解問題 (聴解問題) | 10 | picture + dialogue/talk + spoken question; **4 spoken options** |
| II 聴読解 (~30 min) | `situation` | 状況把握問題 | 5 | picture + short conversation; printed options (topic / situation) |
| | `document` | 資料聴読解問題 (描写問題) | 10 | chart / ad / notice + spoken question; printed options |
| | `integrated` | 総合聴読解問題 (聴読解問題) | 10 | conversation + chart / table / form; spoken question; printed options |
| III 読解 (30 min) | `vocab` | 語彙・文法問題 | 10 | sentence with blank; printed options |
| | `expression` | 表現読解問題 (表現力問題) | 10 | business exchange with blank; register / keigo choice |
| | `reading` | 総合読解問題 (短文読解問題) | 10 | email / notice / report / article + question |

## File: `questions/<name>.json`
```json
{ "section": "listening", "questions": [ Question, ... ] }
```

## Question
| field | req | meaning |
|---|---|---|
| `id` | ✓ | stable unique id, e.g. `p1l-014`. Never renamed (history is keyed on it). |
| `section` | ✓ | one of the 9 section ids above |
| `difficulty` | ✓ | 1–5 (see bands below) — an author judgement, **not** an empirical calibration |
| `skills` | ✓ | subset of `vocab` `grammar` `keigo` `intention` `info` `detail` `numbers` |
| `topic` | ✓ | e.g. `meeting` `schedule` `phone` `email` `client` `negotiation` `order` `delivery` `production` `quality` `complaint` `cost` `payment` `hr` `etiquette` `presentation` `report` `sales` `it` `travel` `finance` `marketing` `recruitment` `general` |
| `visual` |  | see Visuals. Required for `scene`, `utterance`, `situation`, `document`, `integrated`. |
| `audio` |  | `{ "lines": [Line], "question": "…" }` — required for Parts I and II |
| `stem` | ✓ | the question in Japanese. Parts I–II: it is the spoken question (shown as text only after answering). Part III: printed. |
| `passage` |  | Part III `vocab`/`expression`: the sentence(s) with `＿＿＿` for the blank. `reading`: use `visual` type `doc` for the text. |
| `options` | ✓ | exactly 4 distinct strings (Japanese) |
| `answer` | ✓ | index 0–3 of the correct option |
| `fixedOrder` |  | `true` if options must not be shuffled (e.g. ordered times) |
| `explanation` | ✓ | English: why the answer is correct, quoting the decisive Japanese |
| `whyWrong` | ✓ | 4 strings; English reason each distractor is wrong; `""` at the answer index |
| `traps` | ✓ | 4 entries; the error pattern each distractor targets; `null` at the answer index |
| `evidence` | ✓ | the decisive Japanese words from the audio/text (shown after answering) |
| `vocab` | ✓ | `[{ "jp", "kana", "en" }]` key words/expressions (1–6) |
| `nuance` |  | English note on keigo, grammar or context |

### Line (audio)
`{ "spk": "N" | "M1" | "M2" | "F1" | "F2", "text": "…", "tts": "…(optional kana override)" }`
`N` = narrator (situation setup). `M*` male, `F*` female voices. `tts` replaces `text` for
speech only when a kanji reading is ambiguous (names like 生田 → いくた).

### Error-pattern tags (`traps`)
`negation` missed a negation · `intention` confused what the speaker wants/means ·
`number` misheard a number/amount · `deadline` wrong date/time/deadline · `suggestion`
took a suggestion as a decision (or vice versa) · `relationship` misread who is
superior/client/in-group · `integration` missed info split across audio and visual ·
`politeness` wrong register / keigo direction · `detail` picked something mentioned but
not asked · `sequence` wrong order / "what next" · `speaker` attributed to the wrong
person · `change` chose the original plan instead of the changed one · `vocab`
confused a similar word · `grammar` wrong form/collocation · `inference` literal reading
instead of implied meaning · `visual` misread the chart/table.

### Difficulty bands (anchored to the official level descriptions)
1 ≈ J4 (200–319): clear, slow, explicit · 2 ≈ low J3 · **3 ≈ high J3 / J2 boundary (~370–450): the 400 target band** ·
4 ≈ J2 (420–529): indirect expressions, denser information · 5 ≈ J1 (530+): implicature, fast, complex keigo.

## Visuals
- `{ "type": "scene", "setting": "office|meeting-room|reception|factory|warehouse|shop|outside|restaurant", "caption": "English description of everything that matters in the picture", "elements": [El] }`
  El kinds: `person` `{x, label, pose: stand|sit|bow|point, holds: none|card|document|phone|cup|box|pen|pointer|laptop, facing: left|right, g: m|f}` ·
  `desk` `table` `whiteboard` `screen` (`{chart: up|down|flat|peak}` optional) · `laptop` `phone` `clock` (`{time:"15:00"}`) ·
  `boxes` (`{n}`) `door` `shelf` `document` `cup` `calendar` (`{mark:"金"}`) `plant` `window` `truck` `sign` (`{text}`). `x` = 0–100 (% from left).
- `{ "type": "bar" | "line", "title", "unit", "labels": [...], "series": [{ "name", "values": [...] }] }`
- `{ "type": "pie", "title", "labels": [...], "values": [...] }`
- `{ "type": "table", "title", "columns": [...], "rows": [[...]], "note" }`
- `{ "type": "doc", "kind": "email|notice|ad|memo|form|schedule|article|report", "title", "meta": ["差出人：…", "件名：…"], "lines": ["…"] }`

## `vocab.json`
`{ "items": [ { id, jp, kana, en, cat, tier, register, note, example: { jp, en }, sources, status } ] }` — see `scripts/validate_bjt.js`.
