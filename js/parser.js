// Deterministic natural-language food parser (Arabic / Darija / French / English). No AI, no network.
import { normalize, termKey, stem, STOPWORDS } from './text.js';
import { matchFood, isKnownToken } from './matcher.js';

const NUMWORDS = {
  // arabic / darija
  واحد: 1, واحده: 1, وحده: 1, اثنين: 2, اثنان: 2, اتنين: 2, ثنين: 2, زوج: 2, ثلاثه: 3, تلاته: 3, ثلاث: 3, تلاتة: 3, اربعه: 4, اربع: 4, خمسه: 5, خمس: 5,
  سته: 6, ست: 6, سبعه: 7, سبع: 7, ثمانيه: 8, تمانيه: 8, ثماني: 8, تسعه: 9, تسع: 9, عشره: 10, عشر: 10, دزينه: 12,
  // french
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, douzaine: 12,
  // english
  one: 1, two: 2, three: 3, four: 4, five: 5, seven: 7, eight: 8, nine: 9, ten: 10, dozen: 12, couple: 2,
};
const FRACWORDS = { نصف: 0.5, نص: 0.5, ربع: 0.25, ثلث: 1 / 3, تلت: 1 / 3, demi: 0.5, demie: 0.5, moitie: 0.5, quart: 0.25, tiers: 1 / 3, half: 0.5, quarter: 0.25, third: 1 / 3 };

const U = (unit, mult = 1) => ({ unit, mult });
const UNITS = {};
const add = (u, words, mult) => words.split(' ').forEach((w) => { UNITS[normalize(w)] = U(u, mult); });
add('g', 'g gr gramme grammes gram grams غ غرام غرامات جرام غم جم');
add('kg', 'kg kilo kilos kilogramme kilogrammes kilogram كيلو كغ كلغ كيلوغرام كجم');
add('oz', 'oz ounce ounces اونصه');
add('lb', 'lb lbs pound pounds');
add('ml', 'ml millilitre millilitres milliliter مل ملل');
add('l', 'l litre litres liter liters لتر');
add('floz', 'floz');
add('tbsp', 'tbsp tablespoon tablespoons ملعقه ملاعق');
add('tsp', 'tsp teaspoon teaspoons');
add('cup', 'cup cups tasse tasses verre verres glass glasses كوب اكواب كاس كاسات كاسه');
add('piece', 'piece pieces pcs pc unite unites unit units item items tranche tranches slice slices حبه حبات قطعه قطع شريحه شرائح حبة');
add('serving', 'portion portions serving servings حصه حصص');
// dual forms ("two of the unit")
const DUALS = { حبتين: U('piece', 2), حبتان: U('piece', 2), قطعتين: U('piece', 2), كوبين: U('cup', 2), كاسين: U('cup', 2), ملعقتين: U('tbsp', 2), لترين: U('l', 2), شريحتين: U('piece', 2), حصتين: U('serving', 2) };
Object.assign(UNITS, DUALS);

const SEPARATORS = new Set(['و', 'et', 'and', '&', '+', 'with', 'avec', 'مع', 'ثم', 'puis', 'then', ',', 'plus']);

function numToken(t) {
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  const m = /^(\d+)\/(\d+)$/.exec(t);
  if (m && Number(m[2]) !== 0) return Number(m[1]) / Number(m[2]);
  if (t in NUMWORDS) return NUMWORDS[t];
  if (t in FRACWORDS) return FRACWORDS[t];
  return null;
}
const isFracToken = (t) => t in FRACWORDS;

function prepare(input) {
  let s = normalize(input);
  s = s
    .replace(/cuilleres? a soupe/g, ' tbsp ')
    .replace(/cuilleres? a cafe/g, ' tsp ')
    .replace(/fl\.? ?oz/g, ' floz ')
    .replace(/table ?spoons?/g, ' tbsp ')
    .replace(/tea ?spoons?/g, ' tsp ')
    .replace(/ملعقه (كبيره|كبار|اكل|شوربه)/g, ' tbsp ')
    .replace(/ملاعق (كبيره|كبار|اكل)/g, ' tbsp ')
    .replace(/ملعقه (صغيره|شاي|قهوه)/g, ' tsp ')
    .replace(/ملاعق (صغيره|شاي|قهوه)/g, ' tsp ');
  s = s.replace(/([,+&])/g, ' $1 ').replace(/\s+/g, ' ').trim();
  return s ? s.split(' ') : [];
}

/** "بيضتين" -> "بيض" when the base is a known food word; otherwise null. */
function dualBase(index, t) {
  if (isKnownToken(index, t)) return null;
  for (const suf of ['تين', 'تان', 'ين', 'ان']) {
    if (t.length > suf.length + 2 && t.endsWith(suf)) {
      const base = t.slice(0, -suf.length);
      if (isKnownToken(index, base)) return base;
    }
  }
  return null;
}

/** Does a token (or the token without a leading "و") look like something we understand? */
function understood(index, t) {
  return numToken(t) !== null || t in UNITS || SEPARATORS.has(t) || isKnownToken(index, t) || dualBase(index, t) !== null;
}

function splitWaw(index, tokens) {
  const out = [];
  for (const t of tokens) {
    if (t.length > 2 && t.startsWith('و') && !understood(index, t) && understood(index, t.slice(1))) {
      out.push('و', t.slice(1));
    } else out.push(t);
  }
  return out;
}

/** Split into per-food segments. */
function segment(index, tokens) {
  const segs = [];
  let cur = [];
  const flush = () => { if (cur.length) segs.push(cur); cur = []; };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (SEPARATORS.has(t)) {
      // "1 و نصف" / "1 and half" / "1 et demi": keep as one quantity
      const prev = cur[cur.length - 1];
      if (prev !== undefined && numToken(prev) !== null && tokens[i + 1] !== undefined && isFracToken(tokens[i + 1]) && !cur.some((x) => !numToken(x) && !(x in UNITS))) continue;
      flush();
      continue;
    }
    const n = numToken(t);
    if (n !== null) {
      const hasName = cur.some((x) => numToken(x) === null && !(x in UNITS) && !STOPWORDS.has(x));
      const hasQty = cur.some((x) => numToken(x) !== null);
      const prevIsNum = numToken(cur[cur.length - 1] ?? '') !== null;
      // a new quantity after a complete "qty + food" starts a new item; "1 1/2" stays together
      if (hasName && hasQty) flush();
      else if (prevIsNum && n >= 1 && !isFracToken(t)) flush();
    }
    cur.push(t);
  }
  flush();
  return segs;
}

function parseSegment(index, tokens) {
  let qty = null;
  let unit = null;
  const name = [];
  for (let raw of tokens) {
    let t = raw;
    const n = numToken(t);
    if (n !== null && !(t in UNITS)) {
      qty = (qty ?? 0) + n;
      continue;
    }
    const u = UNITS[t];
    // a bare "l" is almost always the French article (l'huile), only a litre after a number
    if (u && unit === null && (t !== 'l' || qty !== null)) {
      unit = u.unit;
      qty = u.mult !== 1 ? (qty ?? 1) * u.mult : qty;
      continue;
    }
    if (STOPWORDS.has(t)) continue;
    // dual noun: بيضتين -> بيض x2
    const base = dualBase(index, t);
    if (base) { t = base; if (qty === null) qty = 2; }
    name.push(t);
  }
  return { qty, unit, name: name.join(' ') };
}

/**
 * Parse free text into candidate items.
 * @returns [{raw, qty, unit, name, candidates}] — unit may be null (caller picks a default).
 */
export function parseFoodText(input, index) {
  const tokens = splitWaw(index, prepare(input));
  const items = [];
  for (const seg of segment(index, tokens)) {
    const p = parseSegment(index, seg);
    if (!p.name && p.qty === null) continue;
    items.push({
      raw: seg.join(' '),
      qty: p.qty ?? 1,
      qtyExplicit: p.qty !== null,
      unit: p.unit,
      name: p.name,
      candidates: p.name ? matchFood(index, p.name) : [],
    });
  }
  return items;
}

export { stem, termKey };
