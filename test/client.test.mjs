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

// 判分函数：用来验证「客户端归一出来的答案，交给判分能不能判对」。
// 这是端到端的一环 —— 只检查前端代码形状是不够的。
import { judge } from '../lib/engine/session.js';

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

// 注入了两个槽位。输入框右侧的胶囊和 shell.overlay 兜底都已删除 ——
// 聊天栏那颗胶囊会挤在权限/模型选择旁边，观感不好，用户要求去掉。
// 现在唯一的入口是侧栏那一行，打开由宿主自己做，插件不需要插手。
ok(injectedSlots.includes('main'), '注入 main（面板本体）');
ok(injectedSlots.includes('sidebar.panellist'), '注入 sidebar.panellist');
eq(injectedSlots.includes('conversation.input.right'), false, '不再注入 conversation.input.right（聊天栏胶囊已删）');
eq(injectedSlots.includes('shell.overlay'), false, '不再注入 shell.overlay（兜底浮层已随胶囊一起删）');
eq(slotsRegistered.length, 2, '注册了 2 个槽位组件');
eq(slotsRegistered.map((e) => e.options.name).sort(), ['main', 'sidebar.panellist'], '槽位恰好是 main + sidebar.panellist');

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

// 侧栏图标：只画旗标，文字和点击区域归宿主
const entryRender = renderDeep(listEntry.component, { size: 18, active: true });
eq(entryRender.node?.type, 'svg', '侧栏入口渲染成 svg 图标');
eq(entryRender.node?.props?.width, 18, '侧栏图标跟随宿主给的 size');
eq(findNode(entryRender.node, (n) => n.type === 'button'), null, '侧栏入口不含自己的按钮（整行由宿主渲染）');

// ── 聊天栏必须是干净的 ──
//
// 输入框右侧原本挂着一颗「🇪🇸 西语」胶囊，和权限、模型选择挤在一行，观感差。
// 这条守的是它不会再被加回来。
eq(findNode(entryRender.node, (n) => String(n.props?.title ?? '').includes('西语')), null,
  '侧栏图标自身不带 title（tooltip 由宿主的整行提供）');
eq(/dsh-es-capsule/.test(SOURCE), false, '样式表里不再有胶囊类');
eq(/dsh-es-badge/.test(SOURCE), false, '样式表里不再有角标类');
eq(SOURCE.includes('conversation.input.right'), false, '源码里不再引用聊天栏槽位');

// ─────────────────── 样式注入 ───────────────────

ok(effects.length >= 3, `注入了 ${effects.length} 个 effect（样式+两个槽位）`);

// 不再用国旗表情：Windows 没有国旗字形，会把区域指示符渲染成 "ES" 两个字母
ok(!SOURCE.includes('🇪🇸'), '不再使用 🇪🇸 表情');
ok(SOURCE.includes('FlagIcon'), '有 SVG 旗标组件');

// ── 选择题必须把键盘监听挂在容器上 ──
// （挂在 input 上的话选择题根本收不到 —— 选择题不渲染输入框）
ok(/onKeyDown: isChoice \? onChoiceKeyDown/.test(SOURCE), '选择题的 keydown 挂在卡片容器上');
ok(/tabIndex: isChoice \? 0 : -1/.test(SOURCE), '选择题容器可聚焦（否则收不到按键）');
ok(/boxRef\.current\.focus\(\)/.test(SOURCE), '选择题聚焦卡片容器而非输入框');
ok(/i < 9 \? `\$\{i \+ 1\}\. \$\{label\}`/.test(SOURCE), '选项显示序号，让快捷键可发现');

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

// 2) 选项格式必须两种都兼容 —— 而且要用**真调用**验证，不是看源码长什么样
//
// 之前这里是两条正则断言（/c\.value ?? c\.id/ 之类）。它们能通过，
// 但逻辑本身是错的：认词题的选项是 {id:'0', text:'repetir'}，按 value→id→text
// 的顺序回退会拿到序号 "0"，点「repetir」实际提交的是 "0"，判分永远错。
// 正则检查的是「代码长得对不对」，不是「点了之后对不对」——所以这个 bug 一路活着。
//
// 现在改成：取出引擎产出的**真实选项**喂给 normalizeChoice，再把结果交给 judge。
const { normalizeChoice, pickIndexFromKey } = exportsObj.__test ?? {};

ok(typeof normalizeChoice === 'function', '客户端导出 normalizeChoice（可被真调用）');
ok(typeof pickIndexFromKey === 'function', '客户端导出 pickIndexFromKey（可被真调用）');

if (typeof normalizeChoice === 'function') {
  // —— 认词题：{id, text}，答案必须是 text 而不是 id ——
  const vocabChoice = normalizeChoice({ id: '0', text: 'repetir' });
  eq(vocabChoice.value, 'repetir', '认词题 {id,text} 的答案取 text，不取序号 id');
  eq(vocabChoice.label, 'repetir', '认词题展示文案是 text');

  // 认词题正确答案必须能判对
  const vocabQ = { kind: 'vocab', answer: 'repetir', prompt: '重复' };
  eq(judge(vocabQ, vocabChoice.value).result, 'correct', '点认词题的正确选项 → 判对');
  // 干扰项仍然要判错（别为了修 bug 把判分放宽了）
  eq(judge(vocabQ, normalizeChoice({ id: '2', text: 'pagar' }).value).result, 'wrong',
    '点认词题的干扰项 → 仍判错');

  // —— 词义方向（es2zh）：选项是中文释义 ——
  const zhChoice = normalizeChoice({ id: '1', text: '重复' });
  eq(zhChoice.value, '重复', '中文释义选项同样取 text');
  eq(judge({ kind: 'vocab', answer: '重复' }, zhChoice.value).result, 'correct', '中文释义判分正常');

  // —— 语法题：同样是 {id, text} ——
  const grammarChoice = normalizeChoice({ id: '0', text: 'está' });
  eq(grammarChoice.value, 'está', '语法题 {id,text} 取 text');
  eq(judge({ kind: 'grammar', answer: 'está' }, grammarChoice.value).result, 'correct', '语法题判对');

  // —— 阴阳性题：{value, label}，value 本身就是答案 ——
  const genderChoice = normalizeChoice({ value: 'f', label: '阴性 · femenino' });
  eq(genderChoice.value, 'f', '阴阳性题 {value,label} 取 value');
  eq(genderChoice.label, '阴性 · femenino', '阴阳性题 label 原样保留（带说明）');
  eq(judge({ kind: 'gender', answer: 'f' }, genderChoice.value).result, 'correct', '阴阳性判分正常');

  // —— 边界：畸形数据不能把 id 当答案交出去 ——
  eq(normalizeChoice({ id: '3' }).value, '3', '只有 id 时兜底，但不参与真实题型');
  eq(normalizeChoice(null).value, '', 'null 选项不崩');

  // 关键回归：任何选项的归一结果都不能是纯序号，
  // 除非那个序号本来就是答案（阴阳性题的 value 是 m/f，不是数字）
  for (const raw of [{ id: '0', text: 'repetir' }, { id: '1', text: '重复' }, { value: 'm', label: '阳性' }]) {
    const got = normalizeChoice(raw).value;
    eq(/^\d+$/.test(got), false, `选项不会被归一成纯序号：${JSON.stringify(raw)} → ${JSON.stringify(got)}`);
  }
}

// ── 按键 → 第几个选项 ──
//
// 以前选择题没有输入框，而 keydown 挂在 input 上，于是做选择题时键盘全废。
// 现在挂到卡片容器上并按 1..9 / a..i 选选项。这里真调用解析函数。
if (typeof pickIndexFromKey === 'function') {
  // 数字键
  eq(pickIndexFromKey('1', 4), 0, '按 1 选第一个');
  eq(pickIndexFromKey('4', 4), 3, '按 4 选第四个');
  eq(pickIndexFromKey('5', 4), -1, '按 5 超出选项数 → 不处理');
  eq(pickIndexFromKey('0', 4), -1, '按 0 不是有效选项');

  // 字母键
  eq(pickIndexFromKey('a', 4), 0, '按 a 选第一个');
  eq(pickIndexFromKey('d', 4), 3, '按 d 选第四个');
  eq(pickIndexFromKey('A', 4), 0, '大写 A 同样有效');
  eq(pickIndexFromKey('e', 4), -1, '按 e 超出选项数 → 不处理');

  // 不该被吃掉的其他键
  eq(pickIndexFromKey('Enter', 4), -1, 'Enter 不当作选项');
  eq(pickIndexFromKey('Tab', 4), -1, 'Tab 不当作选项');
  eq(pickIndexFromKey(' ', 4), -1, '空格不当作选项');
  eq(pickIndexFromKey('ñ', 4), -1, '非 ASCII 字母不当作选项');

  // 边界
  eq(pickIndexFromKey('1', 0), -1, '选项数为 0 时不处理');
  eq(pickIndexFromKey(null, 4), -1, 'key 为 null 不崩');
  eq(pickIndexFromKey('1', Number.NaN), -1, '选项数 NaN 不处理');

  // 端到端联动：按键 → 索引 → 取选项 → 归一 → 判分必须对
  const keysQ = {
    kind: 'vocab',
    answer: 'repetir',
    choices: [
      { id: '0', text: 'repetir' },
      { id: '1', text: 'pagar' },
      { id: '2', text: 'vivir' },
      { id: '3', text: 'llamar' },
    ],
  };
  const pickedByKey = normalizeChoice(keysQ.choices[pickIndexFromKey('1', keysQ.choices.length)]);
  eq(pickedByKey.value, 'repetir', '按 1 取到的是第一个选项的 text');
  eq(judge(keysQ, pickedByKey.value).result, 'correct', '按键选出的答案能判对');
}

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
