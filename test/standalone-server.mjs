/**
 * 独立 HTTP 服务器验证：把插件的 host 半身挂到真实的 node:http 服务上，
 * 然后用真实 HTTP 请求跑一遍六类题型的出题与判分。
 *
 * 为什么需要它：
 *   验证 host 逻辑必须重启 DSH（代码跑在宿主进程里），这很慢而且需要人工。
 *   但「host 逻辑本身对不对」可以脱离 DSH 验证 ——
 *   只要给它一个真实的 HTTP 服务和最小 ctx，剩下的完全一样。
 *
 * 这个脚本不能替代 live-all（宿主集成、client 加载、真实模型都测不到），
 * 但它能把「代码逻辑」和「需要重启」两件事分开，
 * 免得每次都说「测不了，得重启」。
 *
 * 运行：node test/standalone-server.mjs
 */

import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'dsh-es-standalone-'));
const ENV_BEFORE = process.env.DSH_HOME;
process.env.DSH_HOME = HOME;

// 默认用本仓库的 lib/（CI 里就是这么跑的）。
// 想验证「真正跑在 DSH 里的那份」时，指到安装位：
//   SPANISH_TUTOR_LIB=file:///C:/Users/<你>/.dsh/profiles/desktop/node_modules/dsh-spanish-tutor/lib/index.js
const LIB = process.env.SPANISH_TUTOR_LIB ?? new URL('../lib/index.js', import.meta.url).href;
console.log(`待测模块：${LIB}\n`);
const mod = await import(LIB);

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

// ─────────────────── 起一个真实 HTTP 服务 ───────────────────

let handler = null;
const ctx = {
  webServer: {
    register(spec) {
      handler = spec.handler;
      return () => {};
    },
  },
  tools: { register: () => () => {} },
  effect(fn) {
    try { fn(); } catch (err) { failures.push('effect: ' + err.message); fail++; }
  },
  // 不提供 llm / agentDefaultModel —— 走降级路径，正好验证模型不可用时的行为
  get: () => undefined,
};

mod.apply(ctx);

if (handler === null) {
  console.log('✗ 插件没有注册路由');
  process.exit(1);
}

const server = createServer((req, res) => {
  Promise.resolve(handler(req, res)).catch(() => {
    try { res.writeHead(500); res.end(); } catch { /* */ }
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const BASE = `http://127.0.0.1:${port}`;
console.log('独立服务已启动:', BASE);
console.log('');

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// ─────────────────── 1. 基础 ───────────────────

console.log('=== 1. 服务可用 ===');
{
  const meta = await call('GET', '/dsh-spanish/meta');
  eq(meta.status, 200, 'GET /meta 200');
  const kinds = (meta.json?.kinds ?? []).map((k) => k.id);
  for (const k of ['conjugation', 'gender', 'plural', 'vocab', 'cloze', 'grammar']) {
    ok(kinds.includes(k), `meta 含题型 ${k}`);
  }
  ok(meta.json?.fingerprint !== null && meta.json?.fingerprint !== undefined, 'meta 带加载指纹');
}

// ─────────────────── 2. 六类题型：出题 + 判分 ───────────────────
//
// 这是核心：每类题都要走完整 HTTP 路径（出题 → 提交 → 判分），
// 而不是直接调引擎函数。之前漏掉 resolveAnswer 分支的 bug，
// 就是因为单测绕开了 HTTP。

console.log('');
console.log('=== 2. 六类题型走完整 HTTP 判分 ===');

const KINDS = ['conjugation', 'gender', 'plural', 'vocab', 'cloze', 'grammar'];

for (const kind of KINDS) {
  const sess = await call('POST', '/dsh-spanish/session', {
    size: 4,
    kinds: [kind],
    level: 'A1',
    tenses: ['presente'],
    seed: 1234,
  });
  eq(sess.status, 200, `${kind}：出题 200`);
  const qs = sess.json?.questions ?? [];
  eq(qs.length, 4, `${kind}：出 4 题`);

  const q = qs[0];
  if (q === undefined) {
    failures.push(`${kind}：没拿到题目`);
    fail++;
    continue;
  }

  // 题目不能带答案
  ok(!('answer' in q), `${kind}：下发不含 answer`);

  // 用 reveal 拿答案（服务端自己算的）
  const rev = await call('POST', '/dsh-spanish/reveal', { question: q });
  eq(rev.status, 200, `${kind}：reveal 200`);
  const answer = rev.json?.answer;
  ok(typeof answer === 'string' && answer !== '', `${kind}：reveal 给了答案`);

  if (typeof answer !== 'string') continue;

  // 用正确答案提交 → 必须判对
  const right = await call('POST', '/dsh-spanish/answer', { question: q, given: answer });
  eq(right.status, 200, `${kind}：判分 200（不是 400）`);
  eq(right.json?.result, 'correct', `${kind}：正确答案判对`);

  // 用一个明显错的答案 → 必须判错
  const wrongAns = answer === 'zzz' ? 'yyy' : 'zzz';
  const wrong = await call('POST', '/dsh-spanish/answer', { question: q, given: wrongAns });
  eq(wrong.json?.result, 'wrong', `${kind}：错误答案判错`);

  // 防作弊：伪造 answer 字段不影响判分
  const cheat = await call('POST', '/dsh-spanish/answer', {
    question: { ...q, answer: wrongAns },
    given: wrongAns,
  });
  eq(cheat.json?.result, 'wrong', `${kind}：伪造 answer 无效`);
}

// ─────────────────── 3. 认词题：选项质量 ───────────────────

console.log('');
console.log('=== 3. 认词题选项质量 ===');
{
  const sess = await call('POST', '/dsh-spanish/session', { size: 10, kinds: ['vocab'], level: 'A1', seed: 77 });
  const qs = sess.json?.questions ?? [];
  let dup = 0;
  for (const q of qs) {
    const texts = (q.choices ?? []).map((c) => c.text ?? c.label);
    if (new Set(texts).size !== texts.length) dup++;
  }
  eq(dup, 0, '10 道认词题没有重复选项');
  ok(qs.every((q) => (q.choices ?? []).length >= 3), '每题至少 3 个选项');
}

// ─────────────────── 4. 语法题：规则说明 ───────────────────

console.log('');
console.log('=== 4. 语法题自带规则 ===');
{
  const sess = await call('POST', '/dsh-spanish/session', { size: 10, kinds: ['grammar'], seed: 88 });
  const qs = sess.json?.questions ?? [];
  ok(qs.every((q) => typeof q.rule === 'string' && q.rule !== ''), '每题都有 rule（不依赖模型）');
  ok(qs.every((q) => typeof q.zh === 'string' && q.zh !== ''), '每题都有中文翻译');
}

// ─────────────────── 5. 情景造句：模型不可用时降级 ───────────────────

console.log('');
console.log('=== 5. 情景造句在无模型时降级 ===');
{
  const r = await call('POST', '/dsh-spanish/scenario', { scenarioId: 'restaurant' });
  eq(r.status, 200, '无模型时仍返回 200');
  eq(r.json?.degraded, true, '标记降级');
  ok(typeof r.json?.notice === 'string' && r.json.notice !== '', '有说明');

  const g = await call('POST', '/dsh-spanish/scenario/grade', {
    scenarioId: 'restaurant', refToken: 'whatever', answer: 'algo',
  });
  // token 无效 → 400（这是优先级更高的检查）
  eq(g.status, 400, '无效 token 被拒');
}

// ─────────────────── 6. 学 / 看答案 在无模型时 ───────────────────

console.log('');
console.log('=== 6. 学 / 看答案落降级 ===');
{
  const sess = await call('POST', '/dsh-spanish/session', { size: 1, kinds: ['conjugation'], tenses: ['presente'], seed: 3 });
  const q = sess.json?.questions?.[0];

  const teach = await call('POST', '/dsh-spanish/teach', { question: q });
  eq(teach.status, 200, '/teach 200');
  eq(teach.json?.degraded, true, '/teach 降级');
  ok(typeof teach.json?.answer === 'string', '/teach 仍给答案');

  const reveal = await call('POST', '/dsh-spanish/reveal', { question: q });
  eq(reveal.status, 200, '/reveal 200');
  ok(typeof reveal.json?.answer === 'string', '/reveal 给答案');
}

// ─────────────────── 收尾 ───────────────────

await new Promise((resolve) => server.close(resolve));
for (const d of [HOME]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* */ } }
if (ENV_BEFORE === undefined) delete process.env.DSH_HOME;
else process.env.DSH_HOME = ENV_BEFORE;

console.log('');
console.log('═'.repeat(58));
console.log(`独立服务验证：${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('全部通过 ✓');
console.log('');
console.log('说明：这验证了 host 逻辑本身（真实 HTTP + 真实路由）。');
console.log('      宿主集成、client 加载、真实模型仍需 live-all（要重启 DSH）。');
