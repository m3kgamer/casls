// "Add Food" modal: natural-language / search / barcode tabs.
import { t } from './i18n.js';
import { state, MEALS, guessMeal, consumedAtFor } from './state.js';
import * as api from './api.js';
import { $, $$, esc, icon, openModal, busy, toast, debounce } from './ui.js';
import { matchFood, suggestFoods } from './matcher.js';
import { parseFoodText } from './parser.js';
import { calcNutrition, defaultUnit, unitsForFood, logFromCalc, fmt } from './nutrition.js';
import { refText, macroLine, calcError, emptyState } from './shared.js';
import { openFoodForm } from './foodform.js';
import { BarcodeScanner } from './scanner.js';

const unitOptions = (units, sel) => units.map((u) => `<option value="${u}" ${u === sel ? 'selected' : ''}>${esc(t('unit.' + u))}</option>`).join('');
const mealOptions = (sel) => MEALS.map((m) => `<option value="${m}" ${m === sel ? 'selected' : ''}>${esc(t('meal.' + m))}</option>`).join('');
const ALL_UNITS = ['g', 'kg', 'ml', 'l', 'piece', 'serving', 'tbsp', 'tsp', 'cup', 'oz', 'lb', 'floz'];

export function openAddFood({ date = state.date, onDone } = {}) {
  let scanner = null;
  let added = false;
  let meal = guessMeal();

  const m = openModal(`
    <header class="modal-head">
      <h2>${esc(t('add.title'))}</h2>
      <button class="icon-btn" data-close aria-label="${esc(t('common.close'))}">${icon('x')}</button>
    </header>
    <div class="modal-body no-pad-top">
      <label class="field inline"><span>${esc(t('add.meal'))}</span><select id="a-meal">${mealOptions(meal)}</select></label>
      <div class="tabs" role="tablist">
        <button role="tab" class="tab active" data-tab="nl">${icon('text')}<span>${esc(t('add.tabText'))}</span></button>
        <button role="tab" class="tab" data-tab="search">${icon('search')}<span>${esc(t('add.tabSearch'))}</span></button>
        <button role="tab" class="tab" data-tab="scan">${icon('barcode')}<span>${esc(t('add.tabScan'))}</span></button>
      </div>
      <section id="tab-nl" class="tabpane"></section>
      <section id="tab-search" class="tabpane" hidden></section>
      <section id="tab-scan" class="tabpane" hidden></section>
    </div>`, { wide: true, label: t('add.title'), onClose: () => { scanner?.stop(); if (added) onDone?.(); } });
  const el = m.el;
  $('#a-meal', el).addEventListener('change', (e) => { meal = e.target.value; });

  const tabs = { nl: false, search: false, scan: false };
  const init = { nl: initText, search: initSearch, scan: initScan };
  function show(name) {
    $$('.tab', el).forEach((b) => { b.classList.toggle('active', b.dataset.tab === name); b.setAttribute('aria-selected', b.dataset.tab === name); });
    $$('.tabpane', el).forEach((p) => { p.hidden = p.id !== 'tab-' + name; });
    if (name !== 'scan') scanner?.stop();
    if (!tabs[name]) { tabs[name] = true; init[name]($('#tab-' + name, el)); }
  }
  $$('.tab', el).forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));

  async function saveLogs(rows) {
    const at = consumedAtFor(date);
    const payload = rows.map((r) => ({ ...r, meal_type: meal, consumed_at: at }));
    await api.addLogs(state.user.id, payload);
    // bump local usage counters so "frequent" and ranking stay current
    rows.forEach((r) => { const f = state.foods.find((x) => x.id === r.food_id); if (f) f.use_count = (f.use_count || 0) + 1; });
    added = true;
    toast(t('add.added', { n: rows.length }));
  }

  // ---------------------------------------------------------- Tab 1: natural language
  function initText(pane) {
    pane.innerHTML = `
      <label class="field"><span>${esc(t('nl.label'))}</span>
        <textarea id="nl-input" rows="3" placeholder="${esc(t('nl.placeholder'))}" dir="auto"></textarea></label>
      <div id="nl-suggest" class="suggest" aria-live="polite"></div>
      <div class="row-actions"><button class="btn primary" id="nl-go">${esc(t('nl.analyze'))}</button><span class="hint">${esc(t('nl.noAi'))}</span></div>
      <div id="nl-results"></div>
      <div id="nl-footer" class="modal-actions sticky" hidden><button class="btn primary" id="nl-add"></button></div>`;
    const input = $('#nl-input', pane);
    const sug = $('#nl-suggest', pane);
    let rows = [];

    const lastFragment = () => {
      const before = input.value.slice(0, input.selectionStart ?? input.value.length);
      const parts = before.split(/[,،;\n]|\s(?:و|et|and|\+)\s/i);
      let frag = parts[parts.length - 1] || '';
      frag = frag.replace(/^[\s\d.,/]+/, '').replace(/^(?:\S*\d\S*\s+)?(?:g|gr|kg|ml|l|غرام|جرام|غ|كيلو|مل|لتر|حبات?|حبة|piece|pieces|portion|cup|كوب)\s+/i, '');
      return frag.trim();
    };
    const showSuggest = debounce(() => {
      const frag = lastFragment();
      if (frag.length < 2) { sug.innerHTML = ''; return; }
      const list = suggestFoods(state.index, frag, 5);
      sug.innerHTML = list.map((s, i) => `
        <button type="button" class="sug" data-i="${i}">
          ${s.food.image_url ? `<img src="${esc(s.food.image_url)}" alt="" loading="lazy">` : `<span class="sug-ic">${icon('leaf')}</span>`}
          <span class="sug-t"><strong>${esc(s.food.name)}</strong>${s.term !== s.food.name ? `<small>${esc(t('nl.matchedSyn'))}: ${esc(s.term)}</small>` : ''}</span>
          <span class="sug-k">${esc(refText(s.food))}</span>
        </button>`).join('');
      $$('.sug', sug).forEach((b) => b.addEventListener('click', () => {
        const food = list[Number(b.dataset.i)].food;
        const pos = input.selectionStart ?? input.value.length;
        const before = input.value.slice(0, pos);
        const idx = before.toLowerCase().lastIndexOf(frag.toLowerCase());
        input.value = (idx >= 0 ? before.slice(0, idx) : before + ' ') + food.name + input.value.slice(pos);
        input.focus();
        sug.innerHTML = '';
      }));
    }, 150);
    input.addEventListener('input', showSuggest);

    function rowHtml(r, i) {
      const best = r.candidates[0];
      const food = r.food;
      const units = food ? [...new Set([...unitsForFood(food), r.unit || defaultUnit(food)])] : ALL_UNITS;
      const foodSel = `<select class="r-food" data-i="${i}" aria-label="${esc(t('nl.food'))}">
        <option value="">${esc(t('nl.choose'))}</option>
        ${(r.mode === 'all' ? state.foods : r.candidates.map((c) => c.food)).map((f) => `<option value="${f.id}" ${food?.id === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
        ${r.mode === 'all' ? '' : `<option value="__all">${esc(t('nl.searchAll'))}</option>`}
      </select>`;
      const msg = !food
        ? `<div class="msg warn">${esc(t('nl.notFound', { name: r.name || '…' }))}
            <div class="msg-actions">
              <button type="button" class="link" data-act="all" data-i="${i}">${esc(t('nl.searchSaved'))}</button>
              <button type="button" class="link" data-act="new" data-i="${i}">${esc(t('nl.addManually'))}</button>
              <span>${esc(t('nl.fixSpelling'))} ↑</span></div></div>`
        : r.low ? `<div class="msg warn">${esc(t('nl.verify'))}</div>` : '';
      return `
        <div class="nl-row ${r.include ? '' : 'off'}" data-i="${i}">
          <label class="chk"><input type="checkbox" class="r-inc" data-i="${i}" ${r.include ? 'checked' : ''} ${food ? '' : 'disabled'} aria-label="${esc(t('nl.include'))}"></label>
          <div class="nl-fields">
            <div class="nl-line">
              <input class="r-qty" data-i="${i}" type="number" inputmode="decimal" step="any" min="0" value="${esc(r.qty)}" aria-label="${esc(t('add.quantity'))}">
              <select class="r-unit" data-i="${i}" aria-label="${esc(t('add.unit'))}">${unitOptions(units, r.unit || (food ? defaultUnit(food) : 'piece'))}</select>
              <input class="r-name" data-i="${i}" value="${esc(r.name)}" placeholder="${esc(t('nl.foodName'))}" aria-label="${esc(t('nl.foodName'))}" dir="auto">
            </div>
            <div class="nl-line">${foodSel}<div class="nl-calc" data-calc="${i}"></div></div>
            ${msg}
          </div>
          <button type="button" class="icon-btn" data-act="rm" data-i="${i}" aria-label="${esc(t('common.delete'))}">${icon('x')}</button>
        </div>`;
    }

    function calcRow(r) {
      if (!r.food) return null;
      return calcNutrition(r.food, r.qty, r.unit || defaultUnit(r.food));
    }
    function paintCalc(i) {
      const r = rows[i];
      const box = $(`[data-calc="${i}"]`, pane);
      if (!box) return;
      const c = calcRow(r);
      r.calc = c;
      box.innerHTML = !c ? '' : c.ok
        ? `<strong>${fmt(c.calories)} ${esc(t('kcal'))}</strong> <span class="macro-line">${macroLine(c.protein, c.carbohydrates, c.fat)}</span>`
        : `<span class="err-text">${esc(calcError(c.error))}</span>`;
      updateFooter();
    }
    function updateFooter() {
      const ok = rows.filter((r) => r.include && r.food && r.calc?.ok);
      const foot = $('#nl-footer', pane);
      foot.hidden = rows.length === 0;
      const b = $('#nl-add', pane);
      const total = ok.reduce((s, r) => s + r.calc.calories, 0);
      b.textContent = t('nl.addN', { n: ok.length, kcal: fmt(total) });
      b.disabled = ok.length === 0;
    }
    function selectFood(r, food, score) {
      r.food = food;
      r.low = score != null && score < 0.8;
      r.include = !!food && !r.low;
      if (food && !r.unit) r.unit = defaultUnit(food);
      // no quantity typed and the food is measured by weight/volume: don't guess "1 g" — ask for it
      if (food && r.qtyExplicit === false && ['g', 'ml'].includes(r.unit)) { r.qty = ''; r.include = false; }
    }
    function paintAll() {
      const box = $('#nl-results', pane);
      if (!rows.length) { box.innerHTML = `<p class="hint pad">${esc(t('nl.empty'))}</p>`; updateFooter(); return; }
      box.innerHTML = rows.map(rowHtml).join('');
      rows.forEach((_, i) => paintCalc(i));
    }
    function repaintRow(i) {
      const wrap = document.createElement('div');
      wrap.innerHTML = rowHtml(rows[i], i);
      $(`.nl-row[data-i="${i}"]`, pane).replaceWith(wrap.firstElementChild);
      paintCalc(i);
    }
    function rematch(r) {
      r.candidates = r.name ? matchFood(state.index, r.name) : [];
      r.mode = 'candidates';
      const best = r.candidates[0];
      selectFood(r, best?.food ?? null, best?.score);
    }

    $('#nl-go', pane).addEventListener('click', analyze);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) analyze(); });
    function analyze() {
      const text = input.value.trim();
      sug.innerHTML = '';
      if (!text) { rows = []; paintAll(); return; }
      rows = parseFoodText(text, state.index).map((p) => {
        const r = { qty: p.qty, qtyExplicit: p.qtyExplicit, unit: p.unit, name: p.name, candidates: p.candidates, mode: 'candidates', food: null, include: false, low: false };
        const best = p.candidates[0];
        selectFood(r, best?.food ?? null, best?.score);
        return r;
      });
      paintAll();
    }

    const results = $('#nl-results', pane);
    results.addEventListener('input', (e) => {
      const i = Number(e.target.dataset.i);
      const r = rows[i];
      if (!r) return;
      if (e.target.classList.contains('r-qty')) {
        r.qty = e.target.value;
        if (r.qtyExplicit === false && Number(r.qty) > 0 && r.food) {
          r.qtyExplicit = true; r.include = !r.low;
          const cb = $('.r-inc', e.target.closest('.nl-row')); if (cb) cb.checked = r.include;
          e.target.closest('.nl-row').classList.toggle('off', !r.include);
        }
        paintCalc(i);
      }
    });
    results.addEventListener('change', async (e) => {
      const i = Number(e.target.dataset.i);
      const r = rows[i];
      if (!r) return;
      const c = e.target.classList;
      if (c.contains('r-inc')) { r.include = e.target.checked; r.low = false; $(`.nl-row[data-i="${i}"]`, pane).classList.toggle('off', !r.include); updateFooter(); }
      else if (c.contains('r-unit')) { r.unit = e.target.value; paintCalc(i); }
      else if (c.contains('r-name')) { r.name = e.target.value.trim(); rematch(r); repaintRow(i); }
      else if (c.contains('r-food')) {
        if (e.target.value === '__all') { r.mode = 'all'; repaintRow(i); return; }
        const f = state.foods.find((x) => x.id === e.target.value) || null;
        selectFood(r, f, null);
        if (f && r.unit && !unitsForFood(f).includes(r.unit)) r.unit = defaultUnit(f);
        r.include = !!f;
        repaintRow(i);
      }
    });
    results.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const i = Number(b.dataset.i);
      const r = rows[i];
      if (b.dataset.act === 'rm') { rows.splice(i, 1); paintAll(); }
      else if (b.dataset.act === 'all') { r.mode = 'all'; repaintRow(i); }
      else if (b.dataset.act === 'new') {
        const saved = await openFoodForm({ name: r.name });
        if (saved) { rematch(r); selectFood(r, saved, null); r.include = true; repaintRow(i); }
      }
    });
    $('#nl-add', pane).addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const ok = rows.filter((r) => r.include && r.food && r.calc?.ok);
      if (!ok.length) return;
      await saveLogs(ok.map((r) => logFromCalc(r.food, r.calc, {})));
      m.close();
    }));
    paintAll();
    setTimeout(() => input.focus(), 60);
  }

  // ---------------------------------------------------------- shared "selected food" panel
  function selectedPanel(box, food, { onCancel } = {}) {
    let unit = defaultUnit(food);
    const units = [...new Set([...unitsForFood(food), unit])];
    const startQty = food.reference_unit === 'g' || food.reference_unit === 'ml' ? (food.serving_size ? 1 : 100) : 1;
    box.innerHTML = `
      <div class="picked">
        <div class="picked-head"><div><h3>${esc(food.name)}</h3><small>${esc(refText(food))}</small></div>
          ${onCancel ? `<button class="icon-btn" data-x aria-label="${esc(t('common.cancel'))}">${icon('x')}</button>` : ''}</div>
        <div class="grid2">
          <label class="field"><span>${esc(t('add.quantity'))}</span><input id="p-qty" type="number" inputmode="decimal" step="any" min="0" value="${startQty}"></label>
          <label class="field"><span>${esc(t('add.unit'))}</span><select id="p-unit">${unitOptions(units, unit)}</select></label>
        </div>
        <div class="preview" id="p-prev"></div>
        <button class="btn primary block" id="p-add">${esc(t('add.confirm'))}</button>
      </div>`;
    let calc = null;
    const paint = () => {
      calc = calcNutrition(food, $('#p-qty', box).value, $('#p-unit', box).value);
      $('#p-prev', box).innerHTML = calc.ok
        ? `<div class="big-kcal">${fmt(calc.calories)}<small>${esc(t('kcal'))}</small></div><div class="macro-line">${macroLine(calc.protein, calc.carbohydrates, calc.fat)}</div>
           ${calc.missing.length ? `<p class="hint">${esc(t('add.missingMacros'))}</p>` : ''}`
        : `<p class="err-text">${esc(calcError(calc.error))}</p>`;
      $('#p-add', box).disabled = !calc.ok;
    };
    $('#p-qty', box).addEventListener('input', paint);
    $('#p-unit', box).addEventListener('change', paint);
    $('[data-x]', box)?.addEventListener('click', onCancel);
    $('#p-add', box).addEventListener('click', (e) => busy(e.currentTarget, async () => {
      if (!calc?.ok) return;
      await saveLogs([logFromCalc(food, calc, {})]);
      m.close();
    }));
    paint();
  }

  // ---------------------------------------------------------- Tab 2: search
  function initSearch(pane) {
    pane.innerHTML = `
      <label class="field"><span>${esc(t('search.label'))}</span><input id="s-q" type="search" placeholder="${esc(t('search.placeholder'))}" autocomplete="off" dir="auto"></label>
      <div id="s-list" class="list"></div><div id="s-pick"></div>`;
    const list = $('#s-list', pane);
    const pick = $('#s-pick', pane);
    const render = () => {
      const q = $('#s-q', pane).value.trim();
      let items;
      if (q) items = suggestFoods(state.index, q, 25).map((s) => ({ food: s.food, term: s.term }));
      else items = [...state.foods].sort((a, b) => (b.use_count || 0) - (a.use_count || 0) || a.name.localeCompare(b.name)).slice(0, 30).map((f) => ({ food: f, term: f.name }));
      if (!state.foods.length) { list.innerHTML = emptyState('food', t('foods.emptyTitle'), t('foods.emptyText')); return; }
      list.innerHTML = items.length ? items.map((s, i) => `
        <button class="food-pick" data-i="${i}">
          <span class="fp-name"><strong>${esc(s.food.name)}</strong>${s.term !== s.food.name ? `<small>${esc(s.term)}</small>` : ''}</span>
          <span class="fp-k">${esc(refText(s.food))}</span></button>`).join('')
        : `<div class="msg warn">${esc(t('search.none'))} <button class="link" id="s-new">${esc(t('nl.addManually'))}</button></div>`;
      $$('.food-pick', list).forEach((b) => b.addEventListener('click', () => {
        const food = items[Number(b.dataset.i)].food;
        list.hidden = true;
        selectedPanel(pick, food, { onCancel: () => { pick.innerHTML = ''; list.hidden = false; } });
        $('#p-qty', pick).focus();
      }));
      $('#s-new', list)?.addEventListener('click', async () => {
        const saved = await openFoodForm({ name: q });
        if (saved) render();
      });
    };
    $('#s-q', pane).addEventListener('input', debounce(render, 120));
    render();
  }

  // ---------------------------------------------------------- Tab 3: barcode
  function initScan(pane) {
    pane.innerHTML = `
      <div id="sc-cam">
        <div id="sc-reader" class="reader" aria-label="${esc(t('scan.preview'))}"></div>
        <p class="form-error" id="sc-err" role="alert" hidden></p>
        <div class="row-actions">
          <button class="btn primary" id="sc-start">${icon('barcode')}<span>${esc(t('scan.start'))}</span></button>
          <button class="btn ghost" id="sc-torch" hidden>${icon('flash')}<span>${esc(t('scan.flash'))}</span></button>
          <button class="btn ghost" id="sc-stop" hidden>${esc(t('scan.stop'))}</button>
        </div>
      </div>
      <form id="sc-manual" class="input-row" novalidate>
        <input id="sc-code" inputmode="numeric" maxlength="14" dir="ltr" placeholder="${esc(t('scan.manual'))}" aria-label="${esc(t('scan.manual'))}">
        <button class="btn" type="submit">${esc(t('scan.lookup'))}</button>
      </form>
      <div id="sc-result"></div>`;
    const err = (msg) => { const e = $('#sc-err', pane); e.textContent = msg || ''; e.hidden = !msg; };
    const result = $('#sc-result', pane);

    scanner = new BarcodeScanner('sc-reader', {
      onDetect: async (code) => { await scanner.stop(); lookup(code); },
      onError: (msg) => err(msg),
      onState: ({ running, torch }) => {
        $('#sc-start', pane).hidden = running;
        $('#sc-stop', pane).hidden = !running;
        $('#sc-torch', pane).hidden = !(running && torch);
      },
    });
    $('#sc-start', pane).addEventListener('click', () => { err(''); result.innerHTML = ''; scanner.start(); });
    $('#sc-stop', pane).addEventListener('click', () => scanner.stop());
    $('#sc-torch', pane).addEventListener('click', async (e) => e.currentTarget.classList.toggle('on', await scanner.toggleTorch()));
    $('#sc-manual', pane).addEventListener('submit', (e) => {
      e.preventDefault();
      const code = $('#sc-code', pane).value.trim();
      if (!/^\d{6,14}$/.test(code)) return err(t('form.errBarcode'));
      err('');
      scanner.stop();
      lookup(code);
    });

    async function lookup(code) {
      result.innerHTML = `<div class="skeleton"></div>`;
      let food;
      try {
        // Database-only lookup. No external product service is ever queried.
        food = await api.findFoodByBarcode(code);
      } catch (e) {
        result.innerHTML = '';
        return err(t('err.network'));
      }
      if (food) {
        selectedPanel(result, food, { onCancel: () => { result.innerHTML = ''; } });
        $('#p-qty', result).focus();
      } else {
        result.innerHTML = `
          <div class="msg warn big"><p><strong dir="ltr">${esc(code)}</strong></p><p>${esc(t('scan.notFound'))}</p>
          <button class="btn primary" id="sc-new">${icon('plus')}<span>${esc(t('scan.addProduct'))}</span></button></div>`;
        $('#sc-new', result).addEventListener('click', async () => {
          const saved = await openFoodForm({ barcode: code });
          if (saved) selectedPanel(result, saved, { onCancel: () => { result.innerHTML = ''; } });
        });
      }
    }
  }

  show('nl');
  return m;
}
