/**
 * 情景造句自检（全模型题型）。运行：node test/scenario.test.mjs
 *
 * 这一类完全靠模型，所以测试重点是**健壮性**：
 *   1. 模型返回的 JSON 五花八门（带 ```json 包裹、带前言、截断），能否正确抠出
 *   2. 模型返回垃圾时，是否降级而不是崩溃
 *   3. 参考答案 token 能否防篡改
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOMES = [];
function freshHome() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-spanish-scn-'));
  HOMES.push(dir);
  process.env.DSH_HOME = dir;
  return dir;
}
freshHome();

const mod = await import('../lib/index.js');

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

// ─────────────────── 假模型 ───────────────────

let replyQueue = [];
let calls = [];

function makeLlm() {
  return {
    listProviders: () => [{ provider: 'p', name: 'P' }],
    listModels: async () => [{ id: 'm', name: 'M' }],
    stream(opts) {
      calls.push(opts);
      const reply = replyQueue.shift() ?? '';
      return (async function* () {
        for (const ch of reply) yield { type: 'text-delta', text: ch };
        yield { type: 'finish', reason: { kind: 'stop' } };
      })();
    },
  };
}

function makeCtx() {
  const reg = { routes: [] };
  return {
    reg,
    webServer: { register(s) { reg.routes.push(s); return () => {}; } },
    tools: { register() { return () => {}; } },
    effect(fn) { try { fn(); } catch { /* */ } },
    get(n) {
      if (n === 'llm') return makeLlm();
      if (n === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'p', model: 'm' }) };
      return undefined;
    },
  };
}

function makeRes() {
  const res = { statusCode: 0, body: '', writeHead(c) { res.statusCode = c; }, end(chunk) { res.body = chunk === undefined ? '' : String(chunk); } };
  return res;
}

async function call(handler, method, path, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const req = {
    method, url: path,
    async *[Symbol.asyncIterator]() { if (payload !== '') yield Buffer.from(payload, 'utf8'); },
  };
  const res = makeRes();
  await handler(req, res);
  let json = null;
  try { json = JSON.parse(res.body); } catch { /* */ }
  return { status: res.statusCode, json };
}

function withHandler(fn) {
  freshHome();
  calls = [];
  replyQueue = [];
  const ctx = makeCtx();
  mod.apply(ctx);
  return fn(ctx.reg.routes[0].handler);
}

// ═══════════════════════════════════════════════════════════
// 1. 场景列表
// ═══════════════════════════════════════════════════════════

console.log('=== 1. 场景列表 ===');
await withHandler(async (h) => {
  const r = await call(h, 'GET', '/dsh-spanish/scenarios');
  eq(r.status, 200, '/scenarios 200');
  ok(Array.isArray(r.json?.scenarios) && r.json.scenarios.length >= 5, `有 ${r.json?.scenarios?.length} 个场景`);
  ok(r.json.scenarios.every((s) => s.id && s.label && s.zh), '每个场景有 id/label/zh');
});

// ═══════════════════════════════════════════════════════════
// 2. 出题：模型返回标准 JSON
// ═══════════════════════════════════════════════════════════

console.log('');
console.log('=== 2. 出题（标准 JSON）===');
await withHandler(async (h) => {
  replyQueue.push(JSON.stringify({
    task: '用西语点一份海鲜饭和一杯水',
    hints: ['用 pedir 的现在时', '量词用 una'],
    reference: 'Quiero una paella y un vaso de agua, por favor.',
  }));

  const r = await call(h, 'POST', '/dsh-spanish/scenario', { scenarioId: 'restaurant' });
  eq(r.status, 200, '200');
  eq(r.json?.degraded, false, '未降级');
  eq(r.json?.scenario?.id, 'restaurant', '场景正确');
  eq(r.json?.task?.task, '用西语点一份海鲜饭和一杯水', '题目正确');
  eq(r.json?.task?.hints?.length, 2, '有 2 条提示');

  // 关键：参考答案**不能**下发
  ok(r.json?.task?.reference === undefined, '题目里没有 reference 字段');
  ok(r.json?.reference === undefined, '响应顶层没有 reference');
  ok(typeof r.json?.refToken === 'string' && r.json.refToken.length > 5, '给了 refToken');

  // 全响应里不能出现参考答案文本
  const asText = JSON.stringify(r.json);
  ok(!asText.includes('paella'), '整个响应里没有参考答案文本（防偷看）');
});

// ═══════════════════════════════════════════════════════════
// 3. 出题：模型返回带 ```json 包裹
// ═══════════════════════════════════════════════════════════

console.log('');
console.log('=== 3. 出题（带 Markdown 包裹）===');
await withHandler(async (h) => {
  replyQueue.push('```json\n{"task":"问路","hints":["用 ¿dónde está?"],"reference":"¿Dónde está la estación?"}\n```');

  const r = await call(h, 'POST', '/dsh-spanish/scenario', {});
  eq(r.json?.degraded, false, '带包裹也能解析');
  eq(r.json?.task?.task, '问路', '题目正确');
});

// ═══════════════════════════════════════════════════════════
// 4. 出题：模型返回垃圾
// ═══════════════════════════════════════════════════════════

console.log('');
console.log('=== 4. 出题（模型返回垃圾）===');
await withHandler(async (h) => {
  replyQueue.push('对不起，我不能帮你出题。');
  const r = await call(h, 'POST', '/dsh-spanish/scenario', {});
  eq(r.status, 200, '仍返回 200（不崩）');
  eq(r.json?.degraded, true, '标记降级');
  ok(typeof r.json?.notice === 'string' && r.json.notice.length > 0, '有说明');
});

console.log('');
console.log('=== 4b. 出题（JSON 缺字段）===');
await withHandler(async (h) => {
  replyQueue.push('{"task":"只有题目"}'); // 缺 reference
  const r = await call(h, 'POST', '/dsh-spanish/scenario', {});
  eq(r.json?.degraded, true, '缺 reference 时降级');
});

console.log('');
console.log('=== 4c. 出题（JSON 被截断）===');
await withHandler(async (h) => {
  replyQueue.push('{"task":"问路","hints":["a"'); // 截断
  const r = await call(h, 'POST', '/dsh-spanish/scenario', {});
  eq(r.json?.degraded, true, '截断 JSON 降级而不是崩');
});

// ═══════════════════════════════════════════════════════════
// 5. 批改：标准流程
// ═══════════════════════════════════════════════════════════

console.log('');
console.log('=== 5. 批改（标准流程）===');
await withHandler(async (h) => {
  // 先出题
  replyQueue.push(JSON.stringify({
    task: '点菜',
    hints: ['用 querer'],
    reference: 'Quiero una paella.',
  }));
  const made = await call(h, 'POST', '/dsh-spanish/scenario', { scenarioId: 'restaurant' });
  const token = made.json.refToken;

  // 再批改（学生写对了）
  replyQueue.push(JSON.stringify({
    verdict: 'correct',
    feedback: '很好，表达清楚。',
    corrections: [],
  }));
  const g = await call(h, 'POST', '/dsh-spanish/scenario/grade', {
    scenarioId: 'restaurant',
    refToken: token,
    answer: 'Quiero una paella, por favor.',
  });

  eq(g.status, 200, '批改 200');
  eq(g.json?.verdict, 'correct', '判定 correct');
  eq(g.json?.feedback, '很好，表达清楚。', '有反馈');
  eq(g.json?.corrections, [], '没有需要改的');
  eq(g.json?.degraded, false, '未降级');

  // 批改请求里必须带上参考答案（服务端从 token 取）
  const gradeCall = calls[calls.length - 1];
  const gradePrompt = gradeCall.messages[0].content[0].text;
  ok(gradePrompt.includes('Quiero una paella'), '批改时模型收到了参考答案');
  ok(gradePrompt.includes('Quiero una paella, por favor.'), '批改时模型收到了学生的答案');
});

// ═══════════════════════════════════════════════════════════
// 6. 批改：有错误
// ═══════════════════════════════════════════════════════════

console.log('');
console.log('=== 6. 批改（有错误）===');
await withHandler(async (h) => {
  replyQueue.push(JSON.stringify({ task: '点菜', hints: [], reference: 'Quiero una paella.' }));
  const made = await call(h, 'POST', '/dsh-spanish/scenario', { scenarioId: 'restaurant' });

  replyQueue.push(JSON.stringify({
    verdict: 'partial',
    feedback: '能看懂，但动词形式不对。',
    corrections: [{ wrong: 'quiero una paella es', right: 'quiero una paella', why: '不需要加 es' }],
  }));
  const g = await call(h, 'POST', '/dsh-spanish/scenario/grade', {
    scenarioId: 'restaurant',
    refToken: made.json.refToken,
    answer: 'quiero una paella es',
  });

  eq(g.json?.verdict, 'partial', '判定 partial');
  eq(g.json?.corrections?.length, 1, '有 1 条修改');
  eq(g.json?.corrections?.[0]?.right, 'quiero una paella', '修改内容正确');
});

// ═══════════════════════════════════════════════════════════
// 7. token 防篡改（安全边界）
// ═══════════════════════════════════════════════════════════

console.log('');
console.log('=== 7. token 安全 ===');
await withHandler(async (h) => {
  replyQueue.push(JSON.stringify({ task: '点菜', hints: [], reference: 'Quiero una paella.' }));
  const made = await call(h, 'POST', '/dsh-spanish/scenario', { scenarioId: 'restaurant' });
  const token = made.json.refToken;

  // 伪造 token
  const bad = await call(h, 'POST', '/dsh-spanish/scenario/grade', {
    scenarioId: 'restaurant',
    refToken: 'forged-token-123',
    answer: 'algo',
  });
  eq(bad.status, 400, '伪造 token 被拒');

  // 缺 token
  const missing = await call(h, 'POST', '/dsh-spanish/scenario/grade', {
    scenarioId: 'restaurant',
    answer: 'algo',
  });
  eq(missing.status, 400, '缺 token 被拒');

  // 拿 A 场景的 token 批改 B 场景
  replyQueue.push(JSON.stringify({ task: '问路', hints: [], reference: '¿Dónde está?' }));
  const made2 = await call(h, 'POST', '/dsh-spanish/scenario', { scenarioId: 'directions' });
  const cross = await call(h, 'POST', '/dsh-spanish/scenario/grade', {
    scenarioId: 'restaurant',      // 场景不符
    refToken: made2.json.refToken, // 是 directions 的 token
    answer: 'algo',
  });
  eq(cross.status, 400, '跨场景 token 被拒');

  // 客户端伪造 reference 字段也没用（服务端不读它）
  replyQueue.push(JSON.stringify({ verdict: 'correct', feedback: 'ok', corrections: [] }));
  const spoof = await call(h, 'POST', '/dsh-spanish/scenario/grade', {
    scenarioId: 'restaurant',
    refToken: token,
    answer: 'Quiero una paella.',
    reference: '客户端伪造的参考答案', // 应被忽略
  });
  eq(spoof.json?.verdict, 'correct', '伪造 reference 不影响批改');
  const lastPrompt = calls[calls.length - 1].messages[0].content[0].text;
  ok(!lastPrompt.includes('客户端伪造的参考答案'), '客户端伪造的 reference 被忽略');
  ok(lastPrompt.includes('Quiero una paella.'), '用的还是服务端存的参考答案');
});

// ═══════════════════════════════════════════════════════════
// 8. 空答案 / 未知场景
// ═══════════════════════════════════════════════════════════

console.log('');
console.log('=== 8. 参数校验 ===');
await withHandler(async (h) => {
  const empty = await call(h, 'POST', '/dsh-spanish/scenario/grade', {
    scenarioId: 'restaurant', refToken: 'x', answer: '',
  });
  eq(empty.status, 400, '空答案被拒');

  const unknown = await call(h, 'POST', '/dsh-spanish/scenario/grade', {
    scenarioId: 'no-such', refToken: 'x', answer: 'algo',
  });
  eq(unknown.status, 400, '未知场景被拒');
});

// ═══════════════════════════════════════════════════════════
// 9. teachMode=off 时不可用
// ═══════════════════════════════════════════════════════════

console.log('');
console.log('=== 9. 关闭讲解时不可用 ===');
await withHandler(async (h) => {
  await call(h, 'POST', '/dsh-spanish/settings', { teachMode: 'off' });
  calls = [];

  const r = await call(h, 'POST', '/dsh-spanish/scenario', {});
  eq(r.json?.degraded, true, 'off 时降级');
  eq(calls.length, 0, 'off 时完全不调模型');
});

// ═══════════════════════════════════════════════════════════
// 10. 批改结果记入进度
// ═══════════════════════════════════════════════════════════

console.log('');
console.log('=== 10. 批改记入进度 ===');
await withHandler(async (h) => {
  const before = await call(h, 'GET', '/dsh-spanish/state');
  eq(before.json?.stats?.answered, 0, '初始 0');

  replyQueue.push(JSON.stringify({ task: '点菜', hints: [], reference: 'Quiero.' }));
  const made = await call(h, 'POST', '/dsh-spanish/scenario', { scenarioId: 'restaurant' });

  replyQueue.push(JSON.stringify({ verdict: 'correct', feedback: '好', corrections: [] }));
  await call(h, 'POST', '/dsh-spanish/scenario/grade', {
    scenarioId: 'restaurant', refToken: made.json.refToken, answer: 'Quiero.',
  });

  const after = await call(h, 'GET', '/dsh-spanish/state');
  eq(after.json?.stats?.answered, 1, '作答数 +1');
  eq(after.json?.stats?.correct, 1, '正确数 +1');
  ok(after.json?.progress?.tracked >= 1, '记了一张卡');
});

// ─────────────────── 清理 ───────────────────

for (const d of HOMES) { try { rmSync(d, { recursive: true, force: true }); } catch { /* */ } }

console.log('');
console.log(`情景造句自检：${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('全部通过 ✓');
