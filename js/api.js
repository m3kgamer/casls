// Supabase data layer. All persistent data lives in Supabase (no localStorage database).
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { termKey } from './text.js';

export const isConfigured = () =>
  /^https:\/\/[a-z0-9-]+\.supabase\.co/i.test(SUPABASE_URL) && !SUPABASE_URL.includes('YOUR-PROJECT') && !SUPABASE_KEY.includes('YOUR-');

let sb = null;
export function client() {
  if (!sb) sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return sb;
}

export class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function check({ data, error }) {
  if (error) {
    const code = error.code === '23505' ? 'DUPLICATE_BARCODE'
      : error.code === '23514' ? 'INVALID_DATA'
      : (error.message || '').match(/fetch|network/i) ? 'NETWORK' : 'DB';
    throw new ApiError(code, error.message);
  }
  return data;
}

// ---------------- auth
export const getSession = async () => (await client().auth.getSession()).data.session;
export const signIn = (email, password) => client().auth.signInWithPassword({ email, password });
export const signUp = (email, password) => client().auth.signUp({ email, password });
export const signOut = () => client().auth.signOut();
export const onAuthChange = (cb) => client().auth.onAuthStateChange((_e, s) => cb(s));

// ---------------- settings
export async function getSettings(userId) {
  let row = check(await client().from('user_settings').select('*').eq('user_id', userId).maybeSingle());
  if (!row) row = check(await client().from('user_settings').insert({ user_id: userId }).select().single());
  return row;
}
export async function saveSettings(userId, patch) {
  return check(await client().from('user_settings').upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' }).select().single());
}

// ---------------- foods
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

export function foodPayload(f) {
  const synonyms = [...new Set((f.synonyms || []).map((s) => s.trim()).filter(Boolean))];
  return {
    name: f.name.trim(),
    normalized_name: termKey(f.name),
    synonyms,
    calories: num(f.calories) ?? 0,
    protein: num(f.protein), carbohydrates: num(f.carbohydrates), fat: num(f.fat),
    fiber: num(f.fiber), sugar: num(f.sugar),
    reference_quantity: num(f.reference_quantity) ?? 100,
    reference_unit: f.reference_unit || 'g',
    serving_size: num(f.serving_size),
    serving_unit: num(f.serving_size) ? f.serving_unit || (f.reference_unit === 'ml' ? 'ml' : 'g') : null,
    barcode: f.barcode ? String(f.barcode).trim() : null,
    image_url: f.image_url ? f.image_url.trim() : null,
  };
}

export async function listFoods() {
  return check(await client().from('foods').select('*').order('name', { ascending: true }).limit(5000));
}
export async function insertFoods(userId, foods) {
  const rows = foods.map((f) => ({ user_id: userId, ...foodPayload(f) }));
  return check(await client().from('foods').insert(rows).select());
}
export async function saveFood(userId, food) {
  const payload = foodPayload(food);
  if (food.id) return check(await client().from('foods').update(payload).eq('id', food.id).select().single());
  return check(await client().from('foods').insert({ user_id: userId, ...payload }).select().single());
}
export async function deleteFood(id) {
  // food_logs.food_id is ON DELETE SET NULL: history survives with its snapshot.
  check(await client().from('foods').delete().eq('id', id));
}
export async function findFoodByBarcode(code) {
  // Barcode lookup is intentionally limited to the user's own Supabase table. No external service.
  return check(await client().from('foods').select('*').eq('barcode', String(code).trim()).maybeSingle());
}
export async function deleteAllFoods() {
  check(await client().from('foods').delete().not('id', 'is', null));
}

// ---------------- logs
export async function listLogs(fromISO, toISO) {
  return check(await client().from('food_logs').select('*')
    .gte('consumed_at', fromISO).lt('consumed_at', toISO).order('consumed_at', { ascending: true }));
}
export async function addLogs(userId, rows) {
  return check(await client().from('food_logs').insert(rows.map((r) => ({ user_id: userId, ...r }))).select());
}
export async function updateLog(id, patch) {
  return check(await client().from('food_logs').update(patch).eq('id', id).select().single());
}
export async function deleteLog(id) {
  check(await client().from('food_logs').delete().eq('id', id));
}
export async function deleteAllLogs() {
  check(await client().from('food_logs').delete().not('id', 'is', null));
}
/** Fallback expiry check on app load. Touches food_logs only (RLS limits it to the user's rows). */
export async function purgeExpiredLogs() {
  check(await client().from('food_logs').delete().lte('expires_at', new Date().toISOString()));
}
