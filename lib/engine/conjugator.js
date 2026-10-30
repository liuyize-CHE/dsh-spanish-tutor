/**
 * 西语变位引擎 —— 纯函数、零依赖、可离线运行。
 *
 * 设计原则：**规则优先，例外表兜底**。
 * - 规则部分处理 -ar/-er/-ir 三组词尾 × 各时态的常规变位；
 * - 不规则动词用「显式六个人称数组」写死（比分层规则更不容易出错，也更好验证）；
 * - 介于两者之间的（词干变化、正字法变化、重音位移）用描述符 + 规则推导。
 *
 * 每个推导出来的形式都有 test/engine.test.mjs 里的断言盯着。
 */

/** 六个人称：第一/二/三 单数，第一/二/三 复数。 */
export const PERSONS = ['1s', '2s', '3s', '1p', '2p', '3p'];

/** 人称在界面上的显示名。 */
export const PERSON_LABELS = {
  '1s': 'yo',
  '2s': 'tú',
  '3s': 'él / ella / usted',
  '1p': 'nosotros',
  '2p': 'vosotros',
  '3p': 'ellos / ellas / ustedes',
};

/** 支持的全部时态/形式。 */
export const TENSES = [
  'presente',
  'preterito',
  'imperfecto',
  'futuro',
  'condicional',
  'subjuntivo',
  'perfecto',
  'pluscuamperfecto',
  'futuroPerfecto',
  'condicionalPerfecto',
  'imperativo',
];

/** 时态显示名（西语 + 中文）。 */
export const TENSE_LABELS = {
  presente: 'Presente · 现在时',
  preterito: 'Pretérito indefinido · 简单过去时',
  imperfecto: 'Imperfecto · 过去未完成时',
  futuro: 'Futuro · 将来时',
  condicional: 'Condicional · 条件式',
  subjuntivo: 'Presente de subjuntivo · 虚拟式现在时',
  perfecto: 'Pretérito perfecto · 现在完成时',
  pluscuamperfecto: 'Pluscuamperfecto · 过去完成时',
  futuroPerfecto: 'Futuro perfecto · 将来完成时',
  condicionalPerfecto: 'Condicional perfecto · 条件完成时',
  imperativo: 'Imperativo · 命令式',
};

// ─────────────────────────── 规则词尾 ───────────────────────────

const ENDINGS = {
  presente: {
    ar: ['o', 'as', 'a', 'amos', 'áis', 'an'],
    er: ['o', 'es', 'e', 'emos', 'éis', 'en'],
    ir: ['o', 'es', 'e', 'imos', 'ís', 'en'],
  },
  preterito: {
    ar: ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'],
    er: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'],
    ir: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'],
  },
  imperfecto: {
    ar: ['aba', 'abas', 'aba', 'ábamos', 'abais', 'aban'],
    er: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],
    ir: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],
  },
  futuro: {
    ar: ['é', 'ás', 'á', 'emos', 'éis', 'án'],
    er: ['é', 'ás', 'á', 'emos', 'éis', 'án'],
    ir: ['é', 'ás', 'á', 'emos', 'éis', 'án'],
  },
  condicional: {
    ar: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],
    er: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],
    ir: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],
  },
  subjuntivo: {
    ar: ['e', 'es', 'e', 'emos', 'éis', 'en'],
    er: ['a', 'as', 'a', 'amos', 'áis', 'an'],
    ir: ['a', 'as', 'a', 'amos', 'áis', 'an'],
  },
};

// ────────────────────── 完全不规则：现在时 ──────────────────────
// 写死六个人称。凡是「规则推不出来」的现在时都在这里。

const PRESENT_IRREGULAR = {
  ser: ['soy', 'eres', 'es', 'somos', 'sois', 'son'],
  estar: ['estoy', 'estás', 'está', 'estamos', 'estáis', 'están'],
  ir: ['voy', 'vas', 'va', 'vamos', 'vais', 'van'],
  haber: ['he', 'has', 'ha', 'hemos', 'habéis', 'han'],
  dar: ['doy', 'das', 'da', 'damos', 'dais', 'dan'],
  ver: ['veo', 'ves', 've', 'vemos', 'veis', 'ven'],
  saber: ['sé', 'sabes', 'sabe', 'sabemos', 'sabéis', 'saben'],
  tener: ['tengo', 'tienes', 'tiene', 'tenemos', 'tenéis', 'tienen'],
  venir: ['vengo', 'vienes', 'viene', 'venimos', 'venís', 'vienen'],
  hacer: ['hago', 'haces', 'hace', 'hacemos', 'hacéis', 'hacen'],
  poner: ['pongo', 'pones', 'pone', 'ponemos', 'ponéis', 'ponen'],
  decir: ['digo', 'dices', 'dice', 'decimos', 'decís', 'dicen'],
  salir: ['salgo', 'sales', 'sale', 'salimos', 'salís', 'salen'],
  oír: ['oigo', 'oyes', 'oye', 'oímos', 'oís', 'oyen'],
  traer: ['traigo', 'traes', 'trae', 'traemos', 'traéis', 'traen'],
  valer: ['valgo', 'vales', 'vale', 'valemos', 'valéis', 'valen'],
  caber: ['quepo', 'cabes', 'cabe', 'cabemos', 'cabéis', 'caben'],
  caer: ['caigo', 'caes', 'cae', 'caemos', 'caéis', 'caen'],
  conocer: ['conozco', 'conoces', 'conoce', 'conocemos', 'conocéis', 'conocen'],
  parecer: ['parezco', 'pareces', 'parece', 'parecemos', 'parecéis', 'parecen'],
  conducir: ['conduzco', 'conduces', 'conduce', 'conducimos', 'conducís', 'conducen'],
  producir: ['produzco', 'produces', 'produce', 'producimos', 'producís', 'producen'],
  traducir: ['traduzco', 'traduces', 'traduce', 'traducimos', 'traducís', 'traducen'],
  coger: ['cojo', 'coges', 'coge', 'cogemos', 'cogéis', 'cogen'],
  elegir: ['elijo', 'eliges', 'elige', 'elegimos', 'elegís', 'eligen'],
  dirigir: ['dirijo', 'diriges', 'dirige', 'dirigimos', 'dirigís', 'dirigen'],
  corregir: ['corrijo', 'corriges', 'corrige', 'corregimos', 'corregís', 'corrigen'],
  reír: ['río', 'ríes', 'ríe', 'reímos', 'reís', 'ríen'],
  sonreír: ['sonrío', 'sonríes', 'sonríe', 'sonreímos', 'sonreís', 'sonríen'],
  leer: ['leo', 'lees', 'lee', 'leemos', 'leéis', 'leen'],
  creer: ['creo', 'crees', 'cree', 'creemos', 'creéis', 'creen'],
  construir: ['construyo', 'construyes', 'construye', 'construimos', 'construís', 'construyen'],
  huir: ['huyo', 'huyes', 'huye', 'huimos', 'huís', 'huyen'],
  jugar: ['juego', 'juegas', 'juega', 'jugamos', 'jugáis', 'juegan'],
  poder: ['puedo', 'puedes', 'puede', 'podemos', 'podéis', 'pueden'],
  querer: ['quiero', 'quieres', 'quiere', 'queremos', 'queréis', 'quieren'],
  volver: ['vuelvo', 'vuelves', 'vuelve', 'volvemos', 'volvéis', 'vuelven'],
  devolver: ['devuelvo', 'devuelves', 'devuelve', 'devolvemos', 'devolvéis', 'devuelven'],
  mover: ['muevo', 'mueves', 'mueve', 'movemos', 'movéis', 'mueven'],
  empezar: ['empiezo', 'empiezas', 'empieza', 'empezamos', 'empezáis', 'empiezan'],
  pensar: ['pienso', 'piensas', 'piensa', 'pensamos', 'pensáis', 'piensan'],
  entender: ['entiendo', 'entiendes', 'entiende', 'entendemos', 'entendéis', 'entienden'],
  cerrar: ['cierro', 'cierras', 'cierra', 'cerramos', 'cerráis', 'cierran'],
  perder: ['pierdo', 'pierdes', 'pierde', 'perdemos', 'perdéis', 'pierden'],
  contar: ['cuento', 'cuentas', 'cuenta', 'contamos', 'contáis', 'cuentan'],
  encontrar: ['encuentro', 'encuentras', 'encuentra', 'encontramos', 'encontráis', 'encuentran'],
  recordar: ['recuerdo', 'recuerdas', 'recuerda', 'recordamos', 'recordáis', 'recuerdan'],
  costar: ['cuesto', 'cuestas', 'cuesta', 'costamos', 'costáis', 'cuestan'],
  volar: ['vuelo', 'vuelas', 'vuela', 'volamos', 'voláis', 'vuelan'],
  mostrar: ['muestro', 'muestras', 'muestra', 'mostramos', 'mostráis', 'muestran'],
  probar: ['pruebo', 'pruebas', 'prueba', 'probamos', 'probáis', 'prueban'],
  dormir: ['duermo', 'duermes', 'duerme', 'dormimos', 'dormís', 'duermen'],
  morir: ['muero', 'mueres', 'muere', 'morimos', 'morís', 'mueren'],
  pedir: ['pido', 'pides', 'pide', 'pedimos', 'pedís', 'piden'],
  seguir: ['sigo', 'sigues', 'sigue', 'seguimos', 'seguís', 'siguen'],
  conseguir: ['consigo', 'consigues', 'consigue', 'conseguimos', 'conseguís', 'consiguen'],
  sentir: ['siento', 'sientes', 'siente', 'sentimos', 'sentís', 'sienten'],
  preferir: ['prefiero', 'prefieres', 'prefiere', 'preferimos', 'preferís', 'prefieren'],
  repetir: ['repito', 'repites', 'repite', 'repetimos', 'repetís', 'repiten'],
  servir: ['sirvo', 'sirves', 'sirve', 'servimos', 'servís', 'sirven'],
  vestir: ['visto', 'vistes', 'viste', 'vestimos', 'vestís', 'visten'],
  medir: ['mido', 'mides', 'mide', 'medimos', 'medís', 'miden'],
};

// ───────────────────── 完全不规则：简单过去时 ─────────────────────
// 注意 dio / fue / vio 都不带重音，这些必须写死，规则会推错。

const PRETERITE_IRREGULAR = {
  ser: ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron'],
  ir: ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron'],
  dar: ['di', 'diste', 'dio', 'dimos', 'disteis', 'dieron'],
  ver: ['vi', 'viste', 'vio', 'vimos', 'visteis', 'vieron'],
  haber: ['hube', 'hubiste', 'hubo', 'hubimos', 'hubisteis', 'hubieron'],
  tener: ['tuve', 'tuviste', 'tuvo', 'tuvimos', 'tuvisteis', 'tuvieron'],
  estar: ['estuve', 'estuviste', 'estuvo', 'estuvimos', 'estuvisteis', 'estuvieron'],
  andar: ['anduve', 'anduviste', 'anduvo', 'anduvimos', 'anduvisteis', 'anduvieron'],
  hacer: ['hice', 'hiciste', 'hizo', 'hicimos', 'hicisteis', 'hicieron'],
  decir: ['dije', 'dijiste', 'dijo', 'dijimos', 'dijisteis', 'dijeron'],
  poder: ['pude', 'pudiste', 'pudo', 'pudimos', 'pudisteis', 'pudieron'],
  poner: ['puse', 'pusiste', 'puso', 'pusimos', 'pusisteis', 'pusieron'],
  querer: ['quise', 'quisiste', 'quiso', 'quisimos', 'quisisteis', 'quisieron'],
  saber: ['supe', 'supiste', 'supo', 'supimos', 'supisteis', 'supieron'],
  venir: ['vine', 'viniste', 'vino', 'vinimos', 'vinisteis', 'vinieron'],
  traer: ['traje', 'trajiste', 'trajo', 'trajimos', 'trajisteis', 'trajeron'],
  caber: ['cupe', 'cupiste', 'cupo', 'cupimos', 'cupisteis', 'cupieron'],
  conducir: ['conduje', 'condujiste', 'condujo', 'condujimos', 'condujisteis', 'condujeron'],
  producir: ['produje', 'produjiste', 'produjo', 'produjimos', 'produjisteis', 'produjeron'],
  traducir: ['traduje', 'tradujiste', 'tradujo', 'tradujimos', 'tradujisteis', 'tradujeron'],
  oír: ['oí', 'oíste', 'oyó', 'oímos', 'oísteis', 'oyeron'],
  leer: ['leí', 'leíste', 'leyó', 'leímos', 'leísteis', 'leyeron'],
  creer: ['creí', 'creíste', 'creyó', 'creímos', 'creísteis', 'creyeron'],
  caer: ['caí', 'caíste', 'cayó', 'caímos', 'caísteis', 'cayeron'],
  huir: ['huí', 'huíste', 'huyó', 'huimos', 'huisteis', 'huyeron'],
  construir: ['construí', 'construiste', 'construyó', 'construimos', 'construisteis', 'construyeron'],
  reír: ['reí', 'reíste', 'rió', 'reímos', 'reísteis', 'rieron'],
  sonreír: ['sonreí', 'sonreíste', 'sonrió', 'sonreímos', 'sonreísteis', 'sonrieron'],
  dormir: ['dormí', 'dormiste', 'durmió', 'dormimos', 'dormisteis', 'durmieron'],
  morir: ['morí', 'moriste', 'murió', 'morimos', 'moristeis', 'murieron'],
  pedir: ['pedí', 'pediste', 'pidió', 'pedimos', 'pedisteis', 'pidieron'],
  seguir: ['seguí', 'seguiste', 'siguió', 'seguimos', 'seguisteis', 'siguieron'],
  conseguir: ['conseguí', 'conseguiste', 'consiguió', 'conseguimos', 'conseguisteis', 'consiguieron'],
  sentir: ['sentí', 'sentiste', 'sintió', 'sentimos', 'sentisteis', 'sintieron'],
  preferir: ['preferí', 'preferiste', 'prefirió', 'preferimos', 'preferisteis', 'prefirieron'],
  repetir: ['repetí', 'repetiste', 'repitió', 'repetimos', 'repetisteis', 'repitieron'],
  servir: ['serví', 'serviste', 'sirvió', 'servimos', 'servisteis', 'sirvieron'],
  vestir: ['vestí', 'vestiste', 'vistió', 'vestimos', 'vestisteis', 'vistieron'],
  medir: ['medí', 'mediste', 'midió', 'medimos', 'medisteis', 'midieron'],
  elegir: ['elegí', 'elegiste', 'eligió', 'elegimos', 'elegisteis', 'eligieron'],
  corregir: ['corregí', 'corregiste', 'corrigió', 'corregimos', 'corregisteis', 'corrigieron'],
};

// ─────────────────── 其余时态的不规则部件 ───────────────────

/** 过去未完成时只有三个动词不规则。 */
const IMPERFECT_IRREGULAR = {
  ser: ['era', 'eras', 'era', 'éramos', 'erais', 'eran'],
  ir: ['iba', 'ibas', 'iba', 'íbamos', 'ibais', 'iban'],
  ver: ['veía', 'veías', 'veía', 'veíamos', 'veíais', 'veían'],
};

/** 将来时/条件式的共同词干（不规则的在这里）。 */
const FUTURE_STEMS = {
  tener: 'tendr',
  poner: 'pondr',
  salir: 'saldr',
  venir: 'vendr',
  poder: 'podr',
  querer: 'querr',
  saber: 'sabr',
  haber: 'habr',
  hacer: 'har',
  decir: 'dir',
  caber: 'cabr',
  valer: 'valdr',
  salir_: 'saldr',
  // -er/-ir 之外还有两个常用：tener ya 上面有
};

/** 虚拟式词干：只有「从 yo 现在时去掉 -o」推不出来的才写在这里。 */
const SUBJ_EXPLICIT = {
  ser: ['sea', 'seas', 'sea', 'seamos', 'seáis', 'sean'],
  estar: ['esté', 'estés', 'esté', 'estemos', 'estéis', 'estén'],
  ir: ['vaya', 'vayas', 'vaya', 'vayamos', 'vayáis', 'vayan'],
  haber: ['haya', 'hayas', 'haya', 'hayamos', 'hayáis', 'hayan'],
  dar: ['dé', 'des', 'dé', 'demos', 'deis', 'den'],
  ver: ['vea', 'veas', 'vea', 'veamos', 'veáis', 'vean'],
  saber: ['sepa', 'sepas', 'sepa', 'sepamos', 'sepáis', 'sepan'],
  oír: ['oiga', 'oigas', 'oiga', 'oigamos', 'oigáis', 'oigan'],
  // 这些的虚拟式词干来自 yo 现在时（tengo→teng-、vengo→veng-），
  // 而 yo 的词干变化规则给不出 -g-，必须显式写。
  tener: ['tenga', 'tengas', 'tenga', 'tengamos', 'tengáis', 'tengan'],
  venir: ['venga', 'vengas', 'venga', 'vengamos', 'vengáis', 'vengan'],
  poner: ['ponga', 'pongas', 'ponga', 'pongamos', 'pongáis', 'pongan'],
  salir: ['salga', 'salgas', 'salga', 'salgamos', 'salgáis', 'salgan'],
  hacer: ['haga', 'hagas', 'haga', 'hagamos', 'hagáis', 'hagan'],
  decir: ['diga', 'digas', 'diga', 'digamos', 'digáis', 'digan'],
  traer: ['traiga', 'traigas', 'traiga', 'traigamos', 'traigáis', 'traigan'],
  caer: ['caiga', 'caigas', 'caiga', 'caigamos', 'caigáis', 'caigan'],
  valer: ['valga', 'valgas', 'valga', 'valgamos', 'valgáis', 'valgan'],
  caber: ['quepa', 'quepas', 'quepa', 'quepamos', 'quepáis', 'quepan'],
  conocer: ['conozca', 'conozcas', 'conozca', 'conozcamos', 'conozcáis', 'conozcan'],
  parecer: ['parezca', 'parezcas', 'parezca', 'parezcamos', 'parezcáis', 'parezcan'],
  conducir: ['conduzca', 'conduzcas', 'conduzca', 'conduzcamos', 'conduzcáis', 'conduzcan'],
  producir: ['produzca', 'produzcas', 'produzca', 'produzcamos', 'produzcáis', 'produzcan'],
  traducir: ['traduzca', 'traduzcas', 'traduzca', 'traduzcamos', 'traduzcáis', 'traduzcan'],
  coger: ['coja', 'cojas', 'coja', 'cojamos', 'cojáis', 'cojan'],
  elegir: ['elija', 'elijas', 'elija', 'elijamos', 'elijáis', 'elijan'],
  dirigir: ['dirija', 'dirijas', 'dirija', 'dirijamos', 'dirijáis', 'dirijan'],
  corregir: ['corrija', 'corrijas', 'corrija', 'corrijamos', 'corrijáis', 'corrijan'],
  reír: ['ría', 'rías', 'ría', 'riamos', 'riáis', 'rían'],
  sonreír: ['sonría', 'sonrías', 'sonría', 'sonriamos', 'sonriáis', 'sonrían'],
};

/**
 * 词干变化动词（「皮鞋型」）：重音落在词干时换元音， nosotros/vosotros 换回去。
 *
 * stressed = 1s/2s/3s/3p 用的词干；weak = nosotros/vosotros 用的词干。
 * -ar/-er 的 weak 就是原词干；-ir 的 weak 要走弱元音（sentir→sintamos, dormir→durmamos）。
 */
const STEM_CHANGE = {
  // e → ie（-ar）
  pensar: { stressed: 'piens', weak: 'pens' },
  empezar: { stressed: 'empiez', weak: 'empez' },
  cerrar: { stressed: 'cierr', weak: 'cerr' },
  despertar: { stressed: 'despiert', weak: 'despert' },
  sentar: { stressed: 'sient', weak: 'sent' },
  // e → ie（-er）
  entender: { stressed: 'entiend', weak: 'entend' },
  perder: { stressed: 'pierd', weak: 'perd' },
  querer: { stressed: 'quier', weak: 'quer' },
  tener: { stressed: 'tien', weak: 'ten' },
  venir: { stressed: 'vien', weak: 'ven' },
  // o → ue（-ar）
  contar: { stressed: 'cuent', weak: 'cont' },
  encontrar: { stressed: 'encuentr', weak: 'encontr' },
  recordar: { stressed: 'recuerd', weak: 'record' },
  costar: { stressed: 'cuest', weak: 'cost' },
  volar: { stressed: 'vuel', weak: 'vol' },
  mostrar: { stressed: 'muestr', weak: 'mostr' },
  probar: { stressed: 'prueb', weak: 'prob' },
  sonar: { stressed: 'suen', weak: 'son' },
  jugar: { stressed: 'jueg', weak: 'jug' },
  // o → ue（-er）
  poder: { stressed: 'pued', weak: 'pod' },
  volver: { stressed: 'vuelv', weak: 'volv' },
  devolver: { stressed: 'devuelv', weak: 'devolv' },
  mover: { stressed: 'muev', weak: 'mov' },
  llover: { stressed: 'lluev', weak: 'llov' },
  // e → i（-ir，nosotros 也用弱元音）
  pedir: { stressed: 'pid', weak: 'pid' },
  seguir: { stressed: 'sig', weak: 'sig' },
  conseguir: { stressed: 'consig', weak: 'consig' },
  repetir: { stressed: 'repit', weak: 'repit' },
  servir: { stressed: 'sirv', weak: 'sirv' },
  vestir: { stressed: 'vist', weak: 'vist' },
  medir: { stressed: 'mid', weak: 'mid' },
  // e → ie 但 nosotros 走 e→i（-ir）
  sentir: { stressed: 'sient', weak: 'sint' },
  preferir: { stressed: 'prefier', weak: 'prefir' },
  mentir: { stressed: 'mient', weak: 'mint' },
  // o → ue 但 nosotros 走 o→u（-ir）
  dormir: { stressed: 'duerm', weak: 'durm' },
  morir: { stressed: 'muer', weak: 'murm' },
};

/** 命令式第二人称单数的不规则形式（其余 = 现在时第三人称单数）。 */
const TU_IMPERATIVE_IRREGULAR = {
  tener: 'ten',
  poner: 'pon',
  salir: 'sal',
  venir: 'ven',
  hacer: 'haz',
  decir: 'di',
  ir: 've',
  ser: 'sé',
  estar: 'está',
  dar: 'da',
  ver: 've',
  haber: 'he',
  saber: 'sabe',
  oír: 'oye',
};

/** 过去分词的不规则形式。 */
const PARTICIPLE_IRREGULAR = {
  hacer: 'hecho',
  decir: 'dicho',
  ver: 'visto',
  poner: 'puesto',
  escribir: 'escrito',
  describir: 'descrito',
  abrir: 'abierto',
  cubrir: 'cubierto',
  morir: 'muerto',
  volver: 'vuelto',
  devolver: 'devuelto',
  envolver: 'envuelto',
  romper: 'roto',
  resolver: 'resuelto',
  freír: 'frito',
  imprimir: 'impreso',
  componer: 'compuesto',
  suponer: 'supuesto',
  romper_: 'roto',
  // 元音词干的 -er 动词过去分词要加重音（leído 不是 leido），-ir 的多数不加重音
  leer: 'leído',
  creer: 'creído',
  oír: 'oído',
  caer: 'caído',
  traer: 'traído',
  reír: 'reído',
  sonreír: 'sonreído',
  proveer: 'provisto',
};

/** 副动词的不规则形式。 */
const GERUND_IRREGULAR = {
  ir: 'yendo',
  leer: 'leyendo',
  creer: 'creyendo',
  caer: 'cayendo',
  traer: 'trayendo',
  oír: 'oyendo',
  huir: 'huyendo',
  construir: 'construyendo',
  decir: 'diciendo',
  venir: 'viniendo',
  poder: 'pudiendo',
  dormir: 'durmiendo',
  morir: 'muriendo',
  pedir: 'pidiendo',
  seguir: 'siguiendo',
  conseguir: 'consiguiendo',
  sentir: 'sintiendo',
  preferir: 'prefiriendo',
  repetir: 'repitiendo',
  servir: 'sirviendo',
  vestir: 'vistiendo',
  medir: 'midiendo',
  elegir: 'eligiendo',
  corregir: 'corrigiendo',
  reír: 'riendo',
  sonreír: 'sonriendo',
};

/** haber 的现在时（现在完成时用）。 */
const HABER_PRESENT = ['he', 'has', 'ha', 'hemos', 'habéis', 'han'];
const HABER_IMPERFECT = ['había', 'habías', 'había', 'habíamos', 'habíais', 'habían'];
const HABER_FUTURE = ['habré', 'habrás', 'habrá', 'habremos', 'habréis', 'habrán'];
const HABER_COND = ['habría', 'habrías', 'habría', 'habríamos', 'habríais', 'habrían'];

// ─────────────────────────── 工具函数 ───────────────────────────

/** 去掉变位词尾，得到动词词干（hablar → habl）。 */
function stemOf(infinitive) {
  return infinitive.slice(0, -2);
}

/** 判断动词属于哪一组：'ar' | 'er' | 'ir'。
 *
 * 注意 oír / reír / sonreír 这类原形结尾带重音（ír），所以判断前先去掉重音；
 * 词干本身仍用原始拼写（oír → o，reír → re）。
 */
export function groupOf(infinitive) {
  const raw = String(infinitive || '').trim().toLowerCase();
  const last = stripAccents(raw).slice(-2);
  if (last === 'ar' || last === 'er' || last === 'ir') return last;
  throw new Error(`不是标准的西语动词原形：${infinitive}`);
}

/** 正字法调整：-car/-gar/-zar/-guar 在需要换字母的位置上改写词干。
 *
 * 触发条件看的是**词尾第一个字母的发音**，所以要先把重音去掉再比
 * （-éis / -é 都要触发，而 'é' !== 'e'）。
 */
function orthographicStem(infinitive, stem, nextLetter) {
  const letter = stripAccents(String(nextLetter || '')).charAt(0);

  if (letter === 'e') {
    // 简单过去时 yo 与虚拟式：buscar→busqué, llegar→llegué, empezar→empecé
    if (infinitive.endsWith('car') && stem.endsWith('c')) return stem.slice(0, -1) + 'qu';
    if (infinitive.endsWith('gar') && stem.endsWith('g')) return stem.slice(0, -1) + 'gu';
    if (infinitive.endsWith('zar') && stem.endsWith('z')) return stem.slice(0, -1) + 'c';
    if (infinitive.endsWith('guar') && stem.endsWith('gu')) return stem.slice(0, -2) + 'gü';
  }
  if (letter === 'a' || letter === 'o') {
    // 虚拟式：llegar→llegue, buscar→busque, empezar→empiece
    if (infinitive.endsWith('car') && stem.endsWith('c')) return stem.slice(0, -1) + 'qu';
    if (infinitive.endsWith('gar') && stem.endsWith('g')) return stem.slice(0, -1) + 'gu';
    if (infinitive.endsWith('zar') && stem.endsWith('z')) return stem.slice(0, -1) + 'c';
    if (infinitive.endsWith('guar') && stem.endsWith('gu')) return stem.slice(0, -2) + 'gü';
  }
  return stem;
}

// ─────────────────────────── 主变位函数 ───────────────────────────

/**
 * 变位一个动词。
 * @param {string} infinitive 动词原形，如 'hablar'、'tener'
 * @param {string} tense TENSES 里的一个时态名
 * @returns {string[]} 六个人称的形式，顺序同 PERSONS
 */
export function conjugate(infinitive, tense) {
  const verb = String(infinitive || '').trim().toLowerCase();
  const group = groupOf(verb);
  const stem = stemOf(verb);

  if (!TENSES.includes(tense)) throw new Error(`不支持的时态：${tense}`);

  switch (tense) {
    case 'presente':
      return present(verb, group, stem);
    case 'preterito':
      return preterite(verb, group, stem);
    case 'imperfecto':
      return imperfect(verb, group, stem);
    case 'futuro':
      return future(verb, group, stem, ENDINGS.futuro[group]);
    case 'condicional':
      return future(verb, group, stem, ENDINGS.condicional[group]);
    case 'subjuntivo':
      return subjunctive(verb, group, stem);
    case 'perfecto':
      return HABER_PRESENT.map((h) => `${h} ${participle(verb)}`);
    case 'pluscuamperfecto':
      return HABER_IMPERFECT.map((h) => `${h} ${participle(verb)}`);
    case 'futuroPerfecto':
      return HABER_FUTURE.map((h) => `${h} ${participle(verb)}`);
    case 'condicionalPerfecto':
      return HABER_COND.map((h) => `${h} ${participle(verb)}`);
    case 'imperativo':
      return imperative(verb, group, stem);
    default:
      throw new Error(`未处理的时态：${tense}`);
  }
}

function present(verb, group, stem) {
  const explicit = PRESENT_IRREGULAR[verb];
  if (explicit) return explicit.slice();

  const sc = STEM_CHANGE[verb];
  const endings = ENDINGS.presente[group];
  if (sc === undefined) return endings.map((ending) => stem + ending);

  // 词干变化只发生在重音落在词干的四个人称（1s/2s/3s/3p），
  // nosotros(3) 和 vosotros(4) 用弱词干。
  return endings.map((ending, index) => {
    const base = index === 3 || index === 4 ? sc.weak : sc.stressed;
    return base + ending;
  });
}

function preterite(verb, group, stem) {
  const explicit = PRETERITE_IRREGULAR[verb];
  if (explicit) return explicit.slice();

  const endings = ENDINGS.preterito[group];
  return endings.map((ending, index) => {
    // 只有 -ar 的 yo 形（-é）需要正字法调整
    const needsOrtho = group === 'ar' && index === 0;
    const base = needsOrtho ? orthographicStem(verb, stem, 'e') : stem;
    return base + ending;
  });
}

function imperfect(verb, group, stem) {
  const explicit = IMPERFECT_IRREGULAR[verb];
  if (explicit) return explicit.slice();
  return ENDINGS.imperfecto[group].map((ending) => stem + ending);
}

function future(verb, group, stem, endings) {
  // 将来时/条件式一律接在**整个原形**后面（hablar + é → hablaré），
  // 不是接在词干上。只有不规则动词换成专门词干。
  const base = FUTURE_STEMS[verb] ?? verb;
  return endings.map((ending) => base + ending);
}

function subjunctive(verb, group, stem) {
  const explicit = SUBJ_EXPLICIT[verb];
  if (explicit) return explicit.slice();

  const sc = STEM_CHANGE[verb];
  const endings = ENDINGS.subjuntivo[group];

  // 虚拟式词干：现在时 yo 去掉 -o（再按动词的词干变化决定各人称用哪个词干）。
  // 对词干变化动词，词干由 STEM_CHANGE 给出（天然覆盖 yo 的拼写），
  // nosotros/vosotros 用弱词干。
  const nextLetter = endings[0][0];

  if (sc === undefined) {
    const yo = present(verb, group, stem)[0];
    const base = yo.endsWith('o') ? yo.slice(0, -1) : stem;
    const adjusted = orthographicStem(verb, base, nextLetter);
    return endings.map((ending) => adjusted + ending);
  }

  return endings.map((ending, index) => {
    const raw = index === 3 || index === 4 ? sc.weak : sc.stressed;
    // 只有 nosotros/vosotros 的弱词干可能触发正字法调整
    // （empezar → empecemos，不是 empezemos；buscar → busquemos）
    const base = orthographicStem(verb, raw, ending[0] ?? nextLetter);
    return base + ending;
  });
}

function imperative(verb, group, stem) {
  const subj = subjunctive(verb, group, stem);
  // tú = 现在时第三人称单数（不规则用表）；vosotros = 原形 -r 换 -d
  const tu = TU_IMPERATIVE_IRREGULAR[verb] ?? present(verb, group, stem)[2];
  const vosotros = verb === 'ir' ? 'id' : stemOf(verb) + (group === 'ar' ? 'ad' : 'ed');
  return [
    tu, // 1s 位置放 tú 命令（界面上按人称读取）
    tu,
    subj[2], // usted
    subj[3], // nosotros
    vosotros, // vosotros
    subj[5], // ustedes
  ];
}

/** 过去分词。 */
export function participle(verb) {
  const explicit = PARTICIPLE_IRREGULAR[verb];
  if (explicit) return explicit;
  const group = groupOf(verb);
  const stem = stemOf(verb);
  return group === 'ar' ? `${stem}ado` : `${stem}ido`;
}

/** 副动词（-ndo 形式）。 */
export function gerund(verb) {
  const explicit = GERUND_IRREGULAR[verb];
  if (explicit) return explicit;
  const group = groupOf(verb);
  const stem = stemOf(verb);
  return group === 'ar' ? `${stem}ando` : `${stem}iendo`;
}

/**
 * 整个动词的全表（供界面展示）。
 * @returns {Record<string, string[]>}
 */
export function fullTable(infinitive) {
  const out = {};
  for (const tense of TENSES) out[tense] = conjugate(infinitive, tense);
  out.participio = [participle(infinitive)];
  out.gerundio = [gerund(infinitive)];
  return out;
}

// ─────────────────────── 答案比对（判分用） ───────────────────────

/** 去掉重音，用于「只差重音」的近似判分。 */
export function stripAccents(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/gi, 'n');
}

/**
 * 判分。返回 'correct' | 'accent' | 'wrong'。
 * accent 表示字母都对、只差重音符号 —— 单独反馈，不算全错。
 */
export function gradeAnswer(expected, given) {
  const exp = String(expected || '').trim().toLowerCase();
  const got = String(given || '').trim().toLowerCase();
  if (exp === got) return 'correct';
  if (exp !== '' && stripAccents(exp) === stripAccents(got)) return 'accent';
  return 'wrong';
}
