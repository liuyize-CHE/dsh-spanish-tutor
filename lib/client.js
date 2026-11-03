/**
 * dsh-spanish-tutor —— 浏览器半身。
 *
 * DSH 0.2.x 的客户端插件格式（从 app.asar 实测确认）：
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ... exports.apply/inject } })
 * 不是 ESM，React 通过 factory 的 require('react') 拿。
 *
 * 界面：输入框右侧胶囊 → 打开侧栏面板 → 做题。
 * 所有判分都在 host 端（防作弊），这里只负责展示与交互。
 */

window.__ModuleLoader__.load({
  id: 'dsh-spanish-tutor',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback, useMemo } = React;

    const API = '/dsh-spanish';

    // ─────────────────────────── 中英文本 ───────────────────────────
    // 跟随宿主界面语言。这是纯客户端判断，和 dsh-unlag 的 detectZh 同一套逻辑。
    const detectZh = (docLang, browserLang) => {
      const tag = typeof docLang === 'string' ? docLang : '';
      if (/^zh(-|$)/i.test(tag)) return true;
      if (tag !== '' && !/^en(-|$)/i.test(tag)) return false;
      const first = Array.isArray(browserLang) ? browserLang[0] : browserLang;
      return typeof first === 'string' && /^zh(-|$)/i.test(first);
    };
    const ZH = detectZh(
      typeof document !== 'undefined' ? document?.documentElement?.lang : '',
      typeof navigator !== 'undefined' ? navigator.languages || navigator.language : '',
    );

    const T = ZH
      ? {
          label: '西语',
          title: '西语练习',
          back: '返回会话',
          start: '开始一局',
          again: '再来一局',
          loading: '加载中…',
          check: '确认',
          next: '下一题',
          skip: '跳过',
          correct: '答对了',
          accent: '拼写对，重音错了',
          wrong: '答错了',
          answerIs: '正确答案',
          yourAnswer: '你的答案',
          why: '为什么',
          explaining: '正在请模型解释…',
          finish: '这一局完成',
          score: '本局',
          attempts: '共作答',
          wrongTitle: '这一局错了这些',
          wrongCount: (n) => `${n} 题`,
          againShort: '再练一次',
          noWrong: '一题没错',
          requeuedHint: '答错的题会在本局末尾再出现一次',
          progress: '进度',
          tracked: '学过的卡',
          due: '待复习',
          mastered: '已掌握',
          accuracy: '完全正确率',
          accentNote: (n, pct, lenient) => `另有 ${n} 题只差重音（${pct}%）；算作半对是 ${lenient}%`,
          sessions: '局',
          settings: '设置',
          level: '难度',
          kinds: '题型',
          tenses: '时态',
          size: '每局题数',
          explainToggle: '答错时用模型讲解',
          reset: '清空进度',
          resetConfirm: '确定清空全部学习进度？这个操作不能撤销。',
          resetDone: '已清空',
          noun: '名词',
          verb: '动词',
          person: '人称',
          tense: '时态',
          plural: '复数',
          gender: '阴阳性',
          masculine: '阳性',
          feminine: '阴性',
          empty: '还没有题目',
          error: '出错了',
          retry: '重试',
          tabPractice: '练习',
          tabBrowse: '查表',
          tabStats: '进度',
          lookupHint: '输入动词或名词，查变位/阴阳性',
          lookup: '查询',
          noResult: '没查到',
          notAVerb: '这不是一个动词原形（应以 -ar/-er/-ir 结尾）',
          loadingMore: '正在出题…',
          progressLine: (a, b) => `第 ${a} / ${b} 题`,
          allDone: '全部完成',
          streak: '连击',
          learnBtn: '先学一下',
          revealBtn: '看答案',
          teaching: '正在生成讲解…',
          teachDegraded: '模型暂不可用，先看答案继续',
          revealed: '答案已揭晓',
          modelFollow: '跟随 DSH 当前模型',
          modelCustom: '指定模型',
          modelTitle: '讲解用哪个模型',
          modelHint: '留空则跟随你在 DSH 里选的模型',
          teachMode: '学习方式',
          teachLearn: '先学后练',
          teachReveal: '只给答案',
          teachOff: '关闭讲解',
          ruleLabel: '规则',
          scenarioTitle: '情景造句',
          scenarioHint: '按这个场景写一句西语',
          scenarioSubmit: '提交批改',
          scenarioNext: '换个场景',
          scenarioPlaceholder: '在这里写西语…',
          scenarioGrading: '正在批改…',
          verdictCorrect: '写得对',
          verdictPartial: '基本对，有要改的',
          verdictWrong: '还不对',
        }
      : {
          label: 'Español',
          title: 'Spanish Practice',
          back: 'Back to chat',
          start: 'Start a round',
          again: 'Another round',
          loading: 'Loading…',
          check: 'Check',
          next: 'Next',
          skip: 'Skip',
          correct: 'Correct',
          accent: 'Right letters, wrong accent',
          wrong: 'Incorrect',
          answerIs: 'Correct answer',
          yourAnswer: 'Your answer',
          why: 'Why',
          explaining: 'Asking the model…',
          finish: 'Round complete',
          score: 'Score',
          attempts: 'answered',
          wrongTitle: 'Missed this round',
          wrongCount: (n) => `${n} ${n === 1 ? 'question' : 'questions'}`,
          againShort: 'Again',
          noWrong: 'Nothing missed',
          requeuedHint: 'A wrong answer comes back once at the end of the round',
          progress: 'Progress',
          tracked: 'Cards seen',
          due: 'Due',
          mastered: 'Mastered',
          accuracy: 'Strict accuracy',
          accentNote: (n, pct, lenient) => `${n} more differed only in accent (${pct}%); ${lenient}% if counted half-right`,
          sessions: 'rounds',
          settings: 'Settings',
          level: 'Level',
          kinds: 'Question types',
          tenses: 'Tenses',
          size: 'Questions per round',
          explainToggle: 'Explain mistakes with the model',
          reset: 'Reset progress',
          resetConfirm: 'Clear all learning progress? This cannot be undone.',
          resetDone: 'Cleared',
          noun: 'Noun',
          verb: 'Verb',
          person: 'Person',
          tense: 'Tense',
          plural: 'Plural',
          gender: 'Gender',
          masculine: 'Masculine',
          feminine: 'Feminine',
          empty: 'No questions yet',
          error: 'Something went wrong',
          retry: 'Retry',
          tabPractice: 'Practice',
          tabBrowse: 'Lookup',
          tabStats: 'Progress',
          lookupHint: 'Type a verb or noun to look up',
          lookup: 'Look up',
          noResult: 'Not found',
          notAVerb: 'Not an infinitive (should end in -ar/-er/-ir)',
          loadingMore: 'Building questions…',
          progressLine: (a, b) => `Question ${a} of ${b}`,
          allDone: 'All done',
          streak: 'Streak',
          learnBtn: 'Teach me',
          revealBtn: 'Show answer',
          teaching: 'Generating explanation…',
          teachDegraded: 'Model unavailable — showing the answer instead',
          revealed: 'Answer revealed',
          modelFollow: "Follow DSH's current model",
          modelCustom: 'Use a specific model',
          modelTitle: 'Which model explains',
          modelHint: 'Leave empty to follow the model you picked in DSH',
          teachMode: 'Learning mode',
          teachLearn: 'Learn first',
          teachReveal: 'Answer only',
          teachOff: 'No explanation',
          ruleLabel: 'Rule',
          scenarioTitle: 'Write a sentence',
          scenarioHint: 'Write one Spanish sentence for this situation',
          scenarioSubmit: 'Submit for review',
          scenarioNext: 'Another situation',
          scenarioPlaceholder: 'Write in Spanish here…',
          scenarioGrading: 'Reviewing…',
          verdictCorrect: 'Correct',
          verdictPartial: 'Almost — some fixes',
          verdictWrong: 'Not right yet',
        };

    // ─────────────────────────── 样式 ───────────────────────────
    // 用宿主已有的 --dsw-* 主题变量，不硬编码颜色，自动跟随明暗主题。
    const CSS = `
.dsh-es-panel {
  display: flex; flex-direction: column; height: 100%; min-height: 0;
  width: 100%; max-width: 900px; margin: 0 auto; box-sizing: border-box;
  padding: 14px 20px 0;
  font-size: 13px; color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-bg-primary, transparent);
  overflow: hidden;
}
.dsh-es-head {
  display: flex; align-items: center; gap: 8px;
  padding: 0 0 10px; border-bottom: 1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,.2));
  flex: 0 0 auto;
}
.dsh-es-title { font-weight: 600; font-size: 14px; }
.dsh-es-tabs { display: flex; gap: 4px; margin-left: auto; }
.dsh-es-tab {
  padding: 3px 9px; border-radius: 6px; border: none; cursor: pointer;
  background: transparent; color: var(--dsw-alias-label-secondary, inherit);
  font-size: 12px;
}
.dsh-es-tab[data-active="1"] {
  background: var(--dsw-alias-bg-tertiary, rgba(128,128,128,.14));
  color: var(--dsw-alias-label-primary, inherit);
}
.dsh-es-close { margin-left: 4px; }
.dsh-es-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px 0 18px; }
.dsh-es-card {
  border: 1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,.25));
  border-radius: 10px; padding: 14px; margin-bottom: 10px;
  background: var(--dsw-alias-bg-secondary, rgba(128,128,128,.04));
}
.dsh-es-prompt { font-size: 18px; font-weight: 600; margin-bottom: 4px; word-break: break-word; }
.dsh-es-sub { font-size: 12px; color: var(--dsw-alias-label-secondary, rgba(128,128,128,.9)); margin-bottom: 10px; }
.dsh-es-accent { color: var(--dsw-alias-brand-primary, #2f9e6e); font-weight: 600; }
.dsh-es-input {
  width: 100%; box-sizing: border-box; padding: 8px 10px; font-size: 15px;
  border: 1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,.35));
  border-radius: 8px; background: var(--dsw-alias-bg-primary, transparent);
  color: var(--dsw-alias-label-primary, inherit); outline: none;
}
.dsh-es-input:focus { border-color: var(--dsw-alias-brand-primary, #2f9e6e); }
.dsh-es-row { display: flex; gap: 8px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
.dsh-es-btn {
  padding: 6px 14px; border-radius: 7px; cursor: pointer; font-size: 13px;
  border: 1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,.35));
  background: var(--dsw-alias-bg-primary, transparent);
  color: var(--dsw-alias-label-primary, inherit);
}
.dsh-es-btn:hover:not(:disabled) { border-color: var(--dsw-alias-brand-primary, #2f9e6e); }
.dsh-es-btn:disabled { opacity: .5; cursor: default; }
.dsh-es-btn-primary {
  background: var(--dsw-alias-brand-primary, #2f9e6e); color: #fff;
  border-color: transparent;
}
.dsh-es-btn-primary:hover:not(:disabled) { opacity: .9; }
.dsh-es-feedback { margin-top: 12px; padding: 10px; border-radius: 8px; font-size: 13px; line-height: 1.55; }
.dsh-es-feedback[data-result="correct"] { background: rgba(47,158,110,.12); border: 1px solid rgba(47,158,110,.4); }
.dsh-es-feedback[data-result="accent"]  { background: rgba(230,160,40,.12);  border: 1px solid rgba(230,160,40,.4); }
.dsh-es-feedback[data-result="wrong"]   { background: rgba(220,80,80,.12);   border: 1px solid rgba(220,80,80,.4); }
.dsh-es-feedback[data-result="revealed"] { background: rgba(120,140,220,.12); border: 1px solid rgba(120,140,220,.45); }
.dsh-es-teach {
  margin: 10px 0; padding: 10px; border-radius: 8px;
  background: rgba(120,160,220,.10);
  border: 1px solid rgba(120,160,220,.35);
  font-size: 12.5px; line-height: 1.65;
}
.dsh-es-teach-body { white-space: pre-wrap; }
.dsh-es-answer-line { margin-top: 4px; }
.dsh-es-review {
  padding: 10px 0; border-bottom: 1px dashed rgba(128,128,128,.28);
}
.dsh-es-review:last-child { border-bottom: none; padding-bottom: 0; }
.dsh-es-review-q { font-size: 14px; font-weight: 600; word-break: break-word; }
.dsh-es-review-sub { font-size: 12px; color: var(--dsw-alias-label-secondary, rgba(128,128,128,.9)); margin: 2px 0 2px; }
.dsh-es-wrong-text { color: #dc5050; font-weight: 600; }
.dsh-es-explanation { margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(128,128,128,.3); white-space: pre-wrap; }
.dsh-es-progressbar { height: 4px; border-radius: 2px; background: rgba(128,128,128,.25); overflow: hidden; margin-bottom: 12px; }
.dsh-es-progressbar > div { height: 100%; background: var(--dsw-alias-brand-primary, #2f9e6e); transition: width .25s; }
.dsh-es-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.dsh-es-stat {
  border: 1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,.25));
  border-radius: 8px; padding: 10px; text-align: center;
}
.dsh-es-stat-num { font-size: 20px; font-weight: 600; }
.dsh-es-stat-label { font-size: 11px; color: var(--dsw-alias-label-secondary, rgba(128,128,128,.9)); margin-top: 2px; }
.dsh-es-field { margin-bottom: 12px; }
.dsh-es-field-label { font-size: 12px; margin-bottom: 5px; color: var(--dsw-alias-label-secondary, rgba(128,128,128,.9)); }
.dsh-es-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-es-chip {
  padding: 4px 10px; border-radius: 12px; font-size: 12px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,.35));
  background: transparent; color: var(--dsw-alias-label-secondary, inherit);
}
.dsh-es-chip[data-on="1"] {
  background: var(--dsw-alias-brand-primary, #2f9e6e); color: #fff; border-color: transparent;
}
.dsh-es-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.dsh-es-table th, .dsh-es-table td {
  padding: 5px 6px; text-align: left;
  border-bottom: 1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,.18));
}
.dsh-es-table th { font-weight: 600; color: var(--dsw-alias-label-secondary, inherit); }
.dsh-es-muted { color: var(--dsw-alias-label-secondary, rgba(128,128,128,.9)); font-size: 12px; }
.dsh-es-err { color: #dc5050; font-size: 12px; margin-top: 8px; }
`;

    // ─────────────────────────── 数据层 ───────────────────────────

    async function api(path, options) {
      const res = await fetch(API + path, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || (json && json.ok === false)) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      return json;
    }

    // ─────────────────────────── 小组件 ───────────────────────────

    /**
     * 西语旗标。
     *
     * 不用国旗表情符号：Windows 没有国旗字形，区域指示符会被渲染成 "ES" 两个字母，
     * 在侧栏和胶囊里都很难看。SVG 在哪个平台都一样。
     */
    function FlagIcon(props) {
      const size = typeof props?.size === 'number' && props.size > 0 ? props.size : 16;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          'aria-hidden': 'true',
          focusable: 'false',
          style: { display: 'block', flex: '0 0 auto' },
        },
        h('rect', { x: 1.5, y: 3.5, width: 13, height: 9, rx: 1.5, fill: '#c60b1e' }),
        h('rect', { x: 1.5, y: 6, width: 13, height: 4, fill: '#ffc400' }),
      );
    }

    function Stat(props) {
      return h(
        'div',
        { className: 'dsh-es-stat' },
        h('div', { className: 'dsh-es-stat-num' }, String(props.value)),
        h('div', { className: 'dsh-es-stat-label' }, props.label),
      );
    }

    function Chips(props) {
      return h(
        'div',
        { className: 'dsh-es-chips' },
        props.options.map((opt) =>
          h(
            'button',
            {
              key: opt.id,
              type: 'button',
              className: 'dsh-es-chip',
              'data-on': props.selected.includes(opt.id) ? '1' : '0',
              onClick: () => props.onToggle(opt.id),
            },
            opt.label,
          ),
        ),
      );
    }

    // ─────────────────────────── 练习页 ───────────────────────────

    /**
     * 把一个选项归一成 { value, label }。
     *
     * 选项有两种来源格式，形状不一样：
     *   { value, label }  阴阳性题 —— value 就是答案本体（'m' / 'f'）
     *   { id, text }      认词 / 语法题 —— **id 只是序号（"0"、"1"），答案是 text**
     *
     * 关键：不能按「value ?? id ?? text」的顺序回退。认词题没有 value，
     * 回退到 id 就拿到 "0"，点「repetir」提交的是序号而不是单词，判分永远错
     * （而且模型会把 "0" 解释成"等于没作答"）。
     * 所以要显式判断字段组合，而不是看哪个先有值。
     */
    function normalizeChoice(c) {
      if (c === null || typeof c !== 'object') return { value: String(c ?? ''), label: String(c ?? '') };
      // {value,label}：value 是答案，label 是展示文案（可能带说明）
      if (c.value !== undefined) return { value: String(c.value), label: String(c.label ?? c.value) };
      // {id,text}：text 才是答案，id 只用于 key
      if (c.text !== undefined) return { value: String(c.text), label: String(c.text) };
      // 兜底：只有 id 的畸形数据，至少别把它当答案交给判分
      return { value: String(c.id ?? ''), label: String(c.label ?? c.id ?? '') };
    }

    /**
     * 把一次按键解析成「第几个选项」，解析不出来返回 -1。
     *
     * 抽成纯函数是为了能真测：组件本身没导出，按键逻辑埋在闭包里就测不到。
     * 规则：数字 1..9，或字母 a..i（有人习惯按键盘位置而不看标签）。
     */
    function pickIndexFromKey(key, optionCount) {
      if (typeof key !== 'string' || !Number.isFinite(optionCount) || optionCount <= 0) return -1;
      let pick = -1;
      if (/^[1-9]$/.test(key)) pick = Number(key) - 1;
      else if (/^[a-i]$/i.test(key)) pick = key.toLowerCase().charCodeAt(0) - 97;
      return pick >= 0 && pick < optionCount ? pick : -1;
    }

    /**
     * 这题答错后，要不要在本轮末尾再问一次。
     *
     * 抽成纯函数是为了能真测（组件没导出，埋在闭包里测不到）。
     *
     * 规则：真错（wrong）才重出；accent（只差重音）不重出 ——
     * 和 SRS 的 nextLevel() 口径一致，那边 accent 是"不升不降"。
     * 每题最多一次：already 里有的不再重排，否则答错 → 重出 → 再答错 会无限循环。
     *
     * @param {{result?:string}|null} feedback 判分结果
     * @param {string|undefined} questionId 当前题 id
     * @param {Iterable<string>} already 本轮已经重出过的 id
     * @returns {boolean}
     */
    function shouldRequeue(questionId, result, already) {
      if (result !== 'wrong') return false;
      if (typeof questionId !== 'string' || questionId === '') return false;
      const seen = already ?? [];
      for (const id of seen) if (id === questionId) return false;
      return true;
    }

    function PracticeTab() {
      const [questions, setQuestions] = useState([]);
      const [index, setIndex] = useState(0);
      const [given, setGiven] = useState('');
      const [feedback, setFeedback] = useState(null);
      const [teach, setTeach] = useState(null);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState(null);
      const [score, setScore] = useState({ correct: 0, accent: 0, wrong: 0 });
      // 本轮答错的题：结算页用来回看，也用来决定哪些要重出
      const [wrongList, setWrongList] = useState([]);
      const inputRef = useRef(null);
      const boxRef = useRef(null);
      // 已经重出过一次的题 id —— 每题最多重出一次，否则答错会无限循环
      const requeuedRef = useRef(new Set());

      const current = questions[index];

      const startRound = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
          const data = await api('/session', { method: 'POST', body: JSON.stringify({}) });
          setQuestions(data.questions || []);
          setIndex(0);
          setGiven('');
          setFeedback(null);
          setTeach(null);
          setScore({ correct: 0, accent: 0, wrong: 0 });
          setWrongList([]);
          requeuedRef.current = new Set();
        } catch (err) {
          setError(String(err?.message ?? err));
        } finally {
          setBusy(false);
        }
      }, []);

      // 首次进入自动出一局
      useEffect(() => {
        if (questions.length === 0 && !busy && error === null) void startRound();
      }, []); // eslint-disable-line react-hooks/exhaustive-deps

      // 每题自动聚焦：
      //   文本题 → 输入框
      //   选择题 → **卡片容器**（选择题不渲染输入框，以前这里拿到 null，
      //            于是整道题键盘全废，连 Enter 都不响应）
      useEffect(() => {
        if (current === undefined || feedback !== null) return;
        if (Array.isArray(current.choices)) {
          if (boxRef.current) boxRef.current.focus();
        } else if (inputRef.current) {
          inputRef.current.focus();
        }
      }, [index, feedback, current]);

      const submit = useCallback(async () => {
        if (current === undefined || given.trim() === '' || busy) return;
        setBusy(true);
        setError(null);
        try {
          const data = await api('/answer', {
            method: 'POST',
            body: JSON.stringify({ question: current, given }),
          });
          setFeedback(data);
          setScore((s) => ({
            correct: s.correct + (data.result === 'correct' ? 1 : 0),
            accent: s.accent + (data.result === 'accent' ? 1 : 0),
            wrong: s.wrong + (data.result === 'wrong' ? 1 : 0),
          }));
          // 只把「真错」记进错题表。
          // accent（只差重音）不算 —— 和 SRS 的 nextLevel() 一致：
          // 那边 accent 是不升不降，不当作不会这个词。
          if (data.result === 'wrong') {
            setWrongList((list) =>
              list.some((x) => x.id === current.id)
                ? list
                : [...list, {
                    id: current.id,
                    question: current,
                    expected: data.answer,
                    given: String(data.given ?? given),
                  }],
            );
          }
        } catch (err) {
          setError(String(err?.message ?? err));
        } finally {
          setBusy(false);
        }
      }, [current, given, busy]);

      /**
       * 答错后把这道题追加到本轮末尾，但每题最多一次。
       *
       * 为什么值得：现在答错只影响下一轮（SRS 退两级），
       * 而「刚答错的词隔几道题再问一次」正是短时记忆的关键窗口。
       *
       * 防死循环：requeuedRef 记录已经重出过的 id，第二次答错不再重排。
       * 用 ref 而不是 state，因为它只是个守卫，不该触发重渲染。
       */
      const advance = useCallback(() => {
        const last = questions[index];
        const requeue =
          last !== undefined &&
          shouldRequeue(last.id, feedback?.result, requeuedRef.current);

        if (requeue) {
          requeuedRef.current.add(last.id);
          setQuestions((qs) => [...qs, last]);
        }

        setFeedback(null);
        setGiven('');
        setTeach(null);
        setIndex((i) => i + 1);
      }, [questions, index, feedback]);

      // ── 「学」：讲清这个知识点 ──
      // 这是本来缺的那一步：原来只有练，答错才知道规则。
      const doTeach = useCallback(async () => {
        if (current === undefined || busy) return;
        setBusy(true);
        setError(null);
        setTeach({ loading: true });
        try {
          const data = await api('/teach', {
            method: 'POST',
            body: JSON.stringify({ question: current }),
          });
          setTeach({
            loading: false,
            answer: data.answer,
            content: data.content,
            degraded: data.degraded,
            notice: data.notice,
            model: data.model,
          });
        } catch (err) {
          setTeach(null);
          setError(String(err?.message ?? err));
        } finally {
          setBusy(false);
        }
      }, [current, busy]);

      // ── 「看答案」：卡住时直接揭晓 ──
      const reveal = useCallback(async () => {
        if (current === undefined || busy) return;
        setBusy(true);
        setError(null);
        try {
          const data = await api('/reveal', {
            method: 'POST',
            body: JSON.stringify({ question: current, detail: false }),
          });
          setFeedback({
            result: 'revealed',
            expected: data.answer,
            given: given,
            explanation: data.content,
          });
        } catch (err) {
          setError(String(err?.message ?? err));
        } finally {
          setBusy(false);
        }
      }, [current, given, busy]);

      // 键盘：回车提交 / 下一题
      const onKeyDown = useCallback(
        (ev) => {
          if (ev.key !== 'Enter') return;
          ev.preventDefault();
          if (feedback !== null) advance();
          else void submit();
        },
        [feedback, advance, submit],
      );

      /**
       * 选择题的键盘操作。
       *
       * 选择题**不渲染输入框**，所以 onKeyDown（挂在 input 上）根本不触发 ——
       * 以前做选择题时键盘完全用不了，连 Enter 都不行，只能一直摸鼠标。
       * 这里把监听挂到整个题目卡片容器上：
       *   - 数字键 1..9 选第 N 个选项
       *   - 字母键 a/b/c/d 也行（有人习惯按键位而不是数字）
       *   - Enter：没选就选中的那个再按一次 = 提交；已有结果 = 下一题
       */
      const onChoiceKeyDown = useCallback(
        (ev) => {
          // 别抢输入类元素的键，也放过带修饰键的组合（Ctrl+R 之类）
          if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
          const target = ev.target;
          const tag = String(target?.tagName ?? '').toLowerCase();
          if (tag === 'input' || tag === 'textarea') return;

          if (ev.key === 'Enter') {
            ev.preventDefault();
            if (feedback !== null) advance();
            else void submit();
            return;
          }

          const q = current;
          if (q === undefined || !Array.isArray(q.choices) || feedback !== null) return;

          const pick = pickIndexFromKey(ev.key, q.choices.length);
          if (pick < 0) return;

          ev.preventDefault();
          const { value } = normalizeChoice(q.choices[pick]);
          setGiven(String(value));
        },
        [current, feedback, advance, submit],
      );

      if (error !== null && questions.length === 0) {
        return h(
          'div',
          null,
          h('div', { className: 'dsh-es-err' }, `${T.error}：${error}`),
          h('div', { className: 'dsh-es-row' }, h('button', { className: 'dsh-es-btn', onClick: startRound }, T.retry)),
        );
      }

      if (questions.length === 0) {
        return h('div', { className: 'dsh-es-muted' }, busy ? T.loadingMore : T.loading);
      }

      // 全部做完
      if (index >= questions.length) {
        // 作答次数 = 三道计数之和（重出的题会各算一次），
        // 而「做对了多少」按首次作答口径看 score.correct。
        const attempts = score.correct + score.accent + score.wrong;
        return h(
          'div',
          null,
          h('div', { className: 'dsh-es-card' },
            h('div', { className: 'dsh-es-prompt' }, T.finish),
            h('div', { className: 'dsh-es-sub' },
              `${T.score}：${score.correct} / ${attempts}${attempts !== questions.length ? `（${T.attempts} ${attempts}）` : ''}`,
            ),
            score.accent > 0
              ? h('div', { className: 'dsh-es-muted', style: { marginTop: -4, marginBottom: 8 } },
                  `${T.accent}：${score.accent}`)
              : null,
            h('div', { className: 'dsh-es-row' },
              h('button', { className: 'dsh-es-btn dsh-es-btn-primary', onClick: startRound, disabled: busy }, T.again),
            ),
          ),

          // 错题回看：做完 10 题最想看的正是「我刚才错了哪几个」。
          // 以前这里只有一个 7/10，对完就没了。
          wrongList.length > 0
            ? h('div', { className: 'dsh-es-card' },
                h('div', { className: 'dsh-es-sub', style: { marginBottom: 10 } },
                  `${T.wrongTitle} · ${T.wrongCount(wrongList.length)}`),
                ...wrongList.map((item) =>
                  h('div', {
                    key: item.id,
                    className: 'dsh-es-review',
                  },
                    h('div', { className: 'dsh-es-review-q' }, promptOf(item.question)),
                    h('div', { className: 'dsh-es-review-sub' }, describeQuestion(item.question, T)),
                    h('div', { className: 'dsh-es-answer-line' },
                      h('span', { className: 'dsh-es-muted' }, `${T.yourAnswer}：`),
                      h('span', { className: 'dsh-es-wrong-text' }, item.given || '—'),
                    ),
                    h('div', { className: 'dsh-es-answer-line' },
                      h('span', { className: 'dsh-es-muted' }, `${T.answerIs}：`),
                      h('span', { className: 'dsh-es-accent' }, item.expected),
                    ),
                    // 语法题自带规则，零延迟可读，不依赖模型
                    item.question?.rule
                      ? h('div', { className: 'dsh-es-muted', style: { marginTop: 6 } },
                          `${T.ruleLabel}：${item.question.rule}`)
                      : null,
                  ),
                ),
              )
            : h('div', { className: 'dsh-es-muted' }, T.noWrong),
        );
      }

      const q = current;
      const isChoice = Array.isArray(q.choices);

      return h(
        'div',
        null,
        h('div', { className: 'dsh-es-progressbar' },
          h('div', { style: { width: `${((index) / questions.length) * 100}%` } }),
        ),
        h('div', { className: 'dsh-es-muted', style: { marginBottom: 8 } },
          T.progressLine(index + 1, questions.length),
        ),

        h('div', {
          className: 'dsh-es-card',
          ref: boxRef,
          // 选择题没有输入框，键盘监听必须挂在容器上（见 onChoiceKeyDown）。
          // tabIndex 让容器本身可聚焦，这样点进面板后按键就能被它收到。
          tabIndex: isChoice ? 0 : -1,
          onKeyDown: isChoice ? onChoiceKeyDown : undefined,
          style: isChoice ? { outline: 'none' } : null,
        },
          // 题干：变位题显示动词原形，名词题显示名词，填空/语法题显示带 ___ 的句子
          h('div', {
            className: 'dsh-es-prompt',
            // 句子类题干较长，用小一号字体，避免撑破面板
            style: (q.kind === 'cloze' || q.kind === 'grammar') ? { fontSize: 15, lineHeight: 1.6 } : null,
          }, promptOf(q)),
          h('div', { className: 'dsh-es-sub' }, describeQuestion(q, T)),

          // 中文翻译（填空/语法题有，帮助学生理解语境）
          q.zh
            ? h('div', { className: 'dsh-es-muted', style: { marginTop: 4, marginBottom: 8 } }, q.zh)
            : null,

          // 变位填空：提示该用哪个动词的什么形式
          q.verb
            ? h('div', { className: 'dsh-es-muted', style: { marginBottom: 8 } },
                `提示：${q.verb} · ${q.tense} · ${q.person}`)
            : null,

          // 语法题的 hint（冠词/介词类的规则线索）
          q.hint && q.kind !== 'cloze'
            ? h('div', { className: 'dsh-es-muted', style: { marginBottom: 8 } }, q.hint)
            : null,

          // 「先学」区块：答题前可以点开看讲解
          teach !== null
            ? h('div', { className: 'dsh-es-teach' },
                teach.loading
                  ? h('div', { className: 'dsh-es-muted' }, T.teaching)
                  : h('div', null,
                      teach.degraded
                        ? h('div', { className: 'dsh-es-muted', style: { marginBottom: 6 } }, teach.notice || T.teachDegraded)
                        : null,
                      teach.content !== null && teach.content !== undefined
                        ? h('div', { className: 'dsh-es-teach-body' }, teach.content)
                        : null,
                      teach.answer
                        ? h('div', { className: 'dsh-es-answer-line', style: { marginTop: 8 } },
                            h('span', { className: 'dsh-es-muted' }, `${T.answerIs}：`),
                            h('span', { className: 'dsh-es-accent' }, teach.answer),
                          )
                        : null,
                    ),
              )
            : null,

          isChoice
            ? h('div', { className: 'dsh-es-row', style: { marginTop: 0 } },
                q.choices.map((c, i) => {
                  // 选项两种格式都由 normalizeChoice 归一，value 一定是答案本体
                  const { value, label } = normalizeChoice(c);
                  const picked = String(given) === String(value);
                  return h('button', {
                    key: String(c?.id ?? value),
                    type: 'button',
                    className: `dsh-es-btn${picked ? ' dsh-es-btn-primary' : ''}`,
                    // 前 9 个标出快捷键，让「按数字」这件事是可发现的
                    title: i < 9 ? `快捷键：${i + 1}` : null,
                    onClick: () => { if (feedback === null) setGiven(String(value)); },
                    disabled: feedback !== null,
                  }, i < 9 ? `${i + 1}. ${label}` : label);
                }),
              )
            : h('input', {
                ref: inputRef,
                className: 'dsh-es-input',
                value: given,
                placeholder: q.kind === 'plural' ? T.plural : '…',
                onChange: (ev) => setGiven(ev.target.value),
                onKeyDown,
                disabled: feedback !== null,
                autoComplete: 'off',
                autoCapitalize: 'off',
                spellCheck: false,
              }),

          h('div', { className: 'dsh-es-row' },
            feedback === null
              ? h('button', {
                  className: 'dsh-es-btn dsh-es-btn-primary',
                  onClick: submit,
                  disabled: busy || given.trim() === '',
                }, busy ? T.loading : T.check)
              : h('button', { className: 'dsh-es-btn dsh-es-btn-primary', onClick: advance }, T.next),

            // 「学」按钮：答题前随时可以看讲解
            feedback === null && teach === null
              ? h('button', {
                  className: 'dsh-es-btn',
                  onClick: doTeach,
                  disabled: busy || teach !== null,
                }, busy ? T.loading : T.learnBtn)
              : null,

            // 「看答案」：卡住时直接揭晓
            feedback === null
              ? h('button', {
                  className: 'dsh-es-btn',
                  onClick: reveal,
                  disabled: busy,
                }, T.revealBtn)
              : null,
          ),

          error !== null ? h('div', { className: 'dsh-es-err' }, error) : null,

          feedback !== null ? h(FeedbackBlock, { feedback, t: T, question: q }) : null,
        ),
      );
    }

    /** 题干显示什么。 */
    function promptOf(q) {
      if (q.kind === 'conjugation') return q.infinitive ?? '';
      if (q.kind === 'gender' || q.kind === 'plural') return q.noun ?? '';
      if (q.kind === 'agreement') return `${q.noun} + ${q.adjective}`;
      // cloze / grammar：句子本身
      if (q.prompt) return q.prompt;
      if (q.kind === 'vocab') return q.word ?? q.prompt ?? '';
      return q.prompt ?? '';
    }

    function describeQuestion(q, t) {
      if (q.kind === 'conjugation') {
        return `${q.tense} · ${q.personLabel ?? q.person ?? ''}`;
      }
      if (q.kind === 'gender') return t.gender;
      if (q.kind === 'plural') return t.plural;
      if (q.kind === 'agreement') return `${q.noun} + ${q.adjective} (${q.gender} ${q.number})`;
      // 新题型：显示题型名（认词 / 变位填空 / 冠词填空 / ser-estar…）
      if (q.kind === 'vocab') {
        return q.kindLabel + (q.direction === 'zh2es' ? ' · 中→西' : ' · 西→中');
      }
      if (q.kind === 'cloze' || q.kind === 'grammar') {
        return q.kindLabel ?? '';
      }
      return '';
    }

    function FeedbackBlock(props) {
      const { feedback, t, question } = props;
      const result = feedback.result;
      const label = result === 'correct'
        ? t.correct
        : result === 'accent'
          ? t.accent
          : result === 'revealed'
            ? t.revealed
            : t.wrong;

      // 语法题自带 rule：答错时即使模型不可用，也能看懂为什么。
      // 这是刻意的 —— 不把学习完全押在模型上。
      const localRule = question?.rule ?? null;

      return h(
        'div',
        { className: 'dsh-es-feedback', 'data-result': result },
        h('div', { style: { fontWeight: 600 } }, label),
        result !== 'correct'
          ? h('div', { className: 'dsh-es-answer-line' },
              h('span', { className: 'dsh-es-muted' }, `${t.answerIs}：`),
              h('span', { className: 'dsh-es-accent' }, feedback.expected),
            )
          : null,
        feedback.given !== undefined && result === 'wrong'
          ? h('div', { className: 'dsh-es-answer-line' },
              h('span', { className: 'dsh-es-muted' }, `${t.yourAnswer}：`),
              h('span', null, feedback.given || '—'),
            )
          : null,
        // 本地规则优先展示（零延迟、不依赖模型）
        localRule !== null && result !== 'correct'
          ? h('div', { className: 'dsh-es-explanation' },
              h('div', { className: 'dsh-es-muted', style: { marginBottom: 4 } }, `${t.ruleLabel}：`),
              localRule,
            )
          : null,
        feedback.explanation
          ? h('div', { className: 'dsh-es-explanation' },
              h('div', { className: 'dsh-es-muted', style: { marginBottom: 4 } }, `${t.why}：`),
              feedback.explanation,
            )
          : null,
      );
    }

    // ─────────────────────────── 查表页 ───────────────────────────

    function LookupTab() {
      const [word, setWord] = useState('');
      const [result, setResult] = useState(null);
      const [error, setError] = useState(null);
      const [busy, setBusy] = useState(false);

      const doLookup = useCallback(async () => {
        const w = word.trim();
        if (w === '') return;
        setBusy(true);
        setError(null);
        setResult(null);
        try {
          // 先试动词，失败再试名词
          try {
            const table = await api(`/table?verb=${encodeURIComponent(w)}`);
            setResult({ kind: 'verb', data: table });
          } catch {
            const noun = await api(`/noun?word=${encodeURIComponent(w)}`);
            setResult({ kind: 'noun', data: noun });
          }
        } catch (err) {
          setError(`${T.noResult}：${String(err?.message ?? err)}`);
        } finally {
          setBusy(false);
        }
      }, [word]);

      return h(
        'div',
        null,
        h('div', { className: 'dsh-es-field' },
          h('div', { className: 'dsh-es-field-label' }, T.lookupHint),
          h('div', { className: 'dsh-es-row', style: { marginTop: 0 } },
            h('input', {
              className: 'dsh-es-input',
              value: word,
              onChange: (ev) => setWord(ev.target.value),
              onKeyDown: (ev) => { if (ev.key === 'Enter') void doLookup(); },
              placeholder: 'hablar / casa',
              autoComplete: 'off',
              spellCheck: false,
            }),
          ),
          h('div', { className: 'dsh-es-row' },
            h('button', { className: 'dsh-es-btn dsh-es-btn-primary', onClick: doLookup, disabled: busy || word.trim() === '' },
              busy ? T.loading : T.lookup),
          ),
        ),

        error !== null ? h('div', { className: 'dsh-es-err' }, error) : null,

        result?.kind === 'verb' ? h(VerbTable, { data: result.data }) : null,
        result?.kind === 'noun' ? h(NounCard, { data: result.data }) : null,
      );
    }

    function VerbTable(props) {
      const { data } = props;
      const tenses = data.tenses ?? [];
      // 只显示有内容的时态（全表很长，默认展示最常用的几个）
      const common = ['presente', 'preterito', 'imperfecto', 'futuro', 'subjuntivo'];
      const shown = tenses.filter((t) => common.includes(t.id));
      const rest = tenses.filter((t) => !common.includes(t.id));
      const [showAll, setShowAll] = useState(false);
      const list = showAll ? tenses : shown;

      return h(
        'div',
        { className: 'dsh-es-card' },
        h('div', { className: 'dsh-es-prompt' }, data.verb),
        h('div', { className: 'dsh-es-sub' },
          `${data.participlo} · ${data.gerundio}`,
        ),
        h('table', { className: 'dsh-es-table' },
          h('thead', null,
            h('tr', null,
              h('th', null, T.tense),
              (data.personLabels
                ? data.persons.map((p) => h('th', { key: p }, p))
                : ['1s', '2s', '3s', '1p', '2p', '3p'].map((p) => h('th', { key: p }, p))),
            ),
          ),
          h('tbody', null,
            list.map((t) =>
              h('tr', { key: t.id },
                h('td', { style: { whiteSpace: 'nowrap' } }, t.id),
                (data.table[t.id] ?? []).map((form, i) => h('td', { key: i }, form)),
              ),
            ),
          ),
        ),
        rest.length > 0
          ? h('div', { className: 'dsh-es-row' },
              h('button', { className: 'dsh-es-btn', onClick: () => setShowAll((v) => !v) },
                showAll ? '收起' : `展开全部 ${tenses.length} 个时态`),
            )
          : null,
      );
    }

    function NounCard(props) {
      const { data } = props;
      return h(
        'div',
        { className: 'dsh-es-card' },
        h('div', { className: 'dsh-es-prompt' }, data.singular),
        h('div', { className: 'dsh-es-sub' },
          `${data.gender === 'f' ? T.feminine : data.gender === 'm' ? T.masculine : '?'}`,
        ),
        h('table', { className: 'dsh-es-table' },
          h('tbody', null,
            h('tr', null, h('td', null, '单数'), h('td', null, `${data.definite} ${data.singular}`), h('td', null, `${data.indefinite} ${data.singular}`)),
            h('tr', null, h('td', null, '复数'), h('td', null, `${data.definitePl} ${data.plural}`), h('td', null, `${data.indefinitePl} ${data.plural}`)),
          ),
        ),
        data.stressedA
          ? h('div', { className: 'dsh-es-muted', style: { marginTop: 8 } },
              '注意：以重读 a 开头，单数用 el/un，但形容词仍是阴性。')
          : null,
      );
    }

    // ─────────────────────────── 模型选择器 ───────────────────────────

    /**
     * 选「讲解用哪个模型」。
     *
     * 默认跟随 DSH 当前选的模型（留空），也可以指定别的 ——
     * 比如主对话用大模型，讲解用便宜的小模型。
     */
    function ModelPicker(props) {
      const { settings, onSave, t } = props;
      const [providers, setProviders] = useState(null);
      const [current, setCurrent] = useState(null);
      const [useCustom, setUseCustom] = useState(Boolean(settings.llmProvider && settings.llmModel));
      const [err, setErr] = useState(null);

      useEffect(() => {
        let alive = true;
        (async () => {
          try {
            const data = await api('/models');
            if (!alive) return;
            setProviders(data.providers ?? []);
            setCurrent(data.current ?? null);
          } catch (e) {
            if (alive) {
              setProviders([]);
              setErr(String(e?.message ?? e));
            }
          }
        })();
        return () => { alive = false; };
      }, [settings.llmProvider, settings.llmModel]);

      const currentLabel = current === null
        ? '—'
        : `${current.provider} / ${current.model}`;

      if (providers === null) {
        return h('div', { className: 'dsh-es-muted' }, t.loading);
      }

      const chosenProvider = providers.find((p) => p.provider === settings.llmProvider);

      return h(
        'div',
        null,
        h('div', { className: 'dsh-es-muted', style: { marginBottom: 6 } },
          `${t.modelFollow}：${currentLabel}`),

        h('div', { className: 'dsh-es-chips', style: { marginBottom: 8 } },
          h('button', {
            className: 'dsh-es-chip',
            'data-on': useCustom ? '0' : '1',
            onClick: () => {
              setUseCustom(false);
              void onSave({ llmProvider: '', llmModel: '' });
            },
          }, t.modelFollow),
          h('button', {
            className: 'dsh-es-chip',
            'data-on': useCustom ? '1' : '0',
            onClick: () => setUseCustom(true),
            disabled: providers.length === 0,
          }, t.modelCustom),
        ),

        useCustom && providers.length > 0
          ? h('div', null,
              h('select', {
                className: 'dsh-es-input',
                style: { marginBottom: 6, fontSize: 12 },
                value: settings.llmProvider,
                onChange: (ev) => {
                  const p = ev.target.value;
                  const first = providers.find((x) => x.provider === p)?.models?.[0]?.id ?? '';
                  void onSave({ llmProvider: p, llmModel: first });
                },
              },
                h('option', { value: '' }, '— 选择 provider —'),
                providers.map((p) => h('option', { key: p.provider, value: p.provider }, p.name || p.provider)),
              ),
              chosenProvider
                ? h('select', {
                    className: 'dsh-es-input',
                    style: { fontSize: 12 },
                    value: settings.llmModel,
                    onChange: (ev) => void onSave({ llmModel: ev.target.value }),
                  },
                    (chosenProvider.models ?? []).map((m) => h('option', { key: m.id, value: m.id }, m.name || m.id)),
                  )
                : null,
            )
          : providers.length === 0
            ? h('div', { className: 'dsh-es-muted' },
                err ? `${t.error}：${err}` : '没有可用的模型列表，将跟随 DSH 当前模型')
            : null,
      );
    }

    // ─────────────────────────── 情景造句页 ───────────────────────────

    /**
     * 全模型题型：给一个场景，学生写句子，模型批改。
     *
     * 和练习页的区别：没有选项、没有标准答案，
     * 判分完全靠模型 —— 所以界面上要如实说明这一点。
     */
    function ScenarioTab() {
      const [task, setTask] = useState(null);
      const [answer, setAnswer] = useState('');
      const [result, setResult] = useState(null);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState(null);
      const [notice, setNotice] = useState(null);
      const boxRef = useRef(null);

      const newTask = useCallback(async () => {
        setBusy(true);
        setError(null);
        setResult(null);
        setAnswer('');
        setNotice(null);
        try {
          const data = await api('/scenario', { method: 'POST', body: JSON.stringify({}) });
          if (data.degraded) {
            setTask(null);
            setNotice(data.notice ?? T.teachDegraded);
          } else {
            setTask({
              scenario: data.scenario,
              task: data.task?.task ?? '',
              hints: data.task?.hints ?? [],
              refToken: data.refToken,
            });
          }
        } catch (err) {
          setError(String(err?.message ?? err));
        } finally {
          setBusy(false);
        }
      }, []);

      useEffect(() => {
        if (task === null && !busy && error === null && notice === null) void newTask();
      }, []); // eslint-disable-line react-hooks/exhaustive-deps

      useEffect(() => {
        if (task !== null && result === null && boxRef.current) boxRef.current.focus();
      }, [task, result]);

      const submit = useCallback(async () => {
        if (task === null || answer.trim() === '' || busy) return;
        setBusy(true);
        setError(null);
        try {
          const data = await api('/scenario/grade', {
            method: 'POST',
            body: JSON.stringify({
              scenarioId: task.scenario.id,
              refToken: task.refToken,
              answer,
            }),
          });
          if (data.degraded) {
            setNotice(data.notice ?? T.teachDegraded);
          } else {
            setResult({
              verdict: data.verdict,
              feedback: data.feedback,
              corrections: data.corrections ?? [],
            });
          }
        } catch (err) {
          setError(String(err?.message ?? err));
        } finally {
          setBusy(false);
        }
      }, [task, answer, busy]);

      if (notice !== null && task === null) {
        return h('div', null,
          h('div', { className: 'dsh-es-muted' }, notice),
          h('div', { className: 'dsh-es-row' },
            h('button', { className: 'dsh-es-btn', onClick: newTask }, T.retry)),
        );
      }

      if (task === null) {
        return h('div', { className: 'dsh-es-muted' }, busy ? T.loading : T.empty);
      }

      const verdictLabel = result === null
        ? null
        : result.verdict === 'correct'
          ? T.verdictCorrect
          : result.verdict === 'partial'
            ? T.verdictPartial
            : T.verdictWrong;

      return h(
        'div',
        null,
        h('div', { className: 'dsh-es-card' },
          h('div', { className: 'dsh-es-muted', style: { marginBottom: 4 } },
            `${task.scenario.label} · ${task.scenario.level}`),
          h('div', { className: 'dsh-es-sub' }, task.scenario.zh),
          h('div', { className: 'dsh-es-prompt', style: { fontSize: 15, lineHeight: 1.6 } }, task.task),
          task.hints.length > 0
            ? h('div', { className: 'dsh-es-muted', style: { marginTop: 8 } },
                task.hints.map((hint, i) => h('div', { key: i }, `· ${hint}`)))
            : null,

          h('textarea', {
            ref: boxRef,
            className: 'dsh-es-input',
            style: { marginTop: 10, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' },
            value: answer,
            placeholder: T.scenarioPlaceholder,
            onChange: (ev) => setAnswer(ev.target.value),
            disabled: busy || result !== null,
            spellCheck: false,
          }),

          h('div', { className: 'dsh-es-row' },
            result === null
              ? h('button', {
                  className: 'dsh-es-btn dsh-es-btn-primary',
                  onClick: submit,
                  disabled: busy || answer.trim() === '',
                }, busy ? T.scenarioGrading : T.scenarioSubmit)
              : h('button', {
                  className: 'dsh-es-btn dsh-es-btn-primary',
                  onClick: newTask,
                  disabled: busy,
                }, busy ? T.loading : T.scenarioNext),
          ),

          error !== null ? h('div', { className: 'dsh-es-err' }, error) : null,

          result !== null
            ? h('div', {
                className: 'dsh-es-feedback',
                'data-result': result.verdict === 'correct' ? 'correct' : result.verdict === 'partial' ? 'accent' : 'wrong',
              },
                h('div', { style: { fontWeight: 600 } }, verdictLabel),
                result.feedback
                  ? h('div', { className: 'dsh-es-explanation' }, result.feedback)
                  : null,
                result.corrections.length > 0
                  ? h('div', { style: { marginTop: 8 } },
                      result.corrections.map((c, i) => h('div', { key: i, style: { marginTop: 6 } },
                        h('div', null,
                          h('span', { style: { textDecoration: 'line-through', opacity: 0.65 } }, c.wrong),
                          h('span', { className: 'dsh-es-muted' }, '  →  '),
                          h('span', { className: 'dsh-es-accent' }, c.right),
                        ),
                        c.why ? h('div', { className: 'dsh-es-muted' }, c.why) : null,
                      )))
                  : null,
              )
            : null,
        ),
      );
    }

    // ─────────────────────────── 进度 / 设置页 ───────────────────────────

    function StatsTab() {
      const [state, setState] = useState(null);
      const [meta, setMeta] = useState(null);
      const [error, setError] = useState(null);
      const [saving, setSaving] = useState(false);
      const [resetDone, setResetDone] = useState(false);

      const load = useCallback(async () => {
        try {
          const [s, m] = await Promise.all([api('/state'), api('/meta')]);
          setState(s);
          setMeta(m);
        } catch (err) {
          setError(String(err?.message ?? err));
        }
      }, []);

      useEffect(() => { void load(); }, [load]);

      const saveSettings = useCallback(async (patch) => {
        setSaving(true);
        try {
          const data = await api('/settings', { method: 'POST', body: JSON.stringify(patch) });
          setState((prev) => (prev ? { ...prev, settings: data.settings } : prev));
        } catch (err) {
          setError(String(err?.message ?? err));
        } finally {
          setSaving(false);
        }
      }, []);

      const doReset = useCallback(async () => {
        if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
          if (!window.confirm(T.resetConfirm)) return;
        }
        try {
          await api('/reset', { method: 'POST', body: JSON.stringify({ confirm: true }) });
          setResetDone(true);
          await load();
        } catch (err) {
          setError(String(err?.message ?? err));
        }
      }, [load]);

      if (error !== null) return h('div', { className: 'dsh-es-err' }, error);
      if (state === null || meta === null) return h('div', { className: 'dsh-es-muted' }, T.loading);

      const p = state.progress;
      const s = state.settings;

      const toggle = (key, id) => {
        const cur = s[key] ?? [];
        const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
        // 不允许清空：至少留一个
        if (next.length === 0) return;
        void saveSettings({ [key]: next });
      };

      return h(
        'div',
        null,
        h('div', { className: 'dsh-es-grid', style: { marginBottom: 12 } },
          h(Stat, { value: p.tracked, label: T.tracked }),
          h(Stat, { value: p.due, label: T.due }),
          h(Stat, { value: p.mastered, label: T.mastered }),
          h(Stat, {
            // 正确率由服务端算好下发（computeAccuracy），客户端不重复实现一遍 ——
            // 口径只有一处，改的时候不会两边不一致。
            value: state.accuracy?.answered > 0 ? `${state.accuracy.strict}%` : '—',
            label: T.accuracy,
          }),
        ),

        // 重音说明：不显示的话，「只差重音」既不加分也不算对，
        // 用户会以为是判错了（SRS 那边 accent 是"不升不降"，两处口径不同）
        state.accuracy?.hasAccent
          ? h('div', { className: 'dsh-es-muted', style: { marginTop: -6, marginBottom: 12 } },
              T.accentNote(state.accuracy.accent, state.accuracy.accentPct, state.accuracy.lenient))
          : null,

        // 一局计数：sessions 以前是个从没 += 过的死字段
        (state.stats?.sessions > 0)
          ? h('div', { className: 'dsh-es-muted', style: { marginBottom: 12 } },
              `${T.attempts} ${state.stats.answered} · ${state.stats.sessions} ${T.sessions}`)
          : null,

        h('div', { className: 'dsh-es-card' },
          h('div', { className: 'dsh-es-field' },
            h('div', { className: 'dsh-es-field-label' }, T.level),
            h(Chips, {
              options: meta.levels.map((l) => ({ id: l, label: l })),
              selected: [s.level],
              onToggle: (id) => void saveSettings({ level: id }),
            }),
          ),

          h('div', { className: 'dsh-es-field' },
            h('div', { className: 'dsh-es-field-label' }, T.kinds),
            h(Chips, {
              options: meta.kinds,
              selected: s.kinds,
              onToggle: (id) => toggle('kinds', id),
            }),
          ),

          h('div', { className: 'dsh-es-field' },
            h('div', { className: 'dsh-es-field-label' }, T.tenses),
            h(Chips, {
              options: meta.tenses.map((t) => ({ id: t.id, label: t.id })),
              selected: s.tenses,
              onToggle: (id) => toggle('tenses', id),
            }),
          ),

          h('div', { className: 'dsh-es-field' },
            h('div', { className: 'dsh-es-field-label' }, `${T.size}：${s.size}`),
            h('input', {
              type: 'range',
              min: 5,
              max: 30,
              step: 1,
              value: s.size,
              onChange: (ev) => void saveSettings({ size: Number(ev.target.value) }),
              style: { width: '100%' },
            }),
          ),

          h('div', { className: 'dsh-es-field' },
            h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' } },
              h('input', {
                type: 'checkbox',
                checked: Boolean(s.llmExplain),
                onChange: (ev) => void saveSettings({ llmExplain: ev.target.checked }),
              }),
              h('span', { style: { fontSize: 12 } }, T.explainToggle),
            ),
          ),

          // 学习方式：先学后练 / 只给答案 / 关闭
          h('div', { className: 'dsh-es-field' },
            h('div', { className: 'dsh-es-field-label' }, T.teachMode),
            h(Chips, {
              options: [
                { id: 'learn', label: T.teachLearn },
                { id: 'reveal', label: T.teachReveal },
                { id: 'off', label: T.teachOff },
              ],
              selected: [s.teachMode],
              onToggle: (id) => void saveSettings({ teachMode: id }),
            }),
          ),

          // 模型选择
          h('div', { className: 'dsh-es-field' },
            h('div', { className: 'dsh-es-field-label' }, T.modelTitle),
            h(ModelPicker, {
              settings: s,
              onSave: saveSettings,
              t: T,
            }),
          ),
        ),

        h('div', { className: 'dsh-es-row' },
          h('button', { className: 'dsh-es-btn', onClick: doReset },
            resetDone ? T.resetDone : T.reset),
        ),
      );
    }

    // ─────────────────────────── 主面板 ───────────────────────────
    //
    // 面板挂在 root 作用域的 `main` keyed slot 上（key === PANEL_ID），
    // 由侧栏那一行和输入框胶囊共同选中。宿主按 activePanelId 渲染它，
    // 占据中间栏；返回会话用 layout.selectPanel(null)。

    function Panel(props) {
      const [tab, setTab] = useState('practice');
      const closePanel = props?.closePanel;
      return h(
        'div',
        { className: 'dsh-es-panel' },
        h('div', { className: 'dsh-es-head' },
          h('span', { className: 'dsh-es-title' }, T.title),
          h('div', { className: 'dsh-es-tabs' },
            h('button', { type: 'button', className: 'dsh-es-tab', 'data-active': tab === 'practice' ? '1' : '0', onClick: () => setTab('practice') }, T.tabPractice),
            h('button', { type: 'button', className: 'dsh-es-tab', 'data-active': tab === 'write' ? '1' : '0', onClick: () => setTab('write') }, T.scenarioTitle),
            h('button', { type: 'button', className: 'dsh-es-tab', 'data-active': tab === 'browse' ? '1' : '0', onClick: () => setTab('browse') }, T.tabBrowse),
            h('button', { type: 'button', className: 'dsh-es-tab', 'data-active': tab === 'stats' ? '1' : '0', onClick: () => setTab('stats') }, T.tabStats),
            typeof closePanel === 'function'
              ? h('button', { type: 'button', className: 'dsh-es-tab dsh-es-close', title: T.back, onClick: closePanel }, '✕')
              : null,
          ),
        ),
        h('div', { className: 'dsh-es-body' },
          tab === 'practice' ? h(PracticeTab) : null,
          tab === 'write' ? h(ScenarioTab) : null,
          tab === 'browse' ? h(LookupTab) : null,
          tab === 'stats' ? h(StatsTab) : null,
        ),
      );
    }

    // ─────────────────────────── 左栏面板入口 ───────────────────────────

    /**
     * 侧栏那一行里的图标。
     *
     * sidebar.panellist 是 kind:'list' 的槽位，宿主把每个注册项渲染成**一整行按钮**：
     *   <button> [图标 slot] [label 文字] </button>
     * 点这一行 → layout.selectPanel(id) → 在中间栏渲染 main 里同 key 的组件。
     *
     * 所以这里只渲染图标：文字、点击区域、选中态、收起时的 tooltip 全归宿主。
     * 之前这一格塞了一整个带边框的胶囊按钮，于是屏幕上出现「小框 + 旁边的文字」两块，
     * 只有小框能点 —— 因为宿主那一行根本找不到同名 main 面板，比平时更容易让人误解。
     */
    function PanelIcon(props) {
      return h(FlagIcon, { size: props?.size });
    }

    // ─────────────────────────── 插件入口 ───────────────────────────

    /** 面板 id：panellist 的 id 与 main 的 key 必须是同一个值。 */
    const PANEL_ID = 'dsh-spanish';

    const inject = ['slots'];

    function apply(ctx) {
      const slots = ctx.get?.('slots') ?? ctx.slots;
      if (slots === undefined || slots === null) return;

      // 样式只注入一次
      ctx.effect(() => {
        const styleEl = document.createElement('style');
        styleEl.setAttribute('data-plugin', 'dsh-spanish-tutor');
        styleEl.textContent = CSS;
        document.head.appendChild(styleEl);
        return () => {
          if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
        };
      }, 'spanish-tutor: styles');

      // ── 打开/关闭面板 ──
      //
      // 打开由宿主负责：侧栏那一行是宿主画的，点它就走宿主自己的
      // layout.selectPanel(id)，这里不需要插手。
      //
      // 这里只需要「关闭」——面板占了中间栏会盖住对话，右上角的 ✕ 得能回去。
      // 布局服务是延迟解析的：它在自己的 effect 里 provide，插件 apply 时可能还没就绪。
      const readLayout = () => {
        try {
          return ctx.get?.('layout') ?? ctx.layout;
        } catch {
          return undefined;
        }
      };

      const closePanel = () => {
        const layout = readLayout();
        if (layout !== undefined && layout !== null && typeof layout.selectPanel === 'function') {
          layout.selectPanel(null);
        }
      };

      // 主面板：中间栏，key 必须等于 PANEL_ID
      ctx.effect(
        () =>
          slots.inject('main', () =>
            slots.register(
              { name: 'main', key: PANEL_ID, inject: () => ({ closePanel }) },
              Panel,
            ),
          ),
        'spanish-tutor: main panel',
      );

      // 左侧栏入口：只给图标，整行由宿主渲染成按钮 —— id 与 main 的 key 相同
      ctx.effect(
        () =>
          slots.inject('sidebar.panellist', () =>
            slots.register(
              { name: 'sidebar.panellist', id: PANEL_ID, order: 60, label: () => T.label },
              PanelIcon,
            ),
          ),
        'spanish-tutor: sidebar entry',
      );
    }

    // __test 只在测试里用：把这些纯函数交出去，好让测试能真的**调用**它们。
    // 之前选项格式的断言只检查源码形状（正则匹配），逻辑写错了照样通过，
    // 结果认词题点选项时提交的是序号 "0" 而不是单词 —— 真机才发现。
    const exports_ = { apply, inject, __test: { normalizeChoice, pickIndexFromKey, shouldRequeue } };
    return exports_;
  },
});
