import { t, setLang, LANGS } from '../i18n.js';
import { state, setFoods } from '../state.js';
import * as api from '../api.js';
import { $, esc, toast, busy, errorMessage, confirmDialog } from '../ui.js';
import { loadStarterFoods } from '../starter.js';

export async function render(root, { rerender }) {
  const s = state.settings;
  const num = (id, label, v, min, max) => `<label class="field"><span>${esc(label)}</span>
    <input id="${id}" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" value="${v}" required></label>`;

  root.innerHTML = `
    <div class="page-head"><h1>${esc(t('nav.settings'))}</h1></div>
    <form id="st" class="card form-card" novalidate>
      <h2>${esc(t('set.targets'))}</h2>
      <div class="grid2">
        ${num('s-cal', t('set.calories'), s.daily_calorie_target, 500, 10000)}
        ${num('s-pro', t('set.protein'), s.protein_target, 0, 1000)}
        ${num('s-car', t('set.carbs'), s.carbohydrate_target, 0, 2000)}
        ${num('s-fat', t('set.fat'), s.fat_target, 0, 1000)}
      </div>
      <h2>${esc(t('set.preferences'))}</h2>
      <div class="grid2">
        <label class="field"><span>${esc(t('set.language'))}</span><select id="s-lang">
          ${LANGS.map(([c, n]) => `<option value="${c}" ${s.language === c ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field"><span>${esc(t('set.units'))}</span><select id="s-units">
          <option value="metric" ${s.preferred_units === 'metric' ? 'selected' : ''}>${esc(t('set.metric'))}</option>
          <option value="imperial" ${s.preferred_units === 'imperial' ? 'selected' : ''}>${esc(t('set.imperial'))}</option></select></label>
      </div>
      <p class="form-error" id="s-err" role="alert" hidden></p>
      <button class="btn primary" id="s-save" type="submit">${esc(t('common.save'))}</button>
    </form>

    <section class="card form-card">
      <h2>${esc(t('set.data'))}</h2>
      <p class="hint">${esc(t('set.account'))}: <strong dir="ltr">${esc(state.user.email || '')}</strong></p>
      <div class="stack">
        <button class="btn" id="d-export">${esc(t('set.export'))}</button>
        <button class="btn" id="d-starter">${esc(t('set.starter'))}</button>
        <button class="btn danger-o" id="d-logs">${esc(t('set.deleteLogs'))}</button>
        <button class="btn danger-o" id="d-foods">${esc(t('set.deleteFoods'))}</button>
        <button class="btn ghost" id="d-out">${esc(t('set.signOut'))}</button>
      </div>
      <p class="hint">${esc(t('set.retention'))}</p>
    </section>`;

  $('#st', root).addEventListener('submit', (e) => {
    e.preventDefault();
    busy($('#s-save', root), async () => {
      const v = (id) => Number($(id, root).value);
      const patch = {
        daily_calorie_target: v('#s-cal'), protein_target: v('#s-pro'),
        carbohydrate_target: v('#s-car'), fat_target: v('#s-fat'),
        language: $('#s-lang', root).value, preferred_units: $('#s-units', root).value,
      };
      const err = $('#s-err', root);
      const bad = [['daily_calorie_target', 500, 10000], ['protein_target', 0, 1000], ['carbohydrate_target', 0, 2000], ['fat_target', 0, 1000]]
        .some(([k, lo, hi]) => !Number.isInteger(patch[k]) || patch[k] < lo || patch[k] > hi);
      if (bad) { err.textContent = t('set.invalid'); err.hidden = false; return; }
      err.hidden = true;
      state.settings = await api.saveSettings(state.user.id, patch);
      setLang(state.settings.language);
      toast(t('common.saved'));
      rerender();
    });
  });

  $('#d-export', root).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const today = new Date(); today.setDate(today.getDate() + 1);
    const logs = await api.listLogs(new Date(0).toISOString(), today.toISOString());
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), settings: state.settings, foods: state.foods, food_logs: logs }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `calorie-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }));
  $('#d-starter', root).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const n = await loadStarterFoods();
    toast(t('foods.starterLoaded', { n }));
  }));
  $('#d-logs', root).addEventListener('click', async (e) => {
    if (!(await confirmDialog(t('set.confirmLogs')))) return;
    busy(e.currentTarget, async () => { await api.deleteAllLogs(); toast(t('common.deleted')); });
  });
  $('#d-foods', root).addEventListener('click', async (e) => {
    if (!(await confirmDialog(t('set.confirmFoods')))) return;
    busy(e.currentTarget, async () => { await api.deleteAllFoods(); setFoods([]); toast(t('common.deleted')); });
  });
  $('#d-out', root).addEventListener('click', () => api.signOut());
}
