// 实机验证新增的「学」功能与模型选择（对运行中的 DSH）。
const BASE = (process.argv[2] ?? 'http://127.0.0.1:52539').replace(/\/+$/, '');
const API = BASE + '/dsh-spanish';

let pass = 0, fail = 0;
const failures = [];
const check = (c, label, detail) => {
  if (c) { pass++; console.log('  ✓ ' + label); }
  else { fail++; failures.push(label + (detail ? ' [' + detail + ']' : '')); console.log('  ✗ ' + label + (detail ? '  → ' + detail : '')); }
};

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

console.log('=== 0. 新路由存在 ===');
{
  const teach = await call('POST', '/teach', { question: { id: 'x', kind: 'nonsense' } });
  check(teach.status === 400, '/teach 路由存在（对无效题返回 400）', String(teach.status));
  const reveal = await call('POST', '/reveal', { question: { id: 'x', kind: 'nonsense' } });
  check(reveal.status === 400, '/reveal 路由存在', String(reveal.status));
  const models = await call('GET', '/models');
  check(models.status === 200 && models.json?.ok === true, '/models 可用');
}

console.log('');
console.log('=== 1. /models 反映真实 DSH 模型 ===');
{
  const m = await call('GET', '/models');
  const providers = m.json?.providers ?? [];
  check(Array.isArray(providers), 'providers 是数组');
  check(providers.length > 0, `列出了 ${providers.length} 个 provider`, JSON.stringify(providers.map((p) => p.provider)));
  const cur = m.json?.current;
  check(cur !== null && cur !== undefined, 'current 非空（能读到 DSH 当前模型）', JSON.stringify(cur));
  if (cur) {
    check(cur.source === 'session', 'current.source 是 session（跟随）', String(cur.source));
    console.log(`     当前模型：${cur.provider} / ${cur.model}`);
  }
  const totalModels = providers.reduce((s, p) => s + (p.models?.length ?? 0), 0);
  check(totalModels > 0, `共 ${totalModels} 个可选模型`);
}

console.log('');
console.log('=== 2. 出题并测试 /teach（学）===');
let q = null;
{
  await call('POST', '/reset', { confirm: true });
  const sess = await call('POST', '/session', {
    size: 4, kinds: ['conjugation'], tenses: ['presente'], level: 'A1',
  });
  q = sess.json?.questions?.[0];
  check(Boolean(q), '拿到一道题');

  const teach = await call('POST', '/teach', { question: q });
  check(teach.status === 200, '/teach 返回 200');
  check(teach.json?.ok === true, '/teach ok');
  check(typeof teach.json?.answer === 'string' && teach.json.answer !== '', '给了正确答案', String(teach.json?.answer));

  if (teach.json?.degraded === true) {
    console.log('     ⚠ 模型降级（' + (teach.json?.notice ?? '') + '）');
    check(typeof teach.json.notice === 'string', '降级时有说明');
  } else {
    check(typeof teach.json?.content === 'string' && teach.json.content.length > 0,
      `模型生成了讲解（${teach.json?.content?.length ?? 0} 字）`);
    check(teach.json?.model?.provider !== undefined, '回传用了哪个模型',
      `${teach.json?.model?.provider}/${teach.json?.model?.model}`);
    console.log('     讲解开头：' + String(teach.json.content).slice(0, 80).replace(/\n/g, ' '));
  }
}

console.log('');
console.log('=== 3. /reveal（看答案）===');
{
  const r = await call('POST', '/reveal', { question: q });
  check(r.status === 200, '/reveal 200');
  check(typeof r.json?.answer === 'string' && r.json.answer !== '', '揭晓了答案', String(r.json?.answer));
  check(r.json?.content === null, 'detail=false 时不多烧 token');
}

console.log('');
console.log('=== 4. 设置：学习方式与模型 ===');
{
  const set = await call('POST', '/settings', { teachMode: 'off' });
  check(set.json?.settings?.teachMode === 'off', '能设置 teachMode=off');
  const t = await call('POST', '/teach', { question: q });
  check(t.json?.mode === 'off', 'off 模式生效');
  check(t.json?.content === null, 'off 模式不调模型');
  check(typeof t.json?.answer === 'string', 'off 模式仍给答案');

  await call('POST', '/settings', { teachMode: 'learn' });

  const bad = await call('POST', '/settings', { teachMode: 'nonsense' });
  check(bad.json?.settings?.teachMode === 'learn', '非法值被忽略', String(bad.json?.settings?.teachMode));

  const meta = await call('GET', '/meta');
  check(Array.isArray(meta.json?.teachModes) && meta.json.teachModes.length === 3, '/meta 暴露 3 种学习方式');
}

console.log('');
console.log('=== 5. 收尾：还原干净状态 ===');
{
  await call('POST', '/settings', { teachMode: 'learn', llmProvider: '', llmModel: '' });
  await call('POST', '/reset', { confirm: true });
  const s = await call('GET', '/state');
  check(s.json?.stats?.answered === 0, '统计归零');
  check(s.json?.settings?.teachMode === 'learn', '学习方式回到默认');
}

console.log('');
console.log('='.repeat(58));
console.log(`实机验证（学 + 模型）：${pass} 通过 / ${fail} 失败`);
if (fail) { for (const f of failures) console.log('  - ' + f); process.exitCode = 1; }
else console.log('全部通过 ✓');
