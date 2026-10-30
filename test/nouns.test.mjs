/**
 * 名词/形容词引擎自检。运行：node test/nouns.test.mjs
 */

import {
  pluralize,
  pluralOf,
  guessGender,
  definiteArticle,
  indefiniteArticle,
  adjectiveAgreement,
  nounInfo,
  withArticle,
} from '../lib/engine/nouns.js';

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

// ─────────────────────────── 复数 ───────────────────────────

// 元音结尾 +s
eq(pluralize('casa'), 'casas', 'casa');
eq(pluralize('libro'), 'libros', 'libro');
eq(pluralize('coche'), 'coches', 'coche');
eq(pluralize('espíritu'), 'espíritus', 'espíritu');

// 辅音结尾 +es
eq(pluralize('árbol'), 'árboles', 'árbol');
eq(pluralize('papel'), 'papeles', 'papel');
eq(pluralize('profesor'), 'profesores', 'profesor');
eq(pluralize('ciudad'), 'ciudades', 'ciudad');
eq(pluralize('hotel'), 'hoteles', 'hotel');

// -z → -ces
eq(pluralize('luz'), 'luces', 'luz');
eq(pluralize('vez'), 'veces', 'vez');
eq(pluralize('actriz'), 'actrices', 'actriz');
eq(pluralize('lápiz'), 'lápices', 'lápiz');

// -s / -x 结尾：重音在末音节才 +es，否则不变
eq(pluralize('lunes'), 'lunes', 'lunes 不变');
eq(pluralize('martes'), 'martes', 'martes 不变');
eq(pluralize('crisis'), 'crisis', 'crisis 不变');
eq(pluralize('compás'), 'compases', 'compás');
eq(pluralize('autobús'), 'autobuses', 'autobús');

// -y 结尾
eq(pluralize('rey'), 'reyes', 'rey');

// 重音位移：-n 结尾的重读词复数后去重音
eq(pluralize('canción'), 'canciones', 'canción');
// joven → jóvenes 是「加重音」的相反位移，规则给不出，靠例外表
eq(pluralOf('joven'), 'jóvenes', 'joven 加重音（例外表）');
eq(pluralOf('carácter'), 'caracteres', 'carácter（例外表）');
eq(pluralOf('país'), 'países', 'país 保留重音（例外表）');

// ─────────────────────────── 阴阳性 ───────────────────────────

eq(guessGender('libro'), 'm', 'libro');
eq(guessGender('casa'), 'f', 'casa');
eq(guessGender('mesa'), 'f', 'mesa');
eq(guessGender('canción'), 'f', 'canción');
eq(guessGender('ciudad'), 'f', 'ciudad');
eq(guessGender('libertad'), 'f', 'libertad');
eq(guessGender('actitud'), 'f', 'actitud');
eq(guessGender('costumbre'), 'f', 'costumbre');
eq(guessGender('nación'), 'f', 'nación');
eq(guessGender('verdad'), 'f', 'verdad');
eq(guessGender('camión'), 'm', 'camión');
eq(guessGender('garaje'), 'm', 'garaje');
eq(guessGender('amor'), 'm', 'amor');
eq(guessGender('francés'), 'm', 'francés');

// 例外
eq(guessGender('mano'), 'f', 'mano 是阴性');
eq(guessGender('foto'), 'f', 'foto 是阴性');
eq(guessGender('día'), 'm', 'día 是阳性');
eq(guessGender('problema'), 'm', 'problema 是阳性');
eq(guessGender('mapa'), 'm', 'mapa 是阳性');
eq(guessGender('agua'), 'f', 'agua 是阴性（但用 el）');
eq(guessGender('gente'), 'f', 'gente 是阴性');

// 规则给不出的
eq(guessGender('lunes'), null, 'lunes 规则给不出');

// ─────────────────────────── 冠词 ───────────────────────────

eq(definiteArticle('m', 'sg'), 'el', 'el libro');
eq(definiteArticle('f', 'sg'), 'la', 'la casa');
eq(definiteArticle('m', 'pl'), 'los', 'los libros');
eq(definiteArticle('f', 'pl'), 'las', 'las casas');

// 重读 a 开头的阴性单数：冠词用 el
eq(definiteArticle('f', 'sg', 'agua'), 'el', 'el agua');
eq(definiteArticle('f', 'pl', 'agua'), 'las', 'las aguas 用 las');
eq(definiteArticle('f', 'sg', 'águila'), 'el', 'el águila');

eq(indefiniteArticle('m', 'sg'), 'un', 'un libro');
eq(indefiniteArticle('f', 'sg'), 'una', 'una casa');
eq(indefiniteArticle('m', 'pl'), 'unos', 'unos libros');
eq(indefiniteArticle('f', 'pl'), 'unas', 'unas casas');
eq(indefiniteArticle('f', 'sg', 'agua'), 'un', 'un agua');

// ─────────────────────────── 形容词一致 ───────────────────────────

eq(adjectiveAgreement('bueno', 'm', 'sg'), 'bueno', 'bueno m sg');
eq(adjectiveAgreement('bueno', 'f', 'sg'), 'buena', 'bueno f sg');
eq(adjectiveAgreement('bueno', 'm', 'pl'), 'buenos', 'bueno m pl');
eq(adjectiveAgreement('bueno', 'f', 'pl'), 'buenas', 'bueno f pl');

// 阴阳同形，只变数
eq(adjectiveAgreement('grande', 'm', 'sg'), 'grande', 'grande m sg');
eq(adjectiveAgreement('grande', 'f', 'sg'), 'grande', 'grande f sg');
eq(adjectiveAgreement('grande', 'f', 'pl'), 'grandes', 'grande f pl');
eq(adjectiveAgreement('feliz', 'm', 'pl'), 'felices', 'feliz → felices');

// 重读辅音结尾有阴性形式
eq(adjectiveAgreement('trabajador', 'f', 'sg'), 'trabajadora', 'trabajador f');
eq(adjectiveAgreement('trabajador', 'm', 'sg'), 'trabajador', 'trabajador m');
eq(adjectiveAgreement('hablador', 'f', 'pl'), 'habladoras', 'hablador f pl');

// ─────────────────────────── nounInfo ───────────────────────────

const libro = nounInfo('libro');
eq(libro.gender, 'm', 'libro gender');
eq(libro.plural, 'libros', 'libro plural');
eq(libro.definite, 'el', 'libro definite');
eq(libro.indefinite, 'un', 'libro indefinite');
eq(libro.definitePl, 'los', 'libro definite pl');
eq(libro.genderSource, 'rule', 'libro genderSource');

const casa = nounInfo('casa');
eq(casa.gender, 'f', 'casa gender');
eq(casa.plural, 'casas', 'casa plural');
eq(casa.definite, 'la', 'casa definite');

const mano = nounInfo('mano');
eq(mano.gender, 'f', 'mano gender（例外）');
eq(mano.definite, 'la', 'la mano');
eq(mano.plural, 'manos', 'manos');

const agua = nounInfo('agua');
eq(agua.gender, 'f', 'agua gender');
eq(agua.definite, 'el', 'el agua（冠词特例）');
eq(agua.definitePl, 'las', 'las aguas');
eq(agua.stressedA, true, 'agua stressedA');

// 词库标注优先于规则
const custom = nounInfo('el problema', { gender: 'm' });
eq(custom.gender, 'm', 'override gender');
eq(custom.genderSource, 'lexicon', 'override genderSource');

// ─────────────────────────── withArticle ───────────────────────────

eq(withArticle('casa', 'f').full, 'la casa', 'withArticle casa');
eq(withArticle('libro', 'm').full, 'el libro', 'withArticle libro');
eq(withArticle('casa', 'f', 'pl').full, 'las casas', 'withArticle casa pl');
eq(withArticle('agua', 'f').full, 'el agua', 'withArticle agua');

// ─────────────────────────── 报告 ───────────────────────────

console.log(`\n名词引擎自检：${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('全部通过 ✓');
