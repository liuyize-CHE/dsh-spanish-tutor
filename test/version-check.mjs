/**
 * 检查「代码版本」与「运行中的进程」是否一致。
 *
 * 背景：host 半身（lib/index.js）跑在 DSH 进程里，
 * 改了文件不重启就还是旧代码 —— 这个坑我已经踩过一次，
 * 现在做成一个可运行的检查，避免每次靠猜。
 *
 * 运行：node test/version-check.mjs [baseUrl]
 */

import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:57027').replace(/\/+$/, '');
const HERE = dirname(fileURLToPath(import.meta.url));
const INSTALLED = 'C:/Users/Lenovo/.dsh/profiles/desktop/node_modules/dsh-spanish-tutor/lib/index.js';

console.log('检查目标:', BASE);
console.log('');

// 1) 本地文件时间戳
let mtime = null;
try {
  mtime = statSync(INSTALLED).mtime;
  console.log('安装位代码修改时间:', mtime.toLocaleString('zh-CN'));
} catch {
  console.log('⚠ 找不到安装位文件:', INSTALLED);
}

// 2) 从运行中的进程读它认识的题型 + 加载指纹
let runningKinds = null;
let runningFingerprint = null;
try {
  const res = await fetch(BASE + '/dsh-spanish/meta');
  const json = await res.json();
  runningKinds = (json?.kinds ?? []).map((k) => k.id).sort();
  runningFingerprint = json?.fingerprint ?? null;
  console.log('运行中的进程认识这些题型:', runningKinds.join(', '));
  if (runningFingerprint !== null) {
    console.log('进程加载的代码指纹: mtimeMs=' + runningFingerprint.mtimeMs + ' size=' + runningFingerprint.size);
  } else {
    console.log('进程没有提供指纹（是旧版代码，还没加这个字段）');
  }
} catch (e) {
  console.log('✗ 连不上 DSH:', e.message);
  process.exit(1);
}

// 3) 从本地文件读它应该认识的题型
let fileKinds = null;
try {
  const src = readFileSync(INSTALLED, 'utf8');
  // 精确定位 meta 里的 kinds 数组（避免把 teachModes 之类的 { id, label } 也抓进来）
  const metaAt = src.indexOf("path === '/meta'");
  const seg = metaAt >= 0 ? src.slice(metaAt, metaAt + 2000) : src;
  const kindsAt = seg.indexOf('kinds: [');
  const kindsBlock = kindsAt >= 0 ? seg.slice(kindsAt, seg.indexOf(']', kindsAt)) : '';
  const ids = [...kindsBlock.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]);
  fileKinds = [...new Set(ids)].sort();
  console.log('文件里声明的题型:', fileKinds.join(', '));
} catch {
  console.log('⚠ 读不到本地文件');
}

console.log('');

// ─── 主判断：指纹比对 ───
// 这是可靠信号 —— 它连「只改了函数逻辑、题型没变」的更新也能看出来。
// 题型列表只是辅助（旧版代码没指纹时才用它兜底）。
let verdict = null; // 'same' | 'stale' | 'unknown'
const reasons = [];

if (runningFingerprint !== null) {
  try {
    const st = statSync(INSTALLED);
    const diskMtimeMs = Math.round(st.mtimeMs);
    const diskSize = st.size;

    console.log('磁盘文件当前:     mtimeMs=' + diskMtimeMs + ' size=' + diskSize);

    if (runningFingerprint.mtimeMs === diskMtimeMs && runningFingerprint.size === diskSize) {
      verdict = 'same';
    } else {
      verdict = 'stale';
      if (runningFingerprint.size !== diskSize) {
        reasons.push(`文件大小不同：进程=${runningFingerprint.size} 磁盘=${diskSize}`);
      } else {
        reasons.push('文件大小相同但 mtime 不同（只改了内容）');
      }
    }
  } catch (e) {
    console.log('⚠ 读不到磁盘文件，无法比对指纹:', e.message);
    verdict = 'unknown';
  }
} else {
  // 旧版代码：没有指纹字段，只能退回题型比对
  verdict = 'unknown';
}

// ─── 辅助判断：题型列表 ───
const kindsDiffer = fileKinds !== null && runningKinds !== null
  && (fileKinds.some((k) => !runningKinds.includes(k)) || runningKinds.some((k) => !fileKinds.includes(k)));

if (verdict === 'stale') {
  console.log('✗ 版本不一致 —— 进程加载的不是磁盘上这份代码');
  for (const r of reasons) console.log('  · ' + r);
  console.log('');
  console.log('  原因：host 半身跑在 DSH 进程里，改文件不会热重载。');
  console.log('  做法：完全退出 DSH 再打开（不是刷新页面）。');
  process.exitCode = 1;
} else if (verdict === 'same') {
  console.log('✓ 版本一致：进程加载的就是磁盘上这份代码');
  if (kindsDiffer) {
    console.log('  ⚠ 但题型列表有差异，这不该发生，请检查是否改了两个地方');
    process.exitCode = 1;
  }
} else {
  // 没有指纹（旧版）：退回题型比对
  if (kindsDiffer) {
    console.log('✗ 版本不一致 —— 需要重启 DSH');
    const missingInRunning = (fileKinds ?? []).filter((k) => !(runningKinds ?? []).includes(k));
    if (missingInRunning.length > 0) console.log('  进程缺少这些题型:', missingInRunning.join(', '));
    console.log('');
    console.log('  做法：完全退出 DSH 再打开（不是刷新页面）。');
    process.exitCode = 1;
  } else {
    console.log('⚠ 无法确认版本：进程是旧版代码（没有指纹），题型列表又恰好一致。');
    console.log('  这种情况下看不出逻辑有没有更新 —— 重启 DSH 就能拿到指纹。');
    console.log('  （这正是之前踩过的坑：只改判分逻辑、题型没变，粗检查会误报"一致"）');
    process.exitCode = 2;
  }
}
