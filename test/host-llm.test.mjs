/**
 * 带「假模型」的测试：验证模型可用时的完整路径。
 *
 * 前面的 host.test.mjs 里 ctx 没有 llm，只能验证降级。
 * 但真正重要的是：模型**在的时候**，
 *   1. 有没有把正确的 provider/model 传下去
 *   2. 有没有把系统提示词和题目内容传对
 *   3. 流式返回的文本有没有被正确拼装
 *   4. 设置里指定的模型有没有覆盖 DSH 默认模型
 *
 * 运行：node test/host-llm.test.mjs
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 每个场景用**独立的 DSH_HOME**，否则设置会跨场景泄漏
// （场景 2 写了 prov-b，场景 3 就会读到它 —— 这是测试污染，不是代码 bug）。
const HOMES = [];
function freshHome() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-spanish-llm-'));
  HOMES.push(dir);
  process.env.DSH_HOME = dir;
  return dir;
}
const ENV_BEFORE = process.env.DSH_HOME;
freshHome();

const mod = await import('../lib/index.js');

let pass = 0;
let fail = 0;
const failures = [];

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass++;
  else {
    fail++;
    failures.push(`${label}\n    期望 ${e}\n    实际 ${a}`);
  }
}
function ok(cond, label) { eq(Boolean(cond), true, label); }

// ─────────────────── 假 LLM ───────────────────

const calls = [];

function makeFakeLlm(reply = '这是一段讲解。') {
  return {
    listProviders() {
      return [
        { provider: 'prov-a', name: 'Provider A' },
        { provider: 'prov-b', name: 'Provider B' },
      ];
    },
    async listModels(provider) {
      if (provider === 'prov-a') {
        return [{ id: 'model-a1', name: 'Model A1' }, { id: 'model-a2', name: 'Model A2' }];
      }
      return [{ id: 'model-b1', name: 'Model B1' }];
    },
    stream(opts) {
      calls.push({
        provider: opts.provider,
        model: opts.model,
        system: opts.system,
        user: opts.messages?.[0]?.content?.[0]?.text,
        maxTokens: opts.maxTokens,
      });
      // 模拟分块流式返回
      const chunks = reply.split('').map((ch) => ({ type: 'text-delta', text: ch }));
      chunks.push({ type: 'finish', reason: { kind: 'stop' } });
      return (async function* () {
        for (const c of chunks) yield c;
      })();
    },
  };
}

// ─────────────────── 假 ctx ───────────────────

function makeCtx({ llm, defaultModel }) {
  const reg = { routes: [], tools: [] };
  return {
    reg,
    webServer: { register(spec) { reg.routes.push(spec); return () => {}; } },
    tools: { register(tool) { reg.tools.push(tool); return () => {}; } },
    effect(fn) { try { fn(); } catch (e) { failures.push('effect: ' + e.message); fail++; } },
    get(name) {
      if (name === 'llm') return llm;
      if (name === 'agentDefaultModel') {
        return defaultModel === undefined ? undefined : { currentSelection: () => defaultModel };
      }
      return undefined;
    },
  };
}

function makeRes() {
  const res = {
    statusCode: 0, body: '',
    writeHead(c) { res.statusCode = c; },
    end(chunk) { res.body = chunk === undefined ? '' : String(chunk); },
  };
  return res;
}

async function call(handler, method, path, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const req = {
    method, url: path,
    async *[Symbol.asyncIterator]() {
      if (payload !== '') yield Buffer.from(payload, 'utf8');
    },
  };
  const res = makeRes();
  await handler(req, res);
  let json = null;
  try { json = JSON.parse(res.body); } catch { /* */ }
  return { status: res.statusCode, json };
}

// ═══════════════════════════════════════════════════════════
// 场景 1：跟随 DSH 默认模型
// ═══════════════════════════════════════════════════════════

console.log('=== 场景 1：默认跟随 DSH 模型 ===');
{
  calls.length = 0;
  freshHome();
  const ctx = makeCtx({
    llm: makeFakeLlm('讲解正文 here'),
    defaultModel: { provider: 'prov-a', model: 'model-a1' },
  });
  mod.apply(ctx);
  const handler = ctx.reg.routes[0].handler;

  const sess = await call(handler, 'POST', '/dsh-spanish/session', {
    size: 3, kinds: ['conjugation'], tenses: ['presente'], level: 'A1',
  });
  const q = sess.json.questions[0];

  const teach = await call(handler, 'POST', '/dsh-spanish/teach', { question: q });
  eq(teach.status, 200, '/teach 200');
  eq(teach.json?.degraded, false, '模型可用时 degraded=false');
  ok(typeof teach.json?.content === 'string' && teach.json.content.length > 0, '拿到讲解内容');
  eq(teach.json?.model?.source, 'session', '模型来源标记为 session（跟随）');
  eq(teach.json?.model?.provider, 'prov-a', 'provider 正确');
  eq(teach.json?.model?.model, 'model-a1', 'model 正确');

  // 验证传给 llm 的 provider/model 是对的
  eq(calls.length, 1, '调用了一次模型');
  eq(calls[0].provider, 'prov-a', 'llm 收到的 provider');
  eq(calls[0].model, 'model-a1', 'llm 收到的 model');

  // 验证提示词内容
  ok(typeof calls[0].system === 'string' && calls[0].system.length > 20, '有系统提示词');
  ok(calls[0].system.includes('西语'), '系统提示词提到西语');
  ok(typeof calls[0].user === 'string', '有用户消息');
  ok(calls[0].user.includes(q.infinitive), '用户消息里带上了动词原形');
  ok(calls[0].user.includes('正确答案'), '用户消息里带上了正确答案');
}

// ═══════════════════════════════════════════════════════════
// 场景 2：设置里指定模型，覆盖默认
// ═══════════════════════════════════════════════════════════

console.log('');
console.log('=== 场景 2：指定模型覆盖 DSH 默认 ===');
{
  calls.length = 0;
  freshHome();
  const ctx = makeCtx({
    llm: makeFakeLlm('指定的模型讲解'),
    defaultModel: { provider: 'prov-a', model: 'model-a1' },
  });
  mod.apply(ctx);
  const handler = ctx.reg.routes[0].handler;

  // 先设置成 prov-b / model-b1
  const set = await call(handler, 'POST', '/dsh-spanish/settings', {
    llmProvider: 'prov-b', llmModel: 'model-b1',
  });
  eq(set.json?.settings?.llmProvider, 'prov-b', '设置已写入');

  const sess = await call(handler, 'POST', '/dsh-spanish/session', {
    size: 3, kinds: ['conjugation'], tenses: ['presente'], level: 'A1',
  });
  const q = sess.json.questions[0];

  const teach = await call(handler, 'POST', '/dsh-spanish/teach', { question: q });
  eq(teach.json?.model?.source, 'override', '模型来源标记为 override');
  eq(teach.json?.model?.provider, 'prov-b', '用了指定的 provider');
  eq(teach.json?.model?.model, 'model-b1', '用了指定的 model');

  eq(calls[0].provider, 'prov-b', 'llm 实际收到 prov-b（不是默认的 prov-a）');
  eq(calls[0].model, 'model-b1', 'llm 实际收到 model-b1');
}

// ═══════════════════════════════════════════════════════════
// 场景 3：/models 正确列出目录
// ═══════════════════════════════════════════════════════════

console.log('');
console.log('=== 场景 3：/models 列出可用模型 ===');
{
  freshHome();
  const ctx = makeCtx({
    llm: makeFakeLlm(),
    defaultModel: { provider: 'prov-a', model: 'model-a1' },
  });
  mod.apply(ctx);
  const handler = ctx.reg.routes[0].handler;

  const m = await call(handler, 'GET', '/dsh-spanish/models');
  eq(m.json?.providers?.length, 2, '列出 2 个 provider');
  eq(m.json?.providers?.[0]?.provider, 'prov-a', '第一个 provider id');
  eq(m.json?.providers?.[0]?.models?.length, 2, 'prov-a 有 2 个模型');
  eq(m.json?.current?.provider, 'prov-a', 'current 指向 DSH 默认');
}

// ═══════════════════════════════════════════════════════════
// 场景 4：teachMode=off 不调模型
// ═══════════════════════════════════════════════════════════

console.log('');
console.log('=== 场景 4：teachMode=off 不烧 token ===');
{
  calls.length = 0;
  freshHome();
  const ctx = makeCtx({
    llm: makeFakeLlm(),
    defaultModel: { provider: 'prov-a', model: 'model-a1' },
  });
  mod.apply(ctx);
  const handler = ctx.reg.routes[0].handler;

  await call(handler, 'POST', '/dsh-spanish/settings', { teachMode: 'off' });

  const sess = await call(handler, 'POST', '/dsh-spanish/session', {
    size: 3, kinds: ['conjugation'], tenses: ['presente'], level: 'A1',
  });
  const q = sess.json.questions[0];

  const teach = await call(handler, 'POST', '/dsh-spanish/teach', { question: q });
  eq(teach.json?.mode, 'off', 'mode=off');
  eq(calls.length, 0, '关闭时完全不调模型（零 token）');
  // 但答案还是给
  ok(typeof teach.json?.answer === 'string' && teach.json.answer !== '', '关闭讲解仍给答案');
}

// ═══════════════════════════════════════════════════════════
// 场景 5：模型抛错时降级，不影响主流程
// ═══════════════════════════════════════════════════════════

console.log('');
console.log('=== 场景 5：模型报错时降级 ===');
{
  const brokenLlm = {
    listProviders: () => [{ provider: 'p', name: 'P' }],
    listModels: async () => [],
    stream() {
      throw new Error('模型炸了');
    },
  };
  freshHome();
  const ctx = makeCtx({ llm: brokenLlm, defaultModel: { provider: 'p', model: 'm' } });
  mod.apply(ctx);
  const handler = ctx.reg.routes[0].handler;

  const sess = await call(handler, 'POST', '/dsh-spanish/session', {
    size: 3, kinds: ['conjugation'], tenses: ['presente'], level: 'A1',
  });
  const q = sess.json.questions[0];

  const teach = await call(handler, 'POST', '/dsh-spanish/teach', { question: q });
  eq(teach.status, 200, '模型报错时 /teach 仍返回 200');
  eq(teach.json?.degraded, true, '标记为降级');
  ok(typeof teach.json?.answer === 'string', '答案照给');

  // 判分也不能被拖垮
  const { conjugate } = await import('../lib/engine/conjugator.js');
  const ans = await call(handler, 'POST', '/dsh-spanish/answer', {
    question: q,
    given: conjugate(q.infinitive, q.tense)[q.personIndex],
  });
  eq(ans.status, 200, '模型报错时判分正常');
  eq(ans.json?.result, 'correct', '判分结果正确');
}

// ═══════════════════════════════════════════════════════════
// 场景 6：答错时用模型讲解
// ═══════════════════════════════════════════════════════════

console.log('');
console.log('=== 场景 6：答错自动讲解 ===');
{
  calls.length = 0;
  freshHome();
  const ctx = makeCtx({
    llm: makeFakeLlm('你选错了人称。'),
    defaultModel: { provider: 'prov-a', model: 'model-a1' },
  });
  mod.apply(ctx);
  const handler = ctx.reg.routes[0].handler;

  const sess = await call(handler, 'POST', '/dsh-spanish/session', {
    size: 3, kinds: ['conjugation'], tenses: ['presente'], level: 'A1',
  });
  const q = sess.json.questions[0];

  const wrong = await call(handler, 'POST', '/dsh-spanish/answer', { question: q, given: 'zzz' });
  eq(wrong.json?.result, 'wrong', '判为 wrong');
  ok(typeof wrong.json?.explanation === 'string' && wrong.json.explanation.length > 0, '答错时拿到讲解');
  eq(calls.length, 1, '答错调用了一次模型');

  // 答对时不该调模型（省钱）
  calls.length = 0;
  const { conjugate } = await import('../lib/engine/conjugator.js');
  const right = await call(handler, 'POST', '/dsh-spanish/answer', {
    question: q,
    given: conjugate(q.infinitive, q.tense)[q.personIndex],
  });
  eq(right.json?.result, 'correct', '判为 correct');
  eq(right.json?.explanation, null, '答对不给讲解');
  eq(calls.length, 0, '答对不调模型（不浪费 token）');
}

// ─────────────────── 清理 ───────────────────

for (const d of HOMES) { try { rmSync(d, { recursive: true, force: true }); } catch { /* */ } }
if (ENV_BEFORE === undefined) delete process.env.DSH_HOME;
else process.env.DSH_HOME = ENV_BEFORE;

console.log('');
console.log(`模型集成自检：${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('全部通过 ✓');
