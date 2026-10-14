import { t } from '../i18n.js';
import { state, startOfDay, addDays, sameDay, consumedAtFor } from '../state.js';
import * as api from '../api.js';
import { $, $$, esc, icon, toast, errorMessage, confirmDialog, fmtDateLong, fmtDateShort } from '../ui.js';
import { sumLogs, fmt } from '../nutrition.js';
import { entryHtml, emptyState, skeleton, macroLine } from '../shared.js';
import { MEALS } from '../state.js';

export async function render(root) {
  root.innerHTML = `<div class="page-head"><h1>${esc(t('nav.history'))}</h1></div>${skeleton(4)}`;
  const today = startOfDay(new Date());
  const from = addDays(today, -6);
  let logs;
  try { logs = await api.listLogs(from.toISOString(), addDays(today, 1).toISOString()); }
  catch (e) {
    root.innerHTML = emptyState('history', t('err.loadTitle'), errorMessage(e), `<button class="btn" id="retry">${esc(t('common.retry'))}</button>`);
    $('#retry', root).addEventListener('click', () => render(root));
    return;
  }
  let day = 'all';

  function paint() {
    const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i)); // newest first
    const shown = day === 'all' ? days : days.filter((d) => d.getTime() === Number(day));
    const chips = [`<button class="chip ${day === 'all' ? 'active' : ''}" data-d="all">${esc(t('history.all'))}</button>`,
      ...days.map((d) => `<button class="chip ${String(d.getTime()) === day ? 'active' : ''}" data-d="${d.getTime()}">${esc(sameDay(d, today) ? t('dash.today') : fmtDateShort(d))}</button>`)].join('');

    const sections = shown.map((d) => {
      const dl = logs.filter((l) => sameDay(new Date(l.consumed_at), d)).sort((a, b) => new Date(b.consumed_at) - new Date(a.consumed_at));
      if (!dl.length && day === 'all') return '';
      const tot = sumLogs(dl);
      return `<section class="card hist-day">
        <header><div><h2>${esc(fmtDateLong(d))}</h2><div class="macro-line">${macroLine(tot.protein, tot.carbohydrates, tot.fat)}</div></div>
          <div class="entry-kcal"><strong>${fmt(tot.calories)}</strong><small>${esc(t('kcal'))}</small></div></header>
        ${dl.length ? MEALS.map((m) => {
          const ml = dl.filter((l) => l.meal_type === m);
          return ml.length ? `<h4 class="meal-h">${esc(t('meal.' + m))}</h4><ul class="entries">${ml.map((l) => entryHtml(l, ['copy', 'delete'])).join('')}</ul>` : '';
        }).join('') : `<p class="meal-empty">${esc(t('history.noDay'))}</p>`}
      </section>`;
    }).join('');

    root.innerHTML = `
      <div class="page-head"><h1>${esc(t('nav.history'))}</h1></div>
      <p class="hint">${esc(t('history.note'))}</p>
      <div class="chips scroll" role="tablist">${chips}</div>
      ${sections || emptyState('history', t('history.emptyTitle'), t('history.emptyText'))}`;

    $$('.chip', root).forEach((c) => c.addEventListener('click', () => { day = c.dataset.d; paint(); }));
    $$('.entries', root).forEach((ul) => ul.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const log = logs.find((l) => l.id === b.dataset.id);
      if (!log) return;
      b.disabled = true;
      try {
        if (b.dataset.act === 'delete') {
          if (!(await confirmDialog(t('dash.confirmDelete', { name: log.food_name_snapshot })))) { b.disabled = false; return; }
          await api.deleteLog(log.id);
          logs = logs.filter((l) => l.id !== log.id);
          toast(t('common.deleted'));
        } else {
          // copy the snapshot into today's log (food definition is untouched)
          const food = state.foods.find((f) => f.id === log.food_id);
          const [row] = await api.addLogs(state.user.id, [{
            food_id: food ? food.id : null,
            food_name_snapshot: log.food_name_snapshot,
            calories_snapshot: log.calories_snapshot, protein_snapshot: log.protein_snapshot,
            carbohydrates_snapshot: log.carbohydrates_snapshot, fat_snapshot: log.fat_snapshot,
            quantity: log.quantity, quantity_unit: log.quantity_unit, meal_type: log.meal_type,
            consumed_at: consumedAtFor(today),
          }]);
          logs.push(row);
          toast(t('history.copied'));
        }
        paint();
      } catch (err) { b.disabled = false; toast(errorMessage(err), 'err'); }
    }));
  }
  paint();
}
