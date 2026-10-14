// In-memory stand-in for js/api.js, used ONLY by tests/ui.html to exercise the UI without a Supabase project.
import { termKey } from '../js/text.js';

window.supabase = {};
export const isConfigured = () => true;
export class ApiError extends Error { constructor(code, message) { super(message); this.code = code; } }

const uid = () => crypto.randomUUID();
const db = { foods: [], logs: [], settings: null };
window.__db = db;
const clone = (x) => JSON.parse(JSON.stringify(x));

export const getSession = async () => ({ user: { id: 'u1', email: 'test@example.com' } });
export const signIn = async () => ({ data: {}, error: null });
export const signUp = async () => ({ data: {}, error: null });
export const signOut = async () => {};
export const onAuthChange = () => {};

export async function getSettings(userId) {
  return (db.settings ??= { user_id: userId, daily_calorie_target: 2000, protein_target: 100, carbohydrate_target: 250, fat_target: 70, language: 'ar', preferred_units: 'metric', starter_loaded: false });
}
export async function saveSettings(userId, patch) { db.settings = { ...(await getSettings(userId)), ...patch }; return clone(db.settings); }

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
export function foodPayload(f) {
  return {
    name: f.name.trim(), normalized_name: termKey(f.name), synonyms: [...new Set((f.synonyms || []).map((s) => s.trim()).filter(Boolean))],
    calories: num(f.calories) ?? 0, protein: num(f.protein), carbohydrates: num(f.carbohydrates), fat: num(f.fat), fiber: num(f.fiber), sugar: num(f.sugar),
    reference_quantity: num(f.reference_quantity) ?? 100, reference_unit: f.reference_unit || 'g',
    serving_size: num(f.serving_size), serving_unit: num(f.serving_size) ? f.serving_unit || 'g' : null,
    barcode: f.barcode ? String(f.barcode).trim() : null, image_url: f.image_url || null,
  };
}
export const listFoods = async () => clone(db.foods).sort((a, b) => a.name.localeCompare(b.name));
export async function insertFoods(userId, foods) {
  const rows = foods.map((f) => ({ id: uid(), user_id: userId, use_count: 0, created_at: new Date().toISOString(), ...foodPayload(f) }));
  db.foods.push(...rows);
  return clone(rows);
}
export async function saveFood(userId, food) {
  const p = foodPayload(food);
  if (p.barcode && db.foods.some((x) => x.barcode === p.barcode && x.id !== food.id)) throw new ApiError('DUPLICATE_BARCODE', 'duplicate key');
  if (food.id) { const i = db.foods.findIndex((x) => x.id === food.id); db.foods[i] = { ...db.foods[i], ...p }; return clone(db.foods[i]); }
  const row = { id: uid(), user_id: userId, use_count: 0, ...p };
  db.foods.push(row);
  return clone(row);
}
export async function deleteFood(id) { db.foods = db.foods.filter((f) => f.id !== id); db.logs.forEach((l) => { if (l.food_id === id) l.food_id = null; }); }
export const findFoodByBarcode = async (code) => clone(db.foods.find((f) => f.barcode === String(code).trim()) ?? null);
export async function deleteAllFoods() { db.foods = []; db.logs.forEach((l) => { l.food_id = null; }); }

export async function listLogs(from, to) {
  return clone(db.logs.filter((l) => l.consumed_at >= from && l.consumed_at < to)).sort((a, b) => a.consumed_at.localeCompare(b.consumed_at));
}
export async function addLogs(userId, rows) {
  const out = rows.map((r) => ({ id: uid(), user_id: userId, expires_at: new Date(new Date(r.consumed_at).getTime() + 7 * 864e5).toISOString(), ...r }));
  db.logs.push(...out);
  out.forEach((l) => { const f = db.foods.find((x) => x.id === l.food_id); if (f) f.use_count++; });
  return clone(out);
}
export async function updateLog(id, patch) { const l = db.logs.find((x) => x.id === id); Object.assign(l, patch); return clone(l); }
export async function deleteLog(id) { db.logs = db.logs.filter((l) => l.id !== id); }
export async function deleteAllLogs() { db.logs = []; }
export async function purgeExpiredLogs() { const now = new Date().toISOString(); db.logs = db.logs.filter((l) => l.expires_at > now); }
