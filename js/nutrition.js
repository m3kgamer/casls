// Deterministic nutrition engine. Single source of truth for dashboard, add-food modal and history.

export const UNIT_INFO = {
  g: { kind: 'mass', f: 1, base: 'g' },
  kg: { kind: 'mass', f: 1000, base: 'g' },
  oz: { kind: 'mass', f: 28.3495, base: 'g' },
  lb: { kind: 'mass', f: 453.592, base: 'g' },
  ml: { kind: 'volume', f: 1, base: 'ml' },
  l: { kind: 'volume', f: 1000, base: 'ml' },
  tsp: { kind: 'volume', f: 5, base: 'ml' },
  tbsp: { kind: 'volume', f: 15, base: 'ml' },
  cup: { kind: 'volume', f: 240, base: 'ml' },
  floz: { kind: 'volume', f: 29.5735, base: 'ml' },
  piece: { kind: 'count', f: 1, base: 'piece' },
  serving: { kind: 'count', f: 1, base: 'serving' },
};

const REF_KIND = { g: 'mass', ml: 'volume', piece: 'count', serving: 'count' };
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

/** Convert a user quantity to its stored base unit (g / ml / piece / serving). */
export function toBase(qty, unit) {
  const u = UNIT_INFO[unit];
  if (!u) return null;
  return { quantity: r3(qty * u.f), unit: u.base, kind: u.kind };
}

/**
 * Nutrition for `qty` `unit` of `food`.
 * Never assumes 1 ml = 1 g. Returns {ok:false,error} when the conversion is impossible.
 * Errors: INVALID_QTY | INVALID_UNIT | NEEDS_SERVING_SIZE | UNIT_MISMATCH
 */
export function calcNutrition(food, qty, unit) {
  const q = Number(qty);
  if (!Number.isFinite(q) || q <= 0) return { ok: false, error: 'INVALID_QTY' };
  const b = toBase(q, unit);
  if (!b) return { ok: false, error: 'INVALID_UNIT' };
  const refKind = REF_KIND[food.reference_unit];
  const refQty = Number(food.reference_quantity) || 100;
  const servSize = Number(food.serving_size) || 0;
  let amount; // expressed in the food's reference unit

  if (b.kind === refKind) {
    amount = b.quantity;
  } else if (refKind === 'count') {
    const need = b.kind === 'mass' ? 'g' : 'ml';
    if (!servSize || food.serving_unit !== need) return { ok: false, error: 'NEEDS_SERVING_SIZE' };
    amount = b.quantity / servSize;
  } else if (b.kind === 'count') {
    const need = refKind === 'mass' ? 'g' : 'ml';
    if (!servSize || food.serving_unit !== need) return { ok: false, error: 'NEEDS_SERVING_SIZE' };
    amount = b.quantity * servSize;
  } else {
    return { ok: false, error: 'UNIT_MISMATCH' };
  }

  const factor = amount / refQty;
  const scale = (v) => (v == null ? 0 : r2(Number(v) * factor));
  const missing = ['protein', 'carbohydrates', 'fat'].filter((k) => food[k] == null);
  return {
    ok: true,
    quantity: b.quantity,
    unit: b.unit,
    calories: scale(food.calories),
    protein: scale(food.protein),
    carbohydrates: scale(food.carbohydrates),
    fat: scale(food.fat),
    fiber: food.fiber == null ? null : scale(food.fiber),
    sugar: food.sugar == null ? null : scale(food.sugar),
    missing,
  };
}

/** Unit to assume when the user typed no unit ("2 tomates"). */
export function defaultUnit(food) {
  if (food.reference_unit === 'piece' || food.reference_unit === 'serving') return food.reference_unit;
  return food.serving_size ? 'piece' : 'g';
}

/** Units that make sense for a given food (shown in selects). */
export function unitsForFood(food) {
  const out = [];
  if (food.reference_unit === 'ml' || food.serving_unit === 'ml') out.push('ml', 'l', 'tsp', 'tbsp', 'cup', 'floz');
  if (food.reference_unit === 'g' || food.serving_unit === 'g') out.push('g', 'kg', 'oz', 'lb');
  if (food.reference_unit === 'piece' || food.serving_size || food.reference_unit === 'serving') out.push('piece', 'serving');
  return [...new Set(out)];
}

export function logFromCalc(food, calc, extra) {
  return {
    food_id: food.id ?? null,
    food_name_snapshot: food.name,
    calories_snapshot: calc.calories,
    protein_snapshot: calc.protein,
    carbohydrates_snapshot: calc.carbohydrates,
    fat_snapshot: calc.fat,
    quantity: calc.quantity,
    quantity_unit: calc.unit,
    ...extra,
  };
}

export function sumLogs(logs) {
  const t = { calories: 0, protein: 0, carbohydrates: 0, fat: 0 };
  for (const l of logs) {
    t.calories += Number(l.calories_snapshot) || 0;
    t.protein += Number(l.protein_snapshot) || 0;
    t.carbohydrates += Number(l.carbohydrates_snapshot) || 0;
    t.fat += Number(l.fat_snapshot) || 0;
  }
  return t;
}

/** Scale a snapshot when the original food no longer exists. */
export function scaleLog(log, newQty) {
  const k = newQty / Number(log.quantity);
  return {
    quantity: r3(newQty),
    calories_snapshot: r2(log.calories_snapshot * k),
    protein_snapshot: r2(log.protein_snapshot * k),
    carbohydrates_snapshot: r2(log.carbohydrates_snapshot * k),
    fat_snapshot: r2(log.fat_snapshot * k),
  };
}

export const fmt = (n, d = 0) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d, useGrouping: false });
};
