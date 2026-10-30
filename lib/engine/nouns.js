/**
 * 西语名词/形容词引擎：阴阳性、复数、冠词。
 *
 * 和变位引擎同样的思路：规则优先，例外表兜底。
 * 西语性数规则的例外非常多（el agua、la mano、el día…），
 * 所以「词库里标了性就用词库的，没标才走规则」，且规则结果带 confidence 标记。
 */

// ─────────────────────────── 复数 ───────────────────────────

/**
 * 变复数。
 *
 * 规则：
 * 1. 以元音（a/e/i/o/u，含重音元音）结尾 → +s
 * 2. 以 -s / -x 结尾且重音在最后一个音节 → 去掉末尾重音符号后 +es
 *    （compás → compases、autobús → autobuses）；否则不变（lunes → lunes）
 * 3. 以 -z 结尾 → -ces（luz → luces、lápiz → lápices）
 * 4. 以 -y 结尾（前是元音）→ +es（rey → reyes）
 * 5. 其它辅音结尾 → +es，并去掉原词末尾的重音（árbol → árboles 保留原重音）
 *
 * 重音位移：以 -n 结尾的重读词复数后要去掉重音
 * （canción → canciones、alemán → alemanes）。
 * 反过来 joven → jóvenes 是**加重音**，规则给不出，只在词表里单独标。
 */
export function pluralize(word) {
  const w = String(word || '').trim();
  if (w === '') return '';

  const lower = w.toLowerCase();

  // 3) -z → -ces（保留 z 前面的重音不变：lápiz → lápices）
  if (lower.endsWith('z')) return w.slice(0, -1) + 'ces';

  // 4) -y
  if (lower.endsWith('y')) {
    const before = lower.slice(-2, -1);
    if ('aeiouáéíóú'.includes(before)) return w + 'es'; // rey → reyes
    return w + 's';
  }

  // 1) 元音结尾 → +s
  if ('aeiouáéíóú'.includes(lower.slice(-1))) return w + 's';

  // 2) -s / -x 结尾
  if (lower.endsWith('s') || lower.endsWith('x')) {
    if (isFinalStressed(w)) {
      // 重音在末音节：去掉末尾重音符号再 +es（compás → compas → compases）
      return stripAccentOnLastVowel(w) + 'es';
    }
    return w; // lunes / martes / crisis 不变
  }

  // 5) 其它辅音 → +es。
  // 这里**保留原有重音**（árbol → árboles、profesor → profesores、
  // carácter → caracteres 是特例，由词表处理）。
  if (lower.endsWith('n') && isFinalStressed(w)) {
    // canción → canciones（-n 结尾且末音节重读 → 复数后重音前移，去掉重音符号）
    return stripAccentOnLastVowel(w) + 'es';
  }
  return w + 'es';
}

/** 重音是否落在最后一个音节。 */
function isFinalStressed(word) {
  const vowels = 'áéíóú';
  for (let i = 0; i < word.length; i++) {
    if (vowels.includes(word[i])) {
      const rest = word.slice(i + 1);
      // 后面没有别的元音 → 这是最后一个元音
      if (!/[aeiouáéíóú]/i.test(rest)) return true;
    }
  }
  // 无重音符号：单音节必重读；-n/-s 结尾多音节为 penúltima
  const lw = word.toLowerCase();
  if (countSyllables(lw) <= 1) return true;
  if (lw.endsWith('n') || lw.endsWith('s')) return false;
  return true;
}

function countSyllables(word) {
  const m = word.match(/[aeiouáéíóú]+/gi);
  return m ? m.length : 1;
}

/**
 * 去掉**最后一个音节上**的重音符号，其它重音保留。
 * canción → cancion（只有一个重音，全去掉也对）
 * 但 árbol 不会被调用到（它走 +es 保留原样）。
 */
function stripAccentOnLastVowel(word) {
  const nfd = word.normalize('NFD');
  const chars = [...nfd];
  // 找到最后一个带重音的元音（含分解后的组合符）
  let lastAccentIdx = -1;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '\u0301' || chars[i] === '\u0300') {
      // 检查它后面还有没有元音基字符
      const rest = chars.slice(i + 1).join('');
      if (!/[aeiou]/i.test(rest.normalize('NFC'))) lastAccentIdx = i;
    }
  }
  if (lastAccentIdx >= 0) chars.splice(lastAccentIdx, 1);
  return chars.join('').normalize('NFC');
}

/**
 * 复数形式不规则的常见词。
 * 这里的词**必须**写死：规则推不出来（重音位移、词形变化）。
 */
export const PLURAL_EXCEPTIONS = {
  joven: 'jóvenes', // 重音前移（规则会给出 jovenes）
  carácter: 'caracteres', // 重音前移 + 去重音
  régimen: 'regímenes',
  espécimen: 'especímenes',
  tabú: 'tabúes',
  menú: 'menús',
  chapú: 'chapús',
  jabalí: 'jabalíes',
  rubí: 'rubíes',
  alemán: 'alemanes',
  inglés: 'ingleses',
  francés: 'franceses',
  interés: 'intereses',
  autobús: 'autobuses',
  compás: 'compases',
  país: 'países',
  // 单复数同形
  paraguas: 'paraguas',
  cumpleaños: 'cumpleaños',
  sacacorchos: 'sacacorchos',
  virus: 'virus',
  tesis: 'tesis',
  análisis: 'análisis',
  // 外来词
  club: 'clubes',
  cómic: 'cómics',
};

/** 词库未标注时的复数兜底（含例外表）。 */
export function pluralOf(word) {
  const w = String(word || '').trim();
  const lower = w.toLowerCase();
  if (PLURAL_EXCEPTIONS[lower] !== undefined) return PLURAL_EXCEPTIONS[lower];
  return pluralize(w);
}

/** 规则判断阴阳性：返回 'm'（阳性）| 'f'（阴性）| null（规则给不出）。 */
export function guessGender(word) {
  const w = String(word || '').trim().toLowerCase();
  if (w === '') return null;

  // 明确的例外优先（这些是最常考的高频词）
  if (GENDER_EXCEPTIONS[w] !== undefined) return GENDER_EXCEPTIONS[w];

  if (w.endsWith('o')) return 'm';
  if (w.endsWith('a')) return 'f';
  if (w.endsWith('ción') || w.endsWith('sión')) return 'f';
  if (w.endsWith('dad') || w.endsWith('tad')) return 'f';
  if (w.endsWith('tud')) return 'f';
  if (w.endsWith('umbre')) return 'f';
  if (w.endsWith('ie') || w.endsWith('ez')) return 'f';
  if (w.endsWith('is') || w.endsWith('itis')) return 'f';
  if (w.endsWith('ambre')) return 'f';
  // -z 结尾的抽象名词（luz、voz、paz、cruz）几乎都是阴性
  if (w.endsWith('z')) return 'f';
  if (w.endsWith('án') || w.endsWith('ón') || w.endsWith('ín')) return 'm';
  if (w.endsWith('és')) return 'm';
  // -or 多数是阳性（amor、color、profesor），但 flor / labor / sor 是阴性
  if (w.endsWith('or')) return FEMININE_OR.includes(w) ? 'f' : 'm';
  if (w.endsWith('aje')) return 'm';
  if (w.endsWith('ma') && isGreekOriginMa(w)) return 'm';

  return null;
}

/** -or 结尾但属阴性的少见词。 */
const FEMININE_OR = ['flor', 'labor', 'sor', 'coliflor', 'contraflor'];

/** -ma 结尾的希腊词源词多为阳性（el problema、el tema、el sistema）。 */
const GREEK_MA = [
  'problema', 'tema', 'sistema', 'idioma', 'programa', 'drama', 'poema', 'clima',
  'mapa', 'planeta', 'liga', 'mecanismo', 'dilema', 'esquema', 'síntoma', 'teléfono',
];
function isGreekOriginMa(w) {
  return GREEK_MA.includes(w) || w.endsWith('ema') || w.endsWith('ama') && GREEK_MA.includes(w);
}

/**
 * 高频例外。阴性词以 -o 结尾、阳性词以 -a 结尾：
 * 这是西语学习者最容易被规则误导的一批词。
 */
export const GENDER_EXCEPTIONS = {
  // 阴性但以 -o 结尾
  mano: 'f',
  foto: 'f',
  moto: 'f',
  radio: 'f',
  // 阳性但以 -a 结尾
  día: 'm',
  mapa: 'm',
  problema: 'm',
  sistema: 'm',
  tema: 'm',
  idioma: 'm',
  programa: 'm',
  clima: 'm',
  planeta: 'm',
  poema: 'm',
  drama: 'm',
  esquema: 'm',
  síntoma: 'm',
  dilema: 'm',
  // 重读 a / ha 开头的阴性词用 el（但性仍是阴性）
  agua: 'f',
  águila: 'f',
  alma: 'f',
  aula: 'f',
  hacha: 'f',
  hambre: 'f',
  arte: 'm',
  // 其它常见例外
  gente: 'f',
  muerte: 'f',
  noche: 'f',
  leche: 'f',
  carne: 'f',
  sangre: 'f',
  llave: 'f',
  nave: 'f',
  clase: 'f',
  nube: 'f',
  calle: 'f',
  parte: 'f',
  madre: 'f',
  padre: 'm',
  mujer: 'f',
  hombre: 'm',
  actriz: 'f',
  disquete: 'm',
};

// ─────────────────────────── 冠词 ───────────────────────────

/**
 * 定冠词：给定阴阳性与单复数。
 *
 * 「重读 a/ha 开头的阴性单数名词」定冠词用 el，但形容词仍是阴性：
 *   el agua fría（不是 la agua / el agua frío）
 */
export function definiteArticle(gender, number, word = '') {
  if (number === 'pl') return gender === 'f' ? 'las' : 'los';

  if (gender === 'f' && startsWithStressedA(word)) return 'el';
  return gender === 'f' ? 'la' : 'el';
}

/** 不定冠词。 */
export function indefiniteArticle(gender, number, word = '') {
  if (number === 'pl') return gender === 'f' ? 'unas' : 'unos';
  if (gender === 'f' && startsWithStressedA(word)) return 'un';
  return gender === 'f' ? 'una' : 'un';
}

/** 是否以重读 a / ha 开头（决定阴性名词用什么冠词）。 */
function startsWithStressedA(word) {
  const w = String(word || '').toLowerCase().normalize('NFC');
  if (!/^(a|ha|á|há)/.test(w)) return false;
  const STRESSED_A_WORDS = [
    'agua', 'aguas', 'águila', 'águilas', 'alma', 'almas', 'aula', 'aulas',
    'hacha', 'hachas', 'hambre', 'hambres', 'ala', 'alas', 'área', 'áreas',
    'arpa', 'arpas', 'ancla', 'anclas', 'acta', 'actas',
  ];
  if (STRESSED_A_WORDS.includes(w)) return true;
  // 派生词：aguacero / agüita 之类不算（重音跑了），只匹配已知词根
  return false;
}

// ─────────────────── 形容词一致（阴阳性 + 单复数） ───────────────────

/**
 * 形容词按名词变性数。
 *
 * 规则：
 * - 以 -o 结尾：-o/-a/-os/-as（bueno → buena/buenos/buenas）
 * - 以其它元音或辅音结尾：阴阳同形，只变数（grande → grandes）
 * - 以 -án/-ón/-és/-or 结尾的重读词：阴性 +a（trabajador → trabajadora）
 */
export function adjectiveAgreement(adj, gender, number) {
  const a = String(adj || '').trim();
  const lw = a.toLowerCase();

  // -o 类
  if (lw.endsWith('o')) {
    const base = a.slice(0, -1);
    if (number === 'pl') return base + (gender === 'f' ? 'as' : 'os');
    return base + (gender === 'f' ? 'a' : 'o');
  }

  // 性别有标记的辅音结尾
  if (/(án|ón|és|or)$/i.test(lw)) {
    if (number === 'pl') return a + (gender === 'f' ? 'as' : 'es');
    return a + (gender === 'f' ? 'a' : '');
  }

  // 其它：只变数
  if (number === 'pl') return pluralize(a);
  return a;
}

// ─────────────────────────── 组合入口 ───────────────────────────

/**
 * 给出一个名词的完整信息。
 * @param {string} noun
 * @param {{gender?:'m'|'f', plural?:string}} [override] 词库里的标注优先
 * @returns {{singular:string, plural:string, gender:'m'|'f'|null, definite:string,
 *            indefinite:string, definitePl:string, indefinitePl:string,
 *            genderSource:'lexicon'|'rule'|'unknown'}}
 */
export function nounInfo(noun, override = {}) {
  const singular = String(noun || '').trim();
  const lower = singular.toLowerCase();

  let gender = override.gender ?? null;
  let source = override.gender ? 'lexicon' : 'rule';

  if (gender === null) {
    const guessed = guessGender(lower);
    if (guessed === null) {
      source = 'unknown';
      gender = null;
    } else {
      gender = guessed;
    }
  }

  const plural = override.plural ?? pluralOf(singular);
  const g = gender ?? 'm';
  const isStressedA = gender === 'f' && startsWithStressedA(lower);

  return {
    singular,
    plural,
    gender,
    genderSource: source,
    definite: definiteArticle(g, 'sg', lower),
    indefinite: indefiniteArticle(g, 'sg', lower),
    definitePl: definiteArticle(g, 'pl', lower),
    indefinitePl: indefiniteArticle(g, 'pl', lower),
    // 重读 a 开头的阴性名词：冠词用 el/un，但形容词仍用阴性
    stressedA: isStressedA,
  };
}

/**
 * 名词短语用于测量阴阳性掌握度：把词和冠词拼起来。
 * el agua fría / la casa blanca
 */
export function withArticle(noun, gender, number = 'sg') {
  const g = gender ?? guessGender(noun) ?? 'm';
  const lower = String(noun).toLowerCase();
  const art = number === 'pl'
    ? definiteArticle(g, 'pl', lower)
    : definiteArticle(g, 'sg', lower);
  const word = number === 'pl' ? pluralOf(noun) : noun;
  return { article: art, noun: word, full: `${art} ${word}` };
}
