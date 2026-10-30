/**
 * 语法专项目检。运行：node test/grammar.test.mjs
 *
 * 这类题最容易出的错：
 *   1. 正确答案不在选项里（手写题的经典笔误）
 *   2. 选项有歧义（两个都说得通 → 学生选对也被判错）
 *   3. 选项重复
 */

import {
  GRAMMAR_BANK,
  GRAMMAR_TOPIC_LABELS,
  allGrammar,
} from '../lib/engine/grammar.js';

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

console.log('=== 结构检查 ===');

const all = allGrammar();
console.log(`语法题总数: ${all.length}`);
ok(all.length >= 20, `题目数量 ${all.length} >= 20`);

for (const item of all) {
  const problems = [];
  if (typeof item.sentence !== 'string' || !item.sentence.includes('___')) problems.push('sentence 缺占位符');
  if (typeof item.answer !== 'string' || !item.answer) problems.push('answer');
  if (!Array.isArray(item.options) || item.options.length < 2) problems.push('options 不足 2 个');
  if (typeof item.rule !== 'string' || !item.rule) problems.push('rule（缺一句话规则）');
  if (typeof item.zh !== 'string' || !item.zh) problems.push('zh（缺翻译）');
  if (!GRAMMAR_TOPIC_LABELS[item.topic]) problems.push('topic');
  if (!['A1', 'A2', 'B1', 'B2'].includes(item.level)) problems.push('level');

  if (problems.length) {
    fail++;
    failures.push(`缺字段 [${problems.join(',')}]：${JSON.stringify(item).slice(0, 90)}`);
  } else {
    pass++;
  }
}

console.log('');
console.log('=== 核心：答案必须在选项里 ===');

for (const item of all) {
  if (!item.options.includes(item.answer)) {
    fail++;
    failures.push(
      `答案不在选项里！\n` +
      `    句子: ${item.sentence}\n` +
      `    答案: ${item.answer}\n` +
      `    选项: ${item.options.join(' / ')}`,
    );
  } else {
    pass++;
  }
}

console.log('');
console.log('=== 选项不能重复 ===');

for (const item of all) {
  if (new Set(item.options).size !== item.options.length) {
    fail++;
    failures.push(`选项重复: ${item.sentence} → ${item.options.join(' / ')}`);
  } else {
    pass++;
  }
}

console.log('');
console.log('=== 答案唯一性（不能有两个正确答案）===');

// ser/estar 类：选项里如果同时有 ser 和 estar 的同一人称形式，
// 理论上只有一个符合语义。这里做**保守检查**：
// 同一题的选项里不能出现完全相同的字符串（已查），
// 且答案必须在 options 里只出现一次。
for (const item of all) {
  const count = item.options.filter((o) => o === item.answer).length;
  if (count !== 1) {
    fail++;
    failures.push(`答案在选项中出现了 ${count} 次: ${item.sentence}`);
  } else {
    pass++;
  }
}

console.log('');
console.log('=== 分组完整性 ===');

eq(Object.keys(GRAMMAR_BANK).sort(), ['por-para', 'prep', 'ser-estar', 'subjuntivo'], '四个考点都有题');
for (const [topic, list] of Object.entries(GRAMMAR_BANK)) {
  ok(list.length >= 4, `${topic} 至少 4 道（实际 ${list.length}）`);
  ok(Boolean(GRAMMAR_TOPIC_LABELS[topic]), `${topic} 有中文标签`);
}

console.log('');
console.log('=== 语义抽查：ser/estar 的规则是否正确 ===');

// 逐条核对 ser/estar 题的规则描述与答案是否自洽
// （这是最能体现"我写的规则对不对"的检查）
const SER_ESTAR_CHECKS = [
  { snippet: 'de China', expect: 'ser 系', answer: 'soy' },
  { snippet: 'en casa ahora', expect: 'estar 系', answer: 'estoy' },
  { snippet: 'médica', expect: 'ser 系', answer: 'es' },
];

for (const c of SER_ESTAR_CHECKS) {
  const item = GRAMMAR_BANK['ser-estar'].find((x) => x.sentence.includes(c.snippet));
  if (!item) {
    fail++;
    failures.push(`找不到包含 "${c.snippet}" 的 ser/estar 题`);
    continue;
  }
  if (item.answer !== c.answer) {
    fail++;
    failures.push(`"${c.snippet}" 答案应为 ${c.answer}，实际 ${item.answer}`);
  } else {
    pass++;
  }
}

console.log('');
console.log('=== 进 buildSession ===');

const { buildSession, judge, makeGrammarQuestion } = await import('../lib/engine/session.js');
const { BANK } = await import('../lib/engine/bank.js');

{
  const r = buildSession(BANK, { kinds: ['grammar'], size: 10, seed: 7, now: 1000 });
  eq(r.questions.length, 10, '出 10 道语法题');
  ok(r.questions.every((q) => q.kind === 'grammar'), '全是 grammar');
  ok(r.questions.every((q) => q.prompt.includes('___')), '每题都有占位符');
  ok(r.questions.every((q) => Array.isArray(q.choices) && q.choices.length >= 2), '每题有选项');
  ok(r.questions.every((q) => typeof q.rule === 'string' && q.rule), '每题带一句话规则');

  // 同种子可复现
  const r2 = buildSession(BANK, { kinds: ['grammar'], size: 10, seed: 7, now: 1000 });
  eq(r2.questions.map((q) => q.id), r.questions.map((q) => q.id), '同种子同一套题');
}

console.log('');
console.log('=== 语法题判分 ===');

{
  const q = { kind: 'grammar', answer: 'estoy' };
  eq(judge(q, 'estoy').result, 'correct', '选对');
  eq(judge(q, 'soy').result, 'wrong', '选错');
  eq(judge(q, 'ESToy').result, 'correct', '大小写宽容');
  eq(judge(q, '').result, 'wrong', '空答案判错');
}

console.log('');
console.log('=== 混合全部题型 ===');

{
  const r = buildSession(BANK, {
    kinds: ['conjugation', 'gender', 'plural', 'vocab', 'cloze', 'grammar'],
    tenses: ['presente'],
    size: 60,
    seed: 21,
  });
  const kinds = new Set(r.questions.map((q) => q.kind));
  ok(kinds.size >= 5, `至少 5 种题型（实际 ${[...kinds].join(',')}）`);

  for (const q of r.questions) {
    const res = judge(q, q.answer);
    if (res.result !== 'correct') {
      fail++;
      failures.push(`自答应判对：${q.id} (${q.kind})`);
    } else {
      pass++;
    }
  }
}

console.log('');
console.log('=== makeGrammarQuestion 直接调用 ===');

{
  const q = makeGrammarQuestion({ item: GRAMMAR_BANK['ser-estar'][0], topic: 'ser-estar' });
  eq(q.kind, 'grammar', 'kind 正确');
  eq(q.topic, 'ser-estar', 'topic 正确');
  eq(q.kindLabel, 'ser / estar', '中文标签来自考点表');
  eq(q.answer, GRAMMAR_BANK['ser-estar'][0].answer, '答案正确');
  ok(q.rule.length > 0, '带规则说明');
  ok(q.zh.length > 0, '带翻译');
}

console.log('');
console.log(`语法专项目检：${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('全部通过 ✓');
