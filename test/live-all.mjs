/**
 * 实机验证总入口：一条命令跑完所有端到端检查。
 *
 * 用法：node test/live-all.mjs [baseUrl]
 *
 * 为什么要汇总：改了 host 代码必须重启 DSH 才生效，
 * 而验证要跑好几个脚本（版本、练习、学、新题型）。
 * 这里按「版本一致性 → 各功能」的顺序跑，第一步就告诉你要不要重启。
 *
 * 注意：这些套件都是纯 HTTP 调用，不碰全局状态，可以在同一进程里串联。
 * （离线套件不能这样跑，见 test/all.mjs 里的说明。）
 */

const BASE = (process.argv[2] ?? 'http://127.0.0.1:65205').replace(/\/+$/, '');

const SUITES = [
  ['version-check', '版本一致性'],
  ['live', '练习 + 判分'],
  ['live-learn', '学 + 模型'],
  ['live-kinds', '六类题型 + 情景造句'],
];

let totalPass = 0;
let totalFail = 0;
const results = [];

console.log('═'.repeat(60));
console.log('实机验证总入口');
console.log('目标:', BASE);
console.log('═'.repeat(60));
console.log('');

// 先把 BASE 传给子脚本：它们都支持 argv[2]
process.argv[2] = BASE;

for (const [file, label] of SUITES) {
  console.log('─'.repeat(60));
  console.log(`▶ ${label}（${file}）`);
  console.log('─'.repeat(60));

  const before = { pass: totalPass, fail: totalFail };

  try {
    // 每个子脚本自己会 print 汇总行，并可能设置 process.exitCode
    await import(`./${file}.mjs`);
  } catch (err) {
    console.log(`✗ ${label} 跑失败了：${err?.message ?? err}`);
    totalFail += 1;
  }

  const exitCode = process.exitCode ?? 0;
  results.push({ file, label, exitCode });
  // 复位，避免一个套件的失败码影响整体判断
  process.exitCode = 0;

  console.log('');
}

// ─────────────────── 汇总 ───────────────────

console.log('═'.repeat(60));
console.log('汇总');
console.log('═'.repeat(60));

const NAME = {
  'version-check': '版本一致性',
  live: '练习 + 判分',
  'live-learn': '学 + 模型',
  'live-kinds': '六类题型 + 情景造句',
};

let bad = 0;
for (const r of results) {
  // version-check 用 0=一致 / 1=不一致 / 2=无法确认
  let mark;
  let note = '';
  if (r.file === 'version-check') {
    if (r.exitCode === 0) { mark = '✓'; note = '进程已加载最新代码'; }
    else if (r.exitCode === 2) { mark = '?'; note = '无法确认（旧版进程，无指纹）'; }
    else { mark = '✗'; note = '需要重启 DSH'; bad++; }
  } else {
    mark = r.exitCode === 0 ? '✓' : '✗';
    if (r.exitCode !== 0) bad++;
  }
  console.log(`  ${mark} ${NAME[r.file].padEnd(22)} ${note}`);
}

console.log('');
if (bad === 0) {
  console.log('全部通过 ✓');
} else {
  const versionResult = results.find((r) => r.file === 'version-check');
  const stale = versionResult !== undefined && versionResult.exitCode !== 0;

  // 如果版本对不上，那后面的失败**几乎肯定**是同一个原因：
  // 进程跑的还是旧代码，新功能/修复都没加载。
  // 直接说清楚，别让人去猜那些功能是不是坏了。
  if (stale) {
    console.log(`版本不一致 —— 下面这些失败都是同一个原因：进程加载的不是最新代码。`);
    console.log('');
    console.log('  1. 完全退出 DSH（包括托盘图标，不是刷新页面）');
    console.log('  2. 重新打开');
    console.log('  3. 再跑一次：node test/live-all.mjs');
    console.log('');
    console.log('重启后应该全部通过。如果还有失败，那才是真的代码问题。');
  } else {
    console.log(`有 ${bad} 项没通过，且版本是一致的 —— 这是真的代码问题，需要排查。`);
  }
  process.exitCode = 1;
}
