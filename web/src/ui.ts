export const FEATHER =
  'M17 3h2v1h-2zM13 4h6v1h-6zM11 5h4v1h-4zM17 5h1v1h-1zM10 6h4v1h-4zM16 6h1v1h-1zM9 7h4v1h-4zM14 7h3v1h-3zM9 8h3v1h-3zM13 8h4v1h-4zM9 9h2v1h-2zM13 9h3v1h-3zM8 10h2v1h-2zM12 10h4v1h-4zM8 11h2v1h-2zM11 11h3v1h-3zM8 12h1v1h-1zM10 12h3v1h-3zM8 13h1v1h-1zM10 13h1v1h-1zM8 14h2v1h-2zM8 15h1v1h-1zM7 16h2v1h-2zM7 17h1v1h-1zM7 18h1v1h-1zM6 19h2v1h-2zM6 20h2v1h-2z';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function logoSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 35 35');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('transform', 'translate(5 5)');
  p.setAttribute('fill', 'currentColor');
  p.setAttribute('d', FEATHER);
  svg.append(p);
  return svg;
}

export function featherPixels(): [number, number][] {
  const out: [number, number][] = [];
  for (const m of FEATHER.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    for (let i = 0; i < Number(m[3]); i++) out.push([x + i - 6, y - 3]);
  }
  return out;
}

const ICONS: Record<string, string> = {
  palette: 'M12 3a9 9 0 0 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8zM7.5 12.5h.01M9.5 8h.01M14.5 8h.01M17 12h.01',
  sun: 'M12 8a4 4 0 1 0 .01 0M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
  keyboard: 'M3 6h18v12H3zM7 10h.01M10 10h.01M13 10h.01M16 10h.01M7 14h10',
  volume: 'M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  mute: 'M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6',
  chevron: 'M6 9l6 6 6-6',
  restart: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  next: 'M5 12h13M13 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9 17h6',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  settings: 'M12 9a3 3 0 1 0 .01 0M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.6-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 4.6V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  text: 'M4 6h16M4 10h16M4 14h11M4 18h8',
  words: 'M4 8h5M11 8h9M4 13h9M15 13h5M4 18h3M9 18h7',
  accent: 'M6 18l5-12h2l5 12M8.5 13h7M11 3l2-1',
  alpha: 'M5 18l4-12 4 12M6.5 14h5M15 6h4l-4 6h4M15 15v3M19 15v3M15 16.5h4',
  hash: 'M9 4L7 20M17 4l-2 16M4 9h16M3 15h16',
  numpad: 'M5 3h14v18H5zM8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v3',
  data: 'M4 5h16v14H4zM4 10h16M4 14.5h16M10 5v14',
  play: 'M7 5l12 7-12 7z',
  feather: 'M20 4C11 4 6 9 5 19l-1 1M5 19c6 0 11-4 12-10M9 15h5',
  zap: 'M13 3L5 14h6l-1 7 8-11h-6z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  mix: 'M4 7h3l10 10h3M4 17h3l3-3M14 10l3-3h3M18 4l3 3-3 3M18 14l3 3-3 3',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  prev: 'M19 12H6M11 6l-6 6 6 6',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  pause: 'M8 5v14M16 5v14',
};

export function icon(name: string, size = 18): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', ICONS[name] ?? ICONS.info ?? '');
  svg.append(p);
  return svg;
}

type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v as Record<string, string>)) {
        if (prop.startsWith('--')) node.style.setProperty(prop, val);
        else (node.style as unknown as Record<string, string>)[prop] = val;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'text') node.textContent = String(v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} não encontrado`);
  return node as T;
};

export function toast(text: string) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const t = el('div', { class: 'toast', text });
  host.append(t);
  setTimeout(() => t.remove(), 2700);
}

export interface SegOption<T extends string> {
  id: T;
  label: string;
  title?: string;
}

export class Segmented<T extends string> {
  private buttons = new Map<T, HTMLButtonElement>();
  private thumb: HTMLElement;
  value: T;

  private root: HTMLElement;
  private onChange: (v: T) => void;

  constructor(root: HTMLElement, options: SegOption<T>[], value: T, onChange: (v: T) => void) {
    this.root = root;
    this.onChange = onChange;
    this.value = value;
    this.thumb = el('span', { class: 'seg-thumb', 'aria-hidden': 'true' });
    root.append(this.thumb);
    for (const o of options) {
      const b = el('button', { type: 'button', role: 'radio', title: o.title, text: o.label, onclick: () => this.set(o.id, true) });
      this.buttons.set(o.id, b);
      root.append(b);
    }
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const ids = [...this.buttons.keys()];
      const i = ids.indexOf(this.value) + (e.key === 'ArrowRight' ? 1 : -1);
      const next = ids[(i + ids.length) % ids.length] as T;
      this.set(next, true);
      this.buttons.get(next)?.focus();
    });
    this.set(value, false);
    new ResizeObserver(() => this.place()).observe(root);
  }

  set(v: T, notify: boolean) {
    const changed = v !== this.value;
    this.value = v;
    for (const [id, b] of this.buttons) {
      b.setAttribute('aria-checked', String(id === v));
      b.tabIndex = id === v ? 0 : -1;
    }
    this.place();
    if (notify && changed) this.onChange(v);
  }

  setDisabled(disabled: boolean) {
    this.root.classList.toggle('disabled', disabled);
  }

  private place() {
    const b = this.buttons.get(this.value);
    if (!b) return;
    this.thumb.style.width = `${b.offsetWidth}px`;
    this.thumb.style.transform = `translateX(${b.offsetLeft}px)`;
  }
}

export interface DropOption<T extends string> {
  id: T;
  label: string;
  hint: string;
  icon: string;
}

export class Dropdown<T extends string> {
  private button: HTMLButtonElement;
  private labelNode: HTMLSpanElement;
  private list: HTMLUListElement | null = null;
  private active = 0;
  value: T;

  private options: DropOption<T>[];
  private onChange: (v: T) => void;
  private root: HTMLElement;

  constructor(root: HTMLElement, options: DropOption<T>[], value: T, onChange: (v: T) => void, label: string) {
    this.options = options;
    this.onChange = onChange;
    this.root = root;
    this.value = value;
    this.labelNode = el('span', { class: 'lbl' });
    const chev = icon('chevron', 16);
    chev.classList.add('chev');
    this.button = el('button', {
      type: 'button',
      class: 'btn dropdown-btn',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      'aria-label': label,
      onclick: () => (this.list ? this.close() : this.open()),
    }, this.labelNode, chev);
    this.button.addEventListener('keydown', (e) => {
      if (!this.list && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        this.open();
      }
    });
    root.append(this.button);
    this.render();
  }

  private render() {
    const o = this.options.find((x) => x.id === this.value);
    this.labelNode.textContent = o ? o.label : '';
  }

  set(v: T) {
    this.value = v;
    this.render();
  }

  open() {
    if (this.list) return;
    this.active = Math.max(0, this.options.findIndex((o) => o.id === this.value));
    const list = el('ul', { class: 'listbox', role: 'listbox', tabindex: '-1', 'aria-label': this.button.getAttribute('aria-label') });
    this.options.forEach((o, i) => {
      const li = el(
        'li',
        { role: 'option', 'aria-selected': String(o.id === this.value), 'data-i': String(i), onclick: () => this.choose(o.id) },
        el('span', { class: 'opt-icon' }, icon(o.icon, 16)),
        el('span', { class: 'opt-label', text: o.label }),
        el('span', { class: 'opt-hint', text: o.hint }),
      );
      li.addEventListener('mousemove', () => this.highlight(i));
      list.append(li);
    });
    list.addEventListener('keydown', (e) => this.keys(e));
    this.root.append(list);
    this.list = list;
    this.button.setAttribute('aria-expanded', 'true');
    this.highlight(this.active);
    list.focus();
    setTimeout(() => document.addEventListener('pointerdown', this.outside), 0);
  }

  private outside = (e: Event) => {
    if (!this.root.contains(e.target as Node)) this.close();
  };

  close(refocus = false) {
    if (!this.list) return;
    this.list.remove();
    this.list = null;
    this.button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', this.outside);
    if (refocus) this.button.focus();
  }

  private highlight(i: number) {
    if (!this.list) return;
    this.active = i;
    this.list.querySelectorAll('li').forEach((li, j) => li.classList.toggle('active', j === i));
  }

  private keys(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = this.options.length;
      this.highlight((this.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const o = this.options[this.active];
      if (o) this.choose(o.id);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      this.close(true);
    }
  }

  private choose(v: T) {
    this.close();
    this.set(v);
    this.onChange(v);
  }
}

export interface MenuItem {
  label?: string;
  icon?: string;
  kbd?: string;
  checked?: boolean;
  swatches?: string[];
  name?: string;
  sep?: boolean;
  run?: () => void;
}

let openMenuNode: HTMLElement | null = null;

export function closeMenu() {
  if (!openMenuNode) return;
  const node = openMenuNode;
  openMenuNode = null;
  node.remove();
  document.querySelectorAll('[aria-haspopup="menu"][aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}

export function openMenu(anchor: HTMLElement, items: MenuItem[], align: 'left' | 'right' = 'left') {
  const reopen = openMenuNode && anchor.getAttribute('aria-expanded') === 'true';
  closeMenu();
  if (reopen) return;
  const ul = el('ul', { class: 'menu', role: 'menu', tabindex: '-1' });
  const actionable: HTMLLIElement[] = [];
  for (const it of items) {
    if (it.sep) {
      ul.append(el('li', { class: 'sep', role: 'separator' }));
      continue;
    }
    const li = el('li', { role: 'menuitem', tabindex: '-1', class: `${it.checked ? 'sel' : ''}${it.label ? '' : ' swatch-only'}`, title: it.name, 'aria-label': it.name });
    if (it.checked !== undefined) li.append(el('span', { class: 'check' }, it.checked ? icon('check', 15) : ''));
    else if (it.icon) li.append(icon(it.icon, 16));
    if (it.swatches) li.append(el('span', { class: 'swatches' }, ...it.swatches.map((c) => el('i', { style: { background: c } }))));
    if (it.label) li.append(el('span', { class: 'grow', text: it.label }));
    if (it.kbd) li.append(el('kbd', { text: it.kbd }));
    li.addEventListener('click', () => {
      closeMenu();
      it.run?.();
    });
    actionable.push(li);
    ul.append(li);
  }
  document.body.append(ul);
  const r = anchor.getBoundingClientRect();
  const w = ul.offsetWidth;
  const left = align === 'right' ? Math.max(8, r.right - w) : Math.min(window.innerWidth - w - 8, r.left);
  ul.style.left = `${left}px`;
  ul.style.top = `${r.bottom + 6}px`;
  anchor.setAttribute('aria-expanded', 'true');
  openMenuNode = ul;
  let active = -1;
  const focus = (i: number) => {
    active = (i + actionable.length) % actionable.length;
    actionable.forEach((li, j) => li.classList.toggle('active', j === active));
    actionable[active]?.focus();
  };
  ul.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') focus(active + 1);
    else if (e.key === 'ArrowUp') focus(active - 1);
    else if (e.key === 'Enter' || e.key === ' ') actionable[active]?.click();
    else if (e.key === 'Escape') {
      closeMenu();
      anchor.focus();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  });
  ul.focus();
  setTimeout(() => {
    const off = (e: Event) => {
      if (openMenuNode !== ul) return document.removeEventListener('pointerdown', off);
      if (!ul.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
        closeMenu();
        document.removeEventListener('pointerdown', off);
      }
    };
    document.addEventListener('pointerdown', off);
  }, 0);
}

export interface Overlay {
  root: HTMLElement;
  close: () => void;
}

const overlays: Overlay[] = [];

export const overlayOpen = (): boolean => overlays.length > 0;

export function openSheet(content: HTMLElement, options: { center?: boolean; label: string; onClose?: () => void; dialogClass?: string }): Overlay {
  const sheet = el('div', { class: `sheet ${options.dialogClass ?? ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': options.label }, content);
  const back = el('div', { class: `backdrop ${options.center ? 'center' : ''}` }, sheet);
  const previous = document.activeElement as HTMLElement | null;
  let closed = false;
  const overlay: Overlay = {
    root: sheet,
    close: () => {
      if (closed) return;
      closed = true;
      overlays.splice(overlays.indexOf(overlay), 1);
      back.classList.add('closing');
      setTimeout(() => back.remove(), 210);
      document.removeEventListener('keydown', onKey, true);
      options.onClose?.();
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    },
  };
  const onKey = (e: KeyboardEvent) => {
    if (overlays[overlays.length - 1] !== overlay) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      overlay.close();
    } else if (e.key === 'Tab') {
      const focusables = [...sheet.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
        (n) => !n.hasAttribute('disabled') && n.offsetParent !== null,
      );
      if (!focusables.length) return;
      const first = focusables[0] as HTMLElement;
      const last = focusables[focusables.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  back.addEventListener('pointerdown', (e) => {
    if (e.target === back) overlay.close();
  });
  document.addEventListener('keydown', onKey, true);
  document.body.append(back);
  overlays.push(overlay);
  return overlay;
}

export function openDrawer(title: string, body: HTMLElement, headExtra: HTMLElement | null, onClose?: () => void): Overlay {
  const closeBtn = el('button', { class: 'btn icon ghost', 'aria-label': 'Fechar', title: 'Fechar (Esc)' }, icon('close'));
  const drawer = el(
    'aside',
    { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('div', { class: 'drawer-head' }, el('h2', { text: title }), el('div', { class: 'filter-row' }, headExtra, closeBtn)),
    el('div', { class: 'drawer-body' }, body),
  );
  const back = el('div', { class: 'drawer-back' });
  let closed = false;
  const overlay: Overlay = {
    root: drawer,
    close: () => {
      if (closed) return;
      closed = true;
      overlays.splice(overlays.indexOf(overlay), 1);
      drawer.classList.add('closing');
      back.style.opacity = '0';
      setTimeout(() => {
        drawer.remove();
        back.remove();
      }, 220);
      document.removeEventListener('keydown', onKey, true);
      onClose?.();
    },
  };
  const onKey = (e: KeyboardEvent) => {
    if (overlays[overlays.length - 1] !== overlay) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      overlay.close();
    }
  };
  closeBtn.addEventListener('click', () => overlay.close());
  back.addEventListener('pointerdown', () => overlay.close());
  document.addEventListener('keydown', onKey, true);
  document.body.append(back, drawer);
  overlays.push(overlay);
  closeBtn.focus();
  return overlay;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

export function countUp(node: HTMLElement, to: number, format: (v: number) => string, duration = 900, delay = 0) {
  const reduce = document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    node.textContent = format(to);
    return;
  }
  node.textContent = format(0);
  const start = performance.now() + delay;
  const step = (now: number) => {
    const t = Math.min(1, Math.max(0, (now - start) / duration));
    node.textContent = format(to * easeOut(t));
    if (t < 1) requestAnimationFrame(step);
    else node.textContent = format(to);
  };
  requestAnimationFrame(step);
}

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`pluma:${key}`);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(`pluma:${key}`, JSON.stringify(value));
    } catch {
      return;
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(`pluma:${key}`);
    } catch {
      return;
    }
  },
};

export function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const reducedMotion = (): boolean =>
  document.documentElement.dataset.motion === 'off' ||
  (document.documentElement.dataset.motion !== 'on' && matchMedia('(prefers-reduced-motion: reduce)').matches);
