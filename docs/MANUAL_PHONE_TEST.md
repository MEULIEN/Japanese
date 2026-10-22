# Manual phone test — typing answers (5 minutes)

Automated tests run in desktop Chrome and desktop WebKit with phone emulation.
They cannot show a real on-screen keyboard or drive a real Japanese IME, so please
run this once on your phone after updating (reload the page twice, or close and
reopen the home-screen app, so the new version is installed).

**Setup:** Settings → *Typing diagnostics* → **on**. A small log appears under
every answer box. If anything below fails, take a screenshot that includes the log.

1. **Keyboard opens.** Start *Daily Morning* (or *Recall* → Direction *Meaning → Japanese* → Start)
   until a "How do you say…" card appears. Tap the dashed box *"Tap here to type your answer ⌨"*.
   ✅ The keyboard opens and the question and box stay visible above it.
2. **Rōmaji.** Type `omizu` (or the answer shown after "I don't know") → tap **Check**. ✅ Graded.
3. **Kana keyboard, conversion pending.** On the next typed card, switch to the Japanese
   (kana/flick) keyboard, type the reading so it is still underlined, then tap **Check**
   without confirming. ✅ The answer is graded (this was the iPhone bug).
4. **Kanji conversion + Enter.** Type a reading, pick a kanji candidate, press the keyboard's
   confirm key (確定/改行) once — ✅ nothing is submitted yet — then press it again (Go/開く).
   ✅ Submitted once, not twice.
5. **Draft kept.** Type something, tap **Hint**. ✅ Your text is still in the box.
6. **Small screen / landscape.** Rotate the phone and repeat step 1. ✅ Box and Check reachable.

Turn diagnostics off afterwards (Settings).
