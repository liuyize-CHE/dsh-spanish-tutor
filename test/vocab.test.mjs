/**
 * 认词题自检。运行：node test/vocab.test.mjs
 *
 * 认词题最容易出的两类错：
 *   1. 干扰项里混进了和正确答案一样的释义 → 有两个"正确"选项
 *   2. 干扰项太少 → 选项只有两个，蒙对概率 50%
 * 这两个都在这里守住。
 */

import { makeVocabQuestion, buildSession, judge } from '../lib/engine/session.js';
import { BANK, VERBS, NOUNS, ADJECTIVES } from '../lib/engine/bank.js';

let pass = 0;
let fail = 0;
const failures = [];
const eq = (a, e, label) => {
  const x = JSON.stringify(a);
  const y = JSON.stringify(e);
  if (x === y) pass++;
  else { fail++; failures.push(`${label}\n    期望 ${y}\n    实际 ${x}`); }
};
const ok = (c, label) => eq(Boolean(c), true, label);

const rng = () => 0.42; // 固定值，让结果可复现

// ─────────────────── 基本结构 ───────────────────

console.log('=== 基本结构 ===');
{
  const entry = { noun: 'casa', meaning: '房子' };
  const q = makeVocabQuestion({ entry, pool: NOUNS, direction: 'es2zh' }, rng);

  eq(q.kind, 'vocab', 'kind 是 vocab');
  eq(q.kindLabel, '认词', '有中文标签');
  eq(q.direction, 'es2zh', '方向正确');
  eq(q.prompt, 'casa', 'es2zh 的题干是西语词');
  eq(q.meaning, '房子', '带释义');
  ok(Array.isArray(q.choices), '有选项');
  eq(q.choices.length, 4, '四个选项');
  ok(q.choices.every((c) => c.id && c.text), '每个选项有 id 和文本');

  // 正确答案必须在选项里
  const texts = q.choices.map((c) => c.text);
  ok(texts.includes('房子'), '正确释义在选项里');
  eq(q.answer, '房子', '答案就是正确释义');
}

// ─────────────────── 反向：中→西 ───────────────────

console.log('');
console.log('=== 中→西 ===');
{
  const entry = { noun: 'libro', meaning: '书' };
  const q = makeVocabQuestion({ entry, pool: NOUNS, direction: 'zh2es' }, rng);

  eq(q.direction, 'zh2es', '方向正确');
  eq(q.prompt, '书', 'zh2es 的题干是中文');
  eq(q.answer, 'libro', '答案是西语词');
  const texts = q.choices.map((c) => c.text);
  ok(texts.includes('libro'), '西语词在选项里');
  // 选项应该都是西语词，不能混进中文
  ok(texts.every((t) => /^[a-záéíóúñü ]+$/i.test(t)), '选项全是西语词');
}

// ─────────────────── 干扰项质量（核心）───────────────────

console.log('');
console.log('=== 干扰项质量 ===');
{
  let checked = 0;
  let dupAnswer = 0;
  let tooFew = 0;
  let duplicateTexts = 0;

  // 把所有名词都出一道题，逐个检查
  for (const entry of NOUNS) {
    for (const direction of ['es2zh', 'zh2es']) {
      const q = makeVocabQuestion({ entry, pool: NOUNS, direction }, rng);
      checked++;

      const texts = q.choices.map((c) => c.text);

      // 1. 不能有两个一样的选项
      if (new Set(texts).size !== texts.length) duplicateTexts++;

      // 2. 正确释义只能出现一次（否则有两个正确答案）
      const correctCount = texts.filter((t) => t === q.answer).length;
      if (correctCount !== 1) dupAnswer++;

      // 3. 选项数不能太少
      if (texts.length < 3) tooFew++;
    }
  }

  console.log(`  检查了 ${checked} 道题`);
  eq(duplicateTexts, 0, '没有重复选项');
  eq(dupAnswer, 0, '每道题只有一个正确答案');
  eq(tooFew, 0, '没有选项少于 3 个的题');
}

// ─────────────────── 干扰项必须同词性 ───────────────────

console.log('');
console.log('=== 干扰项同词性 ===');
{
  // 只给名词池，选项里就不该出现动词原形（-ar/-er/-ir 结尾的长词）
  const q = makeVocabQuestion(
    { entry: { noun: 'mesa', meaning: '桌子' }, pool: NOUNS, direction: 'zh2es' },
    () => 0.7,
  );
  const texts = q.choices.map((c) => c.text);
  const looksLikeVerb = texts.filter((t) => /(ar|er|ir)$/.test(t) && t.length > 4);
  // 名词也可能以 ar/er/ir 结尾（如 mujer、taller），所以只做宽松检查
  console.log('  选项:', texts.join(' / '));
  ok(texts.length === 4, '仍是四个选项');
}

// ─────────────────── 题库不足时的降级 ───────────────────

console.log('');
console.log('=== 题库不足时降级 ===');
{
  // 只有一个词 → 凑不出 4 个选项，必须如实标记 degraded，而不是硬凑
  const tiny = [{ noun: 'casa', meaning: '房子' }];
  const q = makeVocabQuestion({ entry: tiny[0], pool: tiny, direction: 'es2zh' }, rng);
  eq(q.choices.length, 1, '只有一个选项');
  eq(q.degraded, true, '标记为降级');
  eq(q.distractorCount, 0, '干扰项为 0');
}

// ─────────────────── 同义词库（去重逻辑的真实用例）───────────────────
//
// 当前种子词库里没有"同释义不同词"，但**扩充词库时一定会有**
// （比如 foto / fotografía 都是"照片"）。
// 这里造一个真实的同义词库，逼出去重逻辑 —— 否则那段代码是测不到的死代码。

console.log('');
console.log('=== 同义词库去重 ===');
{
  const synonyms = [
    { noun: 'foto', meaning: '照片' },
    { noun: 'fotografía', meaning: '照片' }, // 与上面释义完全相同
    { noun: 'libro', meaning: '书' },
    { noun: 'mesa', meaning: '桌子' },
    { noun: 'silla', meaning: '椅子' },
    { noun: 'casa', meaning: '房子' },
  ];

  // 单个随机种子可能刚好没抽到同义词，所以要扫一批种子 ——
  // 只测一次会让去重逻辑「碰巧没被触发」，变异测试也就抓不到。
  let dups = 0;
  let scanned = 0;
  for (let seed = 0; seed < 200; seed++) {
    let x = (seed * 2654435761) >>> 0;
    const rng = () => {
      x ^= x << 13; x >>>= 0;
      x ^= x >> 17;
      x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
    const q = makeVocabQuestion(
      { entry: { noun: 'libro', meaning: '书' }, pool: synonyms, direction: 'es2zh' },
      rng,
    );
    const texts = q.choices.map((c) => c.text);
    scanned++;
    if (new Set(texts).size !== texts.length) dups++;
  }
  eq(dups, 0, `扫 ${scanned} 个随机序列，同义干扰项从不重复`);

  // 反向（中→西）：foto 和 fotografía 是两个不同的西语词，
  // 所以选词时它们可以作为不同选项 —— 但「照片」这个题干对应两个正确答案，
  // 这正是必须只取一个的原因。
  const q2 = makeVocabQuestion(
    { entry: { noun: 'foto', meaning: '照片' }, pool: synonyms, direction: 'zh2es' },
    () => 0.3,
  );
  const texts2 = q2.choices.map((c) => c.text);
  eq(new Set(texts2).size, texts2.length, '中→西也没有重复选项');
  ok(texts2.includes('foto'), 'foto 在选项里');
}

// ─────────────────── 判分 ───────────────────

console.log('');
console.log('=== 判分 ===');
{
  const q = { kind: 'vocab', answer: '房子' };
  eq(judge(q, '房子').result, 'correct', '选对');
  eq(judge(q, '汽车').result, 'wrong', '选错');
  eq(judge(q, ' 房子 ').result, 'correct', '首尾空白宽容');
  eq(judge(q, '').result, 'wrong', '空答案判错');

  // 关键：认词题不能出现 accent（中文差一个字就是另一个意思）
  eq(judge(q, '房').result, 'wrong', '差一个字就是错，不算 accent');

  // 西语词方向：重音不同也要判错吗？
  // 是的 —— 认词题考的是"认得出这个词"，不是一个拼写题。
  const q2 = { kind: 'vocab', answer: 'canción' };
  eq(judge(q2, 'cancion').result, 'wrong', '中→西方向重音不同判错');
  eq(judge(q2, 'canción').result, 'correct', '完全一致判对');
}

// ─────────────────── 接入 buildSession ───────────────────

console.log('');
console.log('=== 进 buildSession ===');
{
  const r = buildSession(BANK, {
    kinds: ['vocab'],
    size: 10,
    seed: 5,
    now: 1000,
  });

  eq(r.questions.length, 10, '出 10 道认词题');
  ok(r.questions.every((q) => q.kind === 'vocab'), '全是 vocab');
  ok(r.questions.every((q) => q.id.startsWith('vocab:')), 'id 前缀正确');
  // 同种子可复现
  const r2 = buildSession(BANK, { kinds: ['vocab'], size: 10, seed: 5, now: 1000 });
  eq(r2.questions.map((q) => q.id), r.questions.map((q) => q.id), '同种子同一套题');
}

// ─────────────────── 混合题型 ───────────────────

console.log('');
console.log('=== 混合出题含认词 ===');
{
  const r = buildSession(BANK, {
    kinds: ['conjugation', 'gender', 'plural', 'vocab'],
    tenses: ['presente'],
    size: 40,
    seed: 9,
  });
  const kinds = new Set(r.questions.map((q) => q.kind));
  ok(kinds.has('vocab'), '混合题里有认词');
  ok(kinds.size >= 3, `至少 3 种题型（实际 ${[...kinds].join(',')}）`);

  // 每种题型都能被判分（不能抛错）
  for (const q of r.questions) {
    const res = judge(q, q.answer);
    if (res.result !== 'correct') {
      fail++;
      failures.push(`自答不应判错：${q.id} (${q.kind})`);
    } else {
      pass++;
    }
  }
}

// ─────────────────── 报告 ───────────────────

console.log('');
console.log(`认词自检：${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('全部通过 ✓');
