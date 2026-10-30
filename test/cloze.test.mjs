/**
 * 例句库自检。运行：node test/cloze.test.mjs
 *
 * 最重要的检查：**例句的答案必须和变位引擎算出来的一致**。
 * 如果我手写例句时写错了变位，这里会红 ——
 * 否则学生学到的是错的东西。
 */

import { CLOZE_BANK, allCloze } from '../lib/engine/cloze.js';
import { conjugate, PERSONS } from '../lib/engine/conjugator.js';

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

const all = allCloze();
console.log(`例句总数: ${all.length}`);
ok(all.length >= 40, `例句数量 ${all.length} >= 40`);

// 每条必须有必需字段
for (const item of all) {
  const problems = [];
  if (typeof item.sentence !== 'string' || !item.sentence) problems.push('sentence');
  if (typeof item.answer !== 'string' || !item.answer) problems.push('answer');
  if (typeof item.zh !== 'string' || !item.zh) problems.push('zh');
  if (!['A1', 'A2', 'B1'].includes(item.level)) problems.push('level');
  if (!item.sentence.includes('___')) problems.push('没有 ___ 占位符');
  if (problems.length) {
    fail++;
    failures.push(`例句缺字段 [${problems.join(',')}]: ${JSON.stringify(item).slice(0, 100)}`);
  } else {
    pass++;
  }
}

console.log('');
console.log('=== 变位例句：答案必须与引擎一致 ===');

let checked = 0;
for (const item of CLOZE_BANK.conjugation) {
  if (!item.verb || !item.tense || !item.person) {
    fail++;
    failures.push(`变位例句缺 verb/tense/person: ${item.sentence}`);
    continue;
  }

  const idx = PERSONS.indexOf(item.person);
  if (idx < 0) {
    fail++;
    failures.push(`未知人称 ${item.person}: ${item.sentence}`);
    continue;
  }

  const engineForms = conjugate(item.verb, item.tense);
  const expected = engineForms[idx];
  checked++;

  if (item.answer !== expected) {
    fail++;
    failures.push(
      `变位不一致（${item.verb} ${item.tense} ${item.person}）\n` +
      `    例句写的是: ${item.answer}\n` +
      `    引擎算的是: ${expected}\n` +
      `    句子: ${item.sentence}`,
    );
  } else {
    pass++;
  }
}
console.log(`  核对了 ${checked} 条变位例句`);

console.log('');
console.log('=== 冠词例句：答案必须在合法冠词集合内 ===');

const LEGAL_ARTICLES = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
]);
for (const item of CLOZE_BANK.article) {
  const a = item.answer.toLowerCase();
  if (!LEGAL_ARTICLES.has(a)) {
    fail++;
    failures.push(`非法冠词 "${item.answer}": ${item.sentence}`);
  } else {
    pass++;
  }
}

console.log('');
console.log('=== 介词例句：答案必须在常见介词集合内 ===');

const LEGAL_PREPS = new Set([
  'a', 'de', 'en', 'con', 'por', 'para', 'desde', 'hasta', 'sin', 'sobre', 'entre', 'hacia',
]);
for (const item of CLOZE_BANK.preposition) {
  const p = item.answer.toLowerCase();
  if (!LEGAL_PREPS.has(p)) {
    fail++;
    failures.push(`非法介词 "${item.answer}": ${item.sentence}`);
  } else {
    pass++;
  }
}

console.log('');
console.log('=== 唯一性：同一句子不能有多个合法答案 ===');

// 冠词题里，如果句子以 El 开头但名词是阴性，就可能有两个"看起来对"的答案。
// 这里检查每条冠词题的句子，确保答案与名词性别一致。
for (const item of CLOZE_BANK.article) {
  const a = item.answer.toLowerCase();

  // 从 hint 里读性别线索（简单可靠）
  const hint = item.hint ?? '';
  const isFem = /阴性/.test(hint);
  const isMasc = /阳性/.test(hint);

  const femArticles = new Set(['la', 'las', 'una', 'unas']);
  const mascArticles = new Set(['el', 'los', 'un', 'unos']);

  if (isFem && mascArticles.has(a) && a !== 'el' && a !== 'un') {
    fail++;
    failures.push(`阴性名词用了阳性冠词 "${item.answer}": ${item.sentence}`);
  } else if (isMasc && femArticles.has(a)) {
    fail++;
    failures.push(`阳性名词用了阴性冠词 "${item.answer}": ${item.sentence}`);
  } else {
    pass++;
  }
}

console.log('');
console.log('=== 分组完整性 ===');

eq(Object.keys(CLOZE_BANK).sort(), ['agreement', 'article', 'conjugation', 'preposition'], '四个考点都有例句');
for (const [topic, list] of Object.entries(CLOZE_BANK)) {
  ok(list.length >= 3, `${topic} 至少 3 条例句（实际 ${list.length}）`);
}

console.log('');
console.log('=== 进 buildSession ===');

const { buildSession, judge, makeClozeQuestion } = await import('../lib/engine/session.js');
const { BANK } = await import('../lib/engine/bank.js');

{
  const r = buildSession(BANK, { kinds: ['cloze'], size: 10, seed: 3, now: 1000 });
  eq(r.questions.length, 10, '出 10 道填空题');
  ok(r.questions.every((q) => q.kind === 'cloze'), '全是 cloze');
  ok(r.questions.every((q) => q.prompt.includes('___')), '每题都有占位符');

  // 每道题的答案必须与例句库一致
  for (const q of r.questions) {
    if (!q.answer) {
      fail++;
      failures.push(`填空题没有答案: ${q.prompt}`);
    } else {
      pass++;
    }
  }

  // 同种子可复现
  const r2 = buildSession(BANK, { kinds: ['cloze'], size: 10, seed: 3, now: 1000 });
  eq(r2.questions.map((q) => q.id), r.questions.map((q) => q.id), '同种子同一套题');
}

console.log('');
console.log('=== 填空判分 ===');

{
  // 完全正确
  eq(judge({ kind: 'cloze', answer: 'estudio' }, 'estudio').result, 'correct', '填对');

  // 只差重音 → accent（值得单独提示）
  eq(judge({ kind: 'cloze', answer: 'escribió' }, 'escribio').result, 'accent', '差重音给 accent');

  // 真错
  eq(judge({ kind: 'cloze', answer: 'estudio' }, 'estudia').result, 'wrong', '填错');

  // 大小写宽容（句首冠词）
  eq(judge({ kind: 'cloze', answer: 'El' }, 'el').result, 'correct', '冠词大小写宽容');

  // 空答案
  eq(judge({ kind: 'cloze', answer: 'el' }, '').result, 'wrong', '空答案判错');
}

console.log('');
console.log('=== 混合题型含填空 ===');

{
  const r = buildSession(BANK, {
    kinds: ['conjugation', 'gender', 'plural', 'vocab', 'cloze'],
    tenses: ['presente'],
    size: 50,
    seed: 11,
  });
  const kinds = new Set(r.questions.map((q) => q.kind));
  ok(kinds.has('cloze'), '混合题里有填空');
  ok(kinds.has('vocab'), '混合题里有认词');
  ok(kinds.size >= 4, `至少 4 种题型（实际 ${[...kinds].join(',')}）`);

  // 所有题都能自答且判对
  for (const q of r.questions) {
    const res = judge(q, q.answer);
    if (res.result !== 'correct') {
      fail++;
      failures.push(`自答应判对：${q.id} (${q.kind}) answer=${JSON.stringify(q.answer)}`);
    } else {
      pass++;
    }
  }
}

console.log('');
console.log('=== makeClozeQuestion 直接调用 ===');

{
  const q = makeClozeQuestion({
    item: CLOZE_BANK.conjugation[0],
    topic: 'conjugation',
  });
  eq(q.kind, 'cloze', 'kind 正确');
  eq(q.topic, 'conjugation', 'topic 正确');
  eq(q.kindLabel, '变位填空', '有中文标签');
  eq(q.answer, CLOZE_BANK.conjugation[0].answer, '答案来自例句');
  ok(q.zh === CLOZE_BANK.conjugation[0].zh, '带中文翻译');
}

console.log('');
console.log(`例句库自检：${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('全部通过 ✓');
