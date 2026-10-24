# Writing BJT-style practice questions

Read `SCHEMA.md` first. Every file must pass `node scripts/validate_bjt.js data/bjt/questions/<file>.json`.

## Non-negotiables
1. **Original work.** Study the official samples for *format and reasoning demands* only
   (https://www.kanken.or.jp/bjt/english/sample/sample01.html, sample02, sample03). Never copy or
   lightly paraphrase an official question, scenario, chart or document. Invent new companies,
   products, numbers and situations.
2. **Natural contemporary business Japanese.** Correct keigo direction (尊敬語 for the client's /
   superior's actions, 謙譲語 for one's own side, including one's own boss when speaking to
   outsiders: 「部長の田中は外出しております」). Real workplace phrasing: 恐れ入りますが、
   差し支えなければ、承知しました、かしこまりました、念のため、取り急ぎ、ご確認のほど…
3. **One defensible answer.** A Japanese business professional must agree the key is right
   and each distractor is wrong *for a stated reason*. No trick ambiguity.
4. **Plausible distractors.** Each targets a real error pattern (one `traps` tag each): e.g.
   the original plan before a change (`change`), a suggestion that was rejected (`suggestion`),
   a number mentioned for something else (`number`), a polite-sounding but wrong keigo
   direction (`politeness`), something said but not asked (`detail`).
5. **No test-wise clues.** Options similar in length and grammatical shape; the key should
   *paraphrase* what was said, while distractors may reuse words that were heard. The key
   must not be systematically the longest or most hedged option. Don't make "all of the
   above" style options.
6. **Difficulty from comprehension demands, not obscure words.** Harder = more indirect
   (婉曲表現: 「それはちょっと…」「検討させていただきます」), information spread over more turns,
   a change of plan, competing numbers, implied refusal, faster/denser talk — not rare kanji.
7. **Speech-safe audio text** (it is read by a Japanese text-to-speech engine):
   - write normal Japanese (kanji + kana); numbers as digits are fine (3時、15日、1,200円、20%);
   - no parentheses, ※, 〜, ／, emoji, romaji, or stage directions in `audio` text;
   - use common surnames (田中, 鈴木, 山本, 佐藤, 高橋, 中村, 小林, 加藤, 吉田, 山田, 松本, 井上, 木村, 林, 清水)
     and katakana or plain company names (さくら物流, 東和商事, ミナト電機). If a kanji reading is
     ambiguous, add `"tts": "<kana reading of the whole line>"`.
   - one speaker per line; alternate voices of different gender in two-person dialogues
     where natural (M1/F1); use M2/F2 for a third/fourth person; `N` narrates the setup
     ("会社で男の人と女の人が話しています。") and nothing else.
8. **Length** — dialogues: difficulty 1–2: 3–5 turns; 3: 5–8 turns; 4–5: 7–12 turns.
   Spoken options (Part I) must be short enough to remember: ≤ 30 characters each.
9. **Feedback is teaching.** `explanation` (English) quotes the decisive Japanese and says
   why it settles the question; each `whyWrong` names the specific reason; `evidence` is the
   decisive Japanese phrase; `vocab` lists the 2–6 most useful business words/expressions
   (jp, kana in hiragana/katakana only, en); `nuance` explains keigo/register points.
10. **Variety.** Spread topics (meetings, scheduling, phone, email, clients, negotiation,
    orders, delivery, production, quality, complaints, costs/budget, payment, HR, etiquette,
    presentations, reports, sales, IT, business travel, recruitment) and question targets
    (what next, why, what was decided, what the speaker wants, what the problem is, which
    item, how many/when, who will do it, what is implied).

## Difficulty mix per file
≈ 10% d1 · 25% d2 · 35% d3 · 20% d4 · 10% d5. Mark `difficulty` honestly by the bands in SCHEMA.md.

## Worked example (Part I 総合聴解 — listening)
```json
{
  "id": "p1l-000", "section": "listening", "difficulty": 3, "skills": ["intention", "detail"], "topic": "delivery",
  "visual": { "type": "scene", "setting": "office", "caption": "A woman sits at her desk holding a phone receiver; a male manager stands beside her holding a document.",
    "elements": [ { "kind": "desk", "x": 38 }, { "kind": "person", "x": 38, "pose": "sit", "holds": "phone", "facing": "right", "g": "f", "label": "A" },
                  { "kind": "person", "x": 70, "pose": "stand", "holds": "document", "facing": "left", "g": "m", "label": "B" } ] },
  "audio": { "lines": [
    { "spk": "N", "text": "会社で女の人と男の人が話しています。" },
    { "spk": "F1", "text": "課長、さくら物流から連絡がありまして、明日の納品が午後になるそうです。" },
    { "spk": "M1", "text": "午後か。お客様向けの説明会は10時からだったね。" },
    { "spk": "F1", "text": "はい。サンプルが間に合いませんので、説明会を午後に移しましょうか。" },
    { "spk": "M1", "text": "いや、日程は動かせないよ。展示用のサンプルが手元にあるから、それを使おう。足りない分は後日お届けすると、お客様に伝えておいてくれる？" },
    { "spk": "F1", "text": "承知しました。" } ],
    "question": "女の人はこのあと何をしますか。" },
  "stem": "女の人はこのあと何をしますか。",
  "options": ["説明会を午後に変更する", "物流会社に納品を急がせる", "客に後日届けると連絡する", "展示用サンプルを取りに行く"],
  "answer": 2,
  "explanation": "The manager rejects moving the session (「日程は動かせないよ」) and asks her to tell the customers that the missing samples will be delivered later (「後日お届けすると、お客様に伝えておいてくれる？」). She accepts with 「承知しました」, so her next task is to contact the customers.",
  "whyWrong": ["She only proposed this; the manager rejected it: 「日程は動かせない」.", "Nobody asks the logistics company to hurry; the delay is simply accepted.", "", "The display samples are already at hand (「手元にある」); no one needs to fetch them."],
  "traps": ["suggestion", "inference", null, "detail"],
  "evidence": "足りない分は後日お届けすると、お客様に伝えておいてくれる？",
  "vocab": [ { "jp": "納品", "kana": "のうひん", "en": "delivery of goods" }, { "jp": "後日", "kana": "ごじつ", "en": "at a later date" },
             { "jp": "手元", "kana": "てもと", "en": "at hand" }, { "jp": "承知しました", "kana": "しょうちしました", "en": "Understood (humble)" } ],
  "nuance": "〜ておいてくれる？ is a superior's casual request to a subordinate; お届けする is humble (謙譲語) because it is the company's own action toward the customer."
}
```
