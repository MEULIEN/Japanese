# Curriculum notes

## Update 2026-10-22 (b): uploaded packs merged, new admin topics

The curriculum now has **881 verified items in 20 topic files**, with 651 Tatoeba example sentences. 22 items are in `data/quarantine.json`. The earlier notes below (section "Curriculum notes (2026-10-22)") describe the first 455 items and still apply.

### Counts (before → after)

| topic | before | after | say | hear | read | phrases | with examples | items with `aliases` |
|---|---|---|---|---|---|---|---|---|
| survival | 42 | 64 | 61 | 3 | 0 | 27 | 22 | 13 |
| restaurant | 44 | 95 | 83 | 10 | 2 | 14 | 29 | 15 |
| konbini | 38 | 115 | 81 | 9 | 25 | 15 | 27 | 14 |
| directions | 30 | 42 | 42 | 0 | 0 | 4 | 19 | 0 |
| transport | 30 | 46 | 31 | 4 | 11 | 3 | 15 | 5 |
| intro | 24 | 26 | 26 | 0 | 0 | 5 | 17 | 3 |
| time | 31 | 31 | 31 | 0 | 0 | 1 | 30 | 0 |
| daily | 31 | 31 | 31 | 0 | 0 | 0 | 25 | 0 |
| describe | 29 | 29 | 29 | 0 | 0 | 0 | 26 | 0 |
| home | 30 | 45 | 40 | 0 | 5 | 4 | 20 | 0 |
| friends | 27 | 35 | 35 | 0 | 0 | 3 | 18 | 2 |
| health | 31 | 36 | 33 | 1 | 2 | 7 | 25 | 0 |
| signs | 28 | 45 | 7 | 0 | 38 | 0 | 2 | 10 |
| places | 10 | 23 | 23 | 0 | 0 | 0 | 2 | 0 |
| recovery | 21 | 21 | 21 | 0 | 0 | 0 | 12 | 1 |
| drive | 9 | 14 | 0 | 0 | 14 | 0 | 0 | 0 |
| **bank** (new) | 0 | 47 | 32 | 4 | 11 | 10 | 13 | 0 |
| **post** (new) | 0 | 48 | 36 | 1 | 11 | 8 | 20 | 0 |
| **cityhall** (new) | 0 | 56 | 35 | 8 | 13 | 10 | 18 | 0 |
| **work** (new) | 0 | 32 | 25 | 0 | 7 | 3 | 18 | 0 |

### Part A: the learner's uploaded packs (`origin/master`: pack_food, pack_grocery, pack_signs, pack_talk, pack_places, pack_drive)

The packs contain 327 items, all marked "verified". Most cite `irodori.jpf.go.jp/assets/data/wordlist_X.pdf`. That host (without `www.`) does not resolve. The real files are on `https://www.irodori.jpf.go.jp/assets/data/` and are linked from https://www.irodori.jpf.go.jp/resources.html:

- 入門 ことばリスト: https://www.irodori.jpf.go.jp/assets/data/wordlist_X.pdf
- 初級1 ことばリスト: https://www.irodori.jpf.go.jp/assets/data/wordlist_Y.pdf
- 初級2 ことばリスト: https://www.irodori.jpf.go.jp/assets/data/wordlist_Z.pdf
- Machine-readable copy of all three lists: https://www.irodori.jpf.go.jp/assets/data/wordlist_all.xlsx
- 漢字リスト: https://www.irodori.jpf.go.jp/assets/data/kanji_list.xlsx (`Kanji_all.pdf` is the printed version)
- 文型リスト: https://www.irodori.jpf.go.jp/assets/data/sentence_patterns_list.xlsx
- 文法ノート: https://www.irodori.jpf.go.jp/assets/data/Grammar_all.pdf

**How items were checked.** Each item was matched against `wordlist_all.xlsx` by headword and reading. Irodori's `A／B` variants and optional `（…）` parts were expanded. A match had to fall in the cited lesson. The PDF text was then extracted with pypdf, and the entry's English (or its rōmaji, for 入門) had to appear on a page of that lesson. Each confirmed item gets a source like this:
`{type:"reference", name:"Japan Foundation いろどり 生活の日本語 — 入門 ことばリスト L16", url:"https://www.irodori.jpf.go.jp/assets/data/wordlist_X.pdf", lesson:"L16", activity:4, entry:"<headword>【<reading>】 <English>", checked}`.
The placeholder URL is no longer cited anywhere. A JMdict source is also attached whenever the verifier matched the exact form and primary reading.

**Outcome for the 327 items:**

| outcome | items |
|---|---|
| Added. Confirmed in Irodori (word list, plus the activity headings, 漢字リスト or 文法ノート as noted below) | 196 |
| Added. Verified elsewhere: JMdict (四つ…九つ), Mapion station lists (烏丸, 三条, 七条, 北山, 御池, 河原町) or MLIT + Koriyama furigana leaflet (5 road signs) | 18 |
| Merged into an existing item as an `aliases` entry | 63 |
| Same id and word already in the curriculum (legacy items migrated earlier); no change | 42 |
| Quarantined | 8 |

Special cases among the Irodori confirmations:
- **Activity headings.** 日本語、できますか？ (入門 L2 §2), これは日本語で何と言いますか？ (L2 §3) and こちら、温めますか？ (L16 §4) are activity headings in the word-list PDF. They are cited with a `quote`. こちら、温めますか？ also has Tatoeba 2806584.
- **〜貸してください** is in the 文法ノート and 文型リスト under 入門 **L10**, not L6 as the pack said. It also has Tatoeba 11069519.
- **Numbers 一 to 十, 百, 千, 万.** The kanji form and reading come from the 漢字リスト (入門 L16/L17), and the meaning from the word list's digit entries (e.g. `4【よん】 four`). JMdict gives し and しち as the primary readings of 四 and 七, so no dictionary source is attached to those two.
- **女性** is in 初級1 L15 §3, not 初級2 L11 as cited. The correct lesson is cited.
- **二割引** became **二割引き** and **〜%引** became **〜％引**, to match Irodori's printed form. For 3階 and 8階, Irodori gives two readings. The kana is set to さんがい and はちかい, and the other reading goes in `accept`.

**Merged as aliases (63).** In each case the existing id is kept. The uploaded id goes into `aliases`, an Irodori reference is added where it was confirmed, and `say_when` is copied if the existing item had none. Kana spellings that Irodori uses go into `accept`: すし (寿司), だいじょうぶです (大丈夫です) and お疲れさま (お疲れ様). Two of the merges differ by more than punctuation:
- `t_ikura` これ、いくらですか？ → `x_kore_ikura` これはいくらですか. Irodori's 文型リスト (入門 L16) is added as a source, and `accept: ["これ、いくらですか"]`.
- `t_kore_kudasai` これ、ください → `x_kore_kudasai`. The 文型リスト source (入門 L6) is added.

The full alias list is in each item's `aliases` field (grep `"aliases"`).

**Quarantined (8),** with the original fields kept and `from_pack` set:
- 表示価格: Irodori has only 表示価格より, and there is no JMdict entry.
- よくわかりません: Irodori lists よく and わかりません separately, and there is no stand-alone Tatoeba sentence.
- 八条, 堀川, 千本, 川端, 白川: street names only. The cited kyoto.travel map PDF returns 404, and no station list or official source with the reading was found.
- 指定方向外進行禁止: the name is in MLIT's list, but no furigana source was found.

**Promoted out of quarantine.** `p_kawaramachi` 河原町 (かわらまち) is now backed by the Mapion Hankyu Kyoto Line list, which has 京都河原町駅（きょうとかわらまちえき）. 烏丸, 三条, 七条, 北山 and 御池 were added on the same kind of evidence. Mapion is the same reference type the existing station items use. Each item's `en` names the station that supports its reading.

**Topic placement:**
- food → restaurant
- grocery → konbini
- signs → signs, except:
  - station words (exits, 上り/下り, 待合室, bus and taxi stands, 各駅停車) → transport
  - floors (〜階, 1階 to 10階) → directions
  - ATM → bank
  - 料金 → post
- talk:
  - greetings and requests → survival
  - restaurant staff phrases, ここで and テイクアウトで → restaurant
  - cashier phrases → konbini
  - reactions → friends
  - 〜から来ました and どちらからですか → intro
  - 失礼します and お先に失礼します → work
- places → places, except 銀行 → bank, 市役所 → cityhall and 通り → directions

**Latin-script items are `use: "read"`.** ATM, Suica and PayPay are written in Latin letters in Irodori. The answer checker treats Latin input as rōmaji, so a typed-recall card for them can never be graded correct (the validator returned `answer-unacceptable`). They are therefore taught for reading only.

### Part B: new topics `bank`, `post`, `cityhall` and `work`, plus deepened topics

Topics were added to `topics.json` with orders 17–20. Prerequisites: bank → survival, konbini. post → survival. cityhall → survival, intro. work → intro, time.

**Evidence:**
- **Words.** `verify_jmdict.js` was used: 169 candidates, of which 159 verified directly and the rest were reviewed by hand. Two words were dropped because nothing confirmed them: 支払期限 and 通帳記入. An Irodori word-list source is added wherever the word is in the list. Irodori 初級2 L14 covers the post office slip and the ATM, 初級1 L14/L15 cover work leave and clinic forms, and 入門 L3 covers forms. Some words rest on Irodori alone: 保管期限, 配達日 and 休暇届.
- **Compounds without a JMdict entry use official text** whose exact wording was fetched and is quoted:
  - 住民票の写し, 転入届/転出届/転居届, 印鑑登録 and 区役所: Kyoto City press release (2026-01-28), https://www.city.kyoto.lg.jp/bunshi/cmsfiles/contents/0000349/349188/kouhou(20260128).pdf
  - 在留カード: ISA, https://www.moj.go.jp/isa/applications/procedures/whatzairyu_00001.html
  - 不在連絡票 and 追跡: Japan Post FAQ, https://www.post.japanpost.jp/question/delivery-pickup/category01.html
  - お問い合わせ番号: Japan Post tracking, https://trackings.post.japanpost.jp/services/srv/search/input
  - チャージ: JR West ICOCA, https://www.jr-odekake.net/icoca/ ("チャージ（入金） 方法")
- **Phrases (40).** Every phrase has an approved Tatoeba sentence that matches exactly apart from punctuation, plus JMdict sources for its key words. The collocations the brief asked for are covered only where evidence exists:
  - 口座を開きたいのですが (173906) covers 口座を開く.
  - Sending: これを書留でお願いします, 速達でお願いします, これを航空便で出してください and 船便で出してください.
  - 先月引っ越しました.
  - 何が必要ですか, for asking what is missing.
  - お金を下ろす has no example: Tatoeba only has it in kana (お金をおろさなくちゃ). The 引き出す/下ろす link and synonym note cover the meaning instead. 荷物を送る appears as an example of 送る (10899655). No evidence was found for 住民票を取る or 書類を出す.
- **Examples.** 138 new Tatoeba examples, at most two per tier-1/2 say-item, each 20 characters or fewer and checked by hand for the stated meaning. Sentences that only contain a compound were not used, for example 身分証明書 for 証明書 or 有給休暇 for 有給. Neither was ご記入ください for 記入する, because the example test needs the 記入し stem.
- **Contrast links (both directions),** stated only as far as JMdict senses or the quoted official text support them:
  - 振込/振替 (+ 口座振替 = direct debit)
  - 預金/貯金
  - 引き出す/下ろす: same meaning; お引き出し is the ATM-screen word (Irodori), 下ろす has the JMdict sense "to withdraw (money)"
  - お引き出し/お預け入れ
  - 入金/出金
  - 硬貨/紙幣
  - 書留/速達
  - 航空便/船便
  - 着払い/元払い
  - 差出人/受取人
  - 住民票/在留カード: ward-office certificate (Kyoto) vs the card from Immigration (ISA)
  - 申請/届け出
  - 証明書/身分証明書
  - 転入届/転出届/転居届
  - 区役所/市役所: Kyoto handles moving notices at 区役所・支所
  - 給料/時給
  - 遅刻/早退
  - 敷金/礼金
  - 領収書/レシート
  - 署名/サイン
- **Synonym groups added:**
  - 印鑑/ハンコ
  - 署名/サイン
  - 引き出す/下ろす
  - お水/水
  - 箸/おはし
- **Milestones added:**
  - `m_bank_atm`: withdraw cash
  - `m_bank_account`: open an account
  - `m_post_send`: send a letter or parcel
  - `m_post_redelivery`: read the missed-delivery slip and ask for redelivery
  - `m_cityhall_move`: register at the ward office
  - `m_work_absence`: tell work you are late or need a day off
- **Deepened topics:**
  - home: 賃貸, 敷金, 礼金, 更新料, 光熱費, 電気代/ガス代/水道代, 不動産屋, 停電, 断水, 解約, 契約期間, 家賃は月いくらですか, 敷金は必要ですか
  - health: 問診票, 診察券, 診察, 初診, and the insurance-card request
  - transport: チャージ, 定期券, 精算, 精算機, 乗り越し, 券売機
  - konbini: 領収書, お釣り, ポイントカード, and three cashier phrases
  - survival, polite service phrases staff say: 少々お待ちください, お待たせしました, 申し訳ございません
- **Not added:** ICOCA. It is written in Latin letters, so it could only be a read item, and no official kana reading was fetched.

### Uploaded `flex.json` and `patterns.json`

`flex.json` holds 8 "get unstuck" prompts (situation → tip item ids), for example "staff offer something you don't want → いえ、けっこうです / だいじょうぶです". Their tip ids now resolve as follows:
- Through aliases: t_kore_kudasai, t_ikura, t_toire_doko, t_daijobu_desu and t_onegaishimasu.
- Directly, as items added under the uploaded id: t_ie_kekko, t_nihongo_nanto, t_nan_desu_ka, t_yukkuri_itte and t_nihongo_dekimasu.
- Already in the curriculum under the same id: t_sumimasen, t_mouichido and t_otearai_doko.
- `t_yoku_wakarimasen` is quarantined.

These could become `recovery.json` prompts. That file belongs to the engine owner, so it was not edited.

`patterns.json` holds 9 frames. Five already exist in `grammar.json`: 〜をお願いします, 〜てください, 〜が好きです, 〜はどこですか and 〜いくらですか. Proposals for the rest, each with Irodori evidence from the 文型リスト (`sentence_patterns_list.xlsx`):
- **`g_ni_shimasu` 「Nにします」** "I'll have N" (choosing). 入門 L6 ❷, example 私は、うどんにします。 Slot tags: food, drink, orderable.
- **`g_kara_kimashita` 「【場所】から来ました」** "I came from …". 入門 L3 ❷, example ブラジルから来ました。 This needs a `country` tag, which the schema lacks; only 日本 and 東京 would currently fit.
- **`g_ni_sundeimasu` 「【場所】に住んでいます」** "I live in …". 入門 L4 ❸.
- **`g_n_kudasai_bare` 「N、ください / N、お願いします」** without を. 入門 L6 ❶, examples これ、ください。 and ホットコーヒー、お願いします。 It is the spoken form of the existing g_o_kudasai and g_o_onegai.
- **`g_n_kashite` 「N、貸してください」** "Please lend me N". 入門 L10 ❸ and 文法ノート 入門 L10. Slot tag: thing.
- **`g_n_num_kudasai` 「N、【数】ください」** "two edamame, please". 入門 L6 ❸. Uses the counter items (一つ…九つ).

### For the engine owner

- `aliases` (an array of old ids) is now present on 63 kept items. `curriculum.js` already builds `C.aliasOf`.
- New fields seen on sources:
  - `lesson`, `activity`, `entry` and `quote` on reference sources
  - `quote` on official sources
- `accept` is used on existing items (e.g. 寿司 accepts すし) and on 3階 and 8階.
- Latin-script words (ATM, Suica, PayPay) cannot be typed answers. If the answer checker learns to compare Latin input against a Latin `jp` before rōmaji conversion, they can become `say` items.
- `scripts/audit.js` regenerated `VERIFICATION_LOG.md`.

---

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
