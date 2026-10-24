/* Speech module regression tests with a mocked Web Speech API.
   Old defects: spoke before voices loaded (default, often non-Japanese
   voice), took the first "ja" voice even if network-only, read kana. */
const assert = require('assert');
const { test, run } = require('./harness');

function mockEnv(voices, delayed) {
  const listeners = [];
  let list = delayed ? [] : voices;
  const spoken = [];
  const synth = {
    getVoices: () => list, cancel() { }, resume() { }, paused: false,
    speak: u => spoken.push(u),
    addEventListener: (ev, fn) => listeners.push(fn)
  };
  const root = { speechSynthesis: synth, SpeechSynthesisUtterance: function (t) { this.text = t; } };
  return { root, spoken, load() { list = voices; listeners.forEach(f => f()); } };
}
function loadSpeech(root) {
  delete require.cache[require.resolve('../js/speech.js')];
  const saved = global.speechSynthesis, savedU = global.SpeechSynthesisUtterance;
  global.speechSynthesis = root.speechSynthesis; global.SpeechSynthesisUtterance = root.SpeechSynthesisUtterance;
  const S = require('../js/speech.js');
  return { S, restore() { global.speechSynthesis = saved; global.SpeechSynthesisUtterance = savedU; } };
}
const V = (name, lang, local, uri) => ({ name, lang, localService: local, voiceURI: uri || name });

test('waits for the voice list instead of speaking with the default voice', async () => {
  const env = mockEnv([V('Kyoko', 'ja-JP', true)], true);
  const { S, restore } = loadSpeech(env.root);
  assert.strictEqual(S.speak('水', {}), false, 'no Japanese voice yet → does not speak with a random default');
  const p = S.ready(2000); env.load();
  const list = await p;
  assert.strictEqual(list.length, 1);
  assert.strictEqual(S.speak('水', {}), true);
  assert.strictEqual(env.spoken[0].voice.name, 'Kyoko');
  assert.strictEqual(env.spoken[0].lang, 'ja-JP');
  restore();
});
test('never auto-selects an online-only voice; ranks on-device and enhanced voices first', async () => {
  const env = mockEnv([V('Google 日本語', 'ja-JP', false), V('Kyoko', 'ja-JP', true), V('Otoya (Enhanced)', 'ja-JP', true), V('Samantha', 'en-US', true)]);
  const { S, restore } = loadSpeech(env.root);
  const list = await S.ready(100);
  assert.deepStrictEqual(list.map(v => v.name), ['Otoya (Enhanced)', 'Kyoko', 'Google 日本語'], 'English voices excluded; local+enhanced first');
  assert.strictEqual(S.choose(null).name, 'Otoya (Enhanced)');
  assert.strictEqual(list.find(v => v.name === 'Otoya (Enhanced)').gender, 'male');
  assert.strictEqual(list.find(v => v.name === 'Kyoko').gender, 'female');
  const only = mockEnv([V('Google 日本語', 'ja-JP', false)]);
  const s2 = loadSpeech(only.root);
  await s2.S.ready(100);
  assert.strictEqual(s2.S.choose(null), null);
  assert.ok(s2.S.status(null).onlineOnly, 'reports that only an online voice exists');
  s2.restore(); restore();
});
test('a saved voice choice is used while installed, with fallback when it disappears', async () => {
  const env = mockEnv([V('Kyoko', 'ja-JP', true, 'k'), V('Otoya', 'ja-JP', true, 'o')]);
  const { S, restore } = loadSpeech(env.root);
  await S.ready(100);
  assert.strictEqual(S.choose('o').name, 'Otoya');
  assert.strictEqual(S.choose('missing-uri').local, true, 'falls back to an on-device voice');
  S.speak('こんにちは', { uri: 'o', rate: 0.75 });
  assert.strictEqual(env.spoken[0].rate, 0.75);
  restore();
});
test('items speak their written form (kanji) unless marked tts:kana', () => {
  const X = require('../js/exercises.js');
  assert.strictEqual(X.speechText({ jp: 'お手洗い', kana: 'おてあらい' }), 'お手洗い');
  assert.strictEqual(X.speechText({ jp: '角', kana: 'かど', tts: 'kana' }), 'かど');
});

test('dialogues: male/female roles get gender-matched on-device voices, lines play in order, onend fires', async () => {
  const env = mockEnv([V('Microsoft Haruka', 'ja-JP', true, 'h'), V('Microsoft Ichiro', 'ja-JP', true, 'i'), V('Google 日本語', 'ja-JP', false, 'g')]);
  env.root.speechSynthesis.speak = u => { env.spoken.push(u); setTimeout(() => u.onend && u.onend(), 1); };
  const { S, restore } = loadSpeech(env.root);
  await S.ready(100);
  const done = new Promise(r => S.speakLines([{ spk: 'N', text: '会社で話しています。' }, { spk: 'F1', text: 'おはようございます。' }, { spk: 'M1', text: 'おはよう。' }, { spk: 'F1', text: '生田さんは', tts: 'いくたさんは' }], { onend: r }));
  await done;
  assert.deepStrictEqual(env.spoken.map(u => u.text), ['会社で話しています。', 'おはようございます。', 'おはよう。', 'いくたさんは'], 'order + tts override');
  assert.strictEqual(env.spoken[1].voice.name, 'Microsoft Haruka');
  assert.strictEqual(env.spoken[2].voice.name, 'Microsoft Ichiro');
  assert.ok(env.spoken.every(u => u.voice.name !== 'Google 日本語'), 'never an online voice');
  restore();
});
test('dialogues with a single voice: roles are separated by pitch; no voice → returns null (caller shows why)', async () => {
  const env = mockEnv([V('Kyoko', 'ja-JP', true)]);
  const { S, restore } = loadSpeech(env.root);
  await S.ready(100);
  const c = S.cast(null);
  assert.ok(c.pitch.M1 < 1 && c.pitch.F1 > 1, 'male lower, female higher');
  assert.ok(c.distinct >= 3);
  restore();
  const none = mockEnv([]); const s2 = loadSpeech(none.root); await s2.S.ready(50);
  assert.strictEqual(s2.S.speakLines([{ spk: 'N', text: 'あ' }], {}), null);
  s2.restore();
});

run('speech: voice detection, ranking, persistence');
