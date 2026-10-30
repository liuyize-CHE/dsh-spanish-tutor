/**
 * 出题 + 间隔重复（SRS）。
 *
 * 纯逻辑，无 DOM 无网络，可在 Node 里直接测。
 * 存储由调用方注入（host 端落盘、浏览器端 localStorage），这里只管算法。
 */

import { conjugate, participle, gradeAnswer, PERSONS, TENSES } from './conjugator.js';
import { nounInfo, adjectiveAgreement } from './nouns.js';
import { CLOZE_BANK } from './cloze.js';
import { GRAMMAR_BANK, GRAMMAR_TOPIC_LABELS } from './grammar.js';

// ─────────────────────────── SRS ───────────────────────────

/** 等级 → 下次复习间隔（天）。0 = 刚学，7 = 已掌握。 */
export const INTERVALS_DAYS = [0, 0.02, 0.15, 0.7, 2, 6, 16, 45];

/** 一次作答后应升到哪一级。 */
export function nextLevel(level, result) {
  const cur = clampLevel(level);
  if (result === 'correct') return Math.min(cur + 1, INTERVALS_DAYS.length - 1);
  if (result === 'accent') {
    // 只差重音：不升不降，但也不会掉级（重音错误不等于不会这个词）
    return cur;
  }
  // 真错：退两级（比只退一级更能压缩「假装会」）
  return Math.max(cur - 2, 0);
}

function clampLevel(level) {
  const n = Number(level);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(Math.round(n), 0), INTERVALS_DAYS.length - 1);
}

/**
 * 更新一条记忆记录。
 * @param {{level?:number, correct?:number, wrong?:number, lastSeen?:number}} card
 * @param {'correct'|'accent'|'wrong'} result
 * @param {number} [now]
 */
export function updateCard(card, result, now = Date.now()) {
  const cur = card || {};
  const level = nextLevel(cur.level ?? 0, result);
  const intervalDays = INTERVALS_DAYS[level];
  return {
    ...cur,
    level,
    correct: (cur.correct ?? 0) + (result === 'correct' ? 1 : 0),
    accent: (cur.accent ?? 0) + (result === 'accent' ? 1 : 0),
    wrong: (cur.wrong ?? 0) + (result === 'wrong' ? 1 : 0),
    lastSeen: now,
    due: now + intervalDays * 24 * 60 * 60 * 1000,
    streak: result === 'correct' ? (cur.streak ?? 0) + 1 : 0,
  };
}

/** 是否到期。 */
export function isDue(card, now = Date.now()) {
  if (!card) return true;
  if (typeof card.due !== 'number') return true;
  return card.due <= now;
}

/** 掌握度 0..1，供进度条显示。 */
export function masteryOf(card) {
  if (!card) return 0;
  const level = clampLevel(card.level ?? 0);
  const base = level / (INTERVALS_DAYS.length - 1);
  const total = (card.correct ?? 0) + (card.wrong ?? 0) + (card.accent ?? 0);
  if (total === 0) return 0;
  // 准确率小幅修正，避免只靠等级虚高
  const acc = ((card.correct ?? 0) + (card.accent ?? 0) * 0.7) / total;
  return Math.max(0, Math.min(1, base * 0.75 + acc * 0.25));
}

// ─────────────────────────── 出题 ───────────────────────────

/** 确定性伪随机（同一个种子序列可复现，便于测试与「重做这套题」）。 */
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    // xorshift32
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/**
 * 造一道变位题。
 * @param {{infinitive:string, tenses?:string[], persons?:string[]}} spec
 * @param {function} rng
 */
export function makeConjugationQuestion(spec, rng) {
  const tenses = spec.tenses?.length ? spec.tenses : ['presente'];
  const persons = spec.persons?.length ? spec.persons : PERSONS;
  const tense = pick(rng, tenses);
  const person = pick(rng, persons);
  const personIndex = PERSONS.indexOf(person);
  const forms = conjugate(spec.infinitive, tense);
  const answer = forms[personIndex];

  return {
    id: `conj:${spec.infinitive}:${tense}:${person}`,
    kind: 'conjugation',
    prompt: `${spec.infinitive} · ${tense}`,
    person,
    personIndex,
    tense,
    infinitive: spec.infinitive,
    answer,
    // 同一时态的其它人称，用于「相近答案」干扰项与提示
    siblings: forms,
  };
}

/**
 * 造一道阴阳性/复数题。
 * @param {{noun:string, gender?:'m'|'f'}} spec
 */
export function makeNounQuestion(spec, rng) {
  const info = nounInfo(spec.noun, { gender: spec.gender });
  const mode = rng() < 0.5 ? 'gender' : 'plural';

  if (mode === 'gender') {
    return {
      id: `noun:${info.singular}:gender`,
      kind: 'gender',
      prompt: info.singular,
      answer: info.gender, // 'm' | 'f'
      choices: [
        { value: 'm', label: '阳性 · masculino' },
        { value: 'f', label: '阴性 · femenino' },
      ],
      noun: info.singular,
      hint: info.genderSource === 'rule' ? '按词尾规则推断' : '词库标注',
    };
  }

  return {
    id: `noun:${info.singular}:plural`,
    kind: 'plural',
    prompt: info.singular,
    answer: info.plural,
    noun: info.singular,
    gender: info.gender,
  };
}

/**
 * 造一道语法辨析题（ser/estar、虚拟式、por/para…）。
 *
 * 和填空题的差别：填空考「填什么词」，语法考「该用哪个」——
 * 所以是选择题，选项就是易混对。
 * 每题带 `rule`：即使模型不可用，学生也能看懂为什么。
 *
 * @param {{item:object, topic:string}} spec
 */
export function makeGrammarQuestion(spec) {
  const { item, topic } = spec;
  return {
    id: `grammar:${topic}:${item.sentence}`,
    kind: 'grammar',
    kindLabel: GRAMMAR_TOPIC_LABELS[topic] ?? '语法',
    topic,
    prompt: item.sentence,
    answer: item.answer,
    // 选项就是易混对，直接沿用（不打乱会让答案总在第一个，所以下面打乱）
    rule: item.rule,
    zh: item.zh,
    level: item.level,
    _rawOptions: item.options,
  };
}

/**
 * 造一道句子填空题。
 *
 * 题库来自 cloze.js（人工核对的例句），分四类考点：
 *   conjugation（挖变位）/ article（挖冠词）/ preposition（挖介词）/ agreement（挖形容词）
 *
 * @param {{item:object, topic:string}} spec
 */
export function makeClozeQuestion(spec) {
  const { item, topic } = spec;
  const topicLabel = {
    conjugation: '变位填空',
    article: '冠词填空',
    preposition: '介词填空',
    agreement: '形容词一致',
  }[topic] ?? '填空';

  return {
    id: `cloze:${topic}:${item.sentence}`,
    kind: 'cloze',
    kindLabel: topicLabel,
    topic,
    // 题干就是带 ___ 的句子，学生填这个词
    prompt: item.sentence,
    answer: item.answer,
    zh: item.zh,
    hint: item.hint ?? null,
    level: item.level,
    // 变位类带原形提示，学生知道该填哪个动词的什么形式
    verb: item.verb ?? null,
    tense: item.tense ?? null,
    person: item.person ?? null,
  };
}

/**
 * 造一道认词题（词义选择）。
 *
 * 两种方向：
 *   es2zh —— 看西语选中文（认词，最基础）
 *   zh2es —— 看中文选西语（回忆，更难）
 *
 * 干扰项从**同一词性**的其它词里挑 —— 混进别的词性会让答案太好猜
 * （看到动词原形四个选项，明显该选动词）。
 *
 * @param {{entry:object, pool:object[], direction:'es2zh'|'zh2es'}} spec
 */
export function makeVocabQuestion(spec, rng) {
  const { entry, pool, direction } = spec;
  const word = entry.word ?? entry.infinitive ?? entry.noun ?? entry.adjective;
  const meaning = entry.meaning ?? '';

  // 候选干扰项：同词性、有释义、不是自己
  const others = (pool ?? [])
    .map((x) => ({
      word: x.word ?? x.infinitive ?? x.noun ?? x.adjective,
      meaning: x.meaning ?? '',
    }))
    .filter((x) => x.word && x.word !== word && x.meaning && x.meaning !== meaning);

  // 去重（释义相同的只留一个，否则会出现两个"正确"选项）
  const seen = new Set([meaning]);
  const distractors = [];
  for (const o of shuffle(others, rng)) {
    if (seen.has(o.meaning)) continue;
    seen.add(o.meaning);
    distractors.push(o);
    if (distractors.length >= 3) break;
  }

  const toText = (x) => (direction === 'es2zh' ? x.meaning : x.word);
  const correct = toText({ word, meaning });

  const choices = shuffle(
    [correct, ...distractors.map(toText)],
    rng,
  ).map((text, i) => ({ id: String(i), text }));

  return {
    id: `vocab:${word}:${direction}`,
    kind: 'vocab',
    kindLabel: '认词',
    direction,
    prompt: direction === 'es2zh' ? word : meaning,
    word,
    meaning,
    // 答案用文本本身，判分时和选项文本比对
    answer: correct,
    choices,
    // 干扰项不足时（题库太小）要如实反映，不硬凑
    distractorCount: distractors.length,
    degraded: distractors.length < 3,
  };
}

/**
 * 造一道形容词一致题。
 * @param {{adjective:string, noun:string}} spec
 */
export function makeAgreementQuestion(spec, rng) {
  const gender = pick(rng, ['m', 'f']);
  const number = pick(rng, ['sg', 'pl']);
  const answer = adjectiveAgreement(spec.adjective, gender, number);
  const info = nounInfo(spec.noun);
  const nounForm = number === 'pl' ? info.plural : info.singular;
  const article = number === 'pl' ? info.definitePl : info.definite;

  return {
    id: `agr:${spec.adjective}:${spec.noun}:${gender}:${number}`,
    kind: 'agreement',
    prompt: `${spec.noun} + ${spec.adjective}`,
    answer,
    noun: info.singular,
    adjective: spec.adjective,
    gender,
    number,
    expectedPhrase: `${article} ${nounForm} ${answer}`,
  };
}

/**
 * 从题库抽一组题。
 *
 * @param {object} bank {verbs:[...], nouns:[...], adjectives:[...]}
 * @param {object} opts
 * @param {object} opts.memory 记忆表 {[cardId]: card}
 * @param {string[]} [opts.tenses]
 * @param {string[]} [opts.persons]
 * @param {string[]} [opts.kinds] 只出这些题型
 * @param {number} [opts.size=10]
 * @param {number} [opts.seed]
 * @param {number} [opts.now]
 * @returns {{questions:object[], unseenCount:number, dueCount:number}}
 */
export function buildSession(bank, opts = {}) {
  const {
    memory = {},
    tenses = ['presente'],
    persons = PERSONS,
    kinds = ['conjugation', 'gender', 'plural'],
    size = 10,
    seed = Date.now(),
    now = Date.now(),
  } = opts;

  const rng = makeRng(seed);

  // 收集所有候选卡片 id（先不生成题目，只用来排优先级）
  const candidates = [];

  if (kinds.includes('conjugation')) {
    for (const verb of bank.verbs ?? []) {
      for (const tense of tenses) {
        for (const person of persons) {
          candidates.push({
            id: `conj:${verb.infinitive}:${tense}:${person}`,
            type: 'conjugation',
            ref: { infinitive: verb.infinitive, tense, person },
          });
        }
      }
    }
  }

  if (kinds.includes('gender') || kinds.includes('plural')) {
    for (const noun of bank.nouns ?? []) {
      if (kinds.includes('gender')) {
        candidates.push({ id: `noun:${noun.noun}:gender`, type: 'gender', ref: { noun: noun.noun, gender: noun.gender } });
      }
      if (kinds.includes('plural')) {
        candidates.push({ id: `noun:${noun.noun}:plural`, type: 'plural', ref: { noun: noun.noun, gender: noun.gender } });
      }
    }
  }

  if (kinds.includes('agreement')) {
    for (const adj of bank.adjectives ?? []) {
      for (const noun of bank.nouns ?? []) {
        candidates.push({
          id: `agr:${adj.adjective}:${noun.noun}`,
          type: 'agreement',
          ref: { adjective: adj.adjective, noun: noun.noun },
        });
      }
    }
  }

  // 句子填空：从人工核对的例句库出题
  if (kinds.includes('cloze')) {
    for (const [topic, list] of Object.entries(CLOZE_BANK)) {
      for (const item of list) {
        candidates.push({
          id: `cloze:${topic}:${item.sentence}`,
          type: 'cloze',
          ref: { item, topic },
        });
      }
    }
  }

  // 语法专项：ser/estar、虚拟式、por/para、介词搭配
  if (kinds.includes('grammar')) {
    for (const [topic, list] of Object.entries(GRAMMAR_BANK)) {
      for (const item of list) {
        candidates.push({
          id: `grammar:${topic}:${item.sentence}`,
          type: 'grammar',
          ref: { item, topic },
        });
      }
    }
  }

  // 认词：动词、名词、形容词都进池子，各自用自己的同词性词做干扰项
  if (kinds.includes('vocab')) {
    const groups = [
      { list: bank.verbs ?? [], key: 'infinitive', kind: 'verb' },
      { list: bank.nouns ?? [], key: 'noun', kind: 'noun' },
      { list: bank.adjectives ?? [], key: 'adjective', kind: 'adjective' },
    ];
    for (const g of groups) {
      for (const entry of g.list) {
        const word = entry[g.key];
        if (!word || !entry.meaning) continue;
        for (const direction of ['es2zh', 'zh2es']) {
          candidates.push({
            id: `vocab:${word}:${direction}`,
            type: 'vocab',
            ref: { entry, pool: g.list, direction },
          });
        }
      }
    }
  }

  if (candidates.length === 0) return { questions: [], unseenCount: 0, dueCount: 0 };

  // 优先级：到期的（且等级低）优先 > 没见过的 > 未到期的
  const unseen = [];
  const due = [];
  const later = [];

  for (const c of candidates) {
    const card = memory[c.id];
    if (card === undefined) unseen.push(c);
    else if (isDue(card, now)) due.push({ c, level: card.level ?? 0 });
    else later.push({ c, due: card.due });
  }

  due.sort((a, b) => a.level - b.level);
  later.sort((a, b) => a.due - b.due);

  const ordered = [...due.map((d) => d.c), ...shuffle(unseen, rng), ...later.map((l) => l.c)];
  const chosen = ordered.slice(0, size);

  const questions = chosen.map((c, index) => {
    const q = buildQuestion(c, rng, index);
    return q;
  }).filter(Boolean);

  return {
    questions,
    unseenCount: unseen.length,
    dueCount: due.length,
    totalCount: candidates.length,
  };
}

function buildQuestion(candidate, rng, index) {
  if (candidate.type === 'conjugation') {
    const { infinitive, tense, person } = candidate.ref;
    const personIndex = PERSONS.indexOf(person);
    const forms = conjugate(infinitive, tense);
    return {
      index,
      id: candidate.id,
      kind: 'conjugation',
      kindLabel: '变位',
      infinitive,
      tense,
      person,
      personIndex,
      personLabel: PERSON_LABELS_CN[person] ?? person,
      answer: forms[personIndex],
      siblings: forms,
    };
  }

  if (candidate.type === 'gender') {
    const info = nounInfo(candidate.ref.noun, { gender: candidate.ref.gender });
    return {
      index,
      id: candidate.id,
      kind: 'gender',
      kindLabel: '阴阳性',
      noun: info.singular,
      answer: info.gender,
      choices: [
        { value: 'm', label: '阳性 el / masculino' },
        { value: 'f', label: '阴性 la / femenino' },
      ],
      explanation: info.genderSource === 'lexicon' ? '词库标注' : '按词尾规则',
    };
  }

  if (candidate.type === 'plural') {
    const info = nounInfo(candidate.ref.noun, { gender: candidate.ref.gender });
    return {
      index,
      id: candidate.id,
      kind: 'plural',
      kindLabel: '复数',
      noun: info.singular,
      gender: info.gender,
      answer: info.plural,
    };
  }

  if (candidate.type === 'agreement') {
    const gender = rng() < 0.5 ? 'm' : 'f';
    const number = rng() < 0.5 ? 'sg' : 'pl';
    const adj = adjectiveAgreement(candidate.ref.adjective, gender, number);
    const nounInfoValue = nounInfo(candidate.ref.noun);
    const nounForm = number === 'pl' ? nounInfoValue.plural : nounInfoValue.singular;
    return {
      index,
      id: `${candidate.id}:${gender}:${number}`,
      kind: 'agreement',
      kindLabel: '形容词一致',
      noun: nounInfoValue.singular,
      adjective: candidate.ref.adjective,
      gender,
      number,
      answer: adj,
      expectedPhrase: `${nounForm} ${adj}`,
    };
  }

  if (candidate.type === 'vocab') {
    const q = makeVocabQuestion(candidate.ref, rng);
    return { index, ...q };
  }

  if (candidate.type === 'cloze') {
    const q = makeClozeQuestion(candidate.ref);
    return { index, ...q };
  }

  if (candidate.type === 'grammar') {
    const q = makeGrammarQuestion(candidate.ref);
    // 打乱选项：否则答案永远在固定位置，学生能靠位置蒙对
    const opts = shuffle(q._rawOptions, rng);
    const choices = opts.map((text, i) => ({ id: String(i), text }));
    const { _rawOptions, ...rest } = q;
    return { index, ...rest, choices };
  }

  return null;
}

const PERSON_LABELS_CN = {
  '1s': 'yo',
  '2s': 'tú',
  '3s': 'él / ella / usted',
  '1p': 'nosotros',
  '2p': 'vosotros',
  '3p': 'ellos / ellas / ustedes',
};

function shuffle(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * 判一道题。返回 { result, expected, given }。
 */
export function judge(question, given) {
  const kind = question.kind;

  // 阴阳性：答案是固定的 'm' / 'f'，容忍大小写（用户可能打 M）。
  if (kind === 'gender') {
    const got = String(given ?? '').trim().toLowerCase();
    const expected = String(question.answer ?? '').trim().toLowerCase();
    return { result: got === expected ? 'correct' : 'wrong', expected, given: got };
  }

  // 语法辨析（选择题）：选项是完整西语词，容忍大小写，
  // 但不走 gradeAnswer —— 语法题没有"只差重音算半对"的说法，
  // soy / estoy 差一个字母就是两个完全不同的词。
  if (kind === 'grammar') {
    const got = String(given ?? '').trim().toLowerCase();
    const expected = String(question.answer ?? '').trim().toLowerCase();
    return { result: got === expected ? 'correct' : 'wrong', expected, given: got };
  }

  // 认词：答案是一段中文释义或一个西语词。
  // 这里**不能**走 gradeAnswer —— 它会把「只差重音」判成 accent，
  // 而中文释义差一个字就是另一个意思；西语词在认词题里考的是"认得出"，
  // 不是拼写，所以重音不同也算错。只做首尾空白宽容，不折叠大小写。
  if (kind === 'vocab') {
    const got = String(given ?? '').trim();
    const expected = String(question.answer ?? '').trim();
    return { result: got === expected ? 'correct' : 'wrong', expected, given: got };
  }

  // 变位题 / 填空题（cloze）：答案是西语词。
  // 走 gradeAnswer —— 它会把「只差重音」判成 accent 并单独提示，
  // 这对变位和填空都合适（hablo / habló 是不同词，值得区分）。
  return {
    result: gradeAnswer(question.answer, given),
    expected: question.answer,
    given: String(given || '').trim(),
  };
}
