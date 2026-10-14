// Food matching against the user's saved foods + built-in synonym dictionary.
// Strict order of preference: exact name > saved synonym > dictionary synonym > partial > spelling correction.
import { termKey, levenshtein } from './text.js';
import { STARTER_FOODS } from './data/starter-foods.js';

// ---- Built-in dictionary: every starter food forms a synonym group (extend freely) ----
const GROUPS = STARTER_FOODS.map((f) => [...Object.values(f.names), ...f.synonyms]);

// Extra spelling variants / Darija forms. Keyed by starter food key.
const EXTRA = {
  tomato: ['طماطيم', 'طمطم', 'طماطم', 'طماتم', 'tomat', 'tomatte'],
  egg: ['بيضه', 'بيضات', 'beid', 'oeuf dur', 'omelette', 'boiled egg'],
  chicken: ['دجاج', 'جاج', 'فروج', 'poullet', 'pouleet', 'chiken', 'chicken'],
  potato: ['بطاطا', 'بطاطه', 'batata'],
  rice: ['روز', 'ruz'],
};
STARTER_FOODS.forEach((f, i) => { if (EXTRA[f.key]) GROUPS[i].push(...EXTRA[f.key]); });

export const DICT = new Map(); // termKey -> Set(groupIdx)
GROUPS.forEach((terms, gi) => {
  for (const term of terms) {
    const k = termKey(term);
    if (!k) continue;
    if (!DICT.has(k)) DICT.set(k, new Set());
    DICT.get(k).add(gi);
  }
});
const DICT_KEYS = [...DICT.keys()];

const maxDist = (len) => (len <= 3 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : 3);

export function buildIndex(foods) {
  const entries = [];
  const foodGroups = new Map();
  const known = new Set();
  const df = new Map(); // token -> number of foods using it (rare tokens are more specific)
  for (const food of foods) {
    const terms = [food.name, ...(food.synonyms || [])];
    const groups = new Set();
    terms.forEach((term, i) => {
      const key = termKey(term);
      if (!key) return;
      entries.push({ food, term, key, tokens: key.split(' '), isName: i === 0 });
      known.add(key);
      key.split(' ').forEach((t) => known.add(t));
      for (const g of DICT.get(key) || []) groups.add(g);
    });
    for (const tok of new Set(terms.flatMap((x) => termKey(x).split(' ')).filter(Boolean))) df.set(tok, (df.get(tok) || 0) + 1);
    foodGroups.set(food.id, groups);
  }
  for (const k of DICT_KEYS) { known.add(k); k.split(' ').forEach((t) => known.add(t)); }
  return { entries, foodGroups, known, foods, df };
}

export const isKnownToken = (index, token) => index.known.has(termKey(token));

/**
 * Ranked candidate foods for a free-text name.
 * @returns [{food, score, via, term}] score in 0..1 (>= .8 is considered confident)
 */
export function matchFood(index, text, { limit = 5, prefix = false } = {}) {
  const key = termKey(text);
  if (!key) return [];
  const qTokens = key.split(' ');
  const qGroups = DICT.get(key) || new Set();
  const md = maxDist(key.length);

  // groups reachable through a misspelled dictionary term
  const fuzzyGroups = new Map(); // group -> distance
  if (md > 0 && !DICT.has(key)) {
    for (const dk of DICT_KEYS) {
      if (Math.abs(dk.length - key.length) > md) continue;
      const d = levenshtein(key, dk);
      if (d <= md) for (const g of DICT.get(dk)) if (!(fuzzyGroups.get(g) <= d)) fuzzyGroups.set(g, d);
    }
  }

  const best = new Map();
  for (const e of index.entries) {
    let score = 0;
    let via = '';
    if (e.key === key) { score = e.isName ? 1 : 0.97; via = e.isName ? 'name' : 'synonym'; }
    else {
      const fg = index.foodGroups.get(e.food.id);
      let dictHit = false;
      for (const g of qGroups) if (fg.has(g)) dictHit = true;
      if (dictHit) { score = 0.92; via = 'dictionary'; }
      else if (prefix && e.key.startsWith(key)) { score = 0.88; via = e.isName ? 'name' : 'synonym'; }
      else if (qTokens.every((t) => e.tokens.includes(t))) { score = 0.6 + 0.25 * (qTokens.length / e.tokens.length); via = 'partial'; }
      else if (e.tokens.every((t) => qTokens.includes(t))) { score = 0.55 + 0.2 * (e.tokens.length / qTokens.length) + 0.05 / Math.max(1, Math.min(...e.tokens.map((t) => index.df.get(t) || 1))); via = 'partial'; }
      else if (prefix && e.tokens.some((t) => t.startsWith(key))) { score = 0.75; via = 'partial'; }
      else if (prefix && key.length >= 2 && e.key.includes(key)) { score = 0.6; via = 'partial'; }
      else {
        if (md > 0 && Math.abs(e.key.length - key.length) <= md) {
          const d = levenshtein(key, e.key);
          if (d <= md) { score = 0.85 - 0.12 * d; via = 'spelling'; }
        }
        if (!score && fuzzyGroups.size) {
          let bd = Infinity;
          for (const [g, d] of fuzzyGroups) if (fg.has(g)) bd = Math.min(bd, d);
          if (bd !== Infinity) { score = 0.8 - 0.1 * bd; via = 'spelling'; }
        }
      }
    }
    if (score >= 0.5) {
      const prev = best.get(e.food.id);
      if (!prev || score > prev.score) best.set(e.food.id, { food: e.food, score, via, term: e.term });
    }
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || (b.food.use_count || 0) - (a.food.use_count || 0) || a.food.name.localeCompare(b.food.name))
    .slice(0, limit);
}

/** Autocomplete while typing. */
export const suggestFoods = (index, text, limit = 6) => matchFood(index, text, { limit, prefix: true });
