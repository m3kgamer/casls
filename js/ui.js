import { t, lang } from './i18n.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(msg, type = 'ok') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'err' ? 'alert' : 'status');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, type === 'err' ? 5000 : 2400);
}

export function errorMessage(e) {
  const code = e?.code;
  if (code === 'DUPLICATE_BARCODE') return t('err.duplicateBarcode');
  if (code === 'NETWORK' || !navigator.onLine) return t('err.network');
  return t('err.generic') + (e?.message ? ` (${e.message})` : '');
}

/** Run an async action while disabling the button (prevents duplicate submissions). */
export async function busy(btn, fn) {
  if (btn.disabled) return;
  btn.disabled = true;
  btn.classList.add('loading');
  try { return await fn(); }
  catch (e) { console.error(e); toast(errorMessage(e), 'err'); }
  finally { btn.disabled = false; btn.classList.remove('loading'); }
}

let modalSeq = 0;
/**
 * Open a modal sheet. Returns {el, close}. `onClose` runs once on any close path (ESC, backdrop, button).
 */
export function openModal(html, { onClose, wide = false, label = '' } = {}) {
  const root = $('#modals');
  const id = ++modalSeq;
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1">${html}</div>`;
  root.appendChild(wrap);
  document.body.classList.add('modal-open');
  const el = wrap.firstElementChild;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    wrap.classList.add('out');
    setTimeout(() => { wrap.remove(); if (!root.children.length) document.body.classList.remove('modal-open'); }, 160);
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && root.lastElementChild === wrap) close();
  };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  requestAnimationFrame(() => { wrap.classList.add('in'); el.focus(); });
  return { el, close, id };
}

export function confirmDialog(message, { danger = true, okLabel } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const m = openModal(`
      <div class="modal-body"><p class="confirm-msg">${esc(message)}</p></div>
      <div class="modal-actions">
        <button class="btn ghost" data-close>${esc(t('common.cancel'))}</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel || t('common.confirm'))}</button>
      </div>`, { onClose: () => resolve(result), label: message });
    $('[data-ok]', m.el).addEventListener('click', () => { result = true; m.close(); });
  });
}

export function debounce(fn, ms = 200) {
  let tm;
  return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); };
}

export const icon = (name) => ({
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/></svg>',
  food: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v8a3 3 0 003 3v7M9 3v8M13 3v8M18 3c-2 2-3 5-3 8h3v10"/></svg>',
  history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.4M3 4v4h4M12 7v5l3 2"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 00-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 00-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 000 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 002 1.2l.4 2.6h4l.4-2.6a7 7 0 002-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/></svg>',
  barcode: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14M21 5v14"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  text: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  chevL: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  chevR: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  flash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L5 14h6l-1 8 8-12h-6z"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15M5 19c3-5 6-8 10-10"/></svg>',
}[name] || '');

export const dateLocale = () => ({ ar: 'ar-u-nu-latn', fr: 'fr-FR', en: 'en-GB' }[lang()] || 'en-GB');
export const fmtDateLong = (d) => d.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtDateShort = (d) => d.toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric' });
export const fmtTime = (d) => d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
