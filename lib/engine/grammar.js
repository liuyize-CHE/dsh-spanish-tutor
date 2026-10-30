/**
 * 语法难点专项：ser/estar、虚拟式、por/para 这类「成对易混」考点。
 *
 * 和填空题的区别：
 *   cloze 考的是「填什么词」（拼写/变位记忆）
 *   grammar 考的是「该用哪个」（规则辨析）—— 所以用选择题，选项是易混对
 *
 * 每道题都带 `rule`：一句话讲清区别。答错时即使模型不可用，
 * 学生也能看懂为什么。这是刻意的 —— 不把学习完全押在模型上。
 */

/**
 * 一道语法辨析题。
 * @typedef {{
 *   sentence: string,   // 带 ___ 的句子
 *   answer: string,     // 正确选项
 *   options: string[],  // 全部选项（2~4 个）
 *   rule: string,       // 一句话规则
 *   zh: string,         // 中文翻译
 *   topic: string,      // ser-estar | subjuntivo | por-para | ...
 *   level: string,
 * }} GrammarItem
 */

/** ser vs estar —— 西语最经典的难点。 */
export const SER_ESTAR = [
  {
    sentence: 'Yo ___ de China.',
    answer: 'soy',
    options: ['soy', 'estoy'],
    rule: '来源/国籍用 ser。',
    zh: '我来自中国。',
    topic: 'ser-estar',
    level: 'A1',
  },
  {
    sentence: 'Yo ___ en casa ahora.',
    answer: 'estoy',
    options: ['soy', 'estoy'],
    rule: '位置/临时状态用 estar。',
    zh: '我现在在家。',
    topic: 'ser-estar',
    level: 'A1',
  },
  {
    sentence: 'Ella ___ muy cansada hoy.',
    answer: 'está',
    options: ['es', 'está'],
    rule: '临时状态（今天累）用 estar。',
    zh: '她今天很累。',
    topic: 'ser-estar',
    level: 'A1',
  },
  {
    sentence: 'Ella ___ médica.',
    answer: 'es',
    options: ['es', 'está'],
    rule: '职业/身份用 ser。',
    zh: '她是医生。',
    topic: 'ser-estar',
    level: 'A1',
  },
  {
    sentence: 'La sopa ___ fría.',
    answer: 'está',
    options: ['es', 'está'],
    rule: '食物的当前温度用 estar（状态）。',
    zh: '汤是凉的。',
    topic: 'ser-estar',
    level: 'A2',
  },
  {
    sentence: 'El café ___ caliente por naturaleza.',
    answer: 'es',
    options: ['es', 'está'],
    rule: '固有性质用 ser。',
    zh: '咖啡本质上是热的。',
    topic: 'ser-estar',
    level: 'A2',
  },
  {
    sentence: 'Nosotros ___ estudiantes.',
    answer: 'somos',
    options: ['somos', 'estamos'],
    rule: '身份用 ser。',
    zh: '我们是学生。',
    topic: 'ser-estar',
    level: 'A1',
  },
  {
    sentence: 'Nosotros ___ en el aula.',
    answer: 'estamos',
    options: ['somos', 'estamos'],
    rule: '位置用 estar。',
    zh: '我们在教室里。',
    topic: 'ser-estar',
    level: 'A1',
  },
  {
    sentence: 'Madrid ___ la capital de España.',
    answer: 'es',
    options: ['es', 'está'],
    rule: '客观事实用 ser。',
    zh: '马德里是西班牙的首都。',
    topic: 'ser-estar',
    level: 'A1',
  },
  {
    sentence: 'La tienda ___ cerrada hoy.',
    answer: 'está',
    options: ['es', 'está'],
    rule: '暂态（今天关门）用 estar。',
    zh: '商店今天关门。',
    topic: 'ser-estar',
    level: 'A2',
  },
];

/** 虚拟式 vs 陈述式。 */
export const SUBJUNTIVO = [
  {
    sentence: 'Quiero que tú ___ conmigo.',
    answer: 'vengas',
    options: ['vienes', 'vengas'],
    rule: 'querer que 后面接虚拟式。',
    zh: '我想让你跟我一起来。',
    topic: 'subjuntivo',
    level: 'B1',
  },
  {
    sentence: 'Es posible que ___ mañana.',
    answer: 'llueva',
    options: ['llueve', 'llueva'],
    rule: 'es posible que 表示不确定 → 虚拟式。',
    zh: '明天可能会下雨。',
    topic: 'subjuntivo',
    level: 'B1',
  },
  {
    sentence: 'Espero que ___ bien.',
    answer: 'estés',
    options: ['estás', 'estés'],
    rule: 'espero que 表愿望 → 虚拟式。',
    zh: '我希望你一切都好。',
    topic: 'subjuntivo',
    level: 'B1',
  },
  {
    sentence: 'Cuando ___ mayor, quiero ser médico.',
    answer: 'sea',
    options: ['soy', 'sea'],
    rule: 'cuando 指将来未发生的事 → 虚拟式。',
    zh: '等我长大了，我想当医生。',
    topic: 'subjuntivo',
    level: 'B1',
  },
  {
    sentence: 'No creo que ___ verdad.',
    answer: 'sea',
    options: ['es', 'sea'],
    rule: 'no creo que 表否定判断 → 虚拟式。',
    zh: '我不认为这是真的。',
    topic: 'subjuntivo',
    level: 'B1',
  },
  {
    sentence: 'Sé que ___ verdad.',
    answer: 'es',
    options: ['es', 'sea'],
    rule: 'sé que 表确定 → 陈述式（和 no creo que 相反）。',
    zh: '我知道这是真的。',
    topic: 'subjuntivo',
    level: 'B1',
  },
  {
    sentence: 'Aunque ___ frío, saldremos.',
    answer: 'hace',
    options: ['hace', 'haga'],
    rule: 'aunque + 已知事实 → 陈述式。',
    zh: '虽然天冷，我们还是要出去。',
    topic: 'subjuntivo',
    level: 'B1',
  },
  {
    sentence: 'Quiero que ___ la verdad.',
    answer: 'digas',
    options: ['dices', 'digas'],
    rule: 'querer que → 虚拟式（decir 的虚拟式 digas）。',
    zh: '我要你说实话。',
    topic: 'subjuntivo',
    level: 'B1',
  },
];

/** por vs para。 */
export const POR_PARA = [
  {
    sentence: 'Este regalo es ___ ti.',
    answer: 'para',
    options: ['por', 'para'],
    rule: '表示"给谁的"（对象）用 para。',
    zh: '这个礼物是给你的。',
    topic: 'por-para',
    level: 'A2',
  },
  {
    sentence: 'Gracias ___ tu ayuda.',
    answer: 'por',
    options: ['por', 'para'],
    rule: '表示感谢的原因用 por。',
    zh: '谢谢你的帮助。',
    topic: 'por-para',
    level: 'A2',
  },
  {
    sentence: 'Estudio ___ aprobar el examen.',
    answer: 'para',
    options: ['por', 'para'],
    rule: '表示目的用 para。',
    zh: '我学习是为了通过考试。',
    topic: 'por-para',
    level: 'A2',
  },
  {
    sentence: 'Caminé ___ el parque.',
    answer: 'por',
    options: ['por', 'para'],
    rule: '表示"穿过/经过某处"用 por。',
    zh: '我穿过公园走。',
    topic: 'por-para',
    level: 'A2',
  },
  {
    sentence: 'Este tren va ___ Madrid.',
    answer: 'para',
    options: ['por', 'para'],
    rule: '表示目的地用 para。',
    zh: '这趟火车开往马德里。',
    topic: 'por-para',
    level: 'A2',
  },
];

/** 前置词组合：a / de / en 的固定搭配。 */
export const PREP_PAIRS = [
  {
    sentence: 'Voy ___ la escuela.',
    answer: 'a',
    options: ['a', 'en', 'de'],
    rule: '表示方向/目的地用 a。',
    zh: '我去学校。',
    topic: 'prep',
    level: 'A1',
  },
  {
    sentence: 'Estoy ___ la escuela.',
    answer: 'en',
    options: ['a', 'en', 'de'],
    rule: '表示位置用 en。',
    zh: '我在学校。',
    topic: 'prep',
    level: 'A1',
  },
  {
    sentence: 'Vengo ___ la escuela.',
    answer: 'de',
    options: ['a', 'en', 'de'],
    rule: '表示来源用 de。',
    zh: '我从学校来。',
    topic: 'prep',
    level: 'A1',
  },
  {
    sentence: 'Pienso ___ ti todos los días.',
    answer: 'en',
    options: ['a', 'en', 'de'],
    rule: 'pensar en 是固定搭配。',
    zh: '我每天都想着你。',
    topic: 'prep',
    level: 'A2',
  },
];

/** 按考点分组。 */
export const GRAMMAR_BANK = {
  'ser-estar': SER_ESTAR,
  subjuntivo: SUBJUNTIVO,
  'por-para': POR_PARA,
  prep: PREP_PAIRS,
};

/** 考点中文名。 */
export const GRAMMAR_TOPIC_LABELS = {
  'ser-estar': 'ser / estar',
  subjuntivo: '虚拟式',
  'por-para': 'por / para',
  prep: '介词搭配',
};

/** 摊平所有语法题。 */
export function allGrammar() {
  const out = [];
  for (const [topic, list] of Object.entries(GRAMMAR_BANK)) {
    for (const item of list) out.push({ ...item, topic });
  }
  return out;
}
