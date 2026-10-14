// Run: node tests/core.test.mjs   (pure logic: nutrition, normalisation, parser, matcher)
import assert from 'node:assert/strict';
import { STARTER_FOODS } from '../js/data/starter-foods.js';
import { buildIndex, matchFood, suggestFoods } from '../js/matcher.js';
import { parseFoodText } from '../js/parser.js';
import { calcNutrition, sumLogs, scaleLog, defaultUnit } from '../js/nutrition.js';
import { normalize, termKey } from '../js/text.js';

// Build "saved foods" the same way the app does (Arabic UI language).
const foods = STARTER_FOODS.map((s, i) => ({
  id: 'f' + i, name: s.names.ar,
  synonyms: [s.names.fr, s.names.en, ...s.synonyms],
  calories: s.calories, protein: s.protein, carbohydrates: s.carbohydrates, fat: s.fat,
  reference_quantity: 100, reference_unit: s.reference_unit, serving_size: s.serving_size, serving_unit: s.serving_unit,
  _key: s.key,
}));
const index = buildIndex(foods);
const keyOf = (c) => c?.food._key;

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok -', name); };

test('spec example: 200 g of 150 kcal/10P/20C/5F per 100 g', () => {
  const f = { calories: 150, protein: 10, carbohydrates: 20, fat: 5, reference_quantity: 100, reference_unit: 'g' };
  const r = calcNutrition(f, 200, 'g');
  assert.deepEqual([r.calories, r.protein, r.carbohydrates, r.fat], [300, 20, 40, 10]);
});
test('kg / oz conversion, per-ml foods never treated as grams', () => {
  const f = { calories: 100, protein: 1, carbohydrates: 1, fat: 1, reference_quantity: 100, reference_unit: 'g' };
  assert.equal(calcNutrition(f, 1, 'kg').calories, 1000);
  assert.equal(calcNutrition(f, 200, 'ml').error, 'UNIT_MISMATCH');
  const milk = { ...f, reference_unit: 'ml' };
  assert.equal(calcNutrition(milk, 1, 'cup').calories, 240);
  assert.equal(calcNutrition(milk, 100, 'g').error, 'UNIT_MISMATCH');
});
test('pieces need a serving size; per-piece foods work', () => {
  const noPiece = { calories: 100, reference_quantity: 100, reference_unit: 'g' };
  assert.equal(calcNutrition(noPiece, 2, 'piece').error, 'NEEDS_SERVING_SIZE');
  const egg = { calories: 143, protein: 12.6, carbohydrates: 0.7, fat: 9.5, reference_quantity: 100, reference_unit: 'g', serving_size: 50, serving_unit: 'g' };
  assert.equal(calcNutrition(egg, 5, 'piece').calories, 357.5);
  const perPiece = { calories: 70, reference_quantity: 1, reference_unit: 'piece', serving_size: 50, serving_unit: 'g' };
  assert.equal(calcNutrition(perPiece, 3, 'piece').calories, 210);
  assert.equal(calcNutrition(perPiece, 100, 'g').calories, 140);
  assert.equal(defaultUnit(perPiece), 'piece');
});
test('invalid / negative / fractional quantities', () => {
  const f = { calories: 100, reference_quantity: 100, reference_unit: 'g' };
  assert.equal(calcNutrition(f, -5, 'g').error, 'INVALID_QTY');
  assert.equal(calcNutrition(f, 0, 'g').error, 'INVALID_QTY');
  assert.equal(calcNutrition(f, NaN, 'g').error, 'INVALID_QTY');
  assert.equal(calcNutrition(f, 0.5, 'g').calories, 0.5);
});
test('missing macros count as 0 and are flagged', () => {
  const r = calcNutrition({ calories: 50, protein: null, carbohydrates: 5, fat: null, reference_quantity: 100, reference_unit: 'g' }, 100, 'g');
  assert.deepEqual(r.missing, ['protein', 'fat']);
  assert.equal(r.protein, 0);
});
test('sumLogs + scaleLog', () => {
  const logs = [{ calories_snapshot: 100, protein_snapshot: 5, carbohydrates_snapshot: 10, fat_snapshot: 1 }, { calories_snapshot: 50.5, protein_snapshot: 1, carbohydrates_snapshot: 2, fat_snapshot: 3 }];
  assert.equal(sumLogs(logs).calories, 150.5);
  assert.equal(scaleLog({ quantity: 100, calories_snapshot: 200, protein_snapshot: 10, carbohydrates_snapshot: 20, fat_snapshot: 4 }, 50).calories_snapshot, 100);
});
test('normalisation', () => {
  assert.equal(normalize('٥ حبات بيضة'), '5 حبات بيضه');
  assert.equal(normalize('150g Riz Cuit'), '150 g riz cuit');
  assert.equal(normalize('Pâtes'), 'pates');
  assert.equal(normalize('1,5 kg'), '1.5 kg');
});

const one = (text) => {
  const r = parseFoodText(text, index);
  assert.equal(r.length, 1, `expected 1 item for "${text}" got ${JSON.stringify(r.map((x) => x.raw))}`);
  return r[0];
};

test('AR: 5 حبات بيض', () => { const i = one('5 حبات بيض'); assert.equal(i.qty, 5); assert.equal(i.unit, 'piece'); assert.equal(keyOf(i.candidates[0]), 'egg'); });
test('AR: 2 طماطم', () => { const i = one('2 طماطم'); assert.equal(i.qty, 2); assert.equal(keyOf(i.candidates[0]), 'tomato'); });
test('AR: 200 غرام صدر دجاج', () => { const i = one('200 غرام صدر دجاج'); assert.equal(i.qty, 200); assert.equal(i.unit, 'g'); assert.equal(keyOf(i.candidates[0]), 'chicken'); });
test('FR: 150g riz cuit', () => { const i = one('150g riz cuit'); assert.equal(i.qty, 150); assert.equal(i.unit, 'g'); assert.equal(keyOf(i.candidates[0]), 'rice'); });
test('FR: 2 pommes', () => { const i = one('2 pommes'); assert.equal(i.qty, 2); assert.equal(keyOf(i.candidates[0]), 'apple'); assert.equal(i.candidates[0].food.name, 'تفاح'); });
test('AR dual: بيضتين وطماطمتين', () => {
  const r = parseFoodText('بيضتين وطماطمتين', index);
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((x) => [x.qty, keyOf(x.candidates[0])]), [[2, 'egg'], [2, 'tomato']]);
});
test('AR multi: 3 بيضات و100 غرام خبز', () => {
  const r = parseFoodText('3 بيضات و100 غرام خبز', index);
  assert.deepEqual(r.map((x) => [x.qty, x.unit, keyOf(x.candidates[0])]), [[3, null, 'egg'], [100, 'g', 'bread']]);
});
test('FR multi: 200g poulet et 150g pâtes', () => {
  const r = parseFoodText('200g poulet et 150g pâtes', index);
  assert.deepEqual(r.map((x) => [x.qty, x.unit, keyOf(x.candidates[0])]), [[200, 'g', 'chicken'], [150, 'g', 'pasta']]);
});
test('EN: 2 eggs and 100 g chicken', () => {
  const r = parseFoodText('2 eggs and 100 g chicken', index);
  assert.deepEqual(r.map((x) => [x.qty, keyOf(x.candidates[0])]), [[2, 'egg'], [100, 'chicken']]);
});
test('no separator: "2 تفاح 3 موز"', () => {
  const r = parseFoodText('2 تفاح 3 موز', index);
  assert.deepEqual(r.map((x) => [x.qty, keyOf(x.candidates[0])]), [[2, 'apple'], [3, 'banana']]);
});
test('fractions: نصف + 1/2 + 1 و نصف', () => {
  assert.equal(one('1/2 تفاحة').qty, 0.5);
  assert.equal(one('نصف خيار').qty, 0.5);
  assert.equal(one('1 و نصف موز').qty, 1.5);
  assert.equal(one('1.5 pomme').qty, 1.5);
  assert.equal(one('1,5 kg poulet').qty, 1.5);
});
test('units: tbsp / cup / ml', () => {
  assert.equal(one('2 cuillères à soupe huile d\'olive').unit, 'tbsp');
  assert.equal(one('كوب حليب').unit, 'cup');
  assert.equal(one('250 ml lait').unit, 'ml');
  assert.equal(keyOf(one('l\'huile').candidates[0]), 'olive-oil');
});
test('spelling variations → same saved food', () => {
  for (const w of ['طماطم', 'طماطيم', 'طمطم', 'tomates', 'tomato', 'tomat', 'tomatte'])
    assert.equal(keyOf(matchFood(index, w)[0]), 'tomato', w);
  for (const w of ['بيض', 'بيضات', 'بيضة', 'eggs', 'oeufs', 'egg'])
    assert.equal(keyOf(matchFood(index, w)[0]), 'egg', w);
  for (const w of ['دجاج', 'جاج', 'poulet', 'chicken', 'poullet', 'chiken'])
    assert.equal(keyOf(matchFood(index, w)[0]), 'chicken', w);
});
test('synonym search & autocomplete', () => {
  assert.equal(keyOf(suggestFoods(index, 'dja')[0]), 'chicken');
  assert.equal(keyOf(suggestFoods(index, 'جا')[0]), 'chicken');
  assert.ok(suggestFoods(index, 'pom').some((s) => s.food._key === 'apple'));
});
test('unknown food is NOT invented', () => {
  const r = parseFoodText('2 xyzqwerty', index);
  assert.equal(r.length, 1);
  assert.equal(r[0].candidates.length, 0);
  assert.equal(matchFood(index, 'سوشي').length, 0);
});
test('starter list: every food has valid nutrition and no two foods share a term', () => {
  const seen = new Map();
  const clashes = [];
  for (const f of foods) {
    assert.ok(f.calories >= 0 && f.protein >= 0 && f.carbohydrates >= 0 && f.fat >= 0, f._key);
    assert.ok(f.calories <= 900 || f.fat >= 80, 'implausible kcal ' + f._key);
    for (const term of [f.name, ...f.synonyms]) {
      const k = termKey(term);
      if (!k) { clashes.push('empty:' + term); continue; }
      if (seen.has(k) && seen.get(k) !== f._key) clashes.push(`${k}: ${seen.get(k)} vs ${f._key}`);
      seen.set(k, f._key);
    }
  }
  assert.deepEqual(clashes, []);
});
test('expanded database: fruits, vegetables, dairy, meat, fish', () => {
  const cases = [['mango', 'mango'], ['mangue', 'mango'], ['fromage feta', 'feta'], ['mozzarella', 'mozzarella'], ['كبدة', 'beef-liver'],
    ['saumon', 'salmon'], ['شمندر', 'beetroot'], ['courgette', 'zucchini'], ['hamburger', 'hamburger'], ['فخذ دجاج', 'chicken-thigh'],
    ['لبن', 'buttermilk'], ['حليب', 'milk'], ['مسمن', 'msemen'], ['شكشوكة', 'chakchouka'], ['yaourt grec', 'greek-yogurt'], ['زيت عباد الشمس', 'sunflower-oil']];
  for (const [w, key] of cases) assert.equal(keyOf(matchFood(index, w)[0]), key, w);
  assert.ok(foods.length >= 200, 'foods: ' + foods.length);
  const r = parseFoodText('200 غرام سلمون و 2 كيوي و 100g mozzarella', index);
  assert.deepEqual(r.map((x) => keyOf(x.candidates[0])), ['salmon', 'kiwi', 'mozzarella']);
});
test('works with only user foods (no starter data saved)', () => {
  const idx = buildIndex([{ id: 'x', name: 'Tajine', synonyms: ['طاجين'], calories: 1, reference_unit: 'g', reference_quantity: 100 }]);
  assert.equal(matchFood(idx, 'طاجين')[0].food.id, 'x');
  assert.equal(matchFood(idx, 'بيض').length, 0);
});

console.log(`\n${n} tests passed`);
