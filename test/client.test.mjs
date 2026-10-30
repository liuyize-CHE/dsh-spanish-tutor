/**
 * client 半身自检：用假的 __ModuleLoader__ + 假 React 把 factory 真跑一遍。
 * 运行：node test/client.test.mjs
 *
 * 这个测试守的是「插件能不能被宿主激活」——
 * 格式写错（比如当成 ESM）、exports 少一个 apply、注入的槽位名打错，
 * 都会在真实宿主里变成「装上了但界面上什么都没有」，单看代码是看不出来的。
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT_PATH = join(HERE, '..', 'lib', 'client.js');
const SOURCE = readFileSync(CLIENT_PATH, 'utf8');

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

// ─────────────────── 假 React ───────────────────
//
// 只要够把组件「建出来」并让 hooks 不炸即可。
// createElement 保留类型与 props，方便断言。

function makeFakeReact() {
  let hookIndex = 0;
  const states = [];
  const effects = [];

  return {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: children.flat() };
    },
    Fragment: Symbol('Fragment'),
    useState(initial) {
      const i = hookIndex++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      const set = (next) => {
        states[i] = typeof next === 'function' ? next(states[i]) : next;
      };
      return [states[i], set];
    },
    useEffect(fn) {
      effects.push(fn);
    },
    useRef(initial) {
      const i = hookIndex++;
      if (!(i in states)) states[i] = { current: initial };
      return states[i];
    },
    useCallback(fn) {
      return fn;
    },
    useMemo(fn) {
      return fn();
    },
    __reset() {
      hookIndex = 0;
      states.length = 0;
      effects.length = 0;
    },
    __states: states,
    __effects: effects,
  };
}

// ─────────────────── 假模块加载器 ───────────────────

const registered = [];

globalThis.window = {
  __ModuleLoader__: {
    load(reg) {
      registered.push(reg);
    },
  },
  confirm: () => true,
  dispatchEvent: () => true,
};
globalThis.document = {
  documentElement: { lang: 'zh-CN' },
  head: { appendChild() {}, removeChild() {} },
  createElement: () => ({ setAttribute() {}, appendChild() {}, removeChild() {}, parentNode: null }),
};
// Node 24 里 navigator 是只读的 accessor，必须用 defineProperty 覆盖
Object.defineProperty(globalThis, 'navigator', {
  value: { languages: ['zh-CN'], language: 'zh-CN' },
  configurable: true,
  writable: true,
});
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, questions: [], progress: { due: 0 } }),
});
globalThis.CustomEvent = class {
  constructor(type) {
    this.type = type;
  }
};
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};

const React = makeFakeReact();
const requireFn = (id) => {
  if (id === 'react') return React;
  throw new Error(`不该 require：${id}`);
};

// ─────────────────── 执行 client.js ───────────────────

let threw = null;
try {
  // client.js 是普通脚本（非 ESM），用 Function 包一层执行
  const fn = new Function(SOURCE);
  fn();
} catch (err) {
  threw = err;
}
eq(threw, null, 'client.js 执行不抛错');
if (threw !== null) {
  failures.push(`执行异常：${threw?.stack ?? threw}`);
}

// ─────────────────── 注册格式 ───────────────────

eq(registered.length, 1, '向 __ModuleLoader__ 注册了 1 个模块');
const reg = registered[0];

eq(reg?.id, 'dsh-spanish-tutor', '模块 id 正确');
ok(typeof reg?.factory === 'function', 'factory 是函数');

// factory 必须返回带 apply 的对象（loader 会校验这个）
let exportsObj = null;
threw = null;
try {
  exportsObj = reg.factory(requireFn);
} catch (err) {
  threw = err;
}
eq(threw, null, 'factory 执行不抛错');
ok(exportsObj !== null && typeof exportsObj === 'object', 'factory 返回对象');
ok(typeof exportsObj?.apply === 'function', '导出 apply 函数');
ok(Array.isArray(exportsObj?.inject), '导出 inject 数组');
eq(exportsObj.inject, ['slots'], 'inject 声明 slots');

// ─────────────────── apply 行为 ───────────────────

/** 用假 ctx 跑一遍 apply，返回它注册了什么。 */
function makeCtx(layout) {
  const slotsRegistered = [];
  const injectedSlots = [];
  const effects = [];

  const fakeSlots = {
    inject(name, factory) {
      injectedSlots.push(name);
      return factory();
    },
    register(options, component) {
      slotsRegistered.push({ options, component });
      return () => {};
    },
  };

  const ctx = {
    get(name) {
      if (name === 'slots') return fakeSlots;
      if (name === 'layout') return layout;
      return undefined;
    },
    effect(fn) {
      effects.push(fn);
      try {
        fn();
      } catch (err) {
        fail++;
        failures.push(`effect 抛错：${err?.message ?? err}`);
      }
    },
  };

  return { ctx, slotsRegistered, injectedSlots, effects };
}

/** 按 name 找注册项。 */
const bySlot = (list, name) => list.find((e) => e.options?.name === name);

// 宿主布局服务：selectPanel 记录调用，未注册的 id 抛错（照抄宿主的真实行为）
const layoutCalls = [];
const fakeLayout = {
  selectPanel(id) {
    layoutCalls.push(id);
    if (id !== null && id !== 'dsh-spanish') {
      throw new Error(`layout.selectPanel: main panel "${id}" is not registered`);
    }
  },
};

const run = makeCtx(fakeLayout);
const { slotsRegistered, injectedSlots, effects } = run;

threw = null;
try {
  exportsObj.apply(run.ctx);
} catch (err) {
  threw = err;
}
eq(threw, null, 'apply 执行不抛错');

// 注入了四个槽位
ok(injectedSlots.includes('main'), '注入 main（面板本体）');
ok(injectedSlots.includes('conversation.input.right'), '注入 conversation.input.right');
ok(injectedSlots.includes('sidebar.panellist'), '注入 sidebar.panellist');
ok(injectedSlots.includes('shell.overlay'), '注入 shell.overlay（兜底）');
eq(slotsRegistered.length, 4, '注册了 4 个槽位组件');

// 每个注册项结构正确：list/single 用 id，keyed 的 main 用 key
for (const entry of slotsRegistered) {
  const problems = [];
  const isKeyed = entry.options?.name === 'main';
  if (typeof entry.options?.name !== 'string') problems.push('name');
  if (isKeyed) {
    if (typeof entry.options?.key !== 'string' || entry.options.key === '') problems.push('key');
  } else if (typeof entry.options?.id !== 'string') {
    problems.push('id');
  }
  if (typeof entry.component !== 'function') problems.push('component');
  if (problems.length) {
    fail++;
    failures.push(`槽位注册缺字段：${problems.join(',')} in ${JSON.stringify(entry.options)}`);
  } else {
    pass++;
  }
}

// 槽位名必须与注册时的 name 一致（写错就会挂不到宿主上）
for (const entry of slotsRegistered) {
  if (entry.options.name !== undefined && injectedSlots.includes(entry.options.name)) {
    pass++;
  } else {
    fail++;
    failures.push(`注册的 name 与注入的槽位不匹配：${entry.options.name}`);
  }
}

// id 不能重复
const ids = slotsRegistered.filter((e) => e.options.id !== undefined).map((e) => e.options.id);
eq(new Set(ids).size, ids.length, '槽位 id 不重复');

// ── 这一条是这次「点小框才有反应」的根因 ──
//
// 宿主把 sidebar.panellist 的注册渲染成**一整行按钮**：图标 + label 文字，
// 点行 → layout.selectPanel(id) → 在中间栏渲染 main 里 key === id 的组件。
// 没有同名 main 就抛错并保留原选中态，于是只有我们自己画的小框能点。
const mainEntry = bySlot(slotsRegistered, 'main');
const listEntry = bySlot(slotsRegistered, 'sidebar.panellist');
ok(mainEntry !== undefined, '注册了 main keyed 面板');
ok(listEntry !== undefined, '注册了 sidebar.panellist 入口');
eq(listEntry?.options?.id, mainEntry?.options?.key, '侧栏入口 id 必须等于 main 的 key');
ok(typeof listEntry?.options?.label === 'function', '侧栏 label 是函数（跟随界面语言）');
eq(typeof listEntry?.options?.label, 'function', 'label 可调用');
ok(String(listEntry?.options?.label?.())?.length > 0, 'label 返回非空文字');

// ─────────────────── 组件能实例化 ───────────────────
//
// 这一步守的是「注册成功了但屏幕上是空的」：
// 组件函数本身有 bug（读不存在的字段、hook 顺序错）只有真调用才暴露。
//
// 注意：注册进槽位的往往是**包装函数**（`() => h(Capsule, props)`），
// 所以要递归渲染到真正的宿主元素为止，不能只看第一层。

/**
 * 递归渲染：函数组件一路调用下去，直到拿到宿主元素（string type）或 null。
 * @returns {{node:any, depth:number}}
 */
function renderDeep(component, props, maxDepth = 6) {
  let node = component(props);
  let depth = 0;
  while (node !== null && node !== undefined && typeof node === 'object' && typeof node.type === 'function') {
    if (++depth > maxDepth) throw new Error(`渲染层级超过 ${maxDepth}，可能有无限递归`);
    node = node.type(node.props);
  }
  return { node, depth };
}

for (const entry of slotsRegistered) {
  const label = entry.options.id ?? entry.options.key;
  React.__reset();
  threw = null;
  let node = null;
  try {
    node = entry.component();
  } catch (err) {
    threw = err;
  }
  eq(threw, null, `组件 ${label} 能实例化`);
  ok(node !== null && node !== undefined, `组件 ${label} 返回了节点`);
}

/** 深度优先找一个满足条件的节点。 */
function findNode(node, pred) {
  if (node === null || node === undefined || typeof node !== 'object') return null;
  if (node.type !== undefined && pred(node)) return node;
  for (const child of node.children ?? []) {
    const hit = findNode(child, pred);
    if (hit !== null) return hit;
  }
  return null;
}

// 主面板：中间栏那一页。没给 closePanel 时不该有返回按钮
React.__reset();
const mainRender = renderDeep(mainEntry.component, {});
eq(mainRender.node?.type, 'div', '主面板渲染成 div');
ok(String(mainRender.node?.props?.className ?? '').includes('dsh-es-panel'), '主面板带样式类');
eq(findNode(mainRender.node, (n) => n.props?.className?.includes?.('dsh-es-close')), null,
  '没传 closePanel 时不显示返回按钮');

// 主面板：给了 closePanel 就要有返回按钮；inject 里的 closePanel 要能回到会话
React.__reset();
const mainCloseRender = renderDeep(mainEntry.component, { closePanel: () => {} });
const closeBtn = findNode(
  mainCloseRender.node,
  (n) => n.type === 'button' && String(n.props?.className ?? '').includes('dsh-es-close'),
);
ok(closeBtn !== null, '给了 closePanel 就显示返回按钮');

const mainInject = mainEntry.options.inject?.();
eq(typeof mainInject?.closePanel, 'function', 'main 的 inject 提供 closePanel');
layoutCalls.length = 0;
mainInject.closePanel();
eq(layoutCalls, [null], 'closePanel 让宿主回到会话界面');

// 胶囊组件：递归渲染后应该是一个 button
const capsuleEntry = slotsRegistered.find((e) => e.options.id === 'dsh-spanish-capsule');
React.__reset();
const capsuleRender = renderDeep(capsuleEntry.component, {});
eq(capsuleRender.node?.type, 'button', '胶囊最终渲染成 button');
ok(String(capsuleRender.node?.props?.className ?? '').includes('dsh-es-capsule'), '胶囊带样式类');
ok(capsuleRender.depth >= 1, '胶囊经过包装层（递归渲染生效）');

// 胶囊里应该是 SVG 旗标，不是国旗表情（Windows 会渲染成 "ES" 字母）
const capChildren = capsuleRender.node?.children ?? [];
const flagEl = capChildren.find((c) => typeof c?.type === 'function' && c.type.name === 'FlagIcon');
ok(flagEl !== undefined, '胶囊图标是 FlagIcon 组件');
eq(flagEl?.props?.size, 14, '胶囊旗标尺寸 14');

// 点胶囊 → 交给宿主布局服务选中面板
layoutCalls.length = 0;
capsuleRender.node.props.onClick();
eq(layoutCalls, ['dsh-spanish'], '胶囊点击选中西语面板');

// 侧栏图标：只画旗标，文字和点击区域归宿主
const entryRender = renderDeep(listEntry.component, { size: 18, active: true });
eq(entryRender.node?.type, 'svg', '侧栏入口渲染成 svg 图标');
eq(entryRender.node?.props?.width, 18, '侧栏图标跟随宿主给的 size');
eq(findNode(entryRender.node, (n) => n.type === 'button'), null, '侧栏入口不含自己的按钮（整行由宿主渲染）');

// 浮层兜底初始不可见（渲染 null）
const panelEntry = slotsRegistered.find((e) => e.options.id === 'dsh-spanish-fallback');
React.__reset();
const panelRender = renderDeep(panelEntry.component, {});
eq(panelRender.node, null, '浮层兜底初始不显示');

// ── 没有 layout 服务时，胶囊要退回浮层，不能点了没反应 ──
const noLayoutRun = makeCtx(undefined);
threw = null;
try {
  exportsObj.apply(noLayoutRun.ctx);
} catch (err) {
  threw = err;
}
eq(threw, null, '没有 layout 服务时 apply 也不抛错');

const noLayoutOverlay = bySlot(noLayoutRun.slotsRegistered, 'shell.overlay');
const noLayoutCapsule = bySlot(noLayoutRun.slotsRegistered, 'conversation.input.right');
React.__reset();
const overlayBefore = renderDeep(noLayoutOverlay.component, {});
eq(overlayBefore.node, null, '浮层开始是隐藏的');
React.__reset();
renderDeep(noLayoutCapsule.component, {}).node.props.onClick();
React.__reset();
const overlayAfter = renderDeep(noLayoutOverlay.component, {});
ok(overlayAfter.node !== null, '没有 layout 服务时点击胶囊会打开浮层');

// ─────────────────── 样式注入 ───────────────────

ok(effects.length >= 5, `注入了 ${effects.length} 个 effect（样式+槽位）`);

// 不再用国旗表情：Windows 没有国旗字形，会把区域指示符渲染成 "ES" 两个字母
ok(!SOURCE.includes('🇪🇸'), '不再使用 🇪🇸 表情');
ok(SOURCE.includes('FlagIcon'), '有 SVG 旗标组件');

// ─────────────────── 源码层面检查 ───────────────────

// 必须是 __ModuleLoader__ 格式，不能是 ESM
ok(SOURCE.includes('__ModuleLoader__.load'), '使用 __ModuleLoader__.load');
ok(!/^\s*export\s+/m.test(SOURCE), '不含 ESM export 语句（宿主不认）');
ok(!/^\s*import\s+/m.test(SOURCE), '不含 ESM import 语句（宿主不认）');

// 只能 require('react')
const requires = [...SOURCE.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
const nonReact = requires.filter((r) => r !== 'react');
eq(nonReact, [], '只 require react（其它依赖宿主不提供）');

// API 前缀正确
ok(SOURCE.includes("'/dsh-spanish'"), 'API 前缀与 host 一致');

// ─────────────────── 新题型的接线上有没有漏 ───────────────────
//
// client 是打包产物，内部组件没导出，没法直接渲染测试。
// 但「UI 有没有真的接上 host 的接口」是可以静态检查的 ——
// 漏接一条，功能就是死的（用户点了没反应），这种错误很容易在改界面时发生。

// 1) 每个 host 接口都要被 UI 调用到
const ENDPOINTS = [
  ['/session', '出题'],
  ['/answer', '判分'],
  ['/teach', '先学'],
  ['/reveal', '看答案'],
  ['/state', '进度'],
  ['/settings', '设置'],
  ['/models', '模型列表'],
  ['/scenario', '情景造句出题'],
  ['/scenario/grade', '情景造句批改'],
  ['/meta', '元信息'],
];
for (const [ep, label] of ENDPOINTS) {
  ok(SOURCE.includes(`'${ep}'`) || SOURCE.includes(`"${ep}"`), `客户端调用了 ${ep}（${label}）`);
}

// 2) 选项格式必须两种都兼容
//    host 那边阴阳性题给 {value,label}，认词/语法题给 {id,text}。
//    只读一种的话另一类题会整片空白 —— 这个 bug 真发生过。
ok(/c\.value\s*\?\?\s*c\.id/.test(SOURCE) || /c\.id\s*\?\?\s*c\.value/.test(SOURCE),
  '选项渲染兼容 {value} 与 {id} 两种格式');
ok(/c\.label\s*\?\?\s*c\.text/.test(SOURCE) || /c\.text\s*\?\?\s*c\.label/.test(SOURCE),
  '选项文案兼容 {label} 与 {text} 两种格式');

// 3) 新题型必须在渲染层有专门分支（题干/标签/规则）
ok(SOURCE.includes('promptOf'), '有统一的题干取值函数');
ok(/q\.kind === 'vocab'/.test(SOURCE), '渲染层认识 vocab 题型');
ok(/q\.kind === 'cloze'/.test(SOURCE) || /q\.kind === 'grammar'/.test(SOURCE), '渲染层认识填空/语法题型');
// 语法题必须展示「本地规则」—— 答错时零延迟可读，不依赖模型可用
ok(/question\??\.rule/.test(SOURCE), '语法题会展示本地规则（不依赖模型）');

// 4) 情景造句页要存在且被挂进标签页
ok(SOURCE.includes('ScenarioTab'), '有情景造句组件');
ok(/tab === 'write'/.test(SOURCE), '情景造句挂在标签页上');

// 5) 本地规则标签要能显示（答错时零延迟可读）
ok(SOURCE.includes('ruleLabel'), '有「规则」标签文案');

// ─────────────────── 报告 ───────────────────

console.log(`\nclient 自检：${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('全部通过 ✓');
