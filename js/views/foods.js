import { t } from '../i18n.js';
import { state, removeFoodLocal, setFoods } from '../state.js';
import * as api from '../api.js';
import { $, $$, esc, icon, toast, busy, errorMessage, confirmDialog, debounce } from '../ui.js';
import { termKey } from '../text.js';
import { suggestFoods } from '../matcher.js';
import { fmt } from '../nutrition.js';
import { refText, macroLine, emptyState } from '../shared.js';
import { openFoodForm } from '../foodform.js';
import { loadStarterFoods } from '../starter.js';

export async function render(root) {
  let filter = 'all';
  let q = '';

  root.innerHTML = `
    <div class="page-head"><h1>${esc(t('nav.foods'))}</h1>
      <button class="btn primary" id="fd-add">${icon('plus')}<span>${esc(t('foods.add'))}</span></button></div>
    <div class="toolbar">
      <label class="search">${icon('search')}<input id="fd-q" type="search" placeholder="${esc(t('foods.search'))}" aria-label="${esc(t('foods.search'))}" dir="auto" autocomplete="off"></label>
      <div class="chips" role="tablist">
        <button class="chip active" data-f="all">${esc(t('foods.all'))}</button>
        <button class="chip" data-f="frequent">${esc(t('foods.frequent'))}</button>
      </div>
    </div>
    <div id="fd-list" class="food-list"></div>`;

  const list = $('#fd-list', root);

  function items() {
    let rows;
    if (q) {
      const digits = q.replace(/\s/g, '');
      if (/^\d{3,14}$/.test(digits)) rows = state.foods.filter((f) => f.barcode && f.barcode.includes(digits)).map((f) => ({ food: f, term: f.barcode }));
      else rows = suggestFoods(state.index, q, 100).map((s) => ({ food: s.food, term: s.term }));
    } else rows = state.foods.map((f) => ({ food: f, term: f.name }));
    if (filter === 'frequent') {
      rows = rows.filter((r) => (r.food.use_count || 0) > 0).sort((a, b) => b.food.use_count - a.food.use_count);
    }
    return rows;
  }

  function paint() {
    if (!state.foods.length) {
      list.innerHTML = emptyState('food', t('foods.emptyTitle'), t('foods.emptyText'),
        `<div class="row-actions center"><button class="btn primary" id="fd-starter">${esc(t('foods.loadStarter'))}</button><button class="btn" id="fd-add2">${esc(t('foods.add'))}</button></div>`);
      $('#fd-starter', list).addEventListener('click', (e) => busy(e.currentTarget, async () => {
        const n = await loadStarterFoods();
        toast(t('foods.starterLoaded', { n }));
        paint();
      }));
      $('#fd-add2', list).addEventListener('click', add);
      return;
    }
    const rows = items();
    if (!rows.length) { list.innerHTML = emptyState('search', t(filter === 'frequent' && !q ? 'foods.noFrequent' : 'search.none'), ''); return; }
    list.innerHTML = rows.map(({ food: f, term }) => `
      <article class="food-card card" data-id="${f.id}">
        <div class="fc-main">
          ${f.image_url ? `<img class="fc-img" src="${esc(f.image_url)}" alt="" loading="lazy">` : `<span class="fc-img ph">${icon('leaf')}</span>`}
          <div class="fc-text">
            <h3>${esc(f.name)}</h3>
            ${term !== f.name ? `<small class="syn">${esc(t('nl.matchedSyn'))}: ${esc(term)}</small>` : ''}
            <div class="fc-k"><strong>${esc(refText(f))}</strong></div>
            <div class="macro-line">${macroLine(f.protein ?? 0, f.carbohydrates ?? 0, f.fat ?? 0)}</div>
            <div class="fc-meta">
              ${f.serving_size ? `<span>${esc(t('foods.piece'))}: ${fmt(f.serving_size, 1)} ${esc(f.serving_unit)}</span>` : ''}
              ${f.barcode ? `<span dir="ltr">${icon('barcode')} ${esc(f.barcode)}</span>` : ''}
              ${f.use_count ? `<span>×${f.use_count}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="fc-actions">
          <button class="icon-btn" data-act="edit" data-id="${f.id}" aria-label="${esc(t('common.edit'))}">${icon('edit')}</button>
          <button class="icon-btn danger" data-act="del" data-id="${f.id}" aria-label="${esc(t('common.delete'))}">${icon('trash')}</button>
        </div>
      </article>`).join('');
  }

  async function add() {
    const saved = await openFoodForm();
    if (saved) paint();
  }

  list.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const food = state.foods.find((f) => f.id === b.dataset.id);
    if (!food) return;
    if (b.dataset.act === 'edit') {
      if (await openFoodForm({ food })) paint();
    } else if (b.dataset.act === 'del') {
      if (!(await confirmDialog(t('foods.confirmDelete', { name: food.name }) + '\n' + t('foods.keepsHistory')))) return;
      try { await api.deleteFood(food.id); removeFoodLocal(food.id); paint(); toast(t('common.deleted')); }
      catch (err) { toast(errorMessage(err), 'err'); }
    }
  });
  $('#fd-add', root).addEventListener('click', add);
  $('#fd-q', root).addEventListener('input', debounce((e) => { q = e.target.value.trim(); paint(); }, 120));
  $$('.chip', root).forEach((c) => c.addEventListener('click', () => {
    filter = c.dataset.f;
    $$('.chip', root).forEach((x) => x.classList.toggle('active', x === c));
    paint();
  }));
  // refresh from server so edits from other devices show up
  try { setFoods(await api.listFoods()); } catch (e) { toast(errorMessage(e), 'err'); }
  paint();
}

export { termKey };
