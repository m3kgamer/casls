import { t } from './i18n.js';
import { state } from './state.js';
import { fmt } from './nutrition.js';
import { esc, icon, fmtTime } from './ui.js';

export const qtyText = (q, unit) => {
  const imperial = state.settings?.preferred_units === 'imperial';
  if (imperial && unit === 'g') return `${fmt(q / 28.3495, 1)} ${t('unit.oz')}`;
  if (imperial && unit === 'ml') return `${fmt(q / 29.5735, 1)} ${t('unit.floz')}`;
  return `${fmt(q, 2)} ${t('unit.' + unit)}`;
};

export const refText = (food) => {
  const q = Number(food.reference_quantity);
  if (food.reference_unit === 'piece' || food.reference_unit === 'serving') {
    return `${fmt(food.calories, 1)} ${t('kcal')} / ${q === 1 ? '' : fmt(q) + ' '}${t('unit.' + food.reference_unit)}`;
  }
  return `${fmt(food.calories, 1)} ${t('kcal')} / ${fmt(q)} ${t('unit.' + food.reference_unit)}`;
};

export const macroLine = (p, c, f) =>
  `<span class="m p" title="${esc(t('protein'))}">P ${fmt(p, 1)}</span><span class="m c" title="${esc(t('carbs'))}">C ${fmt(c, 1)}</span><span class="m f" title="${esc(t('fat'))}">F ${fmt(f, 1)}</span>`;

/** One consumption entry. `actions`: array of 'edit' | 'copy' | 'delete'. */
export function entryHtml(log, actions = []) {
  const btn = (a, ic, label) => `<button class="icon-btn" data-act="${a}" data-id="${log.id}" aria-label="${esc(label)}" title="${esc(label)}">${icon(ic)}</button>`;
  return `
    <li class="entry" data-id="${log.id}">
      <div class="entry-main">
        <div class="entry-name">${esc(log.food_name_snapshot)}${log.food_id ? '' : ''}</div>
        <div class="entry-sub"><span>${esc(qtyText(log.quantity, log.quantity_unit))}</span><span class="dot">·</span><span>${esc(fmtTime(new Date(log.consumed_at)))}</span></div>
        <div class="macro-line">${macroLine(log.protein_snapshot, log.carbohydrates_snapshot, log.fat_snapshot)}</div>
      </div>
      <div class="entry-kcal"><strong>${fmt(log.calories_snapshot)}</strong><small>${esc(t('kcal'))}</small></div>
      <div class="entry-actions">
        ${actions.includes('edit') ? btn('edit', 'edit', t('common.edit')) : ''}
        ${actions.includes('copy') ? btn('copy', 'copy', t('history.copyToday')) : ''}
        ${actions.includes('delete') ? btn('delete', 'trash', t('common.delete')) : ''}
      </div>
    </li>`;
}

export const calcError = (code) => t('calc.' + code);

export function emptyState(ic, title, text, actionHtml = '') {
  return `<div class="empty">${icon(ic)}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${actionHtml}</div>`;
}

export function skeleton(rows = 3) {
  return Array.from({ length: rows }, () => '<div class="skeleton"></div>').join('');
}
