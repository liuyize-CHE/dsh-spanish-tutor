/**
 * 内置种子词库。
 *
 * 选词标准：西语 A1–B1 最高频、最常考、最容易在阴阳性上踩坑的。
 * 每个词的 gender 都是人工核对的（不靠规则推），规则只用作兜底。
 */

/** 动词（按变位难度分组）。 */
export const VERBS = [
  // ── 规则三组，先建立信心 ──
  { infinitive: 'hablar', meaning: '说、讲', group: 'ar', level: 'A1' },
  { infinitive: 'trabajar', meaning: '工作', group: 'ar', level: 'A1' },
  { infinitive: 'estudiar', meaning: '学习', group: 'ar', level: 'A1' },
  { infinitive: 'comprar', meaning: '买', group: 'ar', level: 'A1' },
  { infinitive: 'llamar', meaning: '叫、打电话', group: 'ar', level: 'A1' },
  { infinitive: 'comer', meaning: '吃', group: 'er', level: 'A1' },
  { infinitive: 'beber', meaning: '喝', group: 'er', level: 'A1' },
  { infinitive: 'aprender', meaning: '学会', group: 'er', level: 'A1' },
  { infinitive: 'comprender', meaning: '理解', group: 'er', level: 'A1' },
  { infinitive: 'vivir', meaning: '住、活', group: 'ir', level: 'A1' },
  { infinitive: 'escribir', meaning: '写', group: 'ir', level: 'A1' },
  { infinitive: 'abrir', meaning: '打开', group: 'ir', level: 'A1' },
  { infinitive: 'recibir', meaning: '收到', group: 'ir', level: 'A1' },
  { infinitive: 'partir', meaning: '出发、分开', group: 'ir', level: 'A2' },

  // ── 最核心的不规则 ──
  { infinitive: 'ser', meaning: '是（本质）', group: 'er', level: 'A1', irregular: true },
  { infinitive: 'estar', meaning: '在、处于', group: 'ar', level: 'A1', irregular: true },
  { infinitive: 'ir', meaning: '去', group: 'ir', level: 'A1', irregular: true },
  { infinitive: 'tener', meaning: '有', group: 'er', level: 'A1', irregular: true },
  { infinitive: 'haber', meaning: '有（助动词）', group: 'er', level: 'A1', irregular: true },
  { infinitive: 'hacer', meaning: '做', group: 'er', level: 'A1', irregular: true },
  { infinitive: 'poder', meaning: '能够', group: 'er', level: 'A1', irregular: true },
  { infinitive: 'querer', meaning: '想要、爱', group: 'er', level: 'A1', irregular: true },
  { infinitive: 'saber', meaning: '知道', group: 'er', level: 'A1', irregular: true },
  { infinitive: 'decir', meaning: '说', group: 'ir', level: 'A1', irregular: true },
  { infinitive: 'venir', meaning: '来', group: 'ir', level: 'A1', irregular: true },
  { infinitive: 'dar', meaning: '给', group: 'ar', level: 'A1', irregular: true },
  { infinitive: 'ver', meaning: '看见', group: 'er', level: 'A1', irregular: true },
  { infinitive: 'poner', meaning: '放', group: 'er', level: 'A2', irregular: true },
  { infinitive: 'salir', meaning: '出去', group: 'ir', level: 'A2', irregular: true },
  { infinitive: 'traer', meaning: '带来', group: 'er', level: 'A2', irregular: true },
  { infinitive: 'conocer', meaning: '认识', group: 'er', level: 'A2', irregular: true },
  { infinitive: 'parecer', meaning: '显得、似乎', group: 'er', level: 'A2', irregular: true },
  { infinitive: 'oír', meaning: '听见', group: 'ir', level: 'A2', irregular: true },
  { infinitive: 'leer', meaning: '读', group: 'er', level: 'A2', irregular: true },
  { infinitive: 'creer', meaning: '相信', group: 'er', level: 'A2', irregular: true },
  { infinitive: 'caer', meaning: '落下', group: 'er', level: 'B1', irregular: true },
  { infinitive: 'valer', meaning: '值', group: 'er', level: 'B1', irregular: true },
  { infinitive: 'caber', meaning: '容得下', group: 'er', level: 'B1', irregular: true },
  { infinitive: 'andar', meaning: '走', group: 'ar', level: 'B1', irregular: true },

  // ── 词干变化（皮革型）──
  { infinitive: 'pensar', meaning: '想', group: 'ar', level: 'A1', stemChange: 'e→ie' },
  { infinitive: 'empezar', meaning: '开始', group: 'ar', level: 'A1', stemChange: 'e→ie' },
  { infinitive: 'cerrar', meaning: '关闭', group: 'ar', level: 'A1', stemChange: 'e→ie' },
  { infinitive: 'entender', meaning: '明白', group: 'er', level: 'A1', stemChange: 'e→ie' },
  { infinitive: 'perder', meaning: '丢失', group: 'er', level: 'A1', stemChange: 'e→ie' },
  { infinitive: 'contar', meaning: '数、讲述', group: 'ar', level: 'A1', stemChange: 'o→ue' },
  { infinitive: 'encontrar', meaning: '找到', group: 'ar', level: 'A1', stemChange: 'o→ue' },
  { infinitive: 'recordar', meaning: '记得', group: 'ar', level: 'A1', stemChange: 'o→ue' },
  { infinitive: 'volver', meaning: '回来', group: 'er', level: 'A1', stemChange: 'o→ue' },
  { infinitive: 'devolver', meaning: '归还', group: 'er', level: 'A2', stemChange: 'o→ue' },
  { infinitive: 'dormir', meaning: '睡觉', group: 'ir', level: 'A1', stemChange: 'o→ue/u' },
  { infinitive: 'jugar', meaning: '玩', group: 'ar', level: 'A1', stemChange: 'u→ue' },
  { infinitive: 'mostrar', meaning: '展示', group: 'ar', level: 'A2', stemChange: 'o→ue' },
  { infinitive: 'probar', meaning: '尝试、品尝', group: 'ar', level: 'A2', stemChange: 'o→ue' },
  { infinitive: 'mover', meaning: '移动', group: 'er', level: 'A2', stemChange: 'o→ue' },
  { infinitive: 'pedir', meaning: '请求、点菜', group: 'ir', level: 'A1', stemChange: 'e→i' },
  { infinitive: 'repetir', meaning: '重复', group: 'ir', level: 'A1', stemChange: 'e→i' },
  { infinitive: 'seguir', meaning: '跟随、继续', group: 'ir', level: 'A2', stemChange: 'e→i' },
  { infinitive: 'servir', meaning: '服务、上菜', group: 'ir', level: 'A2', stemChange: 'e→i' },
  { infinitive: 'preferir', meaning: '更喜欢', group: 'ir', level: 'A1', stemChange: 'e→ie/i' },
  { infinitive: 'sentir', meaning: '感觉', group: 'ir', level: 'A2', stemChange: 'e→ie/i' },
  { infinitive: 'vestir', meaning: '穿衣', group: 'ir', level: 'A2', stemChange: 'e→i' },
  { infinitive: 'elegir', meaning: '选择', group: 'ir', level: 'B1', stemChange: 'e→i' },
  { infinitive: 'corregir', meaning: '改正', group: 'ir', level: 'B1', stemChange: 'e→i' },
  { infinitive: 'reír', meaning: '笑', group: 'ir', level: 'B1', stemChange: 'e→i' },

  // ── 正字法变化 ──
  { infinitive: 'llegar', meaning: '到达', group: 'ar', level: 'A1', orthographic: true },
  { infinitive: 'buscar', meaning: '寻找', group: 'ar', level: 'A1', orthographic: true },
  { infinitive: 'sacar', meaning: '取出', group: 'ar', level: 'A1', orthographic: true },
  { infinitive: 'pagar', meaning: '付款', group: 'ar', level: 'A1', orthographic: true },
  { infinitive: 'coger', meaning: '拿、搭乘', group: 'er', level: 'A2', orthographic: true },
  { infinitive: 'dirigir', meaning: '领导', group: 'ir', level: 'B1', orthographic: true },
  { infinitive: 'construir', meaning: '建造', group: 'ir', level: 'B1', orthographic: true },
  { infinitive: 'huir', meaning: '逃跑', group: 'ir', level: 'B1', orthographic: true },
];

/** 名词（gender 全部人工核对）。 */
export const NOUNS = [
  // 规则阳性
  { noun: 'libro', gender: 'm', meaning: '书', level: 'A1' },
  { noun: 'coche', gender: 'm', meaning: '汽车', level: 'A1' },
  { noun: 'amigo', gender: 'm', meaning: '朋友（男）', level: 'A1' },
  { noun: 'hombre', gender: 'm', meaning: '男人', level: 'A1' },
  { noun: 'perro', gender: 'm', meaning: '狗', level: 'A1' },
  { noun: 'trabajo', gender: 'm', meaning: '工作', level: 'A1' },
  { noun: 'dinero', gender: 'm', meaning: '钱', level: 'A1' },
  { noun: 'año', gender: 'm', meaning: '年', level: 'A1' },
  { noun: 'día', gender: 'm', meaning: '天（阳性特例）', level: 'A1' },
  { noun: 'idioma', gender: 'm', meaning: '语言（阳性特例）', level: 'A1' },
  { noun: 'problema', gender: 'm', meaning: '问题（阳性特例）', level: 'A1' },
  { noun: 'mapa', gender: 'm', meaning: '地图（阳性特例）', level: 'A1' },
  { noun: 'sistema', gender: 'm', meaning: '系统（阳性特例）', level: 'A2' },
  { noun: 'viaje', gender: 'm', meaning: '旅行', level: 'A1' },
  { noun: 'garaje', gender: 'm', meaning: '车库', level: 'A2' },
  { noun: 'color', gender: 'm', meaning: '颜色', level: 'A1' },
  { noun: 'amor', gender: 'm', meaning: '爱', level: 'A1' },
  { noun: 'camión', gender: 'm', meaning: '卡车', level: 'A2' },
  { noun: 'jardín', gender: 'm', meaning: '花园', level: 'A2' },
  { noun: 'árbol', gender: 'm', meaning: '树', level: 'A1' },
  { noun: 'hotel', gender: 'm', meaning: '旅馆', level: 'A1' },
  { noun: 'papel', gender: 'm', meaning: '纸', level: 'A1' },
  { noun: 'profesor', gender: 'm', meaning: '老师（男）', level: 'A1' },
  { noun: 'rey', gender: 'm', meaning: '国王', level: 'A2' },

  // 规则阴性
  { noun: 'casa', gender: 'f', meaning: '房子', level: 'A1' },
  { noun: 'mesa', gender: 'f', meaning: '桌子', level: 'A1' },
  { noun: 'amiga', gender: 'f', meaning: '朋友（女）', level: 'A1' },
  { noun: 'mujer', gender: 'f', meaning: '女人', level: 'A1' },
  { noun: 'silla', gender: 'f', meaning: '椅子', level: 'A1' },
  { noun: 'puerta', gender: 'f', meaning: '门', level: 'A1' },
  { noun: 'escuela', gender: 'f', meaning: '学校', level: 'A1' },
  { noun: 'noche', gender: 'f', meaning: '夜晚', level: 'A1' },
  { noun: 'ciudad', gender: 'f', meaning: '城市', level: 'A1' },
  { noun: 'verdad', gender: 'f', meaning: '真相', level: 'A2' },
  { noun: 'libertad', gender: 'f', meaning: '自由', level: 'A2' },
  { noun: 'canción', gender: 'f', meaning: '歌', level: 'A1' },
  { noun: 'nación', gender: 'f', meaning: '民族、国家', level: 'A2' },
  { noun: 'gente', gender: 'f', meaning: '人们', level: 'A1' },
  { noun: 'clase', gender: 'f', meaning: '课、班级', level: 'A1' },
  { noun: 'calle', gender: 'f', meaning: '街道', level: 'A1' },
  { noun: 'llave', gender: 'f', meaning: '钥匙', level: 'A1' },
  { noun: 'leche', gender: 'f', meaning: '牛奶', level: 'A1' },
  { noun: 'carne', gender: 'f', meaning: '肉', level: 'A1' },
  { noun: 'sangre', gender: 'f', meaning: '血', level: 'A2' },
  { noun: 'muerte', gender: 'f', meaning: '死亡', level: 'A2' },
  { noun: 'flor', gender: 'f', meaning: '花', level: 'A1' },
  { noun: 'luz', gender: 'f', meaning: '光', level: 'A2' },
  { noun: 'voz', gender: 'f', meaning: '声音', level: 'A2' },
  { noun: 'actriz', gender: 'f', meaning: '女演员', level: 'A2' },
  { noun: 'costumbre', gender: 'f', meaning: '习惯', level: 'B1' },

  // 阴性但 -o 结尾
  { noun: 'mano', gender: 'f', meaning: '手（阴性特例）', level: 'A1' },
  { noun: 'foto', gender: 'f', meaning: '照片（阴性特例）', level: 'A1' },
  { noun: 'moto', gender: 'f', meaning: '摩托车（阴性特例）', level: 'A1' },
  { noun: 'radio', gender: 'f', meaning: '收音机（阴性特例）', level: 'A1' },

  // 重读 a 开头：冠词用 el 但仍是阴性
  { noun: 'agua', gender: 'f', meaning: '水（el agua）', level: 'A1' },
  { noun: 'águila', gender: 'f', meaning: '鹰（el águila）', level: 'A2' },
  { noun: 'alma', gender: 'f', meaning: '灵魂（el alma）', level: 'B1' },
  { noun: 'aula', gender: 'f', meaning: '教室（el aula）', level: 'A2' },
  { noun: 'hambre', gender: 'f', meaning: '饥饿（el hambre）', level: 'A1' },
];

/** 形容词（用于一致练习）。 */
export const ADJECTIVES = [
  { adjective: 'bueno', meaning: '好的', level: 'A1' },
  { adjective: 'malo', meaning: '坏的', level: 'A1' },
  { adjective: 'grande', meaning: '大的', level: 'A1' },
  { adjective: 'pequeño', meaning: '小的', level: 'A1' },
  { adjective: 'nuevo', meaning: '新的', level: 'A1' },
  { adjective: 'viejo', meaning: '旧的、老的', level: 'A1' },
  { adjective: 'bonito', meaning: '漂亮的', level: 'A1' },
  { adjective: 'caro', meaning: '贵的', level: 'A1' },
  { adjective: 'barato', meaning: '便宜的', level: 'A1' },
  { adjective: 'difícil', meaning: '难的', level: 'A1' },
  { adjective: 'fácil', meaning: '容易的', level: 'A1' },
  { adjective: 'feliz', meaning: '幸福的', level: 'A1' },
  { adjective: 'triste', meaning: '悲伤的', level: 'A1' },
  { adjective: 'rápido', meaning: '快的', level: 'A1' },
  { adjective: 'lento', meaning: '慢的', level: 'A1' },
  { adjective: 'trabajador', meaning: '勤劳的', level: 'A2' },
];

/** 完整题库。 */
export const BANK = {
  verbs: VERBS,
  nouns: NOUNS,
  adjectives: ADJECTIVES,
};

/**
 * 词库覆盖到的等级。
 *
 * 只列真的有词的等级：B2 / C1 在词库里是 **0 个词**，
 * 留着它们会让「难度」这个设置变成摆设 —— 选 C1 和选 B1 出的题完全一样
 * （实测：B1/B2/C1 都是动词 72、名词 59、形容词 16）。
 * 补词是大工程，先如实地把不可用的档位撤掉。
 */
export const LEVELS = ['A1', 'A2', 'B1'];

/** 某个等级允许用到的全部等级（含比它低的）。 */
export function levelOrder(max) {
  const idx = LEVELS.indexOf(max);
  return idx < 0 ? LEVELS : LEVELS.slice(0, idx + 1);
}

/** 这条内容的等级是否落在所选难度之内。 */
export function levelAllows(max, itemLevel) {
  return levelOrder(max).includes(itemLevel ?? 'A1');
}

/** 按等级筛选题库。 */
export function bankAtLevel(bank, level) {
  const keep = (item) => levelAllows(level, item.level);
  return {
    verbs: (bank.verbs ?? []).filter(keep),
    nouns: (bank.nouns ?? []).filter(keep),
    adjectives: (bank.adjectives ?? []).filter(keep),
  };
}

