import { buildIndex } from './matcher.js';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];

export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();

export const state = {
  user: null,
  settings: null,
  foods: [],
  index: buildIndex([]),
  date: startOfDay(new Date()),
};

export function setFoods(foods) {
  state.foods = foods;
  state.index = buildIndex(foods);
}
export function upsertFoodLocal(food) {
  const foods = state.foods.filter((f) => f.id !== food.id);
  foods.push(food);
  foods.sort((a, b) => a.name.localeCompare(b.name));
  setFoods(foods);
}
export function removeFoodLocal(id) {
  setFoods(state.foods.filter((f) => f.id !== id));
}

export function guessMeal(d = new Date()) {
  const h = d.getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
}

/** Timestamp for a new log on the selected day: now if today, else noon of that day. */
export function consumedAtFor(date) {
  const now = new Date();
  if (sameDay(date, now)) return now.toISOString();
  const d = startOfDay(date);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}
