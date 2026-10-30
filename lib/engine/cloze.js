/**
 * 例句库：句子填空（cloze）题型用。
 *
 * 每条例句的 `answer` 是挖掉的那个词，`sentence` 用 ___ 占位。
 * 设计原则：
 *   1. **句子必须语法正确、自然**，不能是生造的；
 *   2. 挖空的词必须**只有唯一正确答案**（否则判分不公平）；
 *   3. 每句带中文翻译，让学习者知道整句意思；
 *   4. 带 `hint` 说明这句考什么（变位？介词？冠词？）。
 *
 * 覆盖三类考点：
 *   - conjugation：动词变位（挖变位后的形式）
 *   - article：冠词（el/la/los/las/un/una）
 *   - preposition：介词（a/de/en/con/por/para）
 *   - agreement：形容词性数一致
 */

/** 动词变位填空。 */
export const CLOZE_VERBS = [
  // -ar 规则
  { sentence: 'Yo ___ español todos los días.', answer: 'estudio', verb: 'estudiar', tense: 'presente', person: '1s', zh: '我每天学西班牙语。', level: 'A1' },
  { sentence: 'Ella ___ en un hospital.', answer: 'trabaja', verb: 'trabajar', tense: 'presente', person: '3s', zh: '她在医院工作。', level: 'A1' },
  { sentence: 'Nosotros ___ la cena juntos.', answer: 'preparamos', verb: 'preparar', tense: 'presente', person: '1p', zh: '我们一起准备晚饭。', level: 'A1' },
  { sentence: 'Ayer ___ una película muy buena.', answer: 'vi', verb: 'ver', tense: 'preterito', person: '1s', zh: '昨天我看了一部很好的电影。', level: 'A2' },
  { sentence: 'Ellos ___ a Madrid el año pasado.', answer: 'viajaron', verb: 'viajar', tense: 'preterito', person: '3p', zh: '他们去年去了马德里。', level: 'A2' },

  // -er 规则
  { sentence: 'Yo ___ pan con el desayuno.', answer: 'como', verb: 'comer', tense: 'presente', person: '1s', zh: '我早餐吃面包。', level: 'A1' },
  { sentence: '¿Tú ___ café o té?', answer: 'bebes', verb: 'beber', tense: 'presente', person: '2s', zh: '你喝咖啡还是茶？', level: 'A1' },
  { sentence: 'Nosotros ___ la lección con atención.', answer: 'comprendemos', verb: 'comprender', tense: 'presente', person: '1p', zh: '我们认真理解这一课。', level: 'A1' },

  // -ir 规则
  { sentence: 'Yo ___ en Barcelona.', answer: 'vivo', verb: 'vivir', tense: 'presente', person: '1s', zh: '我住在巴塞罗那。', level: 'A1' },
  { sentence: 'Ella ___ una carta a su abuela.', answer: 'escribe', verb: 'escribir', tense: 'presente', person: '3s', zh: '她给祖母写信。', level: 'A1' },
  { sentence: '¿___ la puerta, por favor?', answer: 'abres', verb: 'abrir', tense: 'presente', person: '2s', zh: '请把门打开好吗？', level: 'A1' },

  // 不规则
  { sentence: 'Yo ___ de China.', answer: 'soy', verb: 'ser', tense: 'presente', person: '1s', zh: '我来自中国。', level: 'A1' },
  { sentence: 'Ella ___ muy cansada hoy.', answer: 'está', verb: 'estar', tense: 'presente', person: '3s', zh: '她今天很累。', level: 'A1' },
  { sentence: 'Nosotros ___ al cine esta noche.', answer: 'vamos', verb: 'ir', tense: 'presente', person: '1p', zh: '我们今晚去看电影。', level: 'A1' },
  { sentence: 'Yo ___ veinte años.', answer: 'tengo', verb: 'tener', tense: 'presente', person: '1s', zh: '我二十岁。', level: 'A1' },
  { sentence: '¿Tú ___ dónde está la estación?', answer: 'sabes', verb: 'saber', tense: 'presente', person: '2s', zh: '你知道车站在哪里吗？', level: 'A1' },
  { sentence: 'No ___ venir hoy.', answer: 'puedo', verb: 'poder', tense: 'presente', person: '1s', zh: '我今天不能来。', level: 'A1' },
  { sentence: 'Yo ___ un café, por favor.', answer: 'quiero', verb: 'querer', tense: 'presente', person: '1s', zh: '我要一杯咖啡，谢谢。', level: 'A1' },
  { sentence: 'Ella ___ la verdad.', answer: 'dice', verb: 'decir', tense: 'presente', person: '3s', zh: '她说实话。', level: 'A2' },
  { sentence: 'Yo ___ la tarea en casa.', answer: 'hago', verb: 'hacer', tense: 'presente', person: '1s', zh: '我在家做作业。', level: 'A1' },

  // 词干变化
  { sentence: 'Yo ___ que tienes razón.', answer: 'pienso', verb: 'pensar', tense: 'presente', person: '1s', zh: '我觉得你说得对。', level: 'A1' },
  { sentence: 'Ella ___ a las ocho.', answer: 'empieza', verb: 'empezar', tense: 'presente', person: '3s', zh: '她八点开始。', level: 'A1' },
  { sentence: 'Yo ___ mucho cuando hace calor.', answer: 'duermo', verb: 'dormir', tense: 'presente', person: '1s', zh: '天热的时候我睡得多。', level: 'A2' },
  { sentence: 'Nosotros ___ la respuesta.', answer: 'encontramos', verb: 'encontrar', tense: 'presente', person: '1p', zh: '我们找到了答案。', level: 'A2' },

  // 过去时
  { sentence: 'Ayer ___ al supermercado.', answer: 'fui', verb: 'ir', tense: 'preterito', person: '1s', zh: '昨天我去了超市。', level: 'A2' },
  { sentence: 'Ella ___ una carta larga.', answer: 'escribió', verb: 'escribir', tense: 'preterito', person: '3s', zh: '她写了一封长信。', level: 'A2' },
  { sentence: 'Nosotros ___ en aquel restaurante.', answer: 'comimos', verb: 'comer', tense: 'preterito', person: '1p', zh: '我们在那家餐厅吃了饭。', level: 'A2' },
  { sentence: 'Ellos ___ la verdad.', answer: 'supieron', verb: 'saber', tense: 'preterito', person: '3p', zh: '他们知道了真相。', level: 'B1' },
];

/** 冠词填空。 */
export const CLOZE_ARTICLES = [
  { sentence: '___ libro está en la mesa.', answer: 'El', zh: '书在桌上。', hint: 'libro 是阳性单数', level: 'A1' },
  { sentence: '___ casa es muy grande.', answer: 'La', zh: '这房子很大。', hint: 'casa 是阴性单数', level: 'A1' },
  { sentence: '___ agua está fría.', answer: 'El', zh: '水是凉的。', hint: 'agua 是阴性，但单数用 el（重读 a 开头）', level: 'A2' },
  { sentence: '___ manos son importantes.', answer: 'Las', zh: '手很重要。', hint: 'mano 是阴性，复数用 las', level: 'A2' },
  { sentence: 'Quiero ___ café.', answer: 'un', zh: '我要一杯咖啡。', hint: 'café 阳性，不定冠词用 un', level: 'A1' },
  { sentence: 'Necesito ___ silla.', answer: 'una', zh: '我需要一把椅子。', hint: 'silla 阴性，不定冠词用 una', level: 'A1' },
  { sentence: '___ problemas son difíciles.', answer: 'Los', zh: '这些问题很难。', hint: 'problema 是阳性（希腊词源）', level: 'A2' },
];

/** 介词填空。 */
export const CLOZE_PREPOSITIONS = [
  { sentence: 'Voy ___ la escuela.', answer: 'a', zh: '我去学校。', hint: '表示方向用 a', level: 'A1' },
  { sentence: 'Soy ___ China.', answer: 'de', zh: '我来自中国。', hint: '表示来源用 de', level: 'A1' },
  { sentence: 'El libro está ___ la mesa.', answer: 'en', zh: '书在桌上。', hint: '表示位置用 en', level: 'A1' },
  { sentence: 'Voy ___ mi hermana.', answer: 'con', zh: '我和姐姐一起去。', hint: '表示伴随用 con', level: 'A1' },
  { sentence: 'Este regalo es ___ ti.', answer: 'para', zh: '这个礼物是给你的。', hint: '表示对象/用途用 para', level: 'A2' },
  { sentence: 'Gracias ___ tu ayuda.', answer: 'por', zh: '谢谢你的帮助。', hint: '表示原因用 por', level: 'A2' },
  { sentence: 'Estudio español ___ dos años.', answer: 'desde', zh: '我学西班牙语两年了。', hint: '表示起点用 desde', level: 'B1' },
];

/** 形容词一致填空。 */
export const CLOZE_AGREEMENT = [
  { sentence: 'La casa es muy ___. (grande)', answer: 'grande', zh: '这房子很大。', hint: 'grande 阴阳同形', level: 'A1' },
  { sentence: 'Los libros son ___. (nuevo)', answer: 'nuevos', zh: '这些书是新的。', hint: 'nuevo → 阳性复数 nuevos', level: 'A1' },
  { sentence: 'Las casas son ___. (bonito)', answer: 'bonitas', zh: '这些房子很漂亮。', hint: 'bonito → 阴性复数 bonitas', level: 'A1' },
  { sentence: 'El chico es ___. (trabajador)', answer: 'trabajador', zh: '这个男孩很勤劳。', hint: 'trabajador 阳性单数不变', level: 'A2' },
  { sentence: 'La chica es ___. (trabajador)', answer: 'trabajadora', zh: '这个女孩很勤劳。', hint: 'trabajador → 阴性 trabajadora', level: 'A2' },
];

/**
 * 全部例句按考点分组。
 * key 是 cloze 的 `topic`，值是该组的例句数组。
 */
export const CLOZE_BANK = {
  conjugation: CLOZE_VERBS,
  article: CLOZE_ARTICLES,
  preposition: CLOZE_PREPOSITIONS,
  agreement: CLOZE_AGREEMENT,
};

/** 所有例句摊平（用于统计与校验）。 */
export function allCloze() {
  const out = [];
  for (const [topic, list] of Object.entries(CLOZE_BANK)) {
    for (const item of list) out.push({ ...item, topic });
  }
  return out;
}
