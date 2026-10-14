import { t } from '../i18n.js';
import { state, MEALS, startOfDay, addDays, sameDay } from '../state.js';
import * as api from '../api.js';
import { $, $$, esc, icon, toast, busy, errorMessage, confirmDialog, openModal, fmtDateLong, fmtDateShort } from '../ui.js';
import { sumLogs, calcNutrition, scaleLog, unitsForFood, fmt } from '../nutrition.js';
import { entryHtml, qtyText, emptyState, skeleton, macroLine, calcError } from '../shared.js';
import { openAddFood } from '../addfood.js';

const R = 52;
const CIRC = 2 * Math.PI * R;

export async function render(root) {
  root.innerHTML = `<div class="page-head"><h1>${esc(t('nav.dashboard'))}</h1></div>${skeleton(4)}`;
  const today = startOfDay(new Date());
  const from = addDays(today, -6);
  let week = [];
  try {
    week = await api.listLogs(from.toISOString(), addDays(today, 1).toISOString());
  } catch (e) {
    root.innerHTML = emptyState('history', t('err.loadTitle'), errorMessage(e), `<button class="btn" id="retry">${esc(t('common.retry'))}</button>`);
    $('#retry', root).addEventListener('click', () => render(root));
    return;
  }
  // keep the selected date inside the 7-day retention window
  if (state.date < from || state.date > today) state.date = today;

  const dayLogs = (d) => week.filter((l) => sameDay(new Date(l.consumed_at), d));
  const refresh = async () => {
    week = await api.listLogs(from.toISOString(), addDays(today, 1).toISOString());
    paint();
  };

  function paint() {
    const s = state.settings;
    const logs = dayLogs(state.date);
    const tot = sumLogs(logs);
    const target = s.daily_calorie_target;
    const remaining = target - tot.calories;
    const pct = Math.min(1, tot.calories / target);
    const over = remaining < 0;
    const isToday = sameDay(state.date, today);
    const canPrev = state.date > from;
    const canNext = state.date < today;

    const macro = (key, label, val, goal, cls) => {
      const p = goal > 0 ? Math.min(100, (val / goal) * 100) : 0;
      return `<div class="macro ${cls}"><div class="macro-top"><span>${esc(label)}</span><strong>${fmt(val, 1)}<small> / ${fmt(goal)} g</small></strong></div>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${fmt(val, 1)}" aria-label="${esc(label)}"><i style="width:${p}%"></i></div></div>`;
    };

    const week7 = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(from, i);
      const k = sumLogs(dayLogs(d)).calories;
      const h = Math.max(4, Math.min(100, (k / target) * 100));
      return `<button class="day ${sameDay(d, state.date) ? 'sel' : ''}" data-day="${d.getTime()}" aria-label="${esc(fmtDateLong(d))}: ${fmt(k)} ${esc(t('kcal'))}">
        <span class="day-bar"><i style="height:${h}%" class="${k > target ? 'over' : ''}"></i></span>
        <span class="day-k">${k ? fmt(k) : '–'}</span><span class="day-n">${esc(fmtDateShort(d))}</span></button>`;
    }).join('');

    const meals = MEALS.map((meal) => {
      const ml = logs.filter((l) => l.meal_type === meal);
      const mt = sumLogs(ml);
      return `<section class="meal card">
        <header><h3>${esc(t('meal.' + meal))}</h3><span class="meal-k">${fmt(mt.calories)} ${esc(t('kcal'))}</span>
          <button class="icon-btn" data-add="${meal}" aria-label="${esc(t('add.title'))} – ${esc(t('meal.' + meal))}">${icon('plus')}</button></header>
        ${ml.length ? `<ul class="entries">${ml.map((l) => entryHtml(l, ['edit', 'delete'])).join('')}</ul>` : `<p class="meal-empty">${esc(t('dash.noEntries'))}</p>`}
      </section>`;
    }).join('');

    root.innerHTML = `
      <div class="page-head">
        <div class="date-nav">
          <button class="icon-btn" id="d-prev" ${canPrev ? '' : 'disabled'} aria-label="${esc(t('dash.prevDay'))}">${icon(document.dir === 'rtl' ? 'chevR' : 'chevL')}</button>
          <div class="date-title"><h1>${esc(isToday ? t('dash.today') : fmtDateLong(state.date))}</h1>${isToday ? `<small>${esc(fmtDateLong(state.date))}</small>` : ''}</div>
          <button class="icon-btn" id="d-next" ${canNext ? '' : 'disabled'} aria-label="${esc(t('dash.nextDay'))}">${icon(document.dir === 'rtl' ? 'chevL' : 'chevR')}</button>
        </div>
        ${isToday ? '' : `<button class="btn ghost sm" id="d-today">${esc(t('dash.backToday'))}</button>`}
      </div>

      <div class="summary card">
        <div class="ring-wrap">
          <svg viewBox="0 0 120 120" class="ring" role="img" aria-label="${esc(t('dash.consumed'))}: ${fmt(tot.calories)} / ${fmt(target)}">
            <circle cx="60" cy="60" r="${R}" class="ring-bg"/>
            <circle cx="60" cy="60" r="${R}" class="ring-fg ${over ? 'over' : ''}" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC * (1 - pct)}" transform="rotate(-90 60 60)"/>
          </svg>
          <div class="ring-center"><strong>${fmt(tot.calories)}</strong><small>${esc(t('kcal'))}</small></div>
        </div>
        <div class="stats">
          <div class="stat"><small>${esc(t('dash.target'))}</small><strong>${fmt(target)}</strong></div>
          <div class="stat"><small>${esc(over ? t('dash.over') : t('dash.remaining'))}</small><strong class="${over ? 'neg' : 'pos'}">${fmt(Math.abs(remaining))}</strong></div>
        </div>
        <div class="macros">
          ${macro('p', t('protein'), tot.protein, s.protein_target, 'p')}
          ${macro('c', t('carbs'), tot.carbohydrates, s.carbohydrate_target, 'c')}
          ${macro('f', t('fat'), tot.fat, s.fat_target, 'f')}
        </div>
      </div>

      <div class="card week"><h2>${esc(t('dash.week'))}</h2><div class="week-grid">${week7}</div></div>
      <div class="meals">${meals}</div>
      <button class="fab" id="fab">${icon('plus')}<span>${esc(t('add.title'))}</span></button>`;

    const go = (d) => { state.date = startOfDay(d); paint(); };
    $('#d-prev', root).addEventListener('click', () => go(addDays(state.date, -1)));
    $('#d-next', root).addEventListener('click', () => go(addDays(state.date, 1)));
    $('#d-today', root)?.addEventListener('click', () => go(today));
    $$('.day', root).forEach((b) => b.addEventListener('click', () => go(new Date(Number(b.dataset.day)))));
    $('#fab', root).addEventListener('click', () => openAddFood({ date: state.date, onDone: refresh }));
    $$('[data-add]', root).forEach((b) => b.addEventListener('click', () => openAddFood({ date: state.date, onDone: refresh })));

    $$('.entries', root).forEach((ul) => ul.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const log = week.find((l) => l.id === b.dataset.id);
      if (!log) return;
      if (b.dataset.act === 'delete') {
        if (!(await confirmDialog(t('dash.confirmDelete', { name: log.food_name_snapshot })))) return;
        try { await api.deleteLog(log.id); week = week.filter((l) => l.id !== log.id); paint(); toast(t('common.deleted')); }
        catch (err) { toast(errorMessage(err), 'err'); }
      } else if (b.dataset.act === 'edit') editEntry(log, refresh);
    }));
  }
  paint();
}

export function editEntry(log, onSaved) {
  const food = state.foods.find((f) => f.id === log.food_id) || null;
  const units = food ? [...new Set([...unitsForFood(food), log.quantity_unit])] : [log.quantity_unit];
  const m = openModal(`
    <form id="ee" novalidate>
      <header class="modal-head"><h2>${esc(t('dash.editEntry'))}</h2><button type="button" class="icon-btn" data-close aria-label="${esc(t('common.close'))}">${icon('x')}</button></header>
      <div class="modal-body">
        <h3 class="picked-name">${esc(log.food_name_snapshot)}</h3>
        ${food ? '' : `<p class="hint">${esc(t('dash.foodGone'))}</p>`}
        <div class="grid2">
          <label class="field"><span>${esc(t('add.quantity'))}</span><input id="e-qty" type="number" inputmode="decimal" step="any" min="0" value="${esc(Number(log.quantity))}"></label>
          <label class="field"><span>${esc(t('add.unit'))}</span><select id="e-unit" ${food ? '' : 'disabled'}>${units.map((u) => `<option value="${u}" ${u === log.quantity_unit ? 'selected' : ''}>${esc(t('unit.' + u))}</option>`).join('')}</select></label>
        </div>
        <label class="field"><span>${esc(t('add.meal'))}</span><select id="e-meal">${MEALS.map((x) => `<option value="${x}" ${x === log.meal_type ? 'selected' : ''}>${esc(t('meal.' + x))}</option>`).join('')}</select></label>
        <div class="preview" id="e-prev"></div>
      </div>
      <footer class="modal-actions"><button type="button" class="btn ghost" data-close>${esc(t('common.cancel'))}</button><button class="btn primary" id="e-save">${esc(t('common.save'))}</button></footer>
    </form>`, { label: t('dash.editEntry') });
  const el = m.el;
  let patch = null;
  const paint = () => {
    const q = Number($('#e-qty', el).value);
    const unit = $('#e-unit', el).value;
    let nut = null;
    let err = null;
    if (food) {
      const c = calcNutrition(food, q, unit);
      if (c.ok) nut = { quantity: c.quantity, quantity_unit: c.unit, calories_snapshot: c.calories, protein_snapshot: c.protein, carbohydrates_snapshot: c.carbohydrates, fat_snapshot: c.fat };
      else err = calcError(c.error);
    } else if (Number.isFinite(q) && q > 0) nut = { ...scaleLog(log, q), quantity_unit: log.quantity_unit };
    else err = calcError('INVALID_QTY');
    patch = nut;
    $('#e-prev', el).innerHTML = nut
      ? `<div class="big-kcal">${fmt(nut.calories_snapshot)}<small>${esc(t('kcal'))}</small></div><div class="macro-line">${macroLine(nut.protein_snapshot, nut.carbohydrates_snapshot, nut.fat_snapshot)}</div>`
      : `<p class="err-text">${esc(err)}</p>`;
    $('#e-save', el).disabled = !nut;
  };
  ['input', 'change'].forEach((ev) => { $('#e-qty', el).addEventListener(ev, paint); $('#e-unit', el).addEventListener(ev, paint); });
  paint();
  $('#ee', el).addEventListener('submit', (ev) => {
    ev.preventDefault();
    busy($('#e-save', el), async () => {
      if (!patch) return;
      await api.updateLog(log.id, { ...patch, meal_type: $('#e-meal', el).value });
      toast(t('common.saved'));
      m.close();
      await onSaved?.();
    });
  });
}
