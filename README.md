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
- `npm run audit` — validates provenance and regenerates `VERIFICATION_LOG.md`
- `npm run build:index` — regenerates `data/index.json` after adding a topic file
- `scripts/bump-version.sh` — bump the cache stamp before deploying

## The daily structure

| | What it is | Changes your schedule? |
|---|---|---|
| **Daily Morning** | Picks the next topic, runs a short diagnostic **on this lesson's words only**, teaches what you don't know (in chunks), practises it in varied ways, mixes in due reviews, and ends with a delayed "can you still produce it?" check. | yes |
| **Daily Evening** | **No new words.** Re-uses the morning's words in different exercises (productive first: sentences, typing, speaking, forms, listening) plus due older reviews. | yes |
| **Recall** | Your own study: weakest words first, or by topic, in the direction you choose (meaning→Japanese, kanji→reading, reading→kanji, listening, context, conjugation, explain-it-simply). Endless. | **no** |
| **Training** | Open-ended practice: mixed, rapid recall, conjugation, listening, sentences, memory span, category switching, rebuild-later, **get unstuck** (describe a word you can't remember, with graduated hints). | **no** |
| **Weekly** | Unlocks **Sunday 00:00 in your time zone** (Settings). A broad assessment of everything since the last one plus at-risk older words, across skills, with real-life milestone checks. A missed Sunday stays available until done. | yes |

Plus **Conjugation** (interactive reference: groups → ending patterns → forms →
meaning, usage, nuance, register, mistakes, contrasts, examples) and **Progress**.

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
analytics · `js/speech.js` voices · `js/engine.js` the single façade used by
the UI and the tests · `js/app.js` UI.
