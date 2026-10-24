# Michi 道 — Japanese for everyday life in Kyoto

An offline-first web app (PWA) for reaching practical, spoken Japanese quickly:
recalling words without freezing, understanding what people say, reading signs
and labels, and getting unstuck when a word won't come.

No build step and no server code: it is static files. Node is only needed for the
developer tools (tests, curriculum verification).

## Launch

```bash
python -m http.server 8080        # any static file server works
# open http://localhost:8080/  (on a phone: http://<your-PC-IP>:8080/)
```
After the first visit the service worker stores the app **and every curriculum
file**, so it then works with no network. On a phone use *Add to Home Screen*.
A plain `file://` open won't register the service worker (no offline cache).

Developer tools: `npm install`, then
- `npm test` — unit, engine, speech and curriculum-data tests (Node, no browser)
- `npm run test:e2e` — end-to-end tests in real Chrome with phone emulation (needs Chrome or Edge installed; `CHROME_PATH` to override)
- `npm run test:webkit` — the typing/settings/lock checks in WebKit (Safari's engine); first run `npx playwright-core install webkit`
- `npm run audit` — validates provenance and regenerates `VERIFICATION_LOG.md`
- `npm run build:index` — regenerates `data/index.json` after adding a topic file
- `scripts/bump-version.sh` — bump the cache stamp before deploying

## The daily structure

| | What it is | Changes your schedule? |
|---|---|---|
| **Daily Morning** | Picks the next topic, runs a short diagnostic **on this lesson's words only**, teaches what you don't know (in chunks), practises it in varied ways, mixes in due reviews, and ends with a delayed "can you still produce it?" check. | yes |
| **Daily Evening** | Opens at **12:00 local time** (enforced by the session logic, unlocks by itself). **No new words.** Re-uses the morning's words in different exercises (productive first: sentences, typing, speaking, forms, listening) plus due older reviews. | yes |
| **Recall** | Your own study: weakest words first, or by topic, in the direction you choose (meaning→Japanese, kanji→reading, reading→kanji, listening, context, conjugation, explain-it-simply). Endless. | **no** |
| **Training** | Open-ended practice: mixed, rapid recall, conjugation, listening, sentences, memory span, category switching, rebuild-later, **get unstuck** (describe a word you can't remember, with graduated hints). | **no** |
| **Weekly** | Unlocks **Sunday 00:00 in your time zone** (Settings). A broad assessment of everything since the last one plus at-risk older words, across skills, with real-life milestone checks. A missed Sunday stays available until done. | yes |

Plus **Conjugation** (interactive reference: groups → ending patterns → forms →
meaning, usage, nuance, register, mistakes, contrasts, examples) and **Progress**.

## Kanji radicals (Kanji tab)

A separate page with its own daily lesson (own schedule — it never changes the vocabulary
reviews). Radicals (部首) are taught in order of how many kanji in your lessons they file,
each with its variants and their names/positions (氵 さんずい, 亻 にんべん), meaning, its
readings as a kanji, and its member kanji with all their 音/訓 readings and sample words —
words you have met in lessons first. Each sample shows which reading the kanji uses in that
word (on / kun / special), so the general rule (on-yomi in compounds, kun-yomi alone or with
okurigana) is visible in real words. Data: KANJIDIC2 (EDRDG, CC BY-SA 4.0) and Kanji alive
(CC BY 4.0); rebuild with `npm run build:kanji` after the curriculum changes.

## BJT Training (BJT tab)

A separate exam-preparation page for the **BJT Business Japanese Proficiency Test**, with a
personal target of **400+ by Mon 30 Nov 2026**. Its own data (`state.bjt`) and schedule — it
never changes the vocabulary or kanji schedules.

- **Format (official sources, `data/bjt/sources.json`)**: 80 four-option questions in three
  parts — Part I listening (場面把握 5 · 発言聴解 10 · 総合聴解 10, ~45 min), Part II
  listening & reading (状況把握 5 · 資料聴読解 10 · 総合聴読解 10, ~30 min), Part III reading
  (語彙・文法 10 · 表現読解 10 · 総合読解 10, 30 min). Scores are IRT-scaled 0–800 (J5–J1+).
- **Questions**: 210 *original* BJT-style practice items (`data/bjt/questions/`), none official,
  each with an explanation, a reason for every distractor, the error pattern each distractor
  targets, key vocabulary and keigo notes. Schema: `data/bjt/SCHEMA.md`; writing rules:
  `data/bjt/AUTHORING.md`; `npm run validate:bjt` checks them. **260 business words and
  expressions** (`data/bjt/vocab.json`), each verified against JMdict, Tatoeba or
  文化審議会「敬語の指針」.
- **36-day plan** (Oct 26 → Nov 30): five phases (diagnostic & foundations → core competence →
  target weaknesses → timed exam practice → final consolidation) and a final check on Nov 30.
  Each day's tasks are generated when you first open the page that day, from your results and
  the minutes you choose (chips on the page; default in Settings). Listening parts get most of
  the practice; Sundays are lighter. **Missed days**: routine practice is not piled onto later
  days; the next plan already targets your weakest areas, plus at most one optional catch-up.
  The diagnostic, the timed assessment (Nov 13–15) and the two mocks (Nov 19–22, 26–28) carry
  forward until done or replaced.
- **Adaptivity**: a 25-question diagnostic across all nine sections (difficulty staircase),
  then practice aimed at ~65% predicted success, weighted toward the weakest part/section,
  biased toward your recurring error patterns (missed negation, suggestion vs decision,
  wrong keigo direction, information split across audio and chart…). Wrong or "not sure"
  answers return in **Mistake review** (FSRS). A weakness is recomputed from recent results,
  so it disappears when you improve.
- **Listening**: dialogues are spoken by the device's Japanese voices — men's and women's
  roles get different voices when the device has them, otherwise different pitch. Speed rises
  with item difficulty and in the timed phases. The transcript and spoken options stay hidden
  until you answer. Replays are free in practice; in mocks each recording plays once (or
  twice, a setting). Without a Japanese voice, listening can only be read as a transcript and
  is flagged *assisted* (never counted as listening), and mocks are unavailable.
- **Scores — what is and isn't shown**: raw accuracy, accuracy by section/skill, change over
  time, accuracy under time pressure, and a *readiness indicator*: estimated success on the
  items the authors placed in the target band (difficulty 3), with a 90% range, from a simple
  item-response model on author-assigned difficulties. It is labelled "insufficient data" until
  each part has 12+ first-time answers. **No 0–800 score is ever computed**: the official
  scaling uses item parameters only the test owner has.
- Tests: `npm run test:bjt` (Node), `npm run test:e2e:bjt` (Chrome, fake speech engine), a
  WebKit check in `npm run test:webkit`. Manual audio/phone checks: `docs/BJT_MANUAL_TEST.md`.

## Topic priorities (Settings)

Choose 1–3 topics you need most (e.g. Banking, Post office, City hall) and order them.
About three in four mornings then take new words from these (rotating 3 : 2 : 1 by rank;
a topic's prerequisites come first and are labelled as such), the rest from other topics so
learning stays broad. Reviews of everything you've learned are unaffected, the evening still
adds nothing new, and Recall/Training are unchanged. The home screen says why a morning's
topic was chosen.

## Typing on a phone

Tap the dashed answer box to open the keyboard (no automatic focus on touch screens — on
iPhones that can leave the field focused with no keyboard). **Check** always submits what is
in the box, even unconfirmed kana; only the Enter that confirms a kana→kanji conversion is
ignored. If typing misbehaves on your device: Settings → *Typing diagnostics* shows a live
event log under the answer box. Manual test procedure: `docs/MANUAL_PHONE_TEST.md`.

## Nothing is a fixed quantity

There are no hard-coded question counts, lesson lengths, pair counts or
repetition counts. Each session is sized from:
- the minutes you have (Settings; defaults 20 / 15 / 40),
- **your own median time** per exercise type (priors only until there is history),
- how many skills are due and how much they matter,
- your recent accuracy (struggling → fewer new words),
- and what verified, eligible material exists.

A morning aims for roughly 7–14 new words as a *preference*, shrinking for hard
topics or a heavy review load and growing (up to a safeguard) for easy ones, but
it never pads with words from another topic. What doesn't fit is **carried
forward explicitly**, never marked learned. Mistakes get bounded extra practice
(a different exercise for the same skill, after a gap; per-item and per-session
caps). Typos are feedback, not failures. All tunable safeguards are in
`js/policy.js`, separate from curriculum data, each documented.

## How memory is modelled

`js/srs.js` implements **FSRS-4.5** (the open scheduler used by Anki) with its
published default parameters. It runs separately for each **(word, skill)**
pair: recognition, listening, kanji reading, typed recall, speaking, conjugation,
use in context. So recognising a word never counts as being able to say it.
Grades are derived from evidence: wrong or "don't know" → Again; correct only
after a strong hint → Again; typo, vowel-length slip or light hint → Hard;
correct unaided → Good; correct production clearly faster than *your own*
usual time → Easy. Multiple choice can never earn Easy.

**Isolation of Recall/Training** is enforced in the data layer (`js/store.js`):
the official memory is written only by `recordScheduled()`, which throws if
called from a practice mode; practice is written by `recordPractice()`, which
only receives the separate `practice` store. Tests freeze the official memory
and run whole Recall and Training sessions to prove nothing changes.

## Voices (audio)

The app uses the device's own Japanese speech engine (Web Speech API), so audio
works offline when an **on-device** Japanese voice is installed. Settings lists
only voices that really exist on the device, with a sample button, a speed
control, and on-device/online labels. Online voices are never chosen
automatically. Tested here on Windows with Chrome 155: Microsoft Ayumi, Haruka,
Sayaka (female) and Ichiro (male). To get good offline voices:
- **iPhone/iPad:** Settings → Accessibility → Spoken Content → Voices → Japanese → *Kyoko (Enhanced)* / *Otoya (Enhanced)*
- **Android:** Settings → System → Languages → Text-to-speech → Google → Install voice data → Japanese
- **Windows:** Settings → Time & language → Speech → Add voices → Japanese
- **Mac:** System Settings → Accessibility → Spoken Content → System voice → Manage voices → Japanese

No voice? Listening exercises are replaced by reading ones automatically.

## Content and verification

Content is in `data/` (schema: `data/SCHEMA.md`); learner state is in the
browser. **Only verified items are served.** Vocabulary is checked against
JMdict (EDRDG) with `scripts/verify_jmdict.js`, which requires the exact written
form and its *primary* reading, records what the dictionary says, and takes
verb/adjective classes from the dictionary's part of speech. Phrases and
patterns need real usage evidence (Tatoeba sentences, CC BY 2.0 FR) or an
official or grammar reference. Constructed example sentences are labelled as
such. Anything unverifiable is in `data/quarantine.json` with a reason, and is
never loaded. See `VERIFICATION_LOG.md`.

## Data, backup, migration

Progress is stored in `localStorage` (`michi_v2`, written as one atomic document
after every answer, with a rolling previous copy for automatic recovery).
Progress from the old version (`michi_v1`) is migrated automatically: Leitner
boxes map to equivalent FSRS stability, production history is kept, and nothing
is marked mastered that wasn't produced before. A byte-identical copy of the old
data is kept (`michi_v1_backup`), downloadable and restorable from Settings.
An interrupted lesson resumes where you left it.

## Code map

`js/policy.js` tunable safeguards · `js/calendar.js` local dates and the Sunday unlock ·
`js/kana.js`, `js/answer.js` answer checking · `js/conjugate.js` conjugation rules ·
`js/srs.js` FSRS · `js/curriculum.js` loading and validation · `js/exercises.js`
exercise generators and validation · `js/planner.js` session planning and
adaptation · `js/store.js` state, migration and isolation · `js/progress.js`
analytics · `js/speech.js` voices and dialogues · `js/bjt.js` BJT plan, selection, scoring, mocks · `js/bjtview.js` BJT screens · `js/engine.js` the single façade used by
the UI and the tests · `js/app.js` UI.
