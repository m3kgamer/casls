import { state, setFoods } from './state.js';
import { lang } from './i18n.js';
import * as api from './api.js';
import { termKey } from './text.js';
import { STARTER_FOODS, STARTER_V1_COUNT, STARTER_VERSION } from './data/starter-foods.js';

/** Insert starter foods (named in the UI language, other languages as synonyms). Skips names already saved. */
export async function loadStarterFoods(list = STARTER_FOODS) {
  const l = lang();
  const have = new Set(state.foods.flatMap((f) => [f.name, ...(f.synonyms || [])]).map(termKey));
  const rows = [];
  for (const s of list) {
    const name = s.names[l];
    if (have.has(termKey(name))) continue;
    const syn = [...new Set([...Object.values(s.names).filter((n) => n !== name), ...s.synonyms])]
      .filter((x) => termKey(x) !== termKey(name));
    rows.push({ ...s, name, synonyms: syn });
  }
  for (let i = 0; i < rows.length; i += 100) await api.insertFoods(state.user.id, rows.slice(i, i + 100));
  if (rows.length) setFoods(await api.listFoods());
  if (!state.settings.starter_loaded) state.settings = await api.saveSettings(state.user.id, { starter_loaded: true });
  markVersion();
  return rows.length;
}

const verKey = () => `starterVersion:${state.user.id}`;
const markVersion = () => { try { localStorage.setItem(verKey(), String(STARTER_VERSION)); } catch { /* ignore */ } };

/** Accounts created before the larger list get the new foods once (never re-adds the original ones). */
export async function topUpStarterFoods() {
  let v = 0;
  try { v = Number(localStorage.getItem(verKey())) || 0; } catch { /* ignore */ }
  if (v >= STARTER_VERSION) return 0;
  const n = await loadStarterFoods(STARTER_FOODS.slice(STARTER_V1_COUNT));
  return n;
}