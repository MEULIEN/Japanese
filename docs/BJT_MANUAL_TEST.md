# BJT page — manual checks (what automated tests cannot verify)

Automated tests use a fake speech engine (Chrome) and desktop WebKit with touch emulation.
They prove the logic, the screens and the playback *sequence*, not how the audio sounds or
how a real phone behaves. Do these once on each device you study on (~15 minutes).

## 1. Voices and pronunciation (by ear)
1. Settings → Voice: pick the best on-device Japanese voice (iPhone: *Kyoko/Otoya (Enhanced)*;
   Windows: Haruka/Ayumi/Sayaka + Ichiro). Having **one male and one female voice installed**
   gives real speaker contrast; with one voice, roles differ only by pitch.
2. BJT → Listening → play 5 questions. Check, and note the id of any item that is wrong
   (shown at the end of the feedback, e.g. `id p1l-014`):
   - men's lines use the male voice, women's the female voice, the narrator is distinct;
   - numbers, prices and dates (3時半, 1,200円, 11月14日) are read correctly;
   - surnames and company names (さくら物流, 東和商事) are read correctly;
   - keigo (いらっしゃいます, 申し上げます, 承知いたしました) is clear;
   - pauses between turns are natural; nothing is cut off mid-sentence.
   Fix for a misread: add `"tts": "<kana>"` to that line in `data/bjt/questions/*.json`.
3. Speed: Settings → Voice speed scales everything; later phases and harder items are 5–10%
   faster on purpose.

## 2. Phone interaction
1. Open BJT on the phone (Add to Home Screen). Rotate once; nothing should overflow sideways.
2. Start the diagnostic. During playback, tap other controls: playback must not reset your
   choice; "Stop" must stop the voice.
3. Lock the phone during a question and unlock: the answer you gave stays; an unfinished
   session is offered on the BJT page (Resume).
4. Mock exam (split mode): start, answer 2 questions, switch to another app for a minute,
   come back — the clock must not have advanced while away (it shows the interruption in the
   report if it was over 2 minutes).
5. Turn on airplane mode after one online visit: the BJT page and questions must still load.

## 3. Data safety
Settings → Export backup before Nov 26: the backup includes all BJT results.
