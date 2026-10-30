/**
 * dsh-spanish-tutor —— host 半身。
 *
 * 职责：
 * 1. 提供 HTTP 路由给浏览器半身（出题、判分、读写进度、查变位表、模型讲解）；
 * 2. 把学习进度落盘到 DSH home；
 * 3. 注册模型工具，让对话里的 agent 也能出题/查变位；
 * 4. 走 ctx.get('llm') 调模型做「为什么错」的讲解（可选，失败不影响主流程）。
 *
 * 纯规则部分全部在 lib/engine/ 下，和 DSH 无关，可独立测试。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, renameSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  conjugate,
  fullTable,
  participle,
  gerund,
  gradeAnswer,
  PERSONS,
  PERSON_LABELS,
  TENSES,
  TENSE_LABELS,
} from './engine/conjugator.js';
import { nounInfo, pluralOf, guessGender, adjectiveAgreement } from './engine/nouns.js';
import { buildSession, judge, updateCard, masteryOf, isDue, INTERVALS_DAYS } from './engine/session.js';
import { BANK, bankAtLevel, VERBS, NOUNS, ADJECTIVES } from './engine/bank.js';
import { CLOZE_BANK } from './engine/cloze.js';
import { GRAMMAR_BANK } from './engine/grammar.js';

export const name = 'dsh-spanish-tutor';

/** 只需要模型工具时也能跑；webServer 缺失时浏览器界面不可用但工具仍可用。 */
export const inject = ['webServer', 'tools'];

/** 路由前缀。 */
const ROUTE_PREFIX = '/dsh-spanish';

// ─────────────────────────── 加载指纹 ───────────────────────────
//
// 为什么需要它：host 半身跑在 DSH 进程里，改了文件不重启就还是旧代码，
// 而「题型列表」这种粗粒度信号看不出**逻辑**有没有更新
// （比如只改了判分函数，题型没变，进程会假装是新的）。
//
// 做法：模块加载时读自己的 mtime，通过 /meta 暴露出去。
// 外部脚本拿它和磁盘上文件的当前 mtime 比对 —— 一致就说明进程加载的就是这份代码。
//
// 用 mtimeMs（毫秒浮点）而不是秒：同一秒内改两次文件也能区分。

let selfStat = null;
try {
  const selfPath = fileURLToPath(import.meta.url);
  const st = statSync(selfPath);
  selfStat = { path: selfPath, mtimeMs: st.mtimeMs, size: st.size };
} catch {
  // 读不到自己也不影响插件运行（比如被打包进 asar 的只读环境）
  selfStat = null;
}

/** 这份代码被加载时的指纹。 */
const LOAD_FINGERPRINT = selfStat === null
  ? null
  : {
    mtimeMs: Math.round(selfStat.mtimeMs),
    size: selfStat.size,
  };

// ─────────────────────────── 进度存储 ───────────────────────────

/**
 * 数据落在 DSH home 下，和插件目录分离（更新插件不丢进度）。
 * 目录：~/.dsh/spanish-tutor/progress.json
 */
function dataDir() {
  const base = (typeof process !== 'undefined' && process.env && process.env.DSH_HOME)
    || join(homedir(), '.dsh');
  return join(base, 'spanish-tutor');
}

function progressFile() {
  return join(dataDir(), 'progress.json');
}

const EMPTY_STATE = { version: 1, memory: {}, stats: { answered: 0, correct: 0, sessions: 0 }, settings: {} };

function loadState() {
  const file = progressFile();
  if (!existsSync(file)) return { ...EMPTY_STATE, memory: {}, stats: { answered: 0, correct: 0, sessions: 0 } };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed === null || typeof parsed !== 'object') return structuredClone(EMPTY_STATE);
    return {
      version: 1,
      memory: parsed.memory && typeof parsed.memory === 'object' ? parsed.memory : {},
      stats: {
        answered: Number(parsed.stats?.answered) || 0,
        correct: Number(parsed.stats?.correct) || 0,
        sessions: Number(parsed.stats?.sessions) || 0,
      },
      settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {},
    };
  } catch {
    // 文件坏了不阻塞使用：当作空档，但**不删**原文件（用户可能想抢救）
    return structuredClone(EMPTY_STATE);
  }
}

function saveState(state) {
  const file = progressFile();
  mkdirSync(dirname(file), { recursive: true });
  // 原子写：先写临时文件再改名，避免写一半断电留下坏 JSON
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  renameSync(tmp, file);
}

// ─────────────────────────── 设置 ───────────────────────────

const DEFAULT_SETTINGS = {
  level: 'A1', // A1 / A2 / B1 / B2 / C1
  tenses: ['presente'], // 练习哪些时态
  // 默认开四种基础题型（都需要拼写/判断，覆盖「认词 + 变形」两条主线）。
  // 语法专项和情景造句默认关 —— 前者要 B1 才合适，后者依赖模型。
  kinds: ['conjugation', 'gender', 'plural', 'vocab'],
  size: 10, // 每局题数
  llmExplain: true, // 答错时是否用模型讲解
  // 模型选择：留空 = 跟随 DSH 当前模型；
  // 填了就用指定的（可以用便宜的小模型专跑讲解，不动主对话的模型）
  llmProvider: '',
  llmModel: '',
  // 「学」的力度：
  //   'learn'  —— 出题前先讲知识点（默认，先学后练）
  //   'reveal' —— 只给最短答案
  //   'off'    —— 不调模型，纯练习
  teachMode: 'learn',
};

function mergeSettings(state) {
  const s = state.settings ?? {};
  const teachMode = ['learn', 'reveal', 'off'].includes(s.teachMode) ? s.teachMode : DEFAULT_SETTINGS.teachMode;
  return {
    level: typeof s.level === 'string' ? s.level : DEFAULT_SETTINGS.level,
    tenses: Array.isArray(s.tenses) && s.tenses.length ? s.tenses.filter((t) => TENSES.includes(t)) : DEFAULT_SETTINGS.tenses,
    kinds: Array.isArray(s.kinds) && s.kinds.length ? s.kinds : DEFAULT_SETTINGS.kinds,
    size: Number.isFinite(s.size) ? Math.min(Math.max(Number(s.size), 1), 50) : DEFAULT_SETTINGS.size,
    llmExplain: s.llmExplain === undefined ? DEFAULT_SETTINGS.llmExplain : Boolean(s.llmExplain),
    llmProvider: typeof s.llmProvider === 'string' ? s.llmProvider : '',
    llmModel: typeof s.llmModel === 'string' ? s.llmModel : '',
    teachMode,
  };
}

// ─────────────────────────── HTTP 辅助 ───────────────────────────

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') return {};
  return JSON.parse(text);
}

// ─────────────────────────── 模型层 ───────────────────────────
//
// 设计要点（按需求调整过）：
//   1. **默认跟随用户 DSH 当前选的模型**（agentDefaultModel.currentSelection）
//   2. 也可以在设置里**指定别的 provider/model** —— 比如用便宜的小模型专门跑讲解
//   3. 模型不可用时一律**降级为 null**，绝不让讲解拖垮出题/判分
//
// 词库只服务「基础机械练习」（变位、阴阳性、复数），
// 真正需要理解的部分（讲解、例句、为什么错）交给模型。

/**
 * 解析这次调用该用哪个模型。
 *
 * @returns {{provider:string, model:string, source:'override'|'session'}|null}
 */
function resolveModel(ctx, settings) {
  // 1) 设置里显式指定了就用它
  const overrideProvider = settings?.llmProvider;
  const overrideModel = settings?.llmModel;
  if (typeof overrideProvider === 'string' && overrideProvider !== ''
      && typeof overrideModel === 'string' && overrideModel !== '') {
    return { provider: overrideProvider, model: overrideModel, source: 'override' };
  }

  // 2) 否则跟随 DSH 当前的默认模型
  try {
    const sel = ctx.get?.('agentDefaultModel')?.currentSelection?.();
    if (sel && typeof sel.provider === 'string' && typeof sel.model === 'string') {
      return { provider: sel.provider, model: sel.model, source: 'session' };
    }
  } catch {
    /* 拿不到就当没有 */
  }
  return null;
}

/**
 * 列出可用模型（供设置页的下拉框）。
 * 任一步失败都返回空数组，不抛错 —— 设置页不能因为模型目录挂了就打不开。
 */
async function listAvailableModels(ctx) {
  const llm = ctx.get?.('llm');
  if (llm === undefined || typeof llm.listProviders !== 'function') return [];

  let providers = [];
  try {
    providers = llm.listProviders() ?? [];
  } catch {
    return [];
  }

  const out = [];
  for (const p of providers) {
    const pid = p?.provider ?? p?.id;
    if (typeof pid !== 'string' || pid === '') continue;

    let models = [];
    if (typeof llm.listModels === 'function') {
      try {
        models = (await llm.listModels(pid)) ?? [];
      } catch {
        models = [];
      }
    }

    out.push({
      provider: pid,
      name: p?.name ?? pid,
      models: models.map((m) => ({ id: m.id, name: m.name ?? m.id })).filter((m) => m.id),
    });
  }
  return out;
}

/** 一次模型补全，返回纯文本；失败返回 null。 */
async function complete(ctx, settings, { system, user, maxTokens = 800, signal }) {
  const target = resolveModel(ctx, settings);
  if (target === null) return null;

  const llm = ctx.get?.('llm');
  if (llm === undefined || typeof llm.stream !== 'function') return null;

  try {
    const chunks = [];
    const stream = llm.stream({
      provider: target.provider,
      model: target.model,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
      maxTokens,
      signal,
    });
    for await (const chunk of stream) {
      if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') chunks.push(chunk.text);
    }
    const text = chunks.join('').trim();
    return text === '' ? null : text;
  } catch {
    return null;
  }
}

/** 带超时的一次补全。 */
async function completeWithTimeout(ctx, settings, opts, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await complete(ctx, settings, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 一道题的完整形态描述，给模型当上下文。 */
function describeForModel(question, answer) {
  const lines = [`题目：${question.prompt ?? ''}`, `正确答案：${answer}`];
  if (question.kind === 'conjugation') {
    lines.push(`题型：动词变位`);
    lines.push(`动词原形：${question.infinitive}`);
    lines.push(`时态：${question.tense}`);
    lines.push(`人称：${question.personLabel ?? question.person}`);
  } else if (question.kind === 'gender') {
    lines.push('题型：判断名词阴阳性（答案应是 m 或 f）');
    lines.push(`名词：${question.noun}`);
  } else if (question.kind === 'plural') {
    lines.push('题型：名词变复数');
    lines.push(`名词：${question.noun}`);
  } else if (question.kind === 'agreement') {
    lines.push('题型：形容词与名词性数一致');
    lines.push(`名词：${question.noun}`);
    lines.push(`形容词：${question.adjective}`);
    lines.push(`要求：${question.gender === 'f' ? '阴性' : '阳性'} ${question.number === 'pl' ? '复数' : '单数'}`);
  }
  return lines.filter(Boolean).join('\n');
}

/** 答错时：讲清为什么错。 */
async function explainMistake(ctx, settings, question, answer, given) {
  const system = [
    '你是西语老师，学生母语是汉语。学生刚答错一道题，用**中文**讲清楚：',
    '1. 正确答案是什么；',
    '2. 这个答案背后的规律（如果是常规律，一句话点明）；',
    '3. 学生的答案错在哪（如果是典型错误，点出来）。',
    '只讲这一道题，不要展开成语法课。控制在 120 字以内。',
    '不要用 Markdown 标题或列表符号，直接说人话。',
  ].join('\n');

  const user = [describeForModel(question, answer), `学生的答案：${given || '(空)'}`].join('\n');
  return completeWithTimeout(ctx, settings, { system, user, maxTokens: 600 });
}

/**
 * 「学」模式：还没做题时，先讲清这个知识点 + 给例句。
 *
 * 这是补上原本缺失的「学习」环节 ——
 * 原来只有练，学生答错才知道规则；现在可以先学再做。
 */
async function teachPoint(ctx, settings, question, answer) {
  const system = [
    '你是西语老师，学生母语是汉语。学生现在要**先学再做**，请在出题前给他讲清这个知识点。',
    '输出用中文，格式固定为四段，每段一个小标题（用「【】」括起来），不要用 Markdown：',
    '【一句话规则】这个知识点最核心的规律，20 字以内。',
    '【正确答案】直接给出这道题的答案，并说明为什么。',
    '【例句】2 个真实自然的西语例句，每个后面跟中文翻译。',
    '【易错点】1-2 条中国学生最容易错的地方。',
    '总长度 200 字以内。如果这个点没有易错点，就写「无明显易错点」。',
  ].join('\n');

  const user = describeForModel(question, answer);
  return completeWithTimeout(ctx, settings, { system, user, maxTokens: 900 });
}

/**
 * 「直接要答案」：不问规则，只给结果 + 极短提示。
 *
 * 和 teachPoint 的区别：这是学生卡住时的「揭晓」，最短路径。
 */
async function revealAnswer(ctx, settings, question, answer) {
  const system = [
    '你是西语学习助手。学生卡住了，只要最短的答案提示。',
    '用中文输出，一行就够：先给正确答案，再用一句话说关键。',
    '不要解释规则、不要举例、不要展开。30 字以内。',
  ].join('\n');

  const user = describeForModel(question, answer);
  return completeWithTimeout(ctx, settings, { system, user, maxTokens: 300, });
}

// ─────────────────── 情景造句（全模型） ───────────────────
//
// 这一类练习完全不依赖词库：模型出题、模型批改。
// 词库只服务「答案唯一」的机械题，自由表达只能靠模型判断。
//
// 风险控制：
//   1. 要求模型输出**严格 JSON**，解析失败就降级，不把半截文本塞给界面
//   2. 批改结果必须带 verdict 枚举，不能让模型自由发挥
//   3. 模型不可用时明确返回 degraded，界面提示"这一项需要模型"

// ─────────────────── 参考答案暂存区 ───────────────────
//
// 出题时把参考答案存在服务端，只给客户端一个随机 token。
// 批改时按 token 取回 —— 客户端**无法伪造或读取**参考答案。
//
// 为什么不直接下发：这句话本身就是答案，学生看到就没得练了。
// 这和变位题的 publicQuestion 剥掉 answer 是同一个道理。
//
// 用 Map + TTL：进程重启就丢，不落盘（丢了学生重出一题即可，不值得持久化）。

const REFERENCE_TTL_MS = 30 * 60 * 1000; // 30 分钟，够学生慢慢写
const referenceStash = new Map();

function stashReference(scenarioId, task, reference) {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  referenceStash.set(token, { scenarioId, task, reference, at: Date.now() });
  // 顺手清理过期项，防止无限增长
  const now = Date.now();
  for (const [k, v] of referenceStash) {
    if (now - v.at > REFERENCE_TTL_MS) referenceStash.delete(k);
  }
  return token;
}

function takeReference(token, scenarioId) {
  if (typeof token !== 'string' || token === '') return null;
  const hit = referenceStash.get(token);
  if (hit === undefined) return null;
  if (Date.now() - hit.at > REFERENCE_TTL_MS) {
    referenceStash.delete(token);
    return null;
  }
  // 场景必须对上，防止拿 A 场景的 token 批改 B 场景
  if (hit.scenarioId !== scenarioId) return null;
  return hit;
}

/** 场景库：给学生一个具体语境，比"造个句子"好落地。 */const SCENARIOS = [
  { id: 'restaurant', label: '在餐厅点菜', zh: '你在马德里的一家餐厅，想点一份海鲜饭和一杯水。', level: 'A2' },
  { id: 'directions', label: '问路', zh: '你在陌生城市，想问路人去火车站怎么走。', level: 'A2' },
  { id: 'shopping', label: '买衣服', zh: '你在服装店，想试穿一件衬衫并问价钱。', level: 'A2' },
  { id: 'introduce', label: '自我介绍', zh: '向新同事介绍自己：姓名、来自哪里、做什么工作。', level: 'A1' },
  { id: 'hotel', label: '酒店入住', zh: '你在酒店前台办理入住，说明你订了一间房。', level: 'A2' },
  { id: 'doctor', label: '看医生', zh: '你不舒服，向医生说明症状（头痛、发烧）。', level: 'B1' },
  { id: 'past', label: '讲昨天的经历', zh: '用过去时讲你昨天做了什么。', level: 'B1' },
  { id: 'opinion', label: '表达看法', zh: '说说你对学外语的看法，用虚拟式表达愿望。', level: 'B1' },
];

/**
 * 出题：给一个场景，让学生写西语。
 * 模型负责生成「提示要点」和「参考答案」（不给学生看，批改时才用）。
 */
async function makeScenarioTask(ctx, settings, scenario) {
  const system = [
    '你是西语老师。给一个中文语境，让学生写西语句子。',
    '只输出一个 JSON 对象，不要 Markdown 代码块，不要任何解释：',
    '{"task":"用西语怎么说（一句中文指令，20字内）","hints":["提示1","提示2"],"reference":"参考答案（西语，1-2句）"}',
    'hints 给 2 条，用中文，提示该用什么时态/词汇，但**不要直接给出答案**。',
  ].join('\n');

  const user = `场景：${scenario.zh}\n难度：${scenario.level}`;
  const raw = await completeWithTimeout(ctx, settings, { system, user, maxTokens: 600 });
  if (raw === null) return null;

  const parsed = extractJsonObject(raw);
  if (parsed === null) return null;

  const task = typeof parsed.task === 'string' ? parsed.task.trim() : '';
  const reference = typeof parsed.reference === 'string' ? parsed.reference.trim() : '';
  if (task === '' || reference === '') return null;

  return {
    task,
    hints: Array.isArray(parsed.hints) ? parsed.hints.filter((h) => typeof h === 'string').slice(0, 3) : [],
    reference,
  };
}

/**
 * 批改：学生写的句子对不对、哪里要改。
 *
 * 要求模型给出结构化判定，而不是一段散文 ——
 * 界面要能据此显示对/错/部分对，并高亮问题。
 */
async function gradeScenario(ctx, settings, { scenario, task, reference, answer }) {
  const system = [
    '你是西语老师，批改学生写的西语句子。',
    '只输出一个 JSON 对象，不要 Markdown，不要解释：',
    '{"verdict":"correct|partial|wrong","feedback":"中文点评，60字内",',
    ' "corrections":[{"wrong":"学生的错误片段","right":"正确写法","why":"中文说明"}]}',
    '',
    '判定标准：',
    '- correct：语法正确、意思达意（措辞不同也接受）',
    '- partial：能看懂但有明显语法/用词错误',
    '- wrong：意思不对或严重语法错误',
    'corrections 最多 3 条，只在有错时给；没错就给空数组。',
    '点评用中文。不要因为"表达不够地道"就判错。',
  ].join('\n');

  const user = [
    `场景：${scenario.zh}`,
    `题目：${task}`,
    `参考答案：${reference}`,
    `学生写的：${answer}`,
  ].join('\n');

  const raw = await completeWithTimeout(ctx, settings, { system, user, maxTokens: 900 });
  if (raw === null) return null;

  const parsed = extractJsonObject(raw);
  if (parsed === null) return null;

  const verdict = ['correct', 'partial', 'wrong'].includes(parsed.verdict) ? parsed.verdict : null;
  if (verdict === null) return null;

  return {
    verdict,
    feedback: typeof parsed.feedback === 'string' ? parsed.feedback.trim() : '',
    corrections: Array.isArray(parsed.corrections)
      ? parsed.corrections
        .filter((c) => c && typeof c.wrong === 'string' && typeof c.right === 'string')
        .slice(0, 3)
        .map((c) => ({
          wrong: c.wrong,
          right: c.right,
          why: typeof c.why === 'string' ? c.why : '',
        }))
      : [],
  };
}

/**
 * 从模型回复里抠出第一个 JSON 对象。
 *
 * 模型经常会加 ```json 包裹或前后废话，所以要容忍。
 * 抠不出来返回 null（**不要**硬解析半截文本）。
 */
function extractJsonObject(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  if (start < 0) return null;

  // 括号配对，跳过字符串里的括号
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ─────────────────────────── 路由实现 ───────────────────────────

function createRouter(ctx) {
  return async function serve(req, res) {
    const url = new URL(req.url ?? '/', 'http://dsh.invalid');
    const path = url.pathname.startsWith(ROUTE_PREFIX)
      ? url.pathname.slice(ROUTE_PREFIX.length) || '/'
      : url.pathname;

    try {
      // GET /dsh-spanish/state —— 当前进度 + 设置 + 摘要统计
      if (path === '/state' && req.method === 'GET') {
        const state = loadState();
        const settings = mergeSettings(state);
        const memory = state.memory;
        const ids = Object.keys(memory);
        const now = Date.now();
        const due = ids.filter((id) => isDue(memory[id], now)).length;
        const mastered = ids.filter((id) => masteryOf(memory[id]) >= 0.85).length;
        return sendJson(res, 200, {
          ok: true,
          settings,
          stats: state.stats,
          progress: {
            tracked: ids.length,
            due,
            mastered,
            bankSize: {
              verbs: BANK.verbs.length,
              nouns: BANK.nouns.length,
              adjectives: BANK.adjectives.length,
            },
          },
        });
      }

      // POST /dsh-spanish/settings
      if (path === '/settings' && req.method === 'POST') {
        const body = await readBody(req);
        const state = loadState();
        state.settings = { ...state.settings, ...pickSettings(body) };
        saveState(state);
        return sendJson(res, 200, { ok: true, settings: mergeSettings(state) });
      }

      // POST /dsh-spanish/session —— 出一局题
      if (path === '/session' && req.method === 'POST') {
        const body = await readBody(req);
        const state = loadState();
        const settings = mergeSettings(state);
        const level = typeof body.level === 'string' ? body.level : settings.level;
        const bank = bankAtLevel(BANK, level);

        const session = buildSession(bank, {
          memory: state.memory,
          tenses: Array.isArray(body.tenses) && body.tenses.length ? body.tenses : settings.tenses,
          kinds: Array.isArray(body.kinds) && body.kinds.length ? body.kinds : settings.kinds,
          persons: Array.isArray(body.persons) && body.persons.length ? body.persons : PERSONS,
          size: Number(body.size) || settings.size,
          seed: Number(body.seed) || Date.now(),
        });

        return sendJson(res, 200, {
          ok: true,
          level,
          settings,
          questions: session.questions.map(publicQuestion),
          unseenCount: session.unseenCount,
          dueCount: session.dueCount,
          totalCount: session.totalCount,
        });
      }

      // POST /dsh-spanish/answer —— 交一题，判分 + 记进度
      if (path === '/answer' && req.method === 'POST') {
        const body = await readBody(req);
        const question = body.question;
        if (question === undefined || typeof question !== 'object') {
          return sendJson(res, 400, { ok: false, error: '缺少 question' });
        }

        // 答案以**服务端重新推导**为准，不信任客户端传来的 answer 字段。
        // 客户端的题目本来就剥掉了 answer（防作弊），所以这里必须能自己算出来。
        const resolved = resolveAnswer(question);
        if (resolved === null) {
          return sendJson(res, 400, { ok: false, error: `无法识别的题目：${question.id ?? '(无 id)'}` });
        }

        const verdict = judge({ ...question, answer: resolved }, body.given);
        const state = loadState();
        const now = Date.now();
        state.memory[question.id] = updateCard(state.memory[question.id], verdict.result, now);
        state.stats.answered += 1;
        if (verdict.result === 'correct') state.stats.correct += 1;
        saveState(state);

        let explanation = null;
        const settings = mergeSettings(state);
        if (verdict.result !== 'correct' && settings.llmExplain && settings.teachMode !== 'off') {
          explanation = await explainMistake(ctx, settings, question, verdict.expected, verdict.given);
        }

        return sendJson(res, 200, {
          ok: true,
          result: verdict.result,
          expected: verdict.expected,
          given: verdict.given,
          explanation,
          card: state.memory[question.id],
          mastery: masteryOf(state.memory[question.id]),
        });
      }

      // POST /dsh-spanish/teach —— 「学」：出题前先讲清这个知识点
      //
      // 这是补上原本缺失的学习环节。原来只有练习，
      // 学生答错才知道规则；现在可以先看讲解再作答。
      if (path === '/teach' && req.method === 'POST') {
        const body = await readBody(req);
        const question = body.question;
        if (question === undefined || typeof question !== 'object') {
          return sendJson(res, 400, { ok: false, error: '缺少 question' });
        }
        const resolved = resolveAnswer(question);
        if (resolved === null) {
          return sendJson(res, 400, { ok: false, error: `无法识别的题目：${question.id ?? '(无 id)'}` });
        }

        const state = loadState();
        const settings = mergeSettings(state);

        // teachMode=off：不调模型，只回一个最简提示，让界面自己显示答案
        if (settings.teachMode === 'off') {
          return sendJson(res, 200, {
            ok: true,
            mode: 'off',
            answer: resolved,
            content: null,
            notice: '已关闭讲解（设置里可以打开）',
          });
        }

        const content = settings.teachMode === 'reveal'
          ? await revealAnswer(ctx, settings, question, resolved)
          : await teachPoint(ctx, settings, question, resolved);

        const target = resolveModel(ctx, settings);
        return sendJson(res, 200, {
          ok: true,
          mode: settings.teachMode,
          answer: resolved,
          content,
          // 讲解失败时界面要能说明原因，而不是空白
          model: target,
          degraded: content === null,
          notice: content === null ? '模型暂不可用，可直接看答案继续练习' : null,
        });
      }

      // POST /dsh-spanish/reveal —— 练习中卡住时「直接给答案」
      if (path === '/reveal' && req.method === 'POST') {
        const body = await readBody(req);
        const question = body.question;
        if (question === undefined || typeof question !== 'object') {
          return sendJson(res, 400, { ok: false, error: '缺少 question' });
        }
        const resolved = resolveAnswer(question);
        if (resolved === null) {
          return sendJson(res, 400, { ok: false, error: `无法识别的题目：${question.id ?? '(无 id)'}` });
        }

        const state = loadState();
        const settings = mergeSettings(state);
        const wantDetail = body.detail === true && settings.teachMode !== 'off';
        const content = wantDetail ? await revealAnswer(ctx, settings, question, resolved) : null;

        // 揭晓答案也要记进记忆表（按「看过答案」处理：不算对，但不扣到最低）
        state.memory[question.id] = updateCard(state.memory[question.id], 'accent', Date.now());
        saveState(state);

        return sendJson(res, 200, {
          ok: true,
          answer: resolved,
          content,
          degraded: wantDetail && content === null,
        });
      }

      // GET /dsh-spanish/models —— 可用模型列表（给设置页的下拉框）
      if (path === '/models' && req.method === 'GET') {
        const providers = await listAvailableModels(ctx);
        const state = loadState();
        const settings = mergeSettings(state);
        const current = resolveModel(ctx, settings);
        return sendJson(res, 200, { ok: true, providers, current, settings });
      }

      // GET /dsh-spanish/scenarios —— 可用场景列表
      if (path === '/scenarios' && req.method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          scenarios: SCENARIOS.map((s) => ({ id: s.id, label: s.label, zh: s.zh, level: s.level })),
        });
      }

      // POST /dsh-spanish/scenario —— 出一个情景造句题
      if (path === '/scenario' && req.method === 'POST') {
        const body = await readBody(req);
        const state = loadState();
        const settings = mergeSettings(state);

        if (settings.teachMode === 'off') {
          return sendJson(res, 200, {
            ok: true,
            degraded: true,
            notice: '情景造句需要模型，已关闭讲解时不可用',
            scenario: null,
          });
        }

        // 选场景：指定了就用指定的，否则随机
        const wanted = typeof body.scenarioId === 'string' ? body.scenarioId : '';
        const scenario = SCENARIOS.find((s) => s.id === wanted)
          ?? SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];

        const task = await makeScenarioTask(ctx, settings, scenario);
        const target = resolveModel(ctx, settings);

        if (task === null) {
          return sendJson(res, 200, {
            ok: true,
            degraded: true,
            model: target,
            scenario: { id: scenario.id, label: scenario.label, zh: scenario.zh, level: scenario.level },
            notice: target === null
              ? '没有可用的模型，情景造句不可用'
              : '模型没有返回可用的题目，请重试',
          });
        }

        return sendJson(res, 200, {
          ok: true,
          degraded: false,
          model: target,
          scenario: { id: scenario.id, label: scenario.label, zh: scenario.zh, level: scenario.level },
          // 参考答案**不下发**：存进服务端暂存区，批改时按 token 取回。
          // 学生从网络面板里看到参考答案的话，这道题就没意义了。
          task: { task: task.task, hints: task.hints },
          refToken: stashReference(scenario.id, task.task, task.reference),
        });
      }

      // POST /dsh-spanish/scenario/grade —— 批改学生写的句子
      if (path === '/scenario/grade' && req.method === 'POST') {
        const body = await readBody(req);
        const state = loadState();
        const settings = mergeSettings(state);

        const scenarioId = typeof body.scenarioId === 'string' ? body.scenarioId : '';
        const scenario = SCENARIOS.find((s) => s.id === scenarioId);
        const answer = typeof body.answer === 'string' ? body.answer.trim() : '';

        if (scenario === undefined) {
          return sendJson(res, 400, { ok: false, error: '未知场景' });
        }
        if (answer === '') {
          return sendJson(res, 400, { ok: false, error: '请先写一句西语' });
        }

        if (settings.teachMode === 'off') {
          return sendJson(res, 200, { ok: true, degraded: true, notice: '批改需要模型，已关闭讲解时不可用' });
        }

        // 参考答案从服务端暂存区按 token 取回 —— 
        // 客户端拿不到也伪造不了，所以批改基准不可被篡改。
        const stashed = takeReference(body.refToken, scenarioId);
        if (stashed === null) {
          return sendJson(res, 400, {
            ok: false,
            error: '这道题的参考答案已过期（或 token 无效），请重新出一题',
          });
        }

        const result = await gradeScenario(ctx, settings, {
          scenario,
          task: stashed.task,
          reference: stashed.reference,
          answer,
        });

        if (result === null) {
          const target = resolveModel(ctx, settings);
          return sendJson(res, 200, {
            ok: true,
            degraded: true,
            model: target,
            notice: target === null ? '没有可用的模型，无法批改' : '模型没有返回可用的批改结果，请重试',
          });
        }

        // 记一次进度（用场景 id 当卡片）
        const cardId = `scenario:${scenario.id}`;
        const mapped = result.verdict === 'correct' ? 'correct' : result.verdict === 'partial' ? 'accent' : 'wrong';
        state.memory[cardId] = updateCard(state.memory[cardId], mapped, Date.now());
        state.stats.answered += 1;
        if (mapped === 'correct') state.stats.correct += 1;
        saveState(state);

        return sendJson(res, 200, { ok: true, degraded: false, ...result });
      }

      // POST /dsh-spanish/reset —— 清空进度（带确认词）
      if (path === '/reset' && req.method === 'POST') {
        const body = await readBody(req);
        if (body.confirm !== true) return sendJson(res, 400, { ok: false, error: '需要 confirm: true' });
        const file = progressFile();
        if (existsSync(file)) rmSync(file);
        return sendJson(res, 200, { ok: true });
      }

      // GET /dsh-spanish/table?verb=hablar —— 变位全表
      if (path === '/table' && req.method === 'GET') {
        const verb = (url.searchParams.get('verb') ?? '').trim().toLowerCase();
        if (verb === '') return sendJson(res, 400, { ok: false, error: '缺少 verb' });
        try {
          const table = fullTable(verb);
          return sendJson(res, 200, {
            ok: true,
            verb,
            table,
            participlo: participle(verb),
            gerundio: gerund(verb),
            tenses: TENSES.map((t) => ({ id: t, label: TENSE_LABELS[t] })),
            persons: PERSONS,
            personLabels: PERSON_LABELS,
          });
        } catch (err) {
          return sendJson(res, 400, { ok: false, error: String(err?.message ?? err) });
        }
      }

      // GET /dsh-spanish/noun?word=casa —— 名词信息
      if (path === '/noun' && req.method === 'GET') {
        const word = (url.searchParams.get('word') ?? '').trim();
        if (word === '') return sendJson(res, 400, { ok: false, error: '缺少 word' });
        const info = nounInfo(word);
        return sendJson(res, 200, { ok: true, ...info, pluralOf: pluralOf(word), guessed: guessGender(word) });
      }

      // GET /dsh-spanish/bank —— 词库（供界面浏览）
      if (path === '/bank' && req.method === 'GET') {
        const level = url.searchParams.get('level') ?? 'C1';
        const bank = bankAtLevel(BANK, level);
        return sendJson(res, 200, { ok: true, level, bank });
      }

      // GET /dsh-spanish/meta —— 静态元信息（时态表、人称、题型）
      if (path === '/meta' && req.method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          tenses: TENSES.map((t) => ({ id: t, label: TENSE_LABELS[t] })),
          persons: PERSONS.map((p) => ({ id: p, label: PERSON_LABELS[p] })),
          kinds: [
            { id: 'conjugation', label: '动词变位' },
            { id: 'gender', label: '名词阴阳性' },
            { id: 'plural', label: '名词复数' },
            { id: 'vocab', label: '认词（词义）' },
            { id: 'cloze', label: '句子填空' },
            { id: 'grammar', label: '语法专项' },
          ],
          levels: ['A1', 'A2', 'B1', 'B2', 'C1'],
          intervals: INTERVALS_DAYS,
          defaults: DEFAULT_SETTINGS,
          teachModes: [
            { id: 'learn', label: '先学后练（讲知识点）' },
            { id: 'reveal', label: '只给最短答案' },
            { id: 'off', label: '关闭讲解（纯练习）' },
          ],
          // 加载指纹：外部脚本拿它和磁盘 mtime 比对，判断进程是不是最新代码。
          // 没有它就只能靠「题型列表」这种粗信号，看不出逻辑更新（踩过）。
          fingerprint: LOAD_FINGERPRINT,
        });
      }

      return sendJson(res, 404, { ok: false, error: `未知路由 ${path}` });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: String(err?.message ?? err) });
    }
  };
}

/** 只把需要展示的字段发给浏览器（答案不预先下发，避免学生从网络面板里看答案）。 */
function publicQuestion(q) {
  const out = { ...q };
  delete out.answer;
  delete out.siblings;
  return out;
}

/**
 * 从题目自身字段**重新推导**正确答案。
 *
 * 这是一道安全边界：客户端提交上来的 answer 一律不采信 ——
 * 否则改一行前端代码就能「全对」。答案永远以引擎 + 词库为准。
 *
 * 难点是名词性别：规则对 mano / foto / problema 这类特例会判反，
 * 而客户端提交的题目里**没有**词库标注（下发时剥掉了）。
 * 所以这里用 `noun` 回词库反查：题库里有的词用题库标注，题库没有的才走规则。
 *
 * @returns {string|null} 答案；无法识别时返回 null
 */
function resolveAnswer(question) {
  const kind = question.kind;
  try {
    if (kind === 'conjugation') {
      const infinitive = String(question.infinitive ?? '').trim().toLowerCase();
      const tense = String(question.tense ?? '');
      const personIndex = Number(question.personIndex);
      if (infinitive === '' || !TENSES.includes(tense)) return null;
      if (!Number.isInteger(personIndex) || personIndex < 0 || personIndex > 5) return null;
      return conjugate(infinitive, tense)[personIndex] ?? null;
    }

    if (kind === 'gender') {
      const noun = String(question.noun ?? '').trim();
      if (noun === '') return null;
      const known = NOUN_BY_WORD.get(noun.toLowerCase());
      return known?.gender ?? nounInfo(noun).gender ?? null;
    }

    if (kind === 'plural') {
      const noun = String(question.noun ?? '').trim();
      if (noun === '') return null;
      // 题库里有就按人工标注的词算（可能带例外复数），否则走规则
      return pluralOf(noun);
    }

    if (kind === 'agreement') {
      const adjective = String(question.adjective ?? '').trim();
      const gender = question.gender === 'f' ? 'f' : 'm';
      const number = question.number === 'pl' ? 'pl' : 'sg';
      if (adjective === '') return null;
      return adjectiveAgreement(adjective, gender, number);
    }

    // ── 下面三类是新题型，**必须**在这里补上 ──
    // 漏掉的后果是判分一律 400：实机测出来的 bug，当时离线单测没覆盖到
    // （单测直接调 judge()，绕开了 resolveAnswer）。

    // 认词：按词回词库查释义，按方向决定答案是中文还是西语
    if (kind === 'vocab') {
      const word = String(question.word ?? '').trim();
      if (word === '') return null;
      const meaning = meaningOfWord(word);
      if (meaning === null) return null;
      return question.direction === 'zh2es' ? word : meaning;
    }

    // 填空 / 语法专项：句子本身就是唯一标识，回题库按句子查答案
    if (kind === 'cloze') {
      const sentence = String(question.prompt ?? '').trim();
      if (sentence === '') return null;
      const hit = CLOZE_BY_SENTENCE.get(sentence);
      return hit !== undefined ? hit.answer : null;
    }

    if (kind === 'grammar') {
      const sentence = String(question.prompt ?? '').trim();
      if (sentence === '') return null;
      const hit = GRAMMAR_BY_SENTENCE.get(sentence);
      return hit !== undefined ? hit.answer : null;
    }

    return null;
  } catch {
    return null;
  }
}

/** 词的释义：动词/名词/形容词都查一遍。 */
function meaningOfWord(word) {
  const w = String(word).toLowerCase();
  for (const list of [VERBS, NOUNS, ADJECTIVES]) {
    for (const entry of list) {
      const key = entry.infinitive ?? entry.noun ?? entry.adjective;
      if (String(key).toLowerCase() === w) return entry.meaning ?? null;
    }
  }
  return null;
}

/** 例句库按句子索引（填空/语法判分用）。 */
const CLOZE_BY_SENTENCE = new Map(
  Object.values(CLOZE_BANK).flat().map((item) => [item.sentence, item]),
);
const GRAMMAR_BY_SENTENCE = new Map(
  Object.values(GRAMMAR_BANK).flat().map((item) => [item.sentence, item]),
);

/** 题库按词索引，供判分反查人工标注的性别。 */
const NOUN_BY_WORD = new Map(NOUNS.map((n) => [String(n.noun).toLowerCase(), n]));

function describeQuestion(q) {
  if (q.kind === 'conjugation') return `${q.infinitive} · ${q.tense} · ${q.person}`;
  if (q.kind === 'gender' || q.kind === 'plural') return q.noun ?? '';
  if (q.kind === 'agreement') return `${q.noun} + ${q.adjective}`;
  return '';
}

function pickSettings(body) {
  const out = {};
  if (typeof body.level === 'string') out.level = body.level;
  if (Array.isArray(body.tenses)) out.tenses = body.tenses.filter((t) => TENSES.includes(t));
  if (Array.isArray(body.kinds)) out.kinds = body.kinds;
  if (body.size !== undefined) out.size = body.size;
  if (body.llmExplain !== undefined) out.llmExplain = Boolean(body.llmExplain);
  if (typeof body.llmProvider === 'string') out.llmProvider = body.llmProvider;
  if (typeof body.llmModel === 'string') out.llmModel = body.llmModel;
  if (['learn', 'reveal', 'off'].includes(body.teachMode)) out.teachMode = body.teachMode;
  return out;
}

// ─────────────────────────── 模型工具 ───────────────────────────

function buildTools() {
  return [
    {
      name: 'spanish_conjugate',
      description:
        '查西语动词变位表。给动词原形（如 hablar、tener）和可选时态，返回六个人称的形式。不传时态则返回全部时态。用于回答「西语 XX 怎么变位」「虚拟式怎么说」这类问题。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          verb: { type: 'string', description: '动词原形，如 hablar、comer、tener' },
          tense: {
            type: 'string',
            enum: TENSES,
            description: '时态；不传则返回全部时态',
          },
        },
        required: ['verb'],
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: { ok: { type: 'boolean' }, verb: { type: 'string' }, notice: { type: 'string' } },
        },
        render(_args, value) {
          if (!value?.ok) return [{ type: 'text', text: value?.notice ?? '查询失败' }];
          return [{ type: 'text', text: value.notice ?? '' }];
        },
      },
      async execute(args) {
        const verb = String(args?.verb ?? '').trim().toLowerCase();
        if (verb === '') return { ok: false, notice: '请给出动词原形。' };
        try {
          if (args?.tense) {
            const forms = conjugate(verb, args.tense);
            const lines = forms.map((f, i) => `${PERSON_LABELS[PERSONS[i]]}: ${f}`);
            return {
              ok: true,
              verb,
              tense: args.tense,
              forms,
              notice: `${verb}（${TENSE_LABELS[args.tense] ?? args.tense}）\n${lines.join('\n')}`,
            };
          }
          const table = fullTable(verb);
          const lines = [];
          for (const t of TENSES) {
            const forms = table[t];
            lines.push(`${TENSE_LABELS[t] ?? t}: ${forms.join(' / ')}`);
          }
          lines.push(`过去分词: ${table.participio[0]}`);
          lines.push(`副动词: ${table.gerundio[0]}`);
          return { ok: true, verb, table, notice: `${verb} 的变位表\n${lines.join('\n')}` };
        } catch (err) {
          return { ok: false, notice: String(err?.message ?? err) };
        }
      },
    },

    {
      name: 'spanish_noun',
      description:
        '查西语名词的阴阳性、复数和冠词。给名词（如 casa、mano、agua），返回性别、复数形式、定冠词与不定冠词。用于回答「XX 是阳性还是阴性」「XX 的复数怎么写」这类问题。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          word: { type: 'string', description: '名词原形，如 casa、libro、mano' },
        },
        required: ['word'],
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: { ok: { type: 'boolean' }, notice: { type: 'string' } },
        },
        render(_args, value) {
          return [{ type: 'text', text: value?.notice ?? '' }];
        },
      },
      async execute(args) {
        const word = String(args?.word ?? '').trim();
        if (word === '') return { ok: false, notice: '请给出名词。' };
        const info = nounInfo(word);
        const genderText = info.gender === 'f' ? '阴性' : info.gender === 'm' ? '阳性' : '规则给不出（需查词库）';
        return {
          ok: true,
          ...info,
          notice: [
            `${word}：${genderText}（来源：${info.genderSource === 'lexicon' ? '词库' : info.genderSource === 'rule' ? '词尾规则' : '无法判断'}）`,
            `单数：${info.definite} ${info.singular}`,
            `复数：${info.definitePl} ${info.plural}`,
            `不定冠词：${info.indefinite} ${info.singular} / ${info.indefinitePl} ${info.plural}`,
            info.stressedA ? '注意：这个阴性名词以重读 a 开头，单数用 el 但形容词仍是阴性。' : '',
          ].filter(Boolean).join('\n'),
        };
      },
    },

    {
      name: 'spanish_quiz',
      description:
        '给用户出一组西语练习题，返回题目（不含答案）。题型包括：动词变位、名词阴阳性、名词复数、认词（词义选择）、句子填空、语法专项（ser/estar、虚拟式、por/para）。用于「考考我西语」「给我出几道变位题」「练练认词」这类请求。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          size: { type: 'number', description: '题目数量，默认 5，最多 20' },
          level: { type: 'string', enum: ['A1', 'A2', 'B1', 'B2', 'C1'], description: '难度等级，默认 A1' },
          kinds: {
            type: 'array',
            items: { type: 'string', enum: ['conjugation', 'gender', 'plural', 'vocab', 'cloze', 'grammar'] },
            description: '题型；默认出变位/阴阳性/复数/认词四种',
          },
          tenses: {
            type: 'array',
            items: { type: 'string', enum: TENSES },
            description: '只出这些时态的变位题，默认只出 presente',
          },
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: { ok: { type: 'boolean' }, notice: { type: 'string' } },
        },
        render(_args, value) {
          return [{ type: 'text', text: value?.notice ?? '' }];
        },
      },
      async execute(args) {
        const state = loadState();
        const settings = mergeSettings(state);
        const bank = bankAtLevel(BANK, args?.level ?? settings.level);
        const session = buildSession(bank, {
          memory: state.memory,
          tenses: args?.tenses?.length ? args.tenses : settings.tenses,
          kinds: args?.kinds?.length ? args.kinds : settings.kinds,
          size: Math.min(Math.max(Number(args?.size) || 5, 1), 20),
        });
        const lines = session.questions.map((q, i) => `${i + 1}. ${describeQuestion(q)}`);
        return {
          ok: true,
          questions: session.questions.map(publicQuestion),
          notice: `出了 ${session.questions.length} 道题（到期 ${session.dueCount}，新题 ${session.unseenCount}）：\n${lines.join('\n')}\n把答案告诉我，我帮你判分。`,
        };
      },
    },

    {
      name: 'spanish_progress',
      description:
        '查看西语学习进度：掌握了多少张卡、多少到期、正确率。用于「我西语学到哪了」「我的正确率多少」这类询问。',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: { ok: { type: 'boolean' }, notice: { type: 'string' } },
        },
        render(_args, value) {
          return [{ type: 'text', text: value?.notice ?? '' }];
        },
      },
      async execute() {
        const state = loadState();
        const ids = Object.keys(state.memory);
        const now = Date.now();
        const due = ids.filter((id) => isDue(state.memory[id], now)).length;
        const mastered = ids.filter((id) => masteryOf(state.memory[id]) >= 0.85).length;
        const acc = state.stats.answered > 0
          ? Math.round((state.stats.correct / state.stats.answered) * 100)
          : 0;
        return {
          ok: true,
          tracked: ids.length,
          due,
          mastered,
          accuracy: acc,
          answered: state.stats.answered,
          notice: [
            `已记录 ${ids.length} 张卡，其中掌握 ${mastered} 张，到期 ${due} 张。`,
            `累计作答 ${state.stats.answered} 题，正确率 ${acc}%。`,
          ].join('\n'),
        };
      },
    },
  ];
}

// ─────────────────────────── 插件入口 ───────────────────────────

export function apply(ctx) {
  // 路由：浏览器半身的所有请求都走这一条前缀
  if (ctx.webServer && typeof ctx.webServer.register === 'function') {
    ctx.effect(
      () => ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler: createRouter(ctx) }),
      'spanish-tutor: routes',
    );
  }

  // 模型工具
  if (ctx.tools && typeof ctx.tools.register === 'function') {
    for (const tool of buildTools()) {
      ctx.effect(() => ctx.tools.register(tool), `spanish-tutor: ${tool.name} tool`);
    }
  }
}

// 供测试与 embedder 使用
export { loadState, saveState, mergeSettings, DEFAULT_SETTINGS, dataDir, progressFile };
