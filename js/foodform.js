// Create / edit a saved food (modal). Resolves with the saved food, or null if cancelled.
import { t } from './i18n.js';
import { state, upsertFoodLocal } from './state.js';
import * as api from './api.js';
import { $, esc, openModal, busy, toast, errorMessage, icon } from './ui.js';
import { BarcodeScanner, validBarcode } from './scanner.js';

const REFS = [
  ['100|g', 'form.ref100g'],
  ['100|ml', 'form.ref100ml'],
  ['1|piece', 'form.ref1piece'],
  ['1|serving', 'form.ref1serving'],
];

export function openFoodForm({ food = null, name = '', barcode = '' } = {}) {
  return new Promise((resolve) => {
    const f = food || { name, barcode, synonyms: [], reference_quantity: 100, reference_unit: 'g', serving_unit: 'g' };
    let result = null;
    const refVal = `${Number(f.reference_quantity) === 1 ? 1 : 100}|${f.reference_unit}`;
    const val = (v) => (v == null ? '' : esc(v));
    const field = (id, label, v, extra = '') => `
      <label class="field"><span>${esc(label)}</span><input id="${id}" inputmode="decimal" type="number" step="any" min="0" value="${val(v)}" ${extra}></label>`;

    const m = openModal(`
      <form id="ff" novalidate>
        <header class="modal-head"><h2>${esc(food ? t('form.editTitle') : t('form.addTitle'))}</h2>
          <button type="button" class="icon-btn" data-close aria-label="${esc(t('common.close'))}">${icon('x')}</button></header>
        <div class="modal-body">
          <label class="field"><span>${esc(t('form.name'))} *</span><input id="f-name" required maxlength="120" value="${val(f.name)}" autocomplete="off"></label>
          <label class="field"><span>${esc(t('form.synonyms'))}</span><input id="f-syn" value="${val((f.synonyms || []).join(', '))}" placeholder="${esc(t('form.synonymsHint'))}" autocomplete="off"></label>
          <label class="field"><span>${esc(t('form.reference'))} *</span>
            <select id="f-ref">${REFS.map(([v, k]) => `<option value="${v}" ${v === refVal ? 'selected' : ''}>${esc(t(k))}</option>`).join('')}</select></label>
          <div class="grid2">
            ${field('f-cal', t('kcal') + ' *', f.calories, 'required')}
            ${field('f-pro', t('protein') + ' (g)', f.protein)}
            ${field('f-car', t('carbs') + ' (g)', f.carbohydrates)}
            ${field('f-fat', t('fat') + ' (g)', f.fat)}
            ${field('f-fib', t('form.fiber') + ' (g)', f.fiber)}
            ${field('f-sug', t('form.sugar') + ' (g)', f.sugar)}
          </div>
          <div class="grid2">
            ${field('f-srv', t('form.serving'), f.serving_size)}
            <label class="field"><span>${esc(t('form.servingUnit'))}</span>
              <select id="f-srvu"><option value="g" ${f.serving_unit !== 'ml' ? 'selected' : ''}>g</option><option value="ml" ${f.serving_unit === 'ml' ? 'selected' : ''}>ml</option></select></label>
          </div>
          <p class="hint" id="f-srv-hint">${esc(t('form.servingHint'))}</p>
          <label class="field"><span>${esc(t('form.barcode'))}</span>
            <div class="input-row"><input id="f-bar" inputmode="numeric" maxlength="14" value="${val(f.barcode)}" dir="ltr" autocomplete="off">
            <button type="button" class="btn ghost sm" id="f-scan">${icon('barcode')}<span>${esc(t('form.scan'))}</span></button></div></label>
          <div id="f-reader-wrap" hidden><div id="f-reader" class="reader"></div><button type="button" class="btn ghost sm" id="f-scan-stop">${esc(t('common.cancel'))}</button></div>
          <label class="field"><span>${esc(t('form.image'))}</span><input id="f-img" type="url" dir="ltr" placeholder="https://…" value="${val(f.image_url)}"></label>
          <p class="form-error" id="f-err" role="alert" hidden></p>
        </div>
        <footer class="modal-actions">
          <button type="button" class="btn ghost" data-close>${esc(t('common.cancel'))}</button>
          <button type="submit" class="btn primary" id="f-save">${esc(t('common.save'))}</button>
        </footer>
      </form>`, { onClose: () => { scanner?.stop(); resolve(result); }, label: t('form.addTitle') });

    const el = m.el;
    let scanner = null;
    const err = (msg) => { const e = $('#f-err', el); e.textContent = msg; e.hidden = !msg; };

    const syncRef = () => {
      const unit = $('#f-ref', el).value.split('|')[1];
      if (unit === 'g' || unit === 'ml') $('#f-srvu', el).value = unit;
    };
    $('#f-ref', el).addEventListener('change', syncRef);

    $('#f-scan', el).addEventListener('click', async () => {
      $('#f-reader-wrap', el).hidden = false;
      scanner = new BarcodeScanner('f-reader', {
        onDetect: async (code) => { $('#f-bar', el).value = code; await scanner.stop(); $('#f-reader-wrap', el).hidden = true; },
        onError: (msg) => { err(msg); $('#f-reader-wrap', el).hidden = true; },
      });
      await scanner.start();
    });
    $('#f-scan-stop', el).addEventListener('click', async () => { await scanner?.stop(); $('#f-reader-wrap', el).hidden = true; });

    $('#ff', el).addEventListener('submit', (ev) => {
      ev.preventDefault();
      const btn = $('#f-save', el);
      busy(btn, async () => {
        err('');
        const n = (id) => $(id, el).value.trim();
        const [rq, ru] = $('#f-ref', el).value.split('|');
        const data = {
          id: food?.id,
          name: n('#f-name'),
          synonyms: n('#f-syn').split(/[,،;\n]/).map((s) => s.trim()).filter(Boolean),
          calories: n('#f-cal'), protein: n('#f-pro'), carbohydrates: n('#f-car'), fat: n('#f-fat'),
          fiber: n('#f-fib'), sugar: n('#f-sug'),
          reference_quantity: Number(rq), reference_unit: ru,
          serving_size: n('#f-srv'), serving_unit: $('#f-srvu', el).value,
          barcode: n('#f-bar'), image_url: n('#f-img'),
        };
        // validation
        if (!data.name) return err(t('form.errName'));
        const numeric = ['calories', 'protein', 'carbohydrates', 'fat', 'fiber', 'sugar', 'serving_size'];
        for (const k of numeric) {
          if (data[k] !== '' && (!Number.isFinite(Number(data[k])) || Number(data[k]) < 0)) return err(t('form.errNumber'));
        }
        if (data.calories === '') return err(t('form.errCalories'));
        if (data.serving_size !== '' && Number(data.serving_size) === 0) return err(t('form.errNumber'));
        if (data.barcode && !validBarcode(data.barcode)) return err(t('form.errBarcode'));
        if (data.image_url && !/^https?:\/\//i.test(data.image_url)) return err(t('form.errImage'));
        if (data.barcode && state.foods.some((x) => x.barcode === data.barcode && x.id !== food?.id)) return err(t('err.duplicateBarcode'));
        if (['g', 'ml'].includes(ru) && data.serving_size !== '' && data.serving_unit !== ru) data.serving_unit = ru;

        try {
          const saved = await api.saveFood(state.user.id, data);
          upsertFoodLocal(saved);
          result = saved;
          toast(t('form.saved'));
          m.close();
        } catch (e) {
          err(errorMessage(e));
        }
      });
    });
    setTimeout(() => $('#f-name', el).focus(), 60);
  });
}
