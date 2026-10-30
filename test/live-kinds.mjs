// 实机验证四类新题型（对运行中的 DSH）。
const BASE = (process.argv[2] ?? 'http://127.0.0.1:57027').replace(/\/+$/, '');
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

console.log('=== 1. 新题型出现在 meta ===');
{
  const m = await call('GET', '/meta');
  const ids = (m.json?.kinds ?? []).map((k) => k.id);
  for (const k of ['vocab', 'cloze', 'grammar']) {
    check(ids.includes(k), `meta 含 ${k}`, ids.join(','));
  }
}

console.log('');
console.log('=== 2. 认词题 ===');
{
  const r = await call('POST', '/session', { size: 8, kinds: ['vocab'], level: 'A1' });
  const qs = r.json?.questions ?? [];
  check(qs.length === 8, `出 8 道认词题（实际 ${qs.length}）`);
  check(qs.every((q) => q.kind === 'vocab'), '全是 vocab');
  check(qs.every((q) => Array.isArray(q.choices) && q.choices.length >= 3), '每题至少 3 个选项');
  check(qs.every((q) => !('answer' in q)), '不下发答案');
  if (qs[0]) {
    console.log('     例题：' + qs[0].prompt + ' → ' + qs[0].choices.map((c) => c.text).join(' / '));
  }
}

console.log('');
console.log('=== 3. 句子填空题 ===');
{
  const r = await call('POST', '/session', { size: 8, kinds: ['cloze'], level: 'A1' });
  const qs = r.json?.questions ?? [];
  check(qs.length === 8, `出 8 道填空题（实际 ${qs.length}）`);
  check(qs.every((q) => q.kind === 'cloze'), '全是 cloze');
  check(qs.every((q) => String(q.prompt ?? '').includes('___')), '每题都有 ___');
  check(qs.every((q) => !('answer' in q)), '不下发答案');
  if (qs[0]) console.log('     例题：' + qs[0].prompt + '  (' + qs[0].zh + ')');
}

console.log('');
console.log('=== 4. 语法专项题 ===');
{
  const r = await call('POST', '/session', { size: 8, kinds: ['grammar'] });
  const qs = r.json?.questions ?? [];
  check(qs.length === 8, `出 8 道语法题（实际 ${qs.length}）`);
  check(qs.every((q) => q.kind === 'grammar'), '全是 grammar');
  check(qs.every((q) => Array.isArray(q.choices) && q.choices.length >= 2), '每题有选项');
  check(qs.every((q) => typeof q.rule === 'string' && q.rule), '每题带规则说明');
  if (qs[0]) console.log('     例题：' + qs[0].prompt + '  规则：' + qs[0].rule);
}

console.log('');
console.log('=== 5. 判分（新题型）===');
{
  // 认词：用 table 反查不到，直接取选项里的正确答案需要靠提交试探
  const vocab = await call('POST', '/session', { size: 1, kinds: ['vocab'], level: 'A1', seed: 42 });
  const vq = vocab.json?.questions?.[0];
  if (vq) {
    // 逐个选项提交，必然有一个判对
    let foundCorrect = false;
    for (const c of vq.choices) {
      const a = await call('POST', '/answer', { question: vq, given: c.text });
      if (a.json?.result === 'correct') { foundCorrect = true; break; }
    }
    check(foundCorrect, '认词题至少有一个选项被判对');
  }

  // 语法：同理
  const gram = await call('POST', '/session', { size: 1, kinds: ['grammar'], seed: 43 });
  const gq = gram.json?.questions?.[0];
  if (gq) {
    let foundCorrect = false;
    for (const c of gq.choices) {
      const a = await call('POST', '/answer', { question: gq, given: c.text });
      if (a.json?.result === 'correct') { foundCorrect = true; break; }
    }
    check(foundCorrect, '语法题至少有一个选项被判对');
  }
}

console.log('');
console.log('=== 6. 情景造句 ===');
{
  const sc = await call('GET', '/scenarios');
  check(sc.status === 200 && (sc.json?.scenarios ?? []).length >= 5, `场景数 ${sc.json?.scenarios?.length}`);

  const made = await call('POST', '/scenario', { scenarioId: 'restaurant' });
  if (made.json?.degraded) {
    console.log('     ⚠ 模型降级：' + (made.json?.notice ?? ''));
    check(typeof made.json.notice === 'string', '降级时有说明');
  } else {
    check(made.json?.task?.task !== undefined, '生成了题目');
    check(typeof made.json?.refToken === 'string', '给了 refToken');
    check(!JSON.stringify(made.json).includes('"reference"'), '参考答案未下发');
    console.log('     场景：' + made.json?.scenario?.zh);
    console.log('     题目：' + made.json?.task?.task);
    console.log('     提示：' + (made.json?.task?.hints ?? []).join(' / '));

    // 批改
    const g = await call('POST', '/scenario/grade', {
      scenarioId: 'restaurant',
      refToken: made.json.refToken,
      answer: 'Quiero una paella, por favor.',
    });
    if (g.json?.degraded) {
      console.log('     ⚠ 批改降级：' + (g.json?.notice ?? ''));
      check(typeof g.json.notice === 'string', '批改降级有说明');
    } else {
      check(['correct', 'partial', 'wrong'].includes(g.json?.verdict), '批改给了有效判定', String(g.json?.verdict));
      check(typeof g.json?.feedback === 'string', '有中文点评');
      console.log('     判定：' + g.json?.verdict + ' — ' + g.json?.feedback);
    }
  }

  // token 安全
  const bad = await call('POST', '/scenario/grade', {
    scenarioId: 'restaurant', refToken: 'forged', answer: 'algo',
  });
  check(bad.status === 400, '伪造 token 被拒', String(bad.status));
}

console.log('');
console.log('=== 7. 收尾 ===');
{
  await call('POST', '/reset', { confirm: true });
  const s = await call('GET', '/state');
  check(s.json?.stats?.answered === 0, '统计归零');
}

console.log('');
console.log('='.repeat(58));
console.log(`新题型实机验证：${pass} 通过 / ${fail} 失败`);
if (fail) { for (const f of failures) console.log('  - ' + f); process.exitCode = 1; }
else console.log('全部通过 ✓');
