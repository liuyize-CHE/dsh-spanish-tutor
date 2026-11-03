/**
 * host 半身自检：用假的 ctx + 假 req/res 真跑一遍路由与工具。
 * 运行：node test/host.test.mjs
 *
 * 用临时 DSH_HOME，绝不碰用户真实进度。
 */

import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 必须在 import 插件之前设好，插件在模块加载时就会读 env。
// 但**不能污染后续套件**：记下原值，跑完恢复（test/all.mjs 是进程内的，
// 否则紧跟其后的 live 套件会以为 DSH_HOME 还是这个临时目录）。
const TMP = mkdtempSync(join(tmpdir(), 'dsh-spanish-test-'));
const ENV_BEFORE = process.env.DSH_HOME;
process.env.DSH_HOME = TMP;

const mod = await import('../lib/index.js');

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

// ─────────────────── 假 ctx ───────────────────

const registered = { routes: [], tools: [], effects: [] };

function makeCtx() {
  return {
    webServer: {
      register(spec) {
        registered.routes.push(spec);
        return () => {};
      },
    },
    tools: {
      register(tool) {
        registered.tools.push(tool);
        return () => {};
      },
    },
    effect(fn) {
      registered.effects.push(fn);
      // 立即执行以便拿到注册结果（清理函数丢弃）
      try {
        fn();
      } catch (err) {
        failures.push(`effect 执行抛错：${err?.message ?? err}`);
        fail++;
      }
    },
    get(name) {
      if (name === 'llm') return undefined; // 没有模型 → 讲解降级
      if (name === 'agentDefaultModel') return undefined;
      return undefined;
    },
  };
}

const ctx = makeCtx();
mod.apply(ctx);

// ─────────────────── 注册检查 ───────────────────

eq(registered.routes.length, 1, '注册了 1 条路由');
eq(registered.routes[0].path, '/dsh-spanish', '路由前缀正确');
eq(registered.routes[0].kind, 'prefix', '路由是 prefix 类型');
eq(typeof registered.routes[0].handler, 'function', '路由有 handler');

eq(registered.tools.length, 4, '注册了 4 个工具');
const toolNames = registered.tools.map((t) => t.name).sort();
eq(toolNames, ['spanish_conjugate', 'spanish_noun', 'spanish_progress', 'spanish_quiz'], '工具名正确');

// 每个工具结构完整
for (const t of registered.tools) {
  const problems = [];
  if (typeof t.name !== 'string' || t.name === '') problems.push('name');
  if (typeof t.description !== 'string' || t.description === '') problems.push('description');
  if (!t.parameters || t.parameters.type !== 'object') problems.push('parameters');
  if (typeof t.execute !== 'function') problems.push('execute');
  if (!t.output || typeof t.output.render !== 'function') problems.push('output.render');
  if (problems.length) {
    fail++;
    failures.push(`工具 ${t.name} 缺字段：${problems.join(',')}`);
  } else {
    pass++;
  }
}

// ─────────────────── 假 req/res ───────────────────

const handler = registered.routes[0].handler;

function makeRes() {
  const res = {
    statusCode: 0,
    headers: null,
    body: '',
    writeHead(code, headers) {
      res.statusCode = code;
      res.headers = headers;
    },
    end(chunk) {
      res.body = chunk === undefined ? '' : String(chunk);
    },
  };
  return res;
}

async function call(method, path, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const req = {
    method,
    url: path,
    async *[Symbol.asyncIterator]() {
      if (payload !== '') yield Buffer.from(payload, 'utf8');
    },
  };
  const res = makeRes();
  await handler(req, res);
  let json = null;
  try {
    json = JSON.parse(res.body);
  } catch {
    /* 非 JSON */
  }
  return { status: res.statusCode, json, raw: res.body };
}

// ─────────────────── /meta ───────────────────

const meta = await call('GET', '/dsh-spanish/meta');
eq(meta.status, 200, 'GET /meta 200');
ok(meta.json?.ok === true, '/meta ok');
ok(Array.isArray(meta.json?.tenses) && meta.json.tenses.length >= 10, '/meta 有时态列表');
ok(Array.isArray(meta.json?.persons) && meta.json.persons.length === 6, '/meta 有六个人称');
ok(meta.json?.levels?.includes('A1'), '/meta 有等级');

// ─────────────────── /state ───────────────────

const state0 = await call('GET', '/dsh-spanish/state');
eq(state0.status, 200, 'GET /state 200');
ok(state0.json?.ok === true, '/state ok');
eq(state0.json?.stats?.answered, 0, '初始 answered = 0');
eq(state0.json?.settings?.level, 'A1', '默认等级 A1');
ok(state0.json?.progress?.bankSize?.verbs > 50, '词库有动词');

// ─────────────────── /settings ───────────────────

const setRes = await call('POST', '/dsh-spanish/settings', { level: 'A2', size: 7 });
eq(setRes.status, 200, 'POST /settings 200');
eq(setRes.json?.settings?.level, 'A2', '设置写成 A2');
eq(setRes.json?.settings?.size, 7, '设置 size 7');

// 非法值要被夹紧 / 过滤
const setBad = await call('POST', '/dsh-spanish/settings', { size: 999, tenses: ['nope', 'presente'] });
eq(setBad.json?.settings?.size, 50, 'size 超上限被夹到 50');
eq(setBad.json?.settings?.tenses, ['presente'], '非法时态被过滤');

// ─────────────────── /session ───────────────────

const sess = await call('POST', '/dsh-spanish/session', { size: 5, kinds: ['conjugation'], tenses: ['presente'], level: 'A1' });
eq(sess.status, 200, 'POST /session 200');
eq(sess.json?.questions?.length, 5, '出 5 题');
ok(sess.json.questions.every((q) => q.kind === 'conjugation'), '全是变位题');

// 关键：下发的题目**不能包含答案**
const leaks = sess.json.questions.filter((q) => q.answer !== undefined || q.siblings !== undefined);
eq(leaks, [], '下发的题目不含答案（防作弊）');

// 但必须有足够的展示字段
for (const q of sess.json.questions) {
  if (!q.id || !q.kind || !q.infinitive || !q.tense || !q.person || q.personIndex === undefined) {
    fail++;
    failures.push(`题目字段不全：${JSON.stringify(q).slice(0, 150)}`);
  } else {
    pass++;
  }
}

// ─────────────────── /answer ───────────────────

// 直接构造一个已知答案的题来判分（从引擎拿正确答案）
const { conjugate } = await import('../lib/engine/conjugator.js');
const q = sess.json.questions[0];
const correct = conjugate(q.infinitive, q.tense)[q.personIndex];

const ansRight = await call('POST', '/dsh-spanish/answer', { question: q, given: correct });
eq(ansRight.status, 200, 'POST /answer 200（答对）');
eq(ansRight.json?.result, 'correct', '判为 correct');
eq(ansRight.json?.expected, correct, '回传正确答案');
ok(ansRight.json?.explanation === null, '答对不调模型讲解');
ok(ansRight.json?.mastery > 0, '掌握度上升');

// 答错
const q2 = sess.json.questions[1];
const wrongAnswer = 'zzzz';
const ansWrong = await call('POST', '/dsh-spanish/answer', { question: q2, given: wrongAnswer });
eq(ansWrong.json?.result, 'wrong', '判为 wrong');
ok(ansWrong.json?.explanation === null, '没有模型时讲解降级为 null（不抛错）');

// 只差重音
const q3 = sess.json.questions[2];
const correct3 = conjugate(q3.infinitive, q3.tense)[q3.personIndex];
const stripped = correct3.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
if (stripped !== correct3) {
  const ansAccent = await call('POST', '/dsh-spanish/answer', { question: q3, given: stripped });
  eq(ansAccent.json?.result, 'accent', '只差重音判为 accent');
} else {
  // 这题本身没有重音，跳过（不记为失败）
  pass++;
}

// 缺 question 要报 400
const ansBad = await call('POST', '/dsh-spanish/answer', { given: 'x' });
eq(ansBad.status, 400, '缺 question 返回 400');

// ─── 防作弊：伪造 answer 字段不能生效 ───
// 客户端如果能自己塞 answer，改一行前端就能「全对」。这里验证服务端不采信。
const cheatQ = sess.json.questions[3];
const cheatRealAnswer = conjugate(cheatQ.infinitive, cheatQ.tense)[cheatQ.personIndex];
const cheat = await call('POST', '/dsh-spanish/answer', {
  question: { ...cheatQ, answer: 'зло' }, // 塞一个假答案
  given: 'зло', // 再按假答案作答
});
eq(cheat.json?.result, 'wrong', '伪造 answer 字段无效（服务端自己算）');
eq(cheat.json?.expected, cheatRealAnswer, '仍然回传真实的正确答案');

// 反过来：按真实答案作答，即使客户端塞了假 answer 也要判对
const cheat2 = await call('POST', '/dsh-spanish/answer', {
  question: { ...cheatQ, answer: 'зло' },
  given: cheatRealAnswer,
});
eq(cheat2.json?.result, 'correct', '按正确答案作答仍然判对');

// 完全无法识别的题目要 400
const bogus = await call('POST', '/dsh-spanish/answer', {
  question: { id: 'bogus:1', kind: 'nonsense' },
  given: 'x',
});
eq(bogus.status, 400, '无法识别的题返回 400');

// 名词题也要防作弊：mano 是阴性，即使客户端塞 gender:'m' 也不能改判
const manoQ = { id: 'noun:mano:gender', kind: 'gender', noun: 'mano', gender: 'm' };
const manoAns = await call('POST', '/dsh-spanish/answer', { question: manoQ, given: 'f' });
eq(manoAns.json?.result, 'correct', 'mano 判阴性（题库标注优先于客户端字段）');
eq(manoAns.json?.expected, 'f', 'mano 的期望答案是 f');

// 作答后统计要变
const stateAfter = await call('GET', '/dsh-spanish/state');
ok(stateAfter.json?.stats?.answered >= 2, '作答数已累计');
ok(stateAfter.json?.progress?.tracked >= 2, '记录了卡片');

// ─────────────────── 新题型必须能通过 HTTP 判分 ───────────────────
//
// 这是一条**回归测试**，守的是一个真实发生过的 bug：
// resolveAnswer() 一开始只覆盖了旧题型，vocab/cloze/grammar 都返回 null，
// 于是判分一律 400 —— 而当时的单测直接调 judge()，绕开了 resolveAnswer，测不出来。
// 所以这里必须走**完整的 HTTP 路径**。
{
  for (const kind of ['vocab', 'cloze', 'grammar']) {
    const sess = await call('POST', '/dsh-spanish/session', {
      size: 3,
      kinds: [kind],
      level: 'A1',
      seed: 31,
    });
    const qs = sess.json?.questions ?? [];
    eq(qs.length, 3, `${kind}：出 3 题`);

    const q = qs[0];
    if (q === undefined) {
      fail++;
      failures.push(`${kind}：没拿到题目`);
      continue;
    }

    // 用「逐个选项试」的方式找正确答案（服务端不信任客户端给的答案）
    let got200 = false;
    let gotCorrect = false;
    if (Array.isArray(q.choices)) {
      for (const c of q.choices) {
        const text = c.value ?? c.text ?? c.id;
        const r = await call('POST', '/dsh-spanish/answer', { question: q, given: text });
        if (r.status === 200) got200 = true;
        if (r.json?.result === 'correct') { gotCorrect = true; break; }
      }
    } else {
      // 填空/语法也可能没有 choices，用 reveal 拿答案再提交
      const rev = await call('POST', '/dsh-spanish/reveal', { question: q });
      const ans = rev.json?.answer;
      if (typeof ans === 'string') {
        const r = await call('POST', '/dsh-spanish/answer', { question: q, given: ans });
        if (r.status === 200) got200 = true;
        if (r.json?.result === 'correct') gotCorrect = true;
      }
    }

    eq(got200, true, `${kind}：判分返回 200（不是 400）`);
    eq(gotCorrect, true, `${kind}：正确答案能被判对`);
  }
}

// ─────────────────── 选项的契约：id 是序号，text 才是答案 ───────────────────
//
// 守的是一个真机 bug：认词题的选项是 {id:'0', text:'repetir'}，客户端当时按
// `c.value ?? c.id ?? c.text` 回退，于是点「repetir」提交的是 "0"，判分永远错，
// 模型还把 "0" 解释成"等于没作答"。
//
// 上面那段 HTTP 测试用的是 `c.value ?? c.text ?? c.id`（正确顺序），所以它测不出来 ——
// 这里显式钉住引擎侧的契约，让「把 id 当答案」这件事在两端都无处可藏。
{
  const sess = await call('POST', '/dsh-spanish/session', {
    size: 4,
    kinds: ['vocab', 'grammar'],
    level: 'A1',
    seed: 7,
  });
  for (const q of sess.json?.questions ?? []) {
    if (!Array.isArray(q.choices) || q.choices.length === 0) continue;

    // 认词/语法题的选项必须是 {id, text}，且 id 是序号
    const allHaveText = q.choices.every((c) => typeof c.text === 'string' && c.text !== '');
    eq(allHaveText, true, `${q.kind}：每个选项都带 text（答案本体）`);

    const idsAreIndexes = q.choices.every((c) => /^\d+$/.test(String(c.id)));
    eq(idsAreIndexes, true, `${q.kind}：选项 id 是纯序号（所以绝不能当答案用）`);

    // 把某个非答案选项的 id 当答案提交，必须判错 —— 序号不能蒙对
    const wrongIdx = q.choices.findIndex((c) => c.text !== q.answer);
    if (wrongIdx >= 0) {
      const r = await call('POST', '/dsh-spanish/answer', {
        question: q,
        given: String(q.choices[wrongIdx].id),
      });
      eq(r.json?.result, 'wrong', `${q.kind}：提交选项序号（而不是选项文字）必须判错`);
    }
  }
}

// ─────────────────── /teach（学）───────────────────
//
// 这是本来缺的那一步。注意测试里的 ctx 没有 llm，
// 所以正好验证「模型不可用时降级」这个关键行为。

{
  const q = sess.json.questions[0];
  const realAnswer = conjugate(q.infinitive, q.tense)[q.personIndex];

  const teachRes = await call('POST', '/dsh-spanish/teach', { question: q });
  eq(teachRes.status, 200, 'POST /teach 200');
  eq(teachRes.json?.ok, true, '/teach ok');
  // 没有模型 → 必须降级而不是报错
  eq(teachRes.json?.degraded, true, '无模型时 degraded=true');
  eq(teachRes.json?.content, null, '无模型时 content 为 null');
  // 关键：即使讲解失败，答案照样给出来
  eq(teachRes.json?.answer, realAnswer, '/teach 仍然给出正确答案');
  ok(typeof teachRes.json?.notice === 'string' && teachRes.json.notice !== '', '有降级说明');

  // 缺 question
  const bad = await call('POST', '/dsh-spanish/teach', {});
  eq(bad.status, 400, '/teach 缺 question 返回 400');

  // 无法识别的题
  const bogus = await call('POST', '/dsh-spanish/teach', { question: { id: 'x', kind: 'nope' } });
  eq(bogus.status, 400, '/teach 无法识别的题返回 400');
}

// ─────────────────── /reveal（看答案）───────────────────

{
  const q = sess.json.questions[1];
  const realAnswer = conjugate(q.infinitive, q.tense)[q.personIndex];

  const r = await call('POST', '/dsh-spanish/reveal', { question: q });
  eq(r.status, 200, 'POST /reveal 200');
  eq(r.json?.ok, true, '/reveal ok');
  eq(r.json?.answer, realAnswer, '/reveal 给出正确答案');
  // detail=false 时不调模型
  eq(r.json?.content, null, 'detail=false 不调模型');

  // 揭晓后应该记进记忆表（按 accent 记，不算对也不扣最低）
  const st = await call('GET', '/dsh-spanish/state');
  ok(st.json?.progress?.tracked >= 1, '看答案也记入进度');

  // detail=true 但没模型 → 降级
  const r2 = await call('POST', '/dsh-spanish/reveal', { question: q, detail: true });
  eq(r2.json?.answer, realAnswer, 'detail=true 仍给答案');
  eq(r2.json?.degraded, true, 'detail=true 无模型时降级');

  const bad = await call('POST', '/dsh-spanish/reveal', {});
  eq(bad.status, 400, '/reveal 缺 question 返回 400');
}

// ─────────────────── /models（模型列表）───────────────────

{
  const m = await call('GET', '/dsh-spanish/models');
  eq(m.status, 200, 'GET /models 200');
  eq(m.json?.ok, true, '/models ok');
  // 没有 llm 服务 → 空列表，但不能报错
  eq(Array.isArray(m.json?.providers), true, 'providers 是数组');
  eq(m.json?.providers, [], '无 llm 时返回空列表（不抛错）');
  eq(m.json?.current, null, '无 llm 时 current 为 null');
  // 但设置要能回传，界面才能渲染
  ok(m.json?.settings !== undefined && m.json.settings !== null, '/models 回传 settings');
}

// ─────────────────── 新设置的读写 ───────────────────

{
  const r = await call('POST', '/dsh-spanish/settings', {
    llmProvider: 'test-provider',
    llmModel: 'test-model',
    teachMode: 'reveal',
  });
  eq(r.json?.settings?.llmProvider, 'test-provider', '能写入 llmProvider');
  eq(r.json?.settings?.llmModel, 'test-model', '能写入 llmModel');
  eq(r.json?.settings?.teachMode, 'reveal', '能写入 teachMode');

  // 非法 teachMode 要被拒绝（保留原值）
  const bad = await call('POST', '/dsh-spanish/settings', { teachMode: 'nonsense' });
  ok(bad.json?.settings?.teachMode !== 'nonsense', '非法 teachMode 被忽略');

  // 清空回到跟随
  const reset = await call('POST', '/dsh-spanish/settings', { llmProvider: '', llmModel: '', teachMode: 'learn' });
  eq(reset.json?.settings?.llmProvider, '', '能清空 llmProvider（回到跟随）');
  eq(reset.json?.settings?.teachMode, 'learn', 'teachMode 回到 learn');

  // /meta 要暴露 teachModes 供界面渲染
  const meta = await call('GET', '/dsh-spanish/meta');
  ok(Array.isArray(meta.json?.teachModes) && meta.json.teachModes.length === 3, '/meta 暴露 3 种学习方式');
}

// ─────────────────── /table ───────────────────
const table = await call('GET', '/dsh-spanish/table?verb=hablar');
eq(table.status, 200, 'GET /table 200');
eq(table.json?.table?.presente?.[0], 'hablo', 'hablar presente yo = hablo');
eq(table.json?.participlo, 'hablado', 'hablar 过去分词');
ok(Array.isArray(table.json?.tenses) && table.json.tenses.length >= 10, '/table 有时态列表');

const tableBad = await call('GET', '/dsh-spanish/table?verb=mesa');
eq(tableBad.status, 400, '非动词查询返回 400');
ok(typeof tableBad.json?.error === 'string', '报错有说明');

const tableMissing = await call('GET', '/dsh-spanish/table');
eq(tableMissing.status, 400, '缺 verb 返回 400');

// ─────────────────── /noun ───────────────────

const noun = await call('GET', '/dsh-spanish/noun?word=mano');
eq(noun.status, 200, 'GET /noun 200');
eq(noun.json?.gender, 'f', 'mano 是阴性');
eq(noun.json?.definite, 'la', 'la mano');
eq(noun.json?.plural, 'manos', 'manos');

const nounAgua = await call('GET', '/dsh-spanish/noun?word=agua');
eq(nounAgua.json?.gender, 'f', 'agua 性为阴性');
eq(nounAgua.json?.definite, 'el', 'agua 冠词用 el');

const nounMissing = await call('GET', '/dsh-spanish/noun');
eq(nounMissing.status, 400, '缺 word 返回 400');

// ─────────────────── /bank ───────────────────

const bank = await call('GET', '/dsh-spanish/bank?level=A1');
eq(bank.status, 200, 'GET /bank 200');
ok(Array.isArray(bank.json?.bank?.verbs) && bank.json.bank.verbs.length > 10, 'A1 动词库非空');
ok(bank.json.bank.verbs.every((v) => v.level === 'A1'), 'A1 库只含 A1');

// ─────────────────── 未知路由 ───────────────────

const unknown = await call('GET', '/dsh-spanish/nope');
eq(unknown.status, 404, '未知路由 404');

// ─────────────────── 工具执行 ───────────────────

const conjTool = registered.tools.find((t) => t.name === 'spanish_conjugate');
const conjOut = await conjTool.execute({ verb: 'tener', tense: 'presente' });
ok(conjOut.ok === true, 'spanish_conjugate ok');
eq(conjOut.forms, ['tengo', 'tienes', 'tiene', 'tenemos', 'tenéis', 'tienen'], 'spanish_conjugate 结果正确');
ok(typeof conjOut.notice === 'string' && conjOut.notice.includes('tengo'), '有可读输出');

const conjAll = await conjTool.execute({ verb: 'hablar' });
ok(conjAll.ok === true && conjAll.table, '不传时态返回全表');

const conjBad = await conjTool.execute({ verb: 'mesa' });
eq(conjBad.ok, false, '非动词返回 ok:false');

const conjEmpty = await conjTool.execute({});
eq(conjEmpty.ok, false, '空参数返回 ok:false');

const nounTool = registered.tools.find((t) => t.name === 'spanish_noun');
const nounOut = await nounTool.execute({ word: 'problema' });
eq(nounOut.ok, true, 'spanish_noun ok');
eq(nounOut.gender, 'm', 'problema 是阳性');
ok(nounOut.notice.includes('阳性'), '输出说明阴阳性');

const quizTool = registered.tools.find((t) => t.name === 'spanish_quiz');
const quizOut = await quizTool.execute({ size: 3, level: 'A1', kinds: ['conjugation'] });
eq(quizOut.ok, true, 'spanish_quiz ok');
eq(quizOut.questions.length, 3, 'spanish_quiz 出 3 题');
ok(typeof quizOut.notice === 'string' && quizOut.notice.length > 0, 'spanish_quiz 有可读输出');
// 工具下发的题也不该带答案
ok(quizOut.questions.every((x) => x.answer === undefined), 'spanish_quiz 不带答案');

const progTool = registered.tools.find((t) => t.name === 'spanish_progress');
const progOut = await progTool.execute({});
eq(progOut.ok, true, 'spanish_progress ok');
ok(typeof progOut.notice === 'string', '进度有可读输出');
ok(progOut.tracked >= 2, '进度反映之前作答');

// ─────────────────── 持久化 ───────────────────

const file = mod.progressFile();
ok(existsSync(file), '进度文件已落盘');

const saved = JSON.parse((await import('node:fs')).readFileSync(file, 'utf8'));
ok(saved.memory && Object.keys(saved.memory).length >= 2, '落盘文件里有记忆');
ok(saved.stats.answered >= 2, '落盘文件里有统计');

// 重新加载能读回来
const reloaded = mod.loadState();
eq(Object.keys(reloaded.memory).length, Object.keys(saved.memory).length, '重新加载记忆数一致');

// /reset
const resetNoConfirm = await call('POST', '/dsh-spanish/reset', {});
eq(resetNoConfirm.status, 400, 'reset 需要 confirm');

const reset = await call('POST', '/dsh-spanish/reset', { confirm: true });
eq(reset.status, 200, 'reset 成功');
eq(existsSync(file), false, '进度文件已删除');

const stateReset = await call('GET', '/dsh-spanish/state');
eq(stateReset.json?.stats?.answered, 0, 'reset 后统计归零');

// ─────────────────── 清理 ───────────────────

try {
  rmSync(TMP, { recursive: true, force: true });
} catch {
  /* 清理失败不影响结果 */
}

// 恢复环境变量：后续套件（尤其 live）要用真实的 DSH_HOME
if (ENV_BEFORE === undefined) delete process.env.DSH_HOME;
else process.env.DSH_HOME = ENV_BEFORE;

console.log(`\nhost 自检：${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('全部通过 ✓');
