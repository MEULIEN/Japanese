# Curriculum notes (2026-10-22)

The verified vocabulary curriculum is 455 items in 16 topic files (`data/items/<topic>.json`), with 514 Tatoeba example sentences. A further 15 items are in `data/quarantine.json`. All 41 legacy items have been migrated with their original ids. One of them, `t_koko_meshiagaru`, is now quarantined.

## Counts

| topic | items | t1 | t2 | t3 | say | hear | read | phrases | with examples | lesson:false |
|---|---|---|---|---|---|---|---|---|---|---|
| survival | 42 | 35 | 7 | 0 | 42 | 0 | 0 | 12 | 22 | 0 |
| restaurant | 44 | 25 | 14 | 5 | 36 | 6 | 2 | 8 | 29 | 1 |
| konbini | 38 | 22 | 14 | 2 | 31 | 1 | 6 | 5 | 24 | 0 |
| directions | 30 | 12 | 16 | 2 | 30 | 0 | 0 | 4 | 19 | 0 |
| transport | 30 | 10 | 14 | 6 | 21 | 3 | 6 | 3 | 14 | 0 |
| intro | 24 | 11 | 12 | 1 | 24 | 0 | 0 | 3 | 17 | 0 |
| time | 31 | 13 | 18 | 0 | 31 | 0 | 0 | 1 | 30 | 0 |
| daily | 31 | 12 | 16 | 3 | 31 | 0 | 0 | 0 | 25 | 1 |
| describe | 29 | 13 | 13 | 3 | 29 | 0 | 0 | 0 | 26 | 0 |
| home | 30 | 13 | 12 | 5 | 28 | 0 | 2 | 2 | 16 | 0 |
| friends | 27 | 9 | 15 | 3 | 27 | 0 | 0 | 3 | 18 | 0 |
| health | 31 | 18 | 11 | 2 | 31 | 0 | 0 | 6 | 23 | 0 |
| signs | 28 | 20 | 6 | 2 | 2 | 0 | 26 | 0 | 2 | 0 |
| places | 10 | 2 | 3 | 5 | 10 | 0 | 0 | 0 | 2 | 0 |
| recovery | 21 | 8 | 11 | 2 | 21 | 0 | 0 | 0 | 12 | 0 |
| drive | 9 | 0 | 9 | 0 | 0 | 0 | 9 | 0 | 0 | 0 |

Survival and restaurant are above the 30-item target because they contain the multi-word phrases. Most of these phrases repeat words that also appear in the same topic.

## How items were verified

- **Words** were checked with `scripts/verify_jmdict.js`, which compares each word against JMdict through the jisho.org API. Each item carries a structured `dictionary` source. `verb_class` and `adj_class` come from the dictionary part of speech.
- **Phrases** (`pos: "phrase"`) have an approved Tatoeba sentence that matches exactly, ignoring punctuation. It is stored as a `usage` source with the chosen direct English translation, followed by the JMdict sources for the key words. Each English meaning (`en`) follows that translation.
- **Examples** (up to 2 per item) cover only tier 1–2 `say` items. Each one is a real Tatoeba sentence of 20 characters or fewer that uses the word in the stated meaning, with a direct English translation. Every sentence was reviewed by hand. Sentences that were unnatural, crude, used the word in another sense (e.g. 上手く, 本当 inside 本物), or contained only a compound (大学生 for 大学) were rejected. Items with no good candidate have no examples, for example はい, 国, 前, ある, する, 出す, ごみ and 乾杯.
- **Legacy items** keep their ids and their official and reference sources: MLIT, the Gunma police poster, MAFF, Kanagawa, Edogawa, Mapion/rosen-zu, Kyoto City, CARLA and PSU. The old strings are converted to `{type, name, ref?, note (original text verbatim), checked?}`. Old "JMdict via site X" strings are replaced by the structured dictionary source whenever the verifier found the entry. Place names and 追越し禁止 / 転回禁止 have no exact JMdict entry, so they rest on their existing official or reference sources.

## Legacy id mapping

- **signs:** s_deguchi, s_iriguchi, s_eki, s_kinen, s_eigyochu, s_junbichu (en changed to "in preparation (shop not yet open)" to match JMdict), s_otearai.
- **places:** all ten p_* ids.
- **restaurant:** f_omizu, f_menu, f_okaikei, f_udon, f_mochikaeri, f_chumon, and f_suito (tier 3, tag thing/shop_item).
- **survival:** t_sumimasen and t_arigato. t_otearai_doko is now backed by Tatoeba 227063.
- **konbini:** g_shomi, g_shohi, g_zeikomi, g_waribiki (all `use: read`).
- **drive:** all nine d_* ids.
- **Quarantined:** t_koko_meshiagaru (see below).
- **Promoted out of the old quarantine** because exact Tatoeba sentences were found: t_mouichido (214165), t_yukkuri (8795518), t_korenani (344924).

## Quarantine

The 6 old entries that are still quarantined are kept. The reasons for t_kore and t_nihongode were updated.

New entries:

| id | text | reason |
|---|---|---|
| w_kocchi | こっち | Not the primary reading of 此方 (the primary reading is こちら). こちら is taught instead. |
| t_koko_meshiagaru | (legacy) ここで召し上がりますか、それともお持ち帰りですか | No exact Tatoeba sentence. Replaced by x_omochikaeri_desuka お持ち帰りですか. |
| x_fukuro_irimasuka | 袋はいりますか | No exact usage evidence for this or 4 other wordings. The words are verified. |
| x_atatamemasuka | 温めますか | No exact usage evidence. The verb 温める is verified with `use: hear`. |
| x_zenbude_ikura | 全部でいくらですか | No exact usage evidence. |
| x_kaado_haraemasuka | カードで払えますか | No exact usage evidence. Covered by カードは使えますか. |
| x_netsu_arimasu | 熱があります | No exact usage evidence. Covered by 熱があるんです. |
| x_kowareteimasu | 壊れています | No exact usage evidence. |
| x_nanji_made | 何時までですか | No exact usage evidence. |

河原町, 祇園 and 止まれ remain quarantined. No official Kyoto or traffic-authority source was added for them.

## Judgment calls

- **Kana-written words** (ある, これ, ちょっと, いくら, きれい, もの and others) are matched against their kanji headword's entry, which is recorded in `matched`, e.g. `幾ら【いくら】 (written in kana: いくら)`. See the verifier changes below.
- **ある** is `verb_class: godan`. JMdict tags it "Godan verb with 'ru' ending (irregular verb)", so the engine must special-case its negative form ない. **いい** is `adj_class: ii`. **いらっしゃる** is `aru-honorific` with `lesson: false`. **死ぬ** has `lesson: false`.
- **`gloss_reviewed: true`** was used only where the gloss word is a stop-word in the verifier and I read the senses myself: お願いします ("please"), これ, それ, あれ ("this", "that"), 一つ ("one") and 何か ("something").
- **Field placement:** `verb_class` and `adj_class` appear only on verbs and adjectives. Dictionary-derived na-adjective classes on nouns and adverbs were stripped, e.g. 現金, 普通, まだ, みたい. The verifier's `takes_suru: true` is kept on nouns that JMdict lists as する-nouns (料理, 掃除, 予約 …).
- **Tags and objects:** `obj` is set only where the sentences come out natural: 食べる/作る → food, 飲む → drink, 買う → shop_item/food/drink, する → activity, 使う/出す → thing, 呼ぶ → person. 見る and 聞く have no `obj`, because the tag set has no "watchable" or "listenable" tag. 映画 and 音楽 are tagged `hobby`. 乗る and 会う take に, so they have no `obj`.
- **TTS:** `tts: "kana"` is set on 何, 角, 箸, 橋, 辛い, 私, 人, 家, 明日, 何時, 時, 上, 下, 中, 形, 男, 女, 大家 and all place names.
- **Kyoto details:** 燃やすごみ (the Kyoto City category name) and 燃えるごみ are both included and both are verified in JMdict. 駐輪場 is tier 1.
- **Greetings:** おはようございます, こんにちは, こんばんは, ただいま, 行ってきます and お疲れ様 are verified as JMdict expressions. お疲れ様です has no entry of its own, so the item is お疲れ様 with a note.

## Verifier changes (`scripts/verify_jmdict.js`)

1. **Homographs:** all exact (form + primary reading) matches are now collected, and the one whose senses best overlap the English gloss is picked. Ties go to the common entry, then to an entry with a real part of speech. Without this, いくら matched イクラ, する matched 掏る ("to pickpocket"), まだ matched a tree name, and ラーメン matched a Wikipedia stub.
2. **Kana-written words:** a kana-only `jp` may match a kanji headword when it is that entry's first reading and the entry is tagged "Usually written using kana alone". An item can opt in for a common entry without that tag by setting `kana_written: true`. This was used only for きれい and もの, and the flag is stripped from the output.
