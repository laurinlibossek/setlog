// UI infrastructure: navigation, modals (promise based), toasts, shared widgets.
import { tr } from './i18n.js';
import {
  html, useState, useEffect, useRef, useReducer, useLayoutEffect,
} from './lib.js';
import { Icon } from './icons.js';
import { S, emit, subscribe, useStore } from './store.js';
import { uid } from './util.js';

// ---------- navigation ----------
export const TABS = ['profile', 'history', 'workout', 'exercises', 'measure'];
export const nav = {
  tab: 'workout',
  stacks: Object.fromEntries(TABS.map((t) => [t, []])),
  sheetOpen: false,
};
export function setTab(t) {
  if (nav.tab === t && nav.stacks[t].length) nav.stacks[t] = [];
  nav.tab = t;
  emit('nav');
}
export function push(screen, props = {}) {
  nav.stacks[nav.tab].push({ key: uid(), screen, props });
  emit('nav');
}
export function pop() {
  nav.stacks[nav.tab].pop();
  emit('nav');
}
export function openSheet() { nav.sheetOpen = true; emit('nav'); }
export function closeSheet() { nav.sheetOpen = false; emit('nav'); }

// ---------- modals ----------
const modals = [];
function emitModals() { emit('modals'); }
export function openModal(kind, props = {}) {
  return new Promise((resolve) => {
    const m = { id: uid(), kind, props, resolve: null };
    m.resolve = (v) => {
      const i = modals.indexOf(m);
      if (i >= 0) modals.splice(i, 1);
      emitModals();
      resolve(v);
    };
    modals.push(m);
    emitModals();
  });
}
export const closeAllModals = () => { while (modals.length) modals[modals.length - 1].resolve(undefined); };

/** confirm({title, message, ok, cancel, destructive}) -> true/false */
export const confirmDialog = (props) => openModal('confirm', props).then((v) => v === true);
/** actionSheet({title, message, actions:[{label, value, destructive, icon, checked}]}) -> value|undefined */
export const actionSheet = (props) => openModal('actions', props);
/** promptDialog({title, message, value, placeholder, ok, inputMode}) -> string|null */
export const promptDialog = (props) => openModal('prompt', props).then((v) => (v === undefined ? null : v));
/** Full-screen custom modal: render(close) */
export const openScreenModal = (render) => openModal('screen', { render });
/** Centered custom dialog: render(close) */
export const openDialog = (render) => openModal('dialog', { render });

function ConfirmDialog({ props, close }) {
  const {
    title, message, ok = tr('OK'), cancel = tr('Cancel'), destructive = false, extra = null,
  } = props;
  return html`<div class="dialog" role="alertdialog" aria-modal="true" aria-label=${title}>
    ${title && html`<h3>${title}</h3>`}
    ${message && html`<p>${message}</p>`}
    ${extra}
    <div class="btns two">
      ${cancel && html`<button class="btn" onClick=${() => close(false)}>${cancel}</button>`}
      <button class=${'btn ' + (destructive ? 'btn-danger' : 'btn-primary')} onClick=${() => close(true)}>${ok}</button>
    </div>
  </div>`;
}

function PromptDialog({ props, close }) {
  const [v, setV] = useState(props.value ?? '');
  const ref = useRef();
  useEffect(() => { setTimeout(() => { ref.current?.focus(); ref.current?.select?.(); }, 60); }, []);
  const submit = (e) => { e?.preventDefault(); close(v); };
  return html`<form class="dialog" onSubmit=${submit}>
    ${props.title && html`<h3>${props.title}</h3>`}
    ${props.message && html`<p>${props.message}</p>`}
    ${props.multiline
      ? html`<textarea ref=${ref} class="textarea" id="prompt-input" value=${v} placeholder=${props.placeholder || ''}
          onInput=${(e) => setV(e.target.value)}></textarea>`
      : html`<input ref=${ref} class="input" id="prompt-input" value=${v} placeholder=${props.placeholder || ''}
          inputmode=${props.inputMode || 'text'} type=${props.type || 'text'} enterkeyhint="done" autocomplete="off"
          onInput=${(e) => setV(e.target.value)} />`}
    <div class="btns two">
      <button type="button" class="btn" onClick=${() => close(undefined)}>${tr('Cancel')}</button>
      <button type="submit" class="btn btn-primary">${props.ok || tr('Save')}</button>
    </div>
  </form>`;
}

function ActionSheet({ props, close }) {
  const { title, message, actions = [] } = props;
  return html`<div class="action-sheet" role="dialog" aria-modal="true">
    <div class="action-group">
      ${(title || message) && html`<div class="action-title">${title && html`<strong>${title}</strong>`}${message}</div>`}
      ${actions.filter(Boolean).map((a) => html`<button class=${'action' + (a.destructive ? ' destructive' : '') + (a.checked ? ' checked' : '')}
          onClick=${() => close(a.value)}>${a.icon && html`<${Icon} name=${a.icon} />`}${a.label}</button>`)}
    </div>
    <div class="action-group"><button class="action cancel" onClick=${() => close(undefined)}>${tr('Cancel')}</button></div>
  </div>`;
}

export function ModalHost() {
  useStore('modals');
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && modals.length) modals[modals.length - 1].resolve(undefined); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return html`${modals.map((m, i) => {
    const close = (v) => m.resolve(v);
    if (m.kind === 'screen') {
      return html`<div key=${m.id} class="fs" style=${`z-index:${50 + i * 2}`}>${m.props.render(close)}</div>`;
    }
    const middle = m.kind !== 'actions';
    let body;
    if (m.kind === 'confirm') body = html`<${ConfirmDialog} props=${m.props} close=${close} />`;
    else if (m.kind === 'prompt') body = html`<${PromptDialog} props=${m.props} close=${close} />`;
    else if (m.kind === 'actions') body = html`<${ActionSheet} props=${m.props} close=${close} />`;
    else body = m.props.render(close);
    return html`<div key=${m.id}>
      <div class="backdrop" style=${`z-index:${60 + i * 2}`} onClick=${() => close(undefined)}></div>
      <div class=${'modal-wrap' + (middle ? ' middle' : '')} style=${`z-index:${61 + i * 2}`}>${body}</div>
    </div>`;
  })}`;
}

// ---------- toasts ----------
const toasts = [];
export function toast(msg, { action = null, ms = 3200 } = {}) {
  const t = { id: uid(), msg, action };
  toasts.push(t);
  if (toasts.length > 3) toasts.shift();
  emit('toasts');
  setTimeout(() => {
    const i = toasts.indexOf(t);
    if (i >= 0) { toasts.splice(i, 1); emit('toasts'); }
  }, action ? Math.max(ms, 5000) : ms);
}
export function ToastHost() {
  useStore('toasts');
  return html`<div class="toasts" aria-live="polite">${toasts.map((t) => html`<div class="toast" key=${t.id}>
    <span>${t.msg}</span>
    ${t.action && html`<button onClick=${() => {
      t.action.fn();
      const i = toasts.indexOf(t);
      if (i >= 0) { toasts.splice(i, 1); emit('toasts'); }
    }}>${t.action.label}</button>`}
  </div>`)}</div>`;
}

// ---------- hooks ----------
export function useNow(ms = 1000, enabled = true) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    if (!enabled) return undefined;
    const t = setInterval(force, ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
  return Date.now();
}
export function useForce() {
  const [, force] = useReducer((x) => x + 1, 0);
  return force;
}

// ---------- shared widgets ----------
export function NavBar({
  title, back = null, left = null, right = null, solid = false, onBack,
}) {
  return html`<header class=${'nav' + (solid ? ' solid' : '')}>
    <div class="nav-inner">
      <div class="nav-side">
        ${back !== null && html`<button class="nav-btn" onClick=${onBack || pop} aria-label=${tr('Go back')}>
          <${Icon} name="chevronLeft" /><span>${back}</span></button>`}
        ${left}
      </div>
      <div class="nav-title">${title}</div>
      <div class="nav-side right">${right}</div>
    </div>
  </header>`;
}

/** A screen with its own scroll area; the nav bar gets a hairline once scrolled. */
export function Screen({
  nav: navProps = {}, large = null, children, bottom = null, scrollKey,
}) {
  const ref = useRef();
  const [scrolled, setScrolled] = useState(false);
  const [pastTitle, setPastTitle] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const on = () => { setScrolled(el.scrollTop > 4); setPastTitle(el.scrollTop > 40); };
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, []);
  useEffect(() => { if (scrollKey !== undefined && ref.current) ref.current.scrollTop = 0; }, [scrollKey]);
  const title = large ? (pastTitle ? large : '') : navProps.title;
  return html`<div class="screen">
    <${NavBar} ...${navProps} title=${title} solid=${scrolled || navProps.solid} />
    <div class="scroll" ref=${ref}><div class="page">
      ${large && html`<h1 class="large-title">${large}</h1>`}
      ${children}
    </div></div>
    ${bottom}
  </div>`;
}

export function Switch({ checked, onChange, id, label }) {
  return html`<label class="switch"><input type="checkbox" role="switch" id=${id} aria-label=${label}
    checked=${checked} onChange=${(e) => onChange(e.target.checked)} /><span></span></label>`;
}

export function Seg({ options, value, onChange, id }) {
  return html`<div class="seg" role="tablist" id=${id}>${options.map((o) => html`<button role="tab"
    aria-selected=${o.value === value} class=${o.value === value ? 'on' : ''} onClick=${() => onChange(o.value)}>${o.label}</button>`)}</div>`;
}

export function Empty({ icon = 'dumbbell', title, text, children }) {
  return html`<div class="empty"><${Icon} name=${icon} /><h3>${title}</h3>${text && html`<p>${text}</p>`}
    ${children && html`<div style="margin-top:16px">${children}</div>`}</div>`;
}

export function Cell({
  title, sub, value, icon, onClick, chevron = !!onClick, danger = false, children, id,
}) {
  const inner = html`
    ${icon && html`<div class="cell-icon"><${Icon} name=${icon} /></div>`}
    <div class="cell-main"><div class="cell-title">${title}</div>${sub && html`<div class="cell-sub">${sub}</div>`}</div>
    ${value !== undefined && value !== null && html`<div class="cell-value ellipsis">${value}</div>`}
    ${children}
    ${chevron && html`<span class="chev"><${Icon} name="chevronRight" /></span>`}`;
  const cls = 'cell' + (danger ? ' danger' : '');
  return onClick
    ? html`<button class=${cls} id=${id} onClick=${onClick}>${inner}</button>`
    : html`<div class=${cls} id=${id}>${inner}</div>`;
}

export { subscribe, S };
