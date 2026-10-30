/**
 * 统一测试入口：node test/all.mjs
 *
 * 不用子进程（沙箱下 spawn 会被拒绝），而是**进程内**依次 import 每个套件。
 * 每个套件在自己的模块作用域里跑完，失败时通过 process.exitCode 反映。
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const SUITES = [
  ['conjugator', '变位引擎'],
  ['nouns', '名词引擎'],
  ['session', '出题 / SRS'],
  ['vocab', '认词题型'],
  ['cloze', '句子填空'],
  ['grammar', '语法专项'],
  ['scenario', '情景造句'],
  ['host', 'host 半身'],
  ['host-llm', '模型集成'],
  ['client', 'client 半身'],
];

// standalone-server 单独跑：它要起一个真实 HTTP 服务并 listen，
// 和这个入口的「进程内串联 + 拦截 process.exit」方式不兼容。
// 它验证的是「六类题型走完整 HTTP 路由」，守 resolveAnswer 漏分支那类 bug：
//   node test/standalone-server.mjs

// live 单独跑：它需要一个正在运行的 DSH，且会和其它套件的全局改动互相干扰，
// 所以不并进这个入口。
const WANT_LIVE = process.argv.includes('--live');

// 拦截每个套件的 process.exit，改记结果后继续跑下一个
const originalExit = process.exit.bind(process);
let current = null;
const results = [];

process.exit = (code = 0) => {
  if (current !== null) {
    current.code = code;
    throw new SuiteDone();
  }
  originalExit(code);
};

class SuiteDone extends Error {
  constructor() {
    super('suite done');
    this.name = 'SuiteDone';
  }
}

// 收集每个套件打印的汇总行
const originalLog = console.log.bind(console);
let captured = '';
console.log = (...args) => {
  const line = args.map(String).join(' ');
  captured += line + '\n';
  originalLog(...args);
};

for (const [file, label] of SUITES) {
  current = { label, file, code: 0 };
  captured = '';
  const started = Date.now();

  try {
    await import(`./${file}.test.mjs`);
  } catch (err) {
    if (!(err instanceof SuiteDone)) {
      originalLog(`✗ ${label}  ${file}: ${err?.message ?? err}`);
      current.code = 1;
    }
  }

  const ms = Date.now() - started;
  const m = captured.match(/(\d+)\s*通过\s*\/\s*(\d+)\s*失败/);
  results.push({
    label,
    file,
    pass: m ? Number(m[1]) : 0,
    fail: m ? Number(m[2]) : 0,
    code: current.code,
    ms,
  });
  current = null;
}

console.log = originalLog;
process.exit = originalExit;

const totalPass = results.reduce((s, r) => s + r.pass, 0);
const totalFail = results.reduce((s, r) => s + r.fail, 0);
const failed = results.filter((r) => r.code !== 0 || r.fail > 0);

console.log('');
console.log('═'.repeat(58));
for (const r of results) {
  const mark = r.code === 0 && r.fail === 0 ? '✓' : '✗';
  console.log(`  ${mark} ${r.label.padEnd(12)} ${String(`${r.pass} 通过 / ${r.fail} 失败`).padStart(18)}  ${String(r.ms).padStart(5)}ms`);
}
console.log('═'.repeat(58));
console.log(`总计：${totalPass} 通过 / ${totalFail} 失败（${results.length} 个套件）`);

if (failed.length > 0) {
  console.log(`失败套件：${failed.map((r) => r.label).join('、')}`);
  process.exitCode = 1;
} else {
  console.log('全部通过 ✓');
}

// ─────────────────── 实机验证 ───────────────────
//
// live 套件**不能**和其他套件跑在同一个进程里：
//   - host.test.mjs 会把 DSH_HOME 指向临时目录
//   - client.test.mjs 会覆盖全局 window/document/process.exit
//   - 两者都会污染紧接着跑的 live 测试
// 而本机沙箱不允许 spawn 子进程，所以这里只给出提示，不自动跑。
// 想跑实机验证请单独执行：node test/live.mjs

console.log('');
console.log('下一步（都在离线套件之外，需要单独跑）：');
console.log('  node test/standalone-server.mjs   # 六类题型走真实 HTTP（不用重启 DSH）');
console.log('  node test/live-all.mjs            # 实机：需要 DSH 在跑 + 加载最新代码');
