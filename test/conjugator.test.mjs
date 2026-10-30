/**
 * 变位引擎自检。运行：node test/conjugator.test.mjs
 *
 * 断言的是**真实西语的正确答案**，而不是「代码跑出来的结果」。
 * 每条期望值都是按标准变位表写下来的，写错了测试就会红。
 */

import {
  conjugate,
  fullTable,
  participle,
  gerund,
  gradeAnswer,
  stripAccents,
  groupOf,
  PERSONS,
  TENSES,
} from '../lib/engine/conjugator.js';

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

function row(verb, tense, expected, label) {
  eq(conjugate(verb, tense), expected, label || `${verb} ${tense}`);
}

// ───────────────── 规则动词：三组 × 全部时态 ─────────────────

// hablar（-ar 规则）
row('hablar', 'presente', ['hablo', 'hablas', 'habla', 'hablamos', 'habláis', 'hablan']);
row('hablar', 'preterito', ['hablé', 'hablaste', 'habló', 'hablamos', 'hablasteis', 'hablaron']);
row('hablar', 'imperfecto', ['hablaba', 'hablabas', 'hablaba', 'hablábamos', 'hablabais', 'hablaban']);
row('hablar', 'futuro', ['hablaré', 'hablarás', 'hablará', 'hablaremos', 'hablaréis', 'hablarán']);
row('hablar', 'condicional', ['hablaría', 'hablarías', 'hablaría', 'hablaríamos', 'hablaríais', 'hablarían']);
row('hablar', 'subjuntivo', ['hable', 'hables', 'hable', 'hablemos', 'habléis', 'hablen']);

// comer（-er 规则）
row('comer', 'presente', ['como', 'comes', 'come', 'comemos', 'coméis', 'comen']);
row('comer', 'preterito', ['comí', 'comiste', 'comió', 'comimos', 'comisteis', 'comieron']);
row('comer', 'imperfecto', ['comía', 'comías', 'comía', 'comíamos', 'comíais', 'comían']);
row('comer', 'futuro', ['comeré', 'comerás', 'comerá', 'comeremos', 'comeréis', 'comerán']);
row('comer', 'subjuntivo', ['coma', 'comas', 'coma', 'comamos', 'comáis', 'coman']);

// vivir（-ir 规则）
row('vivir', 'presente', ['vivo', 'vives', 'vive', 'vivimos', 'vivís', 'viven']);
row('vivir', 'preterito', ['viví', 'viviste', 'vivió', 'vivimos', 'vivisteis', 'vivieron']);
row('vivir', 'imperfecto', ['vivía', 'vivías', 'vivía', 'vivíamos', 'vivíais', 'vivían']);
row('vivir', 'subjuntivo', ['viva', 'vivas', 'viva', 'vivamos', 'viváis', 'vivan']);

// ───────────────── ser / estar / ir / haber ─────────────────

row('ser', 'presente', ['soy', 'eres', 'es', 'somos', 'sois', 'son']);
row('ser', 'preterito', ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron']);
row('ser', 'imperfecto', ['era', 'eras', 'era', 'éramos', 'erais', 'eran']);
row('ser', 'futuro', ['seré', 'serás', 'será', 'seremos', 'seréis', 'serán']);
row('ser', 'subjuntivo', ['sea', 'seas', 'sea', 'seamos', 'seáis', 'sean']);

row('estar', 'presente', ['estoy', 'estás', 'está', 'estamos', 'estáis', 'están']);
row('estar', 'preterito', ['estuve', 'estuviste', 'estuvo', 'estuvimos', 'estuvisteis', 'estuvieron']);
row('estar', 'subjuntivo', ['esté', 'estés', 'esté', 'estemos', 'estéis', 'estén']);

row('ir', 'presente', ['voy', 'vas', 'va', 'vamos', 'vais', 'van']);
row('ir', 'preterito', ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron']);
row('ir', 'imperfecto', ['iba', 'ibas', 'iba', 'íbamos', 'ibais', 'iban']);
row('ir', 'subjuntivo', ['vaya', 'vayas', 'vaya', 'vayamos', 'vayáis', 'vayan']);

row('haber', 'presente', ['he', 'has', 'ha', 'hemos', 'habéis', 'han']);
row('haber', 'futuro', ['habré', 'habrás', 'habrá', 'habremos', 'habréis', 'habrán']);

// ───────────────── 词干变化 e→ie / o→ue / e→i ─────────────────

row('pensar', 'presente', ['pienso', 'piensas', 'piensa', 'pensamos', 'pensáis', 'piensan']);
row('pensar', 'subjuntivo', ['piense', 'pienses', 'piense', 'pensemos', 'penséis', 'piensen']);
row('pensar', 'preterito', ['pensé', 'pensaste', 'pensó', 'pensamos', 'pensasteis', 'pensaron']);

row('poder', 'presente', ['puedo', 'puedes', 'puede', 'podemos', 'podéis', 'pueden']);
row('poder', 'futuro', ['podré', 'podrás', 'podrá', 'podremos', 'podréis', 'podrán']);
row('poder', 'preterito', ['pude', 'pudiste', 'pudo', 'pudimos', 'pudisteis', 'pudieron']);

row('pedir', 'presente', ['pido', 'pides', 'pide', 'pedimos', 'pedís', 'piden']);
row('pedir', 'preterito', ['pedí', 'pediste', 'pidió', 'pedimos', 'pedisteis', 'pidieron']);

row('dormir', 'presente', ['duermo', 'duermes', 'duerme', 'dormimos', 'dormís', 'duermen']);
row('dormir', 'preterito', ['dormí', 'dormiste', 'durmió', 'dormimos', 'dormisteis', 'durmieron']);

row('tener', 'presente', ['tengo', 'tienes', 'tiene', 'tenemos', 'tenéis', 'tienen']);
row('tener', 'preterito', ['tuve', 'tuviste', 'tuvo', 'tuvimos', 'tuvisteis', 'tuvieron']);
row('tener', 'futuro', ['tendré', 'tendrás', 'tendrá', 'tendremos', 'tendréis', 'tendrán']);
row('tener', 'subjuntivo', ['tenga', 'tengas', 'tenga', 'tengamos', 'tengáis', 'tengan']);

row('decir', 'presente', ['digo', 'dices', 'dice', 'decimos', 'decís', 'dicen']);
row('decir', 'preterito', ['dije', 'dijiste', 'dijo', 'dijimos', 'dijisteis', 'dijeron']);
row('decir', 'futuro', ['diré', 'dirás', 'dirá', 'diremos', 'diréis', 'dirán']);
row('decir', 'subjuntivo', ['diga', 'digas', 'diga', 'digamos', 'digáis', 'digan']);

row('hacer', 'presente', ['hago', 'haces', 'hace', 'hacemos', 'hacéis', 'hacen']);
row('hacer', 'preterito', ['hice', 'hiciste', 'hizo', 'hicimos', 'hicisteis', 'hicieron']);
row('hacer', 'futuro', ['haré', 'harás', 'hará', 'haremos', 'haréis', 'harán']);

row('saber', 'presente', ['sé', 'sabes', 'sabe', 'sabemos', 'sabéis', 'saben']);
row('saber', 'preterito', ['supe', 'supiste', 'supo', 'supimos', 'supisteis', 'supieron']);
row('saber', 'subjuntivo', ['sepa', 'sepas', 'sepa', 'sepamos', 'sepáis', 'sepan']);

// ───────────────── 正字法变化 ─────────────────

row('llegar', 'preterito', ['llegué', 'llegaste', 'llegó', 'llegamos', 'llegasteis', 'llegaron']);
row('buscar', 'preterito', ['busqué', 'buscaste', 'buscó', 'buscamos', 'buscasteis', 'buscaron']);
row('empezar', 'preterito', ['empecé', 'empezaste', 'empezó', 'empezamos', 'empezasteis', 'empezaron']);
row('empezar', 'presente', ['empiezo', 'empiezas', 'empieza', 'empezamos', 'empezáis', 'empiezan']);
row('empezar', 'subjuntivo', ['empiece', 'empieces', 'empiece', 'empecemos', 'empecéis', 'empiecen']);
row('jugar', 'preterito', ['jugué', 'jugaste', 'jugó', 'jugamos', 'jugasteis', 'jugaron']);
row('sacar', 'subjuntivo', ['saque', 'saques', 'saque', 'saquemos', 'saquéis', 'saquen']);

// ───────────────── 词干变化全表回归 ─────────────────
// 这一批是从实际输出逐条人工核对过的，锁住它们防止以后改规则改坏。

row('sentir', 'presente', ['siento', 'sientes', 'siente', 'sentimos', 'sentís', 'sienten']);
row('sentir', 'subjuntivo', ['sienta', 'sientas', 'sienta', 'sintamos', 'sintáis', 'sientan']);
row('dormir', 'subjuntivo', ['duerma', 'duermas', 'duerma', 'durmamos', 'durmáis', 'duerman']);
row('preferir', 'presente', ['prefiero', 'prefieres', 'prefiere', 'preferimos', 'preferís', 'prefieren']);
row('perder', 'presente', ['pierdo', 'pierdes', 'pierde', 'perdemos', 'perdéis', 'pierden']);
row('volver', 'presente', ['vuelvo', 'vuelves', 'vuelve', 'volvemos', 'volvéis', 'vuelven']);
row('contar', 'presente', ['cuento', 'cuentas', 'cuenta', 'contamos', 'contáis', 'cuentan']);
row('jugar', 'presente', ['juego', 'juegas', 'juega', 'jugamos', 'jugáis', 'juegan']);
row('seguir', 'presente', ['sigo', 'sigues', 'sigue', 'seguimos', 'seguís', 'siguen']);
row('conseguir', 'subjuntivo', ['consiga', 'consigas', 'consiga', 'consigamos', 'consigáis', 'consigan']);
row('vestir', 'subjuntivo', ['vista', 'vistas', 'vista', 'vistamos', 'vistáis', 'vistan']);
row('repetir', 'presente', ['repito', 'repites', 'repite', 'repetimos', 'repetís', 'repiten']);
row('elegir', 'presente', ['elijo', 'eliges', 'elige', 'elegimos', 'elegís', 'eligen']);
row('mover', 'presente', ['muevo', 'mueves', 'mueve', 'movemos', 'movéis', 'mueven']);
row('devolver', 'presente', ['devuelvo', 'devuelves', 'devuelve', 'devolvemos', 'devolvéis', 'devuelven']);
row('mostrar', 'presente', ['muestro', 'muestras', 'muestra', 'mostramos', 'mostráis', 'muestran']);
row('probar', 'presente', ['pruebo', 'pruebas', 'prueba', 'probamos', 'probáis', 'prueban']);
row('volar', 'presente', ['vuelo', 'vuelas', 'vuela', 'volamos', 'voláis', 'vuelan']);
row('sonar', 'presente', ['sueno', 'suenas', 'suena', 'sonamos', 'sonáis', 'suenan']);

// 元音词干 -ir：重音落在 i 上要写成 í
row('construir', 'presente', ['construyo', 'construyes', 'construye', 'construimos', 'construís', 'construyen']);
row('huir', 'presente', ['huyo', 'huyes', 'huye', 'huimos', 'huís', 'huyen']);
row('reír', 'presente', ['río', 'ríes', 'ríe', 'reímos', 'reís', 'ríen']);
row('oír', 'presente', ['oigo', 'oyes', 'oye', 'oímos', 'oís', 'oyen']);

// yo 形带 -g- / -zc- / -j- 的动词
row('valer', 'presente', ['valgo', 'vales', 'vale', 'valemos', 'valéis', 'valen']);
row('caber', 'presente', ['quepo', 'cabes', 'cabe', 'cabemos', 'cabéis', 'caben']);
row('salir', 'presente', ['salgo', 'sales', 'sale', 'salimos', 'salís', 'salen']);
row('poner', 'presente', ['pongo', 'pones', 'pone', 'ponemos', 'ponéis', 'ponen']);
row('conocer', 'presente', ['conozco', 'conoces', 'conoce', 'conocemos', 'conocéis', 'conocen']);
row('coger', 'presente', ['cojo', 'coges', 'coge', 'cogemos', 'cogéis', 'cogen']);
row('dirigir', 'presente', ['dirijo', 'diriges', 'dirige', 'dirigimos', 'dirigís', 'dirigen']);
row('corregir', 'presente', ['corrijo', 'corriges', 'corrige', 'corregimos', 'corregís', 'corrigen']);
row('parecer', 'presente', ['parezco', 'pareces', 'parece', 'parecemos', 'parecéis', 'parecen']);

// 不规则简单过去时
row('andar', 'preterito', ['anduve', 'anduviste', 'anduvo', 'anduvimos', 'anduvisteis', 'anduvieron']);
row('traer', 'preterito', ['traje', 'trajiste', 'trajo', 'trajimos', 'trajisteis', 'trajeron']);
row('producir', 'preterito', ['produje', 'produjiste', 'produjo', 'produjimos', 'produjisteis', 'produjeron']);
row('caer', 'preterito', ['caí', 'caíste', 'cayó', 'caímos', 'caísteis', 'cayeron']);
row('leer', 'preterito', ['leí', 'leíste', 'leyó', 'leímos', 'leísteis', 'leyeron']);
row('sonreír', 'preterito', ['sonreí', 'sonreíste', 'sonrió', 'sonreímos', 'sonreísteis', 'sonrieron']);
row('construir', 'preterito', ['construí', 'construiste', 'construyó', 'construimos', 'construisteis', 'construyeron']);

// 虚拟式的 -g- / -zc- 词干
row('tener', 'subjuntivo', ['tenga', 'tengas', 'tenga', 'tengamos', 'tengáis', 'tengan']);
row('venir', 'subjuntivo', ['venga', 'vengas', 'venga', 'vengamos', 'vengáis', 'vengan']);
row('hacer', 'subjuntivo', ['haga', 'hagas', 'haga', 'hagamos', 'hagáis', 'hagan']);
row('decir', 'subjuntivo', ['diga', 'digas', 'diga', 'digamos', 'digáis', 'digan']);
row('salir', 'subjuntivo', ['salga', 'salgas', 'salga', 'salgamos', 'salgáis', 'salgan']);
row('poner', 'subjuntivo', ['ponga', 'pongas', 'ponga', 'pongamos', 'pongáis', 'pongan']);
row('conocer', 'subjuntivo', ['conozca', 'conozcas', 'conozca', 'conozcamos', 'conozcáis', 'conozcan']);
row('conducir', 'subjuntivo', ['conduzca', 'conduzcas', 'conduzca', 'conduzcamos', 'conduzcáis', 'conduzcan']);

// 过去分词的重音
eq(participle('leer'), 'leído', 'participle leer');
eq(participle('creer'), 'creído', 'participle creer');
eq(participle('oír'), 'oído', 'participle oír');
eq(participle('caer'), 'caído', 'participle caer');
eq(participle('traer'), 'traído', 'participle traer');

// ───────────────── 复合时态 ─────────────────

row('hablar', 'perfecto', ['he hablado', 'has hablado', 'ha hablado', 'hemos hablado', 'habéis hablado', 'han hablado']);
row('comer', 'perfecto', ['he comido', 'has comido', 'ha comido', 'hemos comido', 'habéis comido', 'han comido']);
row('vivir', 'pluscuamperfecto', ['había vivido', 'habías vivido', 'había vivido', 'habíamos vivido', 'habíais vivido', 'habían vivido']);
row('hablar', 'futuroPerfecto', ['habré hablado', 'habrás hablado', 'habrá hablado', 'habremos hablado', 'habréis hablado', 'habrán hablado']);

// 不规则过去分词
eq(participle('hacer'), 'hecho', 'participle hacer');
eq(participle('decir'), 'dicho', 'participle decir');
eq(participle('ver'), 'visto', 'participle ver');
eq(participle('poner'), 'puesto', 'participle poner');
eq(participle('escribir'), 'escrito', 'participle escribir');
eq(participle('abrir'), 'abierto', 'participle abrir');
eq(participle('volver'), 'vuelto', 'participle volver');
eq(participle('romper'), 'roto', 'participle romper');
eq(participle('hablar'), 'hablado', 'participle regular -ar');
eq(participle('comer'), 'comido', 'participle regular -er');

// 不规则副动词
eq(gerund('ir'), 'yendo', 'gerund ir');
eq(gerund('leer'), 'leyendo', 'gerund leer');
eq(gerund('hablar'), 'hablando', 'gerund regular -ar');
eq(gerund('comer'), 'comiendo', 'gerund regular -er');
eq(gerund('dormir'), 'durmiendo', 'gerund dormir');
eq(gerund('pedir'), 'pidiendo', 'gerund pedir');

// ───────────────── 命令式 ─────────────────

eq(conjugate('hablar', 'imperativo')[0], 'habla', 'imperativo hablar tú');
eq(conjugate('comer', 'imperativo')[0], 'come', 'imperativo comer tú');
eq(conjugate('tener', 'imperativo')[0], 'ten', 'imperativo tener tú');
eq(conjugate('hacer', 'imperativo')[0], 'haz', 'imperativo hacer tú');
eq(conjugate('ir', 'imperativo')[0], 've', 'imperativo ir tú');
eq(conjugate('ser', 'imperativo')[0], 'sé', 'imperativo ser tú');
eq(conjugate('venir', 'imperativo')[0], 'ven', 'imperativo venir tú');
eq(conjugate('hablar', 'imperativo')[4], 'hablad', 'imperativo hablar vosotros');
eq(conjugate('comer', 'imperativo')[4], 'comed', 'imperativo comer vosotros');
eq(conjugate('ir', 'imperativo')[4], 'id', 'imperativo ir vosotros');

// ───────────────── 结构不变量 ─────────────────

const verbs = ['hablar', 'comer', 'vivir', 'ser', 'estar', 'ir', 'tener', 'hacer', 'decir', 'poder', 'querer', 'saber', 'venir', 'poner', 'dar', 'ver', 'dormir', 'pedir', 'elegir', 'leer', 'oír'];
for (const v of verbs) {
  for (const t of TENSES) {
    const forms = conjugate(v, t);
    if (!Array.isArray(forms) || forms.length !== 6) {
      fail++;
      failures.push(`${v} ${t} 应返回 6 个形式，实际 ${JSON.stringify(forms)}`);
    } else if (forms.some((f) => typeof f !== 'string' || f.trim() === '')) {
      fail++;
      failures.push(`${v} ${t} 有空白形式：${JSON.stringify(forms)}`);
    } else {
      pass++;
    }
  }
}

// 每个动词都不能抛异常，且不能混进 undefined/NaN
for (const v of verbs) {
  const table = fullTable(v);
  const bad = Object.entries(table).filter(([, forms]) => forms.some((f) => /undefined|NaN|null/.test(String(f))));
  eq(bad, [], `${v} 全表无脏值`);
}

eq(groupOf('hablar'), 'ar', 'groupOf hablar');
eq(groupOf('comer'), 'er', 'groupOf comer');
eq(groupOf('vivir'), 'ir', 'groupOf vivir');

// 非动词应抛错
let threw = false;
try {
  groupOf('mesa');
} catch {
  threw = true;
}
eq(threw, true, 'groupOf 对非动词抛错');

// ───────────────── 判分 ─────────────────

eq(gradeAnswer('hablo', 'hablo'), 'correct', 'grade 完全相同');
eq(gradeAnswer('hablo', 'HABLO'), 'correct', 'grade 大小写不敏感');
eq(gradeAnswer('hablo', ' hablo '), 'correct', 'grade 空白不敏感');
eq(gradeAnswer('habló', 'hablo'), 'accent', 'grade 只差重音');
eq(gradeAnswer('esta', 'está'), 'accent', 'grade 只差重音 2');
eq(gradeAnswer('hablo', 'habla'), 'wrong', 'grade 真的错');
eq(gradeAnswer('niño', 'nino'), 'accent', 'grade ñ 视为重音差异');
eq(gradeAnswer('hablo', ''), 'wrong', 'grade 空白答案');

eq(stripAccents('canción'), 'cancion', 'stripAccents 1');
eq(stripAccents('niño'), 'nino', 'stripAccents 2');
eq(stripAccents('hablo'), 'hablo', 'stripAccents 无重音');

// ───────────────── 报告 ─────────────────

console.log(`\n变位引擎自检：${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('全部通过 ✓');
