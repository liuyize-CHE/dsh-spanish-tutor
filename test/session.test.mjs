/**
 * 出题 / SRS / 词库自检。运行：node test/session.test.mjs
 */

import {
  nextLevel,
  updateCard,
  isDue,
  masteryOf,
  makeRng,
  buildSession,
  judge,
  INTERVALS_DAYS,
} from '../lib/engine/session.js';
import { BANK, bankAtLevel, VERBS, NOUNS, ADJECTIVES } from '../lib/engine/bank.js';
import { conjugate } from '../lib/engine/conjugator.js';
import { nounInfo, guessGender } from '../lib/engine/nouns.js';

let pass = 0;
let fail = 0;
const failures = [];

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fail++;
    failures.push(`${label}\n    期望 ${e}\n    实际 ${a}`);
  }
}

function ok(cond, label) {
  eq(Boolean(cond), true, label);
}

// ─────────────────────────── SRS ───────────────────────────

const MAX = INTERVALS_DAYS.length - 1;

eq(nextLevel(0, 'correct'), 1, 'level 0 + correct → 1');
eq(nextLevel(3, 'correct'), 4, 'level 3 + correct → 4');
eq(nextLevel(MAX, 'correct'), MAX, 'level 满 + correct 不超顶');
eq(nextLevel(3, 'accent'), 3, '只差重音不升不降');
eq(nextLevel(3, 'wrong'), 1, 'level 3 + wrong → 退两级');
eq(nextLevel(1, 'wrong'), 0, 'level 1 + wrong → 0');
eq(nextLevel(0, 'wrong'), 0, 'level 0 不会变负');
eq(nextLevel(undefined, 'correct'), 1, 'undefined level 当 0');
eq(nextLevel(NaN, 'correct'), 1, 'NaN level 当 0');

const now = 1_000_000;
const c1 = updateCard(undefined, 'correct', now);
eq(c1.level, 1, 'updateCard 新建 level');
eq(c1.correct, 1, 'updateCard correct 计数');
eq(c1.wrong, 0, 'updateCard wrong 计数');
ok(c1.due > now, 'updateCard 设了未来 due');
eq(isDue(c1, now), false, '刚答对不到期');
eq(isDue(c1, now + 10 * 24 * 3600 * 1000), true, '很久以后到期');

const c2 = updateCard({ level: 5, correct: 10, wrong: 0, accent: 0, streak: 3 }, 'wrong', now);
eq(c2.level, 3, '答错降级');
eq(c2.wrong, 1, '答错计数');
eq(c2.streak, 0, '答错清连击');

// 掌握度
eq(masteryOf(undefined), 0, 'mastery 无记录 = 0');
ok(masteryOf({ level: MAX, correct: 10, wrong: 0, accent: 0 }) > 0.9, '满级 + 全对 → 掌握度高');
ok(masteryOf({ level: 0, correct: 0, wrong: 5, accent: 0 }) < 0.1, '零级 + 全错 → 掌握度低');
ok(masteryOf({ level: 5, correct: 5, wrong: 0, accent: 0 }) > masteryOf({ level: 1, correct: 5, wrong: 0, accent: 0 }), '等级高掌握度高');

// ─────────────────────────── RNG 确定性 ───────────────────────────

const r1 = makeRng(42);
const r2 = makeRng(42);
const seq1 = [r1(), r1(), r1()];
const seq2 = [r2(), r2(), r2()];
eq(seq1, seq2, '同种子产生同序列');
ok(seq1.every((v) => v >= 0 && v <= 1), 'rng 值在 [0,1]');

// ─────────────────────────── 题库 ───────────────────────────

ok(VERBS.length > 50, `动词数量 ${VERBS.length} > 50`);
ok(NOUNS.length > 50, `名词数量 ${NOUNS.length} > 50`);
ok(ADJECTIVES.length > 10, `形容词数量 ${ADJECTIVES.length} > 10`);

// 每个动词都真的能变位（不能有写错的原形）
for (const v of VERBS) {
  const forms = conjugate(v.infinitive, 'presente');
  if (!Array.isArray(forms) || forms.length !== 6 || forms.some((f) => !f || /undefined/.test(f))) {
    fail++;
    failures.push(`动词 ${v.infinitive} 变位异常：${JSON.stringify(forms)}`);
  } else {
    pass++;
  }
}

// 每个名词都有人工标注的性别
for (const n of NOUNS) {
  if (n.gender !== 'm' && n.gender !== 'f') {
    fail++;
    failures.push(`名词 ${n.noun} 缺 gender 标注`);
  } else {
    pass++;
  }
}

// 标注的性别必须和**规则推断**一致，除了真正靠规则判不出/判不对的特例。
//
// 这个名单要尽量小：名单越长，规则受到的检验越少。
// 只有「规则在原理上不可能判对」的词才该进来：
//   - 以 -o 结尾的阴性 / 以 -a 结尾的阳性（规则必然判反）
//   - 重读 a 开头（冠词特例，性别本身仍是规则可判的，所以不进来）
//   - -ma 希腊词源（走专门判断，不进来）
const RULE_EXCEPTIONS = new Set([
  'mano', 'foto', 'moto', 'radio', // -o 结尾但是阴性
  'día', 'mapa', 'problema', 'sistema', 'idioma', // -a 结尾但是阳性
  'gente', 'clase', 'calle', 'llave', // -e 结尾，规则给不出
  'leche', 'carne', 'sangre', 'muerte', 'noche', 'costumbre',
  'coche', // -e 结尾，规则给不出
  'árbol', 'hotel', 'papel', 'rey', // 辅音/半元音结尾，规则给不出
  'actriz', // -z 规则现在给 f，但它是 f，应该由规则判对 → 不进来
]);

const ruleMismatch = NOUNS.filter((n) => {
  if (RULE_EXCEPTIONS.has(n.noun)) return false;
  const ruled = guessGender(n.noun);
  return ruled !== null && ruled !== n.gender;
});
eq(ruleMismatch.map((n) => `${n.noun}(规则=${guessGender(n.noun)},标注=${n.gender})`), [], '非特例名词的标注性别与规则推断一致');

// 规则给不出的必须确实是规则原理上给不出的（防止规则漏判却没人发现）
const unknowns = NOUNS.filter((n) => guessGender(n.noun) === null).map((n) => n.noun);
const ALLOWED_UNKNOWN = new Set(['coche', 'árbol', 'hotel', 'papel', 'rey']);
eq(unknowns.filter((x) => !ALLOWED_UNKNOWN.has(x)), [], '规则给不出的词都在允许清单内');

// 反向检查：规则必须能判对这些（如果哪天规则退化，这里会红）
eq(guessGender('flor'), 'f', 'flor 是阴性（-or 例外）');
eq(guessGender('luz'), 'f', 'luz 是阴性（-z）');
eq(guessGender('voz'), 'f', 'voz 是阴性（-z）');
eq(guessGender('actriz'), 'f', 'actriz 是阴性（-z）');
eq(guessGender('amor'), 'm', 'amor 是阳性（-or）');
eq(guessGender('profesor'), 'm', 'profesor 是阳性（-or）');

// 每个名词的复数都非空
for (const n of NOUNS) {
  const info = nounInfo(n.noun, { gender: n.gender });
  if (!info.plural || info.plural === n.noun && !/s$/.test(n.noun)) {
    fail++;
    failures.push(`名词 ${n.noun} 复数异常：${info.plural}`);
  } else {
    pass++;
  }
}

// 等级筛选
const a1 = bankAtLevel(BANK, 'A1');
eq(a1.verbs.every((v) => v.level === 'A1'), true, 'A1 筛选只留 A1 动词');
const a2 = bankAtLevel(BANK, 'A2');
ok(a2.verbs.length > a1.verbs.length, 'A2 比 A1 多');
const all = bankAtLevel(BANK, 'C1');
eq(all.verbs.length, VERBS.length, 'C1 = 全部');

// ─────────────────────────── buildSession ───────────────────────────

const session = buildSession(BANK, {
  tenses: ['presente'],
  kinds: ['conjugation'],
  size: 10,
  seed: 7,
});

eq(session.questions.length, 10, 'buildSession 出 10 题');
eq(session.unseenCount > 0, true, 'unseenCount > 0');
ok(session.questions.every((q) => q.kind === 'conjugation'), '全部是变位题');

// 每道题的答案必须与引擎一致
for (const q of session.questions) {
  const expected = conjugate(q.infinitive, q.tense)[q.personIndex];
  if (q.answer !== expected) {
    fail++;
    failures.push(`题 ${q.id} 答案不一致：${q.answer} vs ${expected}`);
  } else {
    pass++;
  }
}

// 同种子可复现
const session2 = buildSession(BANK, { tenses: ['presente'], kinds: ['conjugation'], size: 10, seed: 7 });
eq(session2.questions.map((q) => q.id), session.questions.map((q) => q.id), '同种子出同一套题');

// 不同种子不同题
const session3 = buildSession(BANK, { tenses: ['presente'], kinds: ['conjugation'], size: 10, seed: 99 });
ok(
  JSON.stringify(session3.questions.map((q) => q.id)) !== JSON.stringify(session.questions.map((q) => q.id)),
  '不同种子出不同题'
);

// 到期的题优先
const mem = {};
for (const verb of BANK.verbs) {
  mem[`conj:${verb.infinitive}:presente:1s`] = { level: 0, due: 0, correct: 0, wrong: 3, accent: 0 };
}
const dueSession = buildSession(BANK, {
  tenses: ['presente'],
  kinds: ['conjugation'],
  size: 5,
  seed: 1,
  memory: mem,
  persons: ['1s'],
  now: 1000,
});
ok(dueSession.dueCount > 0, '有到期卡片');
ok(dueSession.questions.every((q) => q.person === '1s'), '只出 1s 人称');

// 极端情况：空题库
const empty = buildSession({ verbs: [], nouns: [], adjectives: [] }, { size: 10 });
eq(empty.questions, [], '空题库返回空题');
eq(empty.unseenCount, 0, '空题库 unseenCount 0');

// 混合题型
const mixed = buildSession(BANK, {
  kinds: ['conjugation', 'gender', 'plural'],
  tenses: ['presente'],
  size: 20,
  seed: 3,
});
const kinds = new Set(mixed.questions.map((q) => q.kind));
ok(kinds.size >= 2, `混合出题含多种题型（实际 ${[...kinds].join(',')}）`);

// 每道题都有 id / kind / answer
for (const q of mixed.questions) {
  if (!q.id || !q.kind || q.answer === undefined || q.answer === null || q.answer === '') {
    fail++;
    failures.push(`题结构不完整：${JSON.stringify(q).slice(0, 160)}`);
  } else {
    pass++;
  }
}

// ─────────────────────────── 判分 ───────────────────────────

const conjQ = { kind: 'conjugation', answer: 'hablo' };
eq(judge(conjQ, 'hablo').result, 'correct', 'judge 正确');
eq(judge(conjQ, 'HABLO').result, 'correct', 'judge 大小写');
eq(judge(conjQ, 'habló').result, 'accent', 'judge 只差重音');
eq(judge(conjQ, 'habla').result, 'wrong', 'judge 错误');

const genderQ = { kind: 'gender', answer: 'f' };
eq(judge(genderQ, 'f').result, 'correct', 'judge 阴阳性正确');
eq(judge(genderQ, 'F').result, 'correct', 'judge 阴阳性大小写');
eq(judge(genderQ, 'm').result, 'wrong', 'judge 阴阳性错误');

// 阴阳性题给出的是 'm'/'f'，不是 accent 近似
eq(judge(genderQ, '').result, 'wrong', 'judge 阴阳性空答案');

// ─────────────────────────── 完整一局 ───────────────────────────

let memory = {};
let answered = 0;
const round = buildSession(BANK, { kinds: ['conjugation'], tenses: ['presente'], size: 5, seed: 11 });
for (const q of round.questions) {
  const res = judge(q, q.answer);
  if (res.result !== 'correct') {
    fail++;
    failures.push(`自己出题自己答还错：${q.id}`);
    continue;
  }
  memory[q.id] = updateCard(memory[q.id], res.result, Date.now());
  answered++;
}
eq(answered, 5, '一局 5 题全部答对');
eq(Object.keys(memory).length, 5, '记忆表记录了 5 条');

// 下一局应该优先出没见过的
const round2 = buildSession(BANK, {
  kinds: ['conjugation'],
  tenses: ['presente'],
  size: 5,
  seed: 12,
  memory,
});
ok(round2.unseenCount >= 0, '第二局 unseenCount 正常');
ok(round2.questions.length === 5, '第二局也是 5 题');

// ─────────────────────────── 报告 ───────────────────────────

console.log(`\n出题/SRS 自检：${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('全部通过 ✓');
