import { t, setLang, lang, LANGS, detectLang } from './i18n.js';
import * as api from './api.js';
import { state, setFoods, startOfDay } from './state.js';
import { $, $$, esc, icon, toast, errorMessage, busy } from './ui.js';
import { loadStarterFoods, topUpStarterFoods } from './starter.js';

const ROUTES = {
  '/': () => import('./views/dashboard.js'),
  '/foods': () => import('./views/foods.js'),
  '/history': () => import('./views/history.js'),
  '/settings': () => import('./views/settings.js'),
};
const NAV = [['/', 'home', 'nav.dashboard'], ['/foods', 'food', 'nav.foods'], ['/history', 'history', 'nav.history'], ['/settings', 'settings', 'nav.settings']];

let renderSeq = 0;
const show = (id) => ['setup', 'auth', 'app', 'boot'].forEach((x) => { $('#' + x).hidden = x !== id; });

function applyStatic() {
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.title = t('app.name');
  const nav = NAV.map(([p, ic, k]) => `<a href="#${p}" data-route="${p}" class="nav-item">${icon(ic)}<span>${esc(t(k))}</span></a>`).join('');
  $('#side-nav').innerHTML = nav;
  $('#bottom-nav').innerHTML = nav;
}

function currentRoute() {
  const p = location.hash.replace(/^#/, '') || '/';
  return ROUTES[p] ? p : '/';
}

async function renderRoute() {
  if (!state.user) return;
  const seq = ++renderSeq;
  const route = currentRoute();
  $$('.nav-item').forEach((a) => {
    const on = a.dataset.route === route;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const root = $('#view');
  try {
    const mod = await ROUTES[route]();
    if (seq !== renderSeq) return;
    root.scrollTop = 0;
    await mod.render(root, { rerender: () => { applyStatic(); renderRoute(); } });
  } catch (e) {
    console.error(e);
    if (seq === renderSeq) root.innerHTML = `<div class="empty"><h3>${esc(t('err.loadTitle'))}</h3><p>${esc(errorMessage(e))}</p></div>`;
  }
}

let starting = false;
async function startSession(session) {
  if (starting) return;
  starting = true;
  try { await startSessionInner(session); } finally { starting = false; }
}

async function startSessionInner(session) {
  state.user = session.user;
  show('boot');
  try {
    state.settings = await api.getSettings(session.user.id);
    setLang(state.settings.language);
    state.date = startOfDay(new Date());
    // Fallback expiry check (the server-side cron is the primary mechanism). Only touches food_logs.
    api.purgeExpiredLogs().catch((e) => console.warn('expiry check failed', e));
    setFoods(await api.listFoods());
    if (!state.settings.starter_loaded && state.foods.length === 0) {
      try { await loadStarterFoods(); } catch (e) { console.warn('starter foods', e); }
    } else if (state.settings.starter_loaded) {
      try { await topUpStarterFoods(); } catch (e) { console.warn('starter top-up', e); }
    }
  } catch (e) {
    console.error(e);
    show('auth');
    return authMessage(/relation|schema|does not exist|42P01/i.test(e.message || '') ? t('err.noSchema') : errorMessage(e), true);
  }
  applyStatic();
  show('app');
  renderRoute();
}

// ---------------------------------------------------------------- auth screen
function authMessage(msg, isErr = false) {
  const el = $('#auth-msg');
  el.textContent = msg || '';
  el.hidden = !msg;
  el.className = 'form-msg ' + (isErr ? 'err' : 'ok');
}

function initAuth() {
  let mode = 'in';
  const paintMode = () => {
    $('#auth-title').textContent = t(mode === 'in' ? 'auth.signIn' : 'auth.signUp');
    $('#auth-submit').textContent = t(mode === 'in' ? 'auth.signIn' : 'auth.signUp');
    $('#auth-switch').textContent = t(mode === 'in' ? 'auth.toSignUp' : 'auth.toSignIn');
    $('#auth-pass').autocomplete = mode === 'in' ? 'current-password' : 'new-password';
  };
  $('#auth-switch').addEventListener('click', () => { mode = mode === 'in' ? 'up' : 'in'; authMessage(''); paintMode(); });
  $('#auth-form').addEventListener('submit', (e) => {
    e.preventDefault();
    busy($('#auth-submit'), async () => {
      const email = $('#auth-email').value.trim();
      const pass = $('#auth-pass').value;
      if (!email || pass.length < 6) return authMessage(t('auth.invalid'), true);
      authMessage('');
      const { data, error } = mode === 'in' ? await api.signIn(email, pass) : await api.signUp(email, pass);
      if (error) return authMessage(/invalid login/i.test(error.message) ? t('auth.wrong') : error.message, true);
      if (mode === 'up' && !data.session) authMessage(t('auth.confirmEmail'));
    });
  });
  const sel = $('#auth-lang');
  sel.innerHTML = LANGS.map(([c, n]) => `<option value="${c}">${n}</option>`).join('');
  sel.value = lang();
  sel.addEventListener('change', () => { setLang(sel.value); applyStatic(); paintMode(); });
  window.addEventListener('langchange', paintMode);
  paintMode();
}

// ---------------------------------------------------------------- boot
async function boot() {
  setLang(detectLang());
  applyStatic();
  if (!api.isConfigured()) { show('setup'); return; }
  if (!window.supabase) { show('setup'); $('#setup-extra').textContent = t('err.cdn'); return; }
  initAuth();
  window.addEventListener('hashchange', renderRoute);
  window.addEventListener('online', () => toast(t('err.backOnline')));
  window.addEventListener('offline', () => toast(t('err.network'), 'err'));
  // IMPORTANT: never call other supabase methods inside this callback (auth-lock deadlock);
  // defer the work to the next tick.
  api.onAuthChange((session) => {
    setTimeout(() => {
      if (session && (!state.user || state.user.id !== session.user.id)) startSession(session);
      else if (!session) { state.user = null; state.settings = null; setFoods([]); show('auth'); }
    }, 0);
  });
  const session = await api.getSession();
  if (session) await startSession(session);
  else show('auth');
}

boot().catch((e) => { console.error(e); show('setup'); $('#setup-extra').textContent = String(e?.message || e); });
