import textos from '../data/textos.json' with { type: 'json' };
import palavras from '../data/palavras.json' with { type: 'json' };
import musicas from '../data/musicas.json' with { type: 'json' };
import { compose, parseTracks, rhythmWords, type Track } from './chart.ts';
import {
  COMPLEXITIES,
  COMPLEXITY_LABELS,
  KINDS,
  KIND_HINTS,
  KIND_LABELS,
  MAX_CUSTOM_CHARS,
  PART_TARGET as PART_SIZE,
  Rng,
  SIZES,
  SIZE_LABELS,
  adaptForTyping,
  generate,
  normalizeCustom,
  randomSeed,
  splitParts,
  type Complexity,
  type ContentData,
  type Kind,
  type Size,
} from './content.ts';
import { ACCEPTED, DocumentError, extract } from './documents.ts';
import { Effects } from './effects.ts';
import { GROOVES } from './grooves.ts';
import { History, MODE_LABELS, categoryKey, categoryLabel, type Context, type Entry } from './history.ts';
import { Keyboard } from './keyboard.ts';
import { combine, formatBp, formatDuration, formatX100, summarize, timeline, type Summary } from './metrics.ts';
import { OFFSET_LIMIT, PALETTES, applyLook, loadPrefs, savePrefs, systemTheme, type Caret, type FontSize, type Mode, type Prefs } from './prefs.ts';
import { openResults, openRhythmResults } from './results.ts';
import { RhythmGame, type Phase, type RhythmResult, type TrackMeta } from './rhythm.ts';
import { Session, diffInput, type Step } from './session.ts';
import { Sound } from './sound.ts';
import { startTour } from './tutorial.ts';
import {
  $,
  Dropdown,
  Segmented,
  closeMenu,
  download,
  el,
  icon,
  logoSvg,
  openDrawer,
  openMenu,
  openSheet,
  overlayOpen,
  toast,
  type Overlay,
} from './ui.ts';
import { TextView } from './view.ts';

declare const PLUMA_VERSION: string;
const VERSION = typeof PLUMA_VERSION === 'string' ? PLUMA_VERSION : '0.0.0';

const DATA: ContentData = {
  phrases: textos.phrases as ContentData['phrases'],
  words: palavras as ContentData['words'],
};

const TRACKS: Track[] = parseTracks(musicas);
const FALLBACK_TRACK: Track = { id: 'pluma', title: 'Pluma', artist: 'Pluma Sound', groove: 'chip', bpm: 120, key: 'C', scale: 'major', verse: [0, 4, 5, 3], chorus: [3, 4, 0, 5], lead: 'pulse25', arp: 'up', swing: 0 };

const KIND_ICONS: Record<Kind, string> = {
  text: 'text',
  words: 'words',
  'no-accents': 'accent',
  alphabet: 'alpha',
  numbers: 'hash',
  numpad: 'numpad',
  data: 'data',
  mixed: 'mix',
  custom: 'edit',
};

const MILESTONES = [10, 25, 50, 75, 100, 150, 200, 300, 400, 500];

interface Current {
  kind: Kind;
  size: Size;
  complexity: Complexity;
  seed: number | null;
  phraseId: string | null;
  text: string;
  part: number;
  parts: number;
}

interface Stat {
  root: HTMLElement;
  val: HTMLElement;
}

class App {
  prefs: Prefs = loadPrefs();
  history = new History();
  sound = new Sound();
  view: TextView;
  fx: Effects;
  keyboard: Keyboard;
  input = $<HTMLTextAreaElement>('input');
  typing = $('typing');
  current: Current | null = null;
  session: Session | null = null;
  freeParts: Summary[] = [];
  composing = false;
  lastCode = '';
  finished = false;
  stats: Record<string, Stat> = {};
  hudTimer = 0;
  liveTimer = 0;
  results: Overlay | null = null;
  modeSeg: Segmented<Mode>;
  sizeSeg: Segmented<Size>;
  complexitySeg: Segmented<Complexity>;
  kindDrop: Dropdown<Kind>;
  busy = false;
  rhythm: RhythmGame;
  songSeed: number | null = null;
  pauseBtn: HTMLButtonElement | null = null;

  constructor() {
    applyLook(this.prefs);
    document.querySelectorAll('[data-logo]').forEach((n) => n.append(logoSvg()));
    this.view = new TextView($('viewport'), $('scroller'), $('text'), $('caret'), $('glow'));
    this.view.setCaretMode(this.prefs.caret);
    this.fx = new Effects($<HTMLCanvasElement>('fx'), this.typing);
    this.keyboard = new Keyboard($('kb'), $('fingerHint'));
    this.sound.enabled = this.prefs.sound;
    this.rhythm = new RhythmGame({
      browse: (delta) => this.browse(delta),
      list: () => this.songsDialog(),
      next: (ch) => this.keyboard.showNext(ch),
      key: (code, ok) => this.keyboard.flash(code, ok),
      wrong: () => this.sound.error(),
      finished: (r) => this.finishRhythm(r),
      phase: (p) => this.syncPause(p),
    });
    this.rhythm.setVolume(this.prefs.musicVolume / 100);
    this.rhythm.latencyMs = this.prefs.rhythmOffset;

    this.modeSeg = new Segmented<Mode>(
      $('modeSeg'),
      [
        { id: 'free', label: 'Livre', title: 'Sem cronômetro: treine no seu ritmo' },
        { id: 'test', label: 'Teste', title: 'Mede o tempo final e mostra o diagnóstico' },
        { id: 'rhythm', label: 'Ritmo', title: 'Jogo musical: digite cada letra no tempo da música' },
      ],
      this.prefs.mode,
      (v) => this.change({ mode: v }),
    );
    this.kindDrop = new Dropdown<Kind>(
      $('kindDrop'),
      KINDS.map((k) => ({ id: k, label: KIND_LABELS[k], hint: KIND_HINTS[k], icon: KIND_ICONS[k] })),
      this.prefs.kind,
      (v) => this.chooseKind(v),
      'Conteúdo para digitar',
    );
    this.sizeSeg = new Segmented<Size>($('sizeSeg'), SIZES.map((s) => ({ id: s, label: SIZE_LABELS[s] })), this.prefs.size, (v) => this.change({ size: v }));
    this.complexitySeg = new Segmented<Complexity>(
      $('complexitySeg'),
      COMPLEXITIES.map((c) => ({ id: c, label: COMPLEXITY_LABELS[c] })),
      this.prefs.complexity,
      (v) => this.change({ complexity: v }),
    );

    this.topButtons();
    this.bindInput();
    this.bindGlobal();
    this.applyMode();
    this.buildHud();
    this.buildActions();
    this.syncControls();
    this.renderStatus();
    this.toggleKeyboard(this.prefs.keyboard, false);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (!this.prefs.theme) {
        applyLook(this.prefs);
        this.renderTop();
        this.renderStatus();
      }
    });
    if (this.prefs.kind === 'custom' && !this.prefs.customText) this.prefs.kind = 'text';
    this.newText({ enter: true });
    const loading = $('loading');
    loading.classList.add('out');
    setTimeout(() => loading.remove(), 400);
    if (!this.prefs.tutorialDone) setTimeout(() => this.tour(true), 500);
    else this.focus();
  }

  save() {
    savePrefs(this.prefs);
  }

  focus() {
    if (overlayOpen()) return;
    this.input.focus({ preventScroll: true });
  }

  topButtons() {
    $('menuBtn').addEventListener('click', () => this.mainMenu());
    $('historyBtn').addEventListener('click', () => this.openHistory());
    $('keyboardBtn').addEventListener('click', () => this.toggleKeyboard(!this.prefs.keyboard));
    $('soundBtn').addEventListener('click', () => this.toggleSound());
    $('paletteBtn').addEventListener('click', () => this.paletteMenu());
    $('themeBtn').addEventListener('click', () => this.toggleTheme());
    this.renderTop();
  }

  renderTop() {
    const dark = document.documentElement.dataset.theme === 'dark';
    $('historyBtn').replaceChildren(icon('history'));
    $('keyboardBtn').replaceChildren(icon('keyboard'));
    $('keyboardBtn').classList.toggle('on', this.prefs.keyboard);
    $('keyboardBtn').setAttribute('aria-pressed', String(this.prefs.keyboard));
    $('soundBtn').replaceChildren(icon(this.prefs.sound ? 'volume' : 'mute'));
    $('soundBtn').classList.toggle('on', this.prefs.sound);
    $('soundBtn').setAttribute('aria-pressed', String(this.prefs.sound));
    $('paletteBtn').replaceChildren(icon('palette'));
    $('themeBtn').replaceChildren(icon(dark ? 'sun' : 'moon'));
    $('themeBtn').title = dark ? 'Usar o tema claro' : 'Usar o tema escuro';
  }

  renderStatus() {
    const p = this.prefs;
    const theme = (p.theme ?? systemTheme()) === 'dark' ? 'escuro' : 'claro';
    const what = p.kind === 'custom' ? KIND_LABELS.custom : `${KIND_LABELS[p.kind]} · ${SIZE_LABELS[p.size]} · ${COMPLEXITY_LABELS[p.complexity]}`;
    $('statusLeft').replaceChildren(el('span', { text: `Pluma ${VERSION}` }), el('span', { text: `Modo ${MODE_LABELS[p.mode]}` }), el('span', { text: what }));
    $('statusRight').replaceChildren(el('span', { text: `Tema ${theme}` }), el('span', { text: 'Histórico salvo neste navegador' }));
  }

  syncControls() {
    this.modeSeg.set(this.prefs.mode, false);
    this.kindDrop.set(this.prefs.kind);
    this.sizeSeg.set(this.prefs.size, false);
    this.complexitySeg.set(this.prefs.complexity, false);
    this.complexitySeg.setDisabled(this.prefs.kind === 'custom');
  }

  change(patch: Partial<Prefs>) {
    const modeChanged = patch.mode !== undefined && patch.mode !== this.prefs.mode;
    Object.assign(this.prefs, patch);
    this.save();
    this.syncControls();
    this.renderStatus();
    if (modeChanged) {
      this.freeParts = [];
      this.applyMode();
      this.buildHud();
    }
    this.buildActions();
    this.newText({});
  }

  applyMode() {
    const r = this.prefs.mode === 'rhythm';
    this.typing.hidden = r;
    $('rhythm').hidden = !r;
    $('hud').hidden = r;
    if (!r) this.rhythm.unload();
    else {
      this.stopTimers();
      this.session = null;
    }
  }

  chooseKind(kind: Kind) {
    if (kind === 'custom' && !this.prefs.customText) {
      this.kindDrop.set(this.prefs.kind);
      this.customDialog();
      return;
    }
    this.change({ kind });
    this.buildActions();
  }

  toggleKeyboard(on: boolean, persist = true) {
    this.prefs.keyboard = on;
    if (persist) this.save();
    $('keyboardWrap').hidden = !on;
    this.renderTop();
    this.focus();
  }

  toggleSound() {
    this.prefs.sound = !this.prefs.sound;
    this.sound.enabled = this.prefs.sound;
    this.save();
    this.renderTop();
    if (this.prefs.sound) this.sound.key();
    toast(this.prefs.sound ? 'Som das teclas ligado' : 'Som das teclas desligado');
    this.focus();
  }

  toggleTheme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    this.prefs.theme = dark ? 'light' : 'dark';
    this.save();
    applyLook(this.prefs);
    this.renderTop();
    this.renderStatus();
    this.focus();
  }

  paletteMenu() {
    openMenu(
      $('paletteBtn'),
      PALETTES.map((p) => ({
        name: p.id === 'pluma' ? `Paleta ${p.label} (padrão)` : `Paleta ${p.label}`,
        swatches: p.colors,
        checked: this.prefs.palette === p.id,
        run: () => {
          this.prefs.palette = p.id;
          this.save();
          applyLook(this.prefs);
          this.renderStatus();
          this.focus();
        },
      })),
      'right',
    );
  }

  mainMenu() {
    const r = this.prefs.mode === 'rhythm';
    openMenu($('menuBtn'), [
      { label: r ? 'Outra música' : 'Novo texto', icon: 'next', kbd: 'Tab', run: () => this.newText({ step: 1 }) },
      { label: r ? 'Recomeçar esta música' : 'Recomeçar este texto', icon: 'restart', kbd: 'Esc', run: () => this.newText({ repeat: true }) },
      { label: 'Escolher música…', icon: 'music', run: () => this.songsDialog() },
      { label: 'Texto customizado…', icon: 'edit', run: () => this.customDialog() },
      { sep: true },
      { label: 'Histórico e recordes', icon: 'history', kbd: 'Alt+H', run: () => this.openHistory() },
      { label: 'Preferências…', icon: 'settings', kbd: 'Alt+P', run: () => this.prefsDialog() },
      { label: 'Atalhos do teclado', icon: 'keyboard', kbd: 'F1', run: () => this.shortcutsDialog() },
      { label: 'Tutorial rápido', icon: 'help', run: () => this.tour(false) },
      { sep: true },
      { label: 'Sobre o Pluma', icon: 'info', run: () => this.aboutDialog() },
    ]);
  }

  buildHud() {
    const hud = $('hud');
    hud.replaceChildren();
    this.stats = {};
    const add = (id: string, label: string, value: string, cls = '') => {
      const val = el('span', { class: 'val', text: value });
      const root = el('div', { class: `stat ${cls}` }, el('span', { class: 'lbl', text: label }), val);
      hud.append(root);
      this.stats[id] = { root, val };
    };
    if (this.prefs.mode === 'test') {
      add('time', 'Tempo', '0:00,00', 'timer');
      add('speed', 'Toques/min', '0');
      add('accuracy', 'Precisão', '100%');
      add('streak', 'Sequência', '0');
    } else {
      add('accuracy', 'Precisão', '100%');
      add('streak', 'Sequência', '0');
      add('texts', 'Textos', '0');
      add('keys', 'Toques', '0');
    }
  }

  buildActions() {
    const bar = $('actions');
    bar.replaceChildren();
    const btn = (label: string, ic: string, kbd: string | null, run: () => void, cls = 'btn') =>
      el('button', { class: cls, type: 'button', onclick: () => run() }, icon(ic, 15), label, kbd ? el('kbd', { text: kbd }) : null);
    this.pauseBtn = null;
    if (this.prefs.mode === 'rhythm') {
      const keep = (b: HTMLButtonElement) => {
        b.addEventListener('pointerdown', (e) => e.preventDefault());
        return b;
      };
      this.pauseBtn = keep(btn('Começar', 'play', 'Espaço', () => {
        this.rhythm.toggle();
        this.focus();
      }, 'btn primary'));
      bar.append(
        keep(btn('Recomeçar', 'restart', 'Esc', () => {
          this.rhythmRestart();
          this.focus();
        })),
        keep(btn('Outra música', 'next', 'Tab', () => this.newText({ step: 1 }))),
        this.pauseBtn,
        btn('Músicas', 'music', null, () => this.songsDialog()),
      );
      if (this.prefs.kind === 'custom') bar.append(btn('Trocar texto ou arquivo', 'upload', null, () => this.customDialog()));
      bar.append(el('span', { class: 'hint' }, icon('music', 14), `${TRACKS.length} músicas · digite cada letra quando ela encostar no círculo`));
      this.syncPause(this.rhythm.phase);
      return;
    }
    const doc = this.prefs.kind === 'custom' && splitParts(this.prefs.customText, this.prefs.size).length > 1;
    bar.append(btn('Recomeçar', 'restart', 'Esc', () => this.newText({ repeat: true })), btn(doc ? 'Próxima parte' : 'Novo texto', 'next', 'Tab', () => this.newText({ step: 1 })));
    if (this.prefs.kind === 'custom') {
      if (doc) bar.append(btn('Parte anterior', 'prev', null, () => this.newText({ step: -1 })));
      bar.append(btn('Trocar texto ou arquivo', 'upload', null, () => this.customDialog()));
    }
    if (this.prefs.mode === 'free') {
      bar.append(btn('Encerrar e ver diagnóstico', 'flag', 'Ctrl+Enter', () => this.finishFree(), 'btn primary'));
      const sw = el('button', { class: 'switch', role: 'switch', 'aria-checked': String(this.prefs.stopOnError), 'aria-label': 'Avançar só com a tecla certa' });
      sw.addEventListener('click', () => {
        this.prefs.stopOnError = !this.prefs.stopOnError;
        sw.setAttribute('aria-checked', String(this.prefs.stopOnError));
        this.save();
        if (this.session && !this.session.started) this.newText({ repeat: true });
        this.focus();
      });
      bar.append(el('span', { class: 'hint' }, sw, 'Avançar só com a tecla certa'));
    } else {
      bar.append(el('span', { class: 'hint' }, icon('clock', 14), 'O tempo começa no primeiro toque'));
    }
  }

  pick(step: number): Current | null {
    const p = this.prefs;
    if (p.kind === 'custom') {
      const parts = splitParts(p.customText, p.size);
      if (!parts.length) return null;
      const base = Math.min(p.customPart, parts.length - 1);
      const part = (((base + step) % parts.length) + parts.length) % parts.length;
      if (part !== p.customPart) {
        p.customPart = part;
        this.save();
      }
      return { kind: 'custom', size: p.size, complexity: p.complexity, seed: null, phraseId: null, text: parts[part] as string, part, parts: parts.length };
    }
    let g = generate(DATA, { kind: p.kind, size: p.size, complexity: p.complexity, seed: randomSeed() });
    for (let i = 0; i < 6 && this.current && g.text === this.current.text; i++) {
      g = generate(DATA, { kind: p.kind, size: p.size, complexity: p.complexity, seed: randomSeed() });
    }
    return { kind: g.kind, size: g.size, complexity: g.complexity, seed: g.seed, phraseId: g.phraseId, text: g.text, part: 0, parts: 1 };
  }

  syncPause(phase: Phase) {
    const b = this.pauseBtn;
    if (!b) return;
    const playing = phase === 'playing' || phase === 'count';
    const label = playing ? 'Pausar' : phase === 'paused' ? 'Continuar' : 'Começar';
    b.disabled = phase === 'done' || phase === 'empty';
    if (b.dataset.label === label) return;
    b.dataset.label = label;
    b.replaceChildren(icon(playing ? 'pause' : 'play', 15), label, el('kbd', { text: 'Espaço' }));
  }

  rhythmRestart() {
    const phase = this.rhythm.phase;
    if (phase === 'ready' || phase === 'empty' || phase === 'done') this.newText({ repeat: true });
    else this.rhythm.restart();
  }

  trackIndex(): number {
    const i = TRACKS.findIndex((t) => t.id === this.prefs.rhythmTrack);
    return i < 0 ? 0 : i;
  }

  track(): Track {
    return TRACKS[this.trackIndex()] ?? FALLBACK_TRACK;
  }

  setTrack(index: number) {
    if (!TRACKS.length) return;
    const i = ((index % TRACKS.length) + TRACKS.length) % TRACKS.length;
    this.prefs.rhythmTrack = (TRACKS[i] as Track).id;
    this.save();
    this.loadSong('fresh');
  }

  browse(delta: number) {
    const phase = this.rhythm.phase;
    if (phase === 'playing' || phase === 'count' || phase === 'paused') return;
    this.setTrack(this.trackIndex() + delta);
  }

  bestFor(track: Track): Entry | null {
    const p = this.prefs;
    return this.history.best(categoryKey({ mode: 'rhythm', track: track.id, kind: p.kind, size: p.size, complexity: p.complexity }), 'rhythm');
  }

  songsDialog() {
    closeMenu();
    if (this.prefs.mode !== 'rhythm') this.change({ mode: 'rhythm' });
    const nf = new Intl.NumberFormat('pt-BR');
    const current = this.trackIndex();
    const search = el('input', { type: 'search', class: 'song-search', placeholder: 'Buscar por nome, banda ou estilo', 'aria-label': 'Buscar música' });
    const style = el('select', { class: 'select', 'aria-label': 'Filtrar por estilo' }, el('option', { value: '', text: 'Todos os estilos' })) as HTMLSelectElement;
    for (const g of new Set(TRACKS.map((t) => t.groove))) style.append(el('option', { value: g, text: GROOVES[g].label }));
    const list = el('div', { class: 'songs', role: 'list' });
    const count = el('small', { class: 'songs-count' });
    const fold = (v: string) => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let first: HTMLButtonElement | null = null;
    const render = () => {
      const q = fold(search.value.trim());
      list.replaceChildren();
      first = null;
      let shown = 0;
      TRACKS.forEach((t, i) => {
        if (style.value && t.groove !== style.value) return;
        if (q && !fold(`${t.title} ${t.artist} ${GROOVES[t.groove].label}`).includes(q)) return;
        const best = this.bestFor(t);
        const b = el(
          'button',
          { class: `song${i === current ? ' on' : ''}`, type: 'button', role: 'listitem', 'aria-current': i === current ? 'true' : null, style: { '--i': String(Math.min(shown, 14)) } },
          el('span', { class: 'song-n', text: String(i + 1).padStart(2, '0') }),
          el('span', { class: 'song-t' }, el('b', { text: t.title }), el('small', { text: `${t.artist} · ${GROOVES[t.groove].label} · ${t.bpm} BPM` })),
          el('span', { class: 'song-r' }, best ? el('b', { text: best.grade ?? '—' }) : el('i', { text: 'nova' }), best ? el('small', { text: nf.format(best.score ?? 0) }) : null),
        );
        b.addEventListener('click', () => {
          ov.close();
          this.setTrack(i);
        });
        if (!first) first = b;
        list.append(b);
        shown++;
      });
      count.textContent = shown === TRACKS.length ? `${TRACKS.length} músicas` : `${shown} de ${TRACKS.length} músicas`;
      if (!shown) list.append(el('p', { class: 'empty', text: 'Nenhuma música com esse nome.' }));
    };
    search.addEventListener('input', render);
    style.addEventListener('change', render);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && first) {
        e.preventDefault();
        first.click();
      }
    });
    const body = el(
      'div',
      {},
      el(
        'div',
        { class: 'sheet-head' },
        el('div', {}, el('h2', { text: 'Músicas' }), el('p', { text: `Trilhas originais feitas para o Pluma, em ${new Set(TRACKS.map((t) => t.groove)).size} estilos. A nota e o recorde ao lado valem para ${categoryLabel(this.prefs)}.` })),
      ),
      el('div', { class: 'filter-row songs-filter' }, search, style, count),
      list,
      el('div', { class: 'sheet-foot' }, el('span'), el('button', { class: 'btn primary', type: 'button', onclick: () => ov.close(), text: 'Fechar' })),
    );
    const ov = openSheet(body, { center: true, label: 'Músicas', dialogClass: 'dialog wide', onClose: () => this.focus() });
    render();
    setTimeout(() => {
      search.focus();
      list.querySelector('.song.on')?.scrollIntoView({ block: 'center' });
    }, 60);
  }

  rhythmSource(seed: number): string[] {
    const p = this.prefs;
    if (p.kind === 'custom') return rhythmWords(p.customText);
    const rng = new Rng(seed ^ 0x5bd1e995);
    const out: string[] = [];
    for (let i = 0; i < 60 && out.length < 360; i++) {
      out.push(...rhythmWords(generate(DATA, { kind: p.kind, size: 'long', complexity: p.complexity, seed: rng.next() }).text));
    }
    return out;
  }

  loadSong(how: 'repeat' | 'fresh' | 'other') {
    const p = this.prefs;
    if (p.kind === 'custom' && !p.customText) {
      this.customDialog();
      return;
    }
    if (how === 'other' && TRACKS.length > 1) {
      const now = this.trackIndex();
      let i = now;
      while (i === now) i = Math.floor((randomSeed() / 4294967296) * TRACKS.length);
      p.rhythmTrack = (TRACKS[i] as Track).id;
      this.save();
    }
    const track = this.track();
    const seed = how === 'repeat' && this.songSeed != null ? this.songSeed : randomSeed();
    this.songSeed = seed;
    const song = compose(this.rhythmSource(seed), { size: p.size, complexity: p.complexity, seed, track });
    this.stopTimers();
    this.session = null;
    this.finished = false;
    this.current = { kind: p.kind, size: p.size, complexity: p.complexity, seed, phraseId: null, text: song.words.join(' '), part: 0, parts: 1 };
    this.keyboard.setLayout('main');
    const best = this.bestFor(track);
    const meta: TrackMeta = {
      index: this.trackIndex(),
      total: TRACKS.length,
      style: GROOVES[track.groove].label,
      best: best ? `Seu recorde aqui: ${new Intl.NumberFormat('pt-BR').format(best.score ?? 0)} pontos, nota ${best.grade ?? '—'}` : null,
    };
    this.rhythm.load(song, meta);
    const tag = $('rhTag').querySelector('span');
    if (tag) tag.textContent = ['Ritmo', p.kind === 'custom' ? [KIND_LABELS.custom, p.customName].filter(Boolean).join(' · ') : `${KIND_LABELS[p.kind]} · ${SIZE_LABELS[p.size]} · ${COMPLEXITY_LABELS[p.complexity]}`].join(' · ');
    const nf = new Intl.NumberFormat('pt-BR');
    $('rhInfo').textContent = `${GROOVES[track.groove].label} · ${song.bpm} BPM · ${formatDuration(song.duration * 1000).replace(/,\d+$/, '')} · ${nf.format(song.notes.length)} notas`;
    this.focus();
  }

  finishRhythm(r: RhythmResult) {
    const ctx = this.context();
    const record = this.history.addRhythm(
      {
        score: r.score,
        grade: r.letter,
        perfect: r.perfect,
        great: r.great,
        good: r.good,
        miss: r.miss,
        wrong: r.wrong,
        notes: r.notes,
        hits: r.hits,
        presses: r.presses,
        maxCombo: r.maxCombo,
        accuracyBp: r.accuracyBp,
        durationMs: r.durationMs,
        title: r.song.title,
        bpm: r.song.bpm,
        track: r.song.track.id,
        completed: true,
      },
      ctx,
    );
    this.sound.chime(record.record);
    if (record.record || r.fullCombo) this.fx.feathers(record.record ? 18 : 10);
    this.announce(`Música concluída com ${new Intl.NumberFormat('pt-BR').format(r.score)} pontos, nota ${r.letter}, precisão de ${formatBp(r.accuracyBp)}.`);
    this.results = openRhythmResults(
      { ...r, title: r.song.title, artist: r.song.artist, bpm: r.song.bpm },
      ctx,
      record,
      {
        repeat: () => this.newText({ repeat: true }),
        next: () => this.newText({ step: 1 }),
        history: () => {
          this.newText({ step: 1 });
          this.openHistory();
        },
        closed: () => this.newText({ step: 1 }),
      },
    );
  }

  rhythmKey(e: KeyboardEvent) {
    if (e.altKey && !e.ctrlKey) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      this.newText({ step: 1 });
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.rhythmRestart();
    } else if (e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) this.rhythm.toggle();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!e.repeat && this.rhythm.phase === 'ready') this.rhythm.toggle();
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.browse(e.key === 'ArrowLeft' ? -1 : 1);
    } else if (e.ctrlKey || e.metaKey) {
      if (['a', 'z', 'y', 'x', 'v'].includes(e.key.toLowerCase())) e.preventDefault();
    } else if (this.rhythm.keydown(e)) {
      e.preventDefault();
    } else if (e.key.length === 1 || e.key === 'Dead' || e.key === 'Backspace' || e.key.startsWith('Arrow') || ['Home', 'End', 'PageUp', 'PageDown', 'Delete'].includes(e.key)) {
      e.preventDefault();
    }
  }

  async newText(options: { repeat?: boolean; enter?: boolean; step?: number }) {
    if (this.busy) return;
    closeMenu();
    if (this.prefs.mode === 'rhythm') {
      this.loadSong(options.repeat ? 'repeat' : options.step ? 'other' : 'fresh');
      return;
    }
    const next = options.repeat && this.current ? this.current : this.pick(options.step ?? 0);
    if (!next) {
      this.customDialog();
      return;
    }
    this.busy = true;
    this.stopTimers();
    if (this.session && this.prefs.mode === 'free' && !this.finished && this.session.started && !this.session.done && !options.repeat) {
      this.freeParts.push(summarize(this.session.target, this.session.events, { active: true }));
    }
    if (!options.enter && this.session) await this.view.leave();
    this.current = next;
    this.session = new Session(next.text, { stopOnError: this.prefs.mode === 'free' && this.prefs.stopOnError });
    this.finished = false;
    this.typing.classList.remove('done');
    this.typing.classList.toggle('numpad', next.kind === 'numpad');
    this.keyboard.setLayout(next.kind === 'numpad' ? 'numpad' : 'main');
    this.view.render(next.text, { numpad: next.kind === 'numpad', enter: true });
    this.input.value = '';
    this.fx.clear();
    this.updateProgress();
    this.keyboard.showNext(this.session.expected ?? null);
    this.updateHud(true);
    const tag = $('typingTag').querySelector('span');
    if (tag) {
      tag.textContent =
        next.kind === 'custom'
          ? [KIND_LABELS.custom, this.prefs.customName, next.parts > 1 ? `parte ${next.part + 1} de ${next.parts}` : null].filter(Boolean).join(' · ')
          : `${KIND_LABELS[next.kind]} · ${SIZE_LABELS[next.size]} · ${COMPLEXITY_LABELS[next.complexity]}`;
    }
    const n = this.session.target.length;
    $('typingInfo').textContent = `${new Intl.NumberFormat('pt-BR').format(n)} caracteres`;
    this.busy = false;
    this.focus();
  }

  bindInput() {
    const input = this.input;
    input.addEventListener('compositionstart', () => (this.composing = true));
    input.addEventListener('compositionend', () => {
      this.composing = false;
      this.consume();
    });
    input.addEventListener('beforeinput', (e) => {
      const t = (e as InputEvent).inputType;
      if (t === 'insertFromPaste' || t === 'insertFromDrop' || t === 'historyUndo' || t === 'historyRedo' || t === 'insertReplacementText') e.preventDefault();
    });
    input.addEventListener('input', (e) => {
      if (this.prefs.mode === 'rhythm') {
        const v = input.value;
        input.value = '';
        if (v && !this.composing) this.rhythm.typed(v);
        return;
      }
      if (this.composing || (e as InputEvent).isComposing) return;
      this.consume();
    });
    input.addEventListener('paste', (e) => e.preventDefault());
    input.addEventListener('drop', (e) => e.preventDefault());
    input.addEventListener('keydown', (e) => {
      this.lastCode = e.code;
      if (e.code) this.keyboard.press(e.code);
      if (this.prefs.mode === 'rhythm') {
        this.rhythmKey(e);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        this.newText({ step: 1 });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.newText({ repeat: true });
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (this.prefs.mode === 'free') this.finishFree();
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && ['a', 'z', 'y', 'x', 'v'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      } else if (this.finished) {
        e.preventDefault();
      }
    });
    input.addEventListener('keyup', (e) => {
      if (e.code) this.keyboard.release(e.code);
      if (this.prefs.mode === 'rhythm') this.rhythm.keyup(e);
    });
    input.addEventListener('focus', () => {
      this.typing.classList.remove('blurred');
      this.view.hideCaret(false);
    });
    input.addEventListener('blur', () => {
      this.keyboard.releaseAll();
      if (this.prefs.mode === 'rhythm') this.rhythm.pause();
      setTimeout(() => {
        if (document.activeElement !== input && !overlayOpen() && !document.querySelector('.tour-card')) this.typing.classList.add('blurred');
      }, 120);
    });
    this.typing.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.focus();
    });
    $('rhythm').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.focus();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.rhythm.pause();
    });
  }

  bindGlobal() {
    document.addEventListener('keydown', (e) => {
      if (e.defaultPrevented) return;
      if (e.altKey && !e.ctrlKey) {
        const k = e.key.toLowerCase();
        const map: Record<string, () => void> = {
          h: () => this.openHistory(),
          k: () => this.toggleKeyboard(!this.prefs.keyboard),
          s: () => this.toggleSound(),
          p: () => this.prefsDialog(),
          t: () => this.toggleTheme(),
        };
        const fn = map[k];
        if (fn && !overlayOpen()) {
          e.preventDefault();
          fn();
          return;
        }
      }
      if (e.key === 'F1' && !overlayOpen()) {
        e.preventDefault();
        this.shortcutsDialog();
        return;
      }
      if (overlayOpen() || document.activeElement === this.input) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.closest('.menu, .listbox, .tour-card') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (e.key === 'Tab' && target && target.closest('.topbar, .actions')) return;
      if (this.prefs.mode === 'rhythm' && e.key === ' ' && !(target instanceof HTMLButtonElement)) {
        e.preventDefault();
        this.focus();
        this.rhythm.toggle();
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) this.focus();
      else if (e.key === 'Escape' || e.key === 'Dead') this.focus();
    });
    window.addEventListener('blur', () => this.keyboard.releaseAll());
    window.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f && !overlayOpen()) this.customDialog(f);
    });
  }

  consume() {
    if (this.prefs.mode === 'rhythm') {
      this.input.value = '';
      return;
    }
    const s = this.session;
    if (!s || this.busy) return;
    const value = this.input.value;
    if (this.finished) {
      this.input.value = s.value;
      return;
    }
    const steps = s.apply(diffInput(s.value, value), performance.now());
    if (this.input.value !== s.value) this.input.value = s.value;
    if (!steps.length) return;
    for (const step of steps) this.react(step);
    this.view.setPosition(s.position);
    this.keyboard.showNext(s.expected ?? null);
    this.updateProgress();
    if (this.prefs.mode === 'test' && s.started && !this.hudTimer) this.startTimers();
    this.updateHud(false);
    if (s.done) this.finishText();
  }

  react(step: Step) {
    if (step.type === 'char') {
      this.view.mark(step.index, step.ok ? 'ok' : 'err');
      this.keyboard.flash(this.lastCode, step.ok);
      if (step.ok) {
        this.sound.key(step.char === ' ' || step.char === '\n');
        if (MILESTONES.includes(step.streak) || (step.streak > 500 && step.streak % 100 === 0)) this.milestone(step.streak, step.index);
      } else {
        this.view.miss();
        this.sound.error();
      }
    } else if (step.type === 'reject') {
      this.view.miss();
      this.keyboard.flash(this.lastCode, false);
      this.sound.error();
    } else if (step.type === 'back') {
      this.view.mark(step.index, 'pending');
    }
  }

  milestone(streak: number, index: number) {
    const p = this.view.charPoint(index) ?? this.view.caretPoint();
    this.fx.sparks(p.x, p.y, streak >= 100 ? 26 : 16, streak >= 50 ? 'mix' : 'accent');
    const bubble = el('span', { class: 'combo', text: `${streak} em sequência!` });
    const head = this.typing.querySelector<HTMLElement>('.typing-head');
    const limit = head ? head.offsetTop + head.offsetHeight + 6 : 0;
    const above = p.y - 30;
    bubble.style.left = `${p.x}px`;
    bubble.style.top = `${above < limit ? p.y + 22 : above}px`;
    this.typing.append(bubble);
    setTimeout(() => bubble.remove(), 1150);
    const st = this.stats.streak?.root;
    if (st) {
      st.classList.remove('pulse');
      void st.offsetWidth;
      st.classList.add('pulse');
    }
  }

  updateProgress() {
    const s = this.session;
    const ratio = s && s.target.length ? s.position / s.target.length : 0;
    $('progress').style.transform = `scaleX(${ratio})`;
  }

  startTimers() {
    const tick = () => {
      const s = this.session;
      if (!s || !s.started || s.done) {
        this.hudTimer = 0;
        return;
      }
      const t = this.stats.time;
      if (t) t.val.textContent = formatDuration(s.elapsed(performance.now()));
      this.hudTimer = requestAnimationFrame(tick);
    };
    this.stats.time?.root.classList.add('running');
    this.hudTimer = requestAnimationFrame(tick);
    this.liveTimer = window.setInterval(() => this.updateHud(false), 250);
  }

  stopTimers() {
    if (this.hudTimer) cancelAnimationFrame(this.hudTimer);
    this.hudTimer = 0;
    clearInterval(this.liveTimer);
    this.liveTimer = 0;
    this.stats.time?.root.classList.remove('running');
  }

  updateHud(reset: boolean) {
    const s = this.session;
    if (!s) return;
    const nf = new Intl.NumberFormat('pt-BR');
    const set = (id: string, v: string) => {
      const st = this.stats[id];
      if (st && st.val.textContent !== v) st.val.textContent = v;
    };
    if (this.prefs.mode === 'test') {
      if (reset) set('time', '0:00,00');
      set('speed', nf.format(Math.round(s.liveNetPerMin(performance.now()))));
      set('accuracy', `${nf.format(Math.round(s.liveAccuracy() * 1000) / 10)}%`);
      set('streak', nf.format(s.streak));
    } else {
      const parts = [...this.freeParts];
      let keys = s.keystrokes;
      let correct = s.correct;
      for (const p of parts) {
        keys += p.keystrokes;
        correct += p.correct;
      }
      set('accuracy', `${nf.format(keys ? Math.round((correct / keys) * 1000) / 10 : 100)}%`);
      set('streak', nf.format(s.streak));
      set('texts', nf.format(parts.filter((p) => p.completed).length));
      set('keys', nf.format(keys));
    }
  }

  context(texts?: number): Context {
    const c = this.current as Current;
    return { mode: this.prefs.mode, kind: c.kind, size: c.size, complexity: c.complexity, seed: c.seed, phraseId: c.phraseId, texts };
  }

  finishText() {
    const s = this.session;
    if (!s || this.finished) return;
    this.finished = true;
    this.stopTimers();
    this.typing.classList.add('done');
    const point = this.view.caretPoint();
    if (this.prefs.mode === 'test') {
      const summary = summarize(s.target, s.events);
      const t = this.stats.time;
      if (t) t.val.textContent = formatDuration(summary.durationMs);
      const record = this.history.add(summary, this.context());
      this.fx.sparks(point.x, point.y, 28, 'mix');
      this.fx.feathers(record.record ? 18 : 10);
      this.sound.chime(record.record);
      this.announce(`Teste concluído em ${formatDuration(summary.durationMs)}, ${formatX100(summary.netPerMinX100)} toques líquidos por minuto, precisão de ${formatBp(summary.accuracyBp)}.`);
      setTimeout(() => {
        this.results = openResults(summary, this.context(), timeline(s.target, s.events), record, this.keyboard.layout, {
          repeat: () => this.newText({ repeat: true }),
          next: () => this.newText({ step: 1 }),
          history: () => {
            this.newText({ step: 1 });
            this.openHistory();
          },
          closed: () => this.newText({ step: 1 }),
        });
      }, 620);
    } else {
      const part = summarize(s.target, s.events, { active: true });
      this.freeParts.push(part);
      this.fx.sparks(point.x, point.y, 18, 'accent');
      this.sound.chime(false);
      toast(`Texto concluído · precisão de ${formatBp(part.accuracyBp)}`);
      this.updateHud(false);
      setTimeout(() => this.newText({ step: 1 }), 650);
    }
  }

  finishFree() {
    const s = this.session;
    const parts = [...this.freeParts];
    if (s && s.started && !s.done) parts.push(summarize(s.target, s.events, { active: true }));
    if (!parts.length || parts.every((p) => p.keystrokes === 0)) {
      toast('Digite um pouco antes de encerrar a sessão');
      this.focus();
      return;
    }
    this.stopTimers();
    this.finished = true;
    const total = combine(parts);
    const ctx = this.context(total.texts);
    const record = this.history.add(total, ctx);
    this.freeParts = [];
    this.results = openResults(total, ctx, [], { record: false, previous: record.previous }, this.keyboard.layout, {
      repeat: null,
      next: () => {
        this.buildHud();
        this.newText({ step: 1 });
      },
      history: () => {
        this.buildHud();
        this.newText({ step: 1 });
        this.openHistory();
      },
      closed: () => {
        this.buildHud();
        this.newText({ step: 1 });
      },
    });
  }

  announce(text: string) {
    const live = $('liveText');
    live.hidden = false;
    live.textContent = text;
  }

  customDialog(file?: File) {
    closeMenu();
    const nf = new Intl.NumberFormat('pt-BR');
    let name: string | null = this.prefs.customName;
    const area = el('textarea', { class: 'custom-area', placeholder: 'Cole ou escreva aqui o texto que você quer treinar, ou envie um documento.', spellcheck: 'false' });
    area.value = this.prefs.customText;
    const picker = el('input', { type: 'file', accept: ACCEPTED, hidden: true });
    const status = el('p', { class: 'drop-status', role: 'status' });
    const info = el('small');
    const startAt = el('input', { type: 'number', min: '1', value: '1', class: 'part-input', 'aria-label': 'Começar pela parte' });
    const startRow = el('label', { class: 'part-row' }, 'Começar pela parte', startAt, el('span'));
    const sizeOf = () => this.prefs.size;
    const refresh = () => {
      const adapted = adaptForTyping(area.value);
      const parts = splitParts(adapted.text, sizeOf()).length;
      const chars = Array.from(adapted.text).length;
      info.textContent = chars
        ? `${nf.format(chars)} caracteres${parts > 1 ? ` em ${nf.format(parts)} partes de até ${nf.format(Math.round(PART_SIZE[sizeOf()]))} caracteres (tamanho ${SIZE_LABELS[sizeOf()]}; mude em Curto, Médio ou Longo)` : ''}. Aspas curvas, travessões, marcadores e símbolos que não existem no teclado são ajustados.`
        : 'Nada escrito ainda.';
      startRow.hidden = parts < 2;
      startAt.max = String(Math.max(1, parts));
      (startRow.lastChild as HTMLElement).textContent = `de ${nf.format(parts)}`;
      if (Number(startAt.value) > parts) startAt.value = String(Math.max(1, parts));
    };
    area.addEventListener('input', () => {
      if (!area.value.trim()) name = null;
      refresh();
    });
    const load = async (f: File) => {
      drop.classList.add('busy');
      status.className = 'drop-status';
      status.textContent = `Lendo ${f.name}…`;
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const doc = await extract(f.name, bytes);
        const adapted = adaptForTyping(doc.text);
        if (!adapted.text) throw new DocumentError('o arquivo não tem texto para digitar');
        area.value = adapted.text;
        name = f.name;
        startAt.value = '1';
        const extra = [
          doc.pages ? `${nf.format(doc.pages)} ${doc.pages === 1 ? 'página' : 'páginas'}` : null,
          adapted.removed ? `${nf.format(adapted.removed)} ${adapted.removed === 1 ? 'caractere que não existe' : 'caracteres que não existem'} no teclado ${adapted.removed === 1 ? 'foi retirado' : 'foram retirados'}` : null,
          adapted.truncated ? `só os primeiros ${nf.format(MAX_CUSTOM_CHARS)} caracteres foram mantidos` : null,
        ].filter(Boolean);
        status.className = 'drop-status ok';
        status.textContent = `${f.name} pronto para digitar${extra.length ? `: ${extra.join('; ')}` : ''}.`;
        refresh();
      } catch (e) {
        status.className = 'drop-status bad';
        const msg = e instanceof DocumentError ? e.message : 'não foi possível ler este arquivo';
        status.textContent = `${f.name}: ${msg}.`;
      } finally {
        drop.classList.remove('busy');
      }
    };
    picker.addEventListener('change', () => {
      const f = picker.files?.[0];
      if (f) void load(f);
      picker.value = '';
    });
    const drop = el(
      'div',
      { class: 'drop' },
      el('span', { class: 'drop-icon' }, icon('upload', 20)),
      el('span', { class: 'drop-text' }, el('b', { text: 'Envie um documento' }), el('small', { text: 'PDF, DOCX, DOC, ODT ou TXT, até 25 MB. Ou arraste o arquivo para cá.' })),
      el('button', { class: 'btn', type: 'button', onclick: () => picker.click() }, icon('file', 15), 'Escolher arquivo'),
      picker,
    );
    const use = el('button', { class: 'btn primary', type: 'button' }, icon('check', 15), 'Usar este texto');
    const cancel = el('button', { class: 'btn ghost', type: 'button', text: 'Cancelar' });
    const body = el(
      'div',
      {},
      el('div', { class: 'sheet-head' }, el('div', {}, el('h2', { text: 'Texto customizado' }), el('p', { text: 'Cole, escreva ou envie um documento. Tudo fica só neste navegador.' }))),
      drop,
      status,
      el('label', { class: 'field' }, area, info),
      el('div', { class: 'sheet-foot' }, startRow, el('div', { class: 'grp' }, cancel, use)),
    );
    const ov = openSheet(body, { center: true, label: 'Texto customizado', dialogClass: 'dialog wide', onClose: () => this.focus() });
    const sheet = ov.root;
    sheet.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('over');
    });
    sheet.addEventListener('dragleave', (e) => {
      if (!sheet.contains(e.relatedTarget as Node)) drop.classList.remove('over');
    });
    sheet.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      const f = e.dataTransfer?.files?.[0];
      if (f) void load(f);
    });
    cancel.addEventListener('click', () => ov.close());
    use.addEventListener('click', () => {
      const text = normalizeCustom(area.value);
      if (!text) {
        toast('Escreva, cole ou envie algum texto primeiro');
        area.focus();
        return;
      }
      const parts = splitParts(text, this.prefs.size).length;
      this.prefs.customText = text;
      this.prefs.customName = name;
      this.prefs.customPart = Math.min(parts - 1, Math.max(0, Math.round(Number(startAt.value) || 1) - 1));
      this.prefs.kind = 'custom';
      this.save();
      this.syncControls();
      this.renderStatus();
      this.buildActions();
      ov.close();
      this.current = null;
      this.newText({});
    });
    refresh();
    if (file) void load(file);
    else setTimeout(() => area.focus(), 60);
  }

  prefsDialog() {
    closeMenu();
    const row = (title: string, sub: string, control: HTMLElement) => el('div', { class: 'pref-row' }, el('span', { class: 'txt' }, el('b', { text: title }), el('small', { text: sub })), control);
    const sw = (on: boolean, label: string, fn: (v: boolean) => void) => {
      const b = el('button', { class: 'switch', role: 'switch', type: 'button', 'aria-checked': String(on), 'aria-label': label });
      b.addEventListener('click', () => {
        const v = b.getAttribute('aria-checked') !== 'true';
        b.setAttribute('aria-checked', String(v));
        fn(v);
      });
      return b;
    };
    const range = (label: string, min: number, max: number, step: number, value: number, show: (v: number) => string, fn: (v: number) => void) => {
      const input = el('input', { type: 'range', class: 'range', min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
      const out = el('output', { class: 'range-val', text: show(value) });
      input.addEventListener('input', () => {
        const v = Number(input.value);
        out.textContent = show(v);
        fn(v);
      });
      return el('span', { class: 'range-row' }, input, out);
    };
    const caretSeg = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Cursor' });
    const fontSeg = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Tamanho da letra' });
    const clear = el('button', { class: 'btn danger', type: 'button' }, icon('trash', 15), 'Apagar histórico');
    let armed = false;
    clear.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        clear.lastChild && (clear.lastChild.textContent = 'Clique de novo para apagar');
        return;
      }
      this.history.clear();
      toast('Histórico apagado');
      ov.close();
    });
    const body = el(
      'div',
      {},
      el('div', { class: 'sheet-head' }, el('div', {}, el('h2', { text: 'Preferências' }), el('p', { text: 'Tudo fica salvo neste navegador.' }))),
      row('Efeitos e animações', 'Cursor deslizante, partículas e penas no fim do teste', sw(this.prefs.effects, 'Efeitos e animações', (v) => {
        this.prefs.effects = v;
        this.save();
        applyLook(this.prefs);
      })),
      row('Som das teclas', 'Clique suave a cada toque e aviso nos erros', sw(this.prefs.sound, 'Som das teclas', (v) => {
        this.prefs.sound = v;
        this.sound.enabled = v;
        this.save();
        this.renderTop();
      })),
      row('Teclado na tela', 'Mostra a próxima tecla e o dedo certo', sw(this.prefs.keyboard, 'Teclado na tela', (v) => this.toggleKeyboard(v))),
      row('Avançar só com a tecla certa', 'No modo Livre, a letra errada não entra no texto', sw(this.prefs.stopOnError, 'Avançar só com a tecla certa', (v) => {
        this.prefs.stopOnError = v;
        this.save();
        this.buildActions();
      })),
      row('Música do modo Ritmo', 'Volume da trilha; no zero, o jogo segue só pelas linhas', range('Volume da música', 0, 100, 5, this.prefs.musicVolume, (v) => `${v}%`, (v) => {
        this.prefs.musicVolume = v;
        this.rhythm.setVolume(v / 100);
        this.save();
      })),
      row('Sincronia do modo Ritmo', 'Se a nota do resultado diz “atrasado”, aumente; se diz “adiantado”, diminua', range('Sincronia em milissegundos', -OFFSET_LIMIT, OFFSET_LIMIT, 5, this.prefs.rhythmOffset, (v) => `${v > 0 ? '+' : ''}${v} ms`, (v) => {
        this.prefs.rhythmOffset = v;
        this.rhythm.latencyMs = v;
        this.save();
      })),
      row('Cursor', 'Formato do cursor de digitação', caretSeg),
      row('Tamanho da letra', 'Tamanho do texto a digitar', fontSeg),
      row('Histórico', `${new Intl.NumberFormat('pt-BR').format(this.history.entries.length)} ${this.history.entries.length === 1 ? 'resultado salvo' : 'resultados salvos'}`, clear),
      el('div', { class: 'sheet-foot' }, el('span'), el('button', { class: 'btn primary', type: 'button', onclick: () => ov.close(), text: 'Pronto' })),
    );
    const ov = openSheet(body, { center: true, label: 'Preferências', dialogClass: 'dialog', onClose: () => this.focus() });
    new Segmented<Caret>(caretSeg, [{ id: 'line', label: 'Linha' }, { id: 'block', label: 'Bloco' }, { id: 'underline', label: 'Sublinhado' }], this.prefs.caret, (v) => {
      this.prefs.caret = v;
      this.save();
      this.view.setCaretMode(v);
    });
    new Segmented<FontSize>(fontSeg, [{ id: 'small', label: 'Pequena' }, { id: 'medium', label: 'Média' }, { id: 'large', label: 'Grande' }], this.prefs.fontSize, (v) => {
      this.prefs.fontSize = v;
      this.save();
      applyLook(this.prefs);
    });
  }

  shortcutsDialog() {
    closeMenu();
    const list: [string, string][] = [
      ['Tab', 'Novo texto'],
      ['Esc', 'Recomeçar o texto atual'],
      ['Ctrl+Enter', 'Encerrar a sessão do modo Livre'],
      ['Espaço', 'Ritmo: começar, pausar e continuar'],
      ['Tab / Esc', 'Ritmo: outra música / recomeçar'],
      ['← / →', 'Ritmo: música anterior / próxima'],
      ['Backspace', 'Apagar o último caractere'],
      ['Ctrl+Backspace', 'Apagar a última palavra'],
      ['Enter / R', 'No diagnóstico: próximo texto / repetir'],
      ['Alt+H', 'Histórico e recordes'],
      ['Alt+K', 'Mostrar ou esconder o teclado'],
      ['Alt+S', 'Ligar ou desligar o som'],
      ['Alt+T', 'Alternar tema claro e escuro'],
      ['Alt+P', 'Preferências'],
      ['F1', 'Esta lista'],
    ];
    const grid = el('div', { class: 'shortcuts' });
    for (const [k, d] of list) grid.append(el('kbd', { text: k }), el('span', { text: d }));
    const body = el(
      'div',
      {},
      el('div', { class: 'sheet-head' }, el('div', {}, el('h2', { text: 'Atalhos do teclado' }))),
      grid,
      el('div', { class: 'sheet-foot' }, el('span'), el('button', { class: 'btn primary', type: 'button', onclick: () => ov.close(), text: 'Fechar' })),
    );
    const ov = openSheet(body, { center: true, label: 'Atalhos do teclado', dialogClass: 'dialog', onClose: () => this.focus() });
  }

  aboutDialog() {
    const logo = el('span', { class: 'logo big' });
    logo.append(logoSvg());
    const body = el(
      'div',
      {},
      el(
        'div',
        { class: 'about' },
        logo,
        el(
          'div',
          {},
          el('h2', { text: `Pluma ${VERSION}`, style: { margin: '0' } }),
          el('p', { text: 'Treino de digitação em português, com modo livre, modo teste e modo ritmo.' }),
          el('p', { text: `${DATA.phrases.length} textos, ${DATA.words.easy.length + DATA.words.medium.length + DATA.words.hard.length} palavras e ${TRACKS.length} músicas originais no acervo. Tudo roda neste navegador; nada é enviado para servidores.` }),
          el('p', { text: 'Copyright (©) 2026 Erik Pimenta. Todos os direitos reservados.' }),
        ),
      ),
      el('div', { class: 'sheet-foot' }, el('span'), el('button', { class: 'btn primary', type: 'button', onclick: () => ov.close(), text: 'Fechar' })),
    );
    const ov = openSheet(body, { center: true, label: 'Sobre o Pluma', dialogClass: 'dialog', onClose: () => this.focus() });
  }

  openHistory() {
    closeMenu();
    const nf = new Intl.NumberFormat('pt-BR');
    const body = el('div', { style: { display: 'contents' } });
    const filter = el(
      'select',
      { class: 'select', 'aria-label': 'Filtrar por modo' },
      el('option', { value: 'all', text: 'Todos' }),
      el('option', { value: 'test', text: 'Testes' }),
      el('option', { value: 'free', text: 'Livre' }),
      el('option', { value: 'rhythm', text: 'Ritmo' }),
    ) as HTMLSelectElement;
    const exportBtn = el('button', { class: 'btn icon ghost', type: 'button', title: 'Exportar CSV', 'aria-label': 'Exportar CSV' }, icon('download'));
    exportBtn.addEventListener('click', () => {
      if (!this.history.entries.length) return toast('O histórico ainda está vazio');
      download(`pluma-historico-${new Date().toISOString().slice(0, 10)}.csv`, this.history.toCsv(), 'text/csv;charset=utf-8');
    });
    const render = () => {
      const tests = this.history.entries.filter((e) => e.mode === 'test');
      const last10 = tests.slice(0, 10);
      const best = this.history.records()[0];
      const avgAcc = last10.length ? Math.round(last10.reduce((s, e) => s + e.accuracyBp, 0) / last10.length) : null;
      const mini = el(
        'div',
        { class: 'mini-cards' },
        el('div', { class: 'card', style: { '--i': '0' } }, el('span', { class: 'lbl', text: 'Testes' }), el('span', { class: 'val', text: nf.format(tests.length) })),
        el('div', { class: 'card', style: { '--i': '1' } }, el('span', { class: 'lbl', text: 'Melhor TLM' }), el('span', { class: 'val', text: best ? formatX100(best.netPerMinX100) : '—' })),
        el('div', { class: 'card', style: { '--i': '2' } }, el('span', { class: 'lbl', text: 'Precisão média' }), el('span', { class: 'val', text: formatBp(avgAcc) })),
      );
      const series = tests.slice(0, 30).reverse();
      const spark = el('div', { class: 'chart-box' }, el('h3', { text: 'Toques líquidos por minuto nos últimos testes' }));
      if (series.length >= 2) {
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 300 70');
        svg.setAttribute('class', 'spark');
        svg.setAttribute('preserveAspectRatio', 'none');
        const max = Math.max(...series.map((e) => e.netPerMinX100), 1);
        const pts = series.map((e, i) => [(i / (series.length - 1)) * 296 + 2, 66 - (e.netPerMinX100 / max) * 60] as const);
        const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
        const area = document.createElementNS(NS, 'path');
        area.setAttribute('class', 'a');
        area.setAttribute('d', `${d} L298 70 L2 70 Z`);
        const line = document.createElementNS(NS, 'path');
        line.setAttribute('class', 'l');
        line.setAttribute('d', d);
        svg.append(area, line);
        spark.append(svg);
      } else {
        spark.append(el('p', { class: 'formula', text: 'Faça pelo menos dois testes para ver a evolução.' }));
      }
      const recs = this.history.records().slice(0, 8);
      const recBox = el('div', {}, el('h3', { class: 'section-title', text: 'Recordes por categoria' }));
      const recList = el('div', { class: 'records' });
      for (const r of recs) {
        recList.append(el('div', { class: 'record' }, el('span', { text: categoryLabel(r) }), el('b', { text: formatX100(r.netPerMinX100) }), el('span', { text: formatBp(r.accuracyBp) })));
      }
      if (!recs.length) recList.append(el('p', { class: 'empty', text: 'Seus recordes aparecem aqui depois do primeiro teste.' }));
      recBox.append(recList);
      const songs = this.history.records('rhythm').slice(0, 8);
      const songBox = el('div', {}, el('h3', { class: 'section-title', text: 'Recordes do Ritmo' }));
      const songList = el('div', { class: 'records' });
      for (const r of songs) {
        songList.append(el('div', { class: 'record' }, el('span', { text: `${r.title ?? 'Música'} · ${categoryLabel(r)}` }), el('b', { text: nf.format(r.score ?? 0) }), el('span', { text: `nota ${r.grade ?? '—'} · ${formatBp(r.accuracyBp)}` })));
      }
      if (!songs.length) songList.append(el('p', { class: 'empty', text: 'Toque uma música no modo Ritmo para ver seus recordes aqui.' }));
      songBox.append(songList);
      const listBox = el('div', {}, el('h3', { class: 'section-title', text: 'Últimos resultados' }));
      const list = el('div', { class: 'hist-list' });
      const fmtDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      const shown = this.history.entries.filter((e) => filter.value === 'all' || e.mode === filter.value).slice(0, 100);
      const item = (e: Entry, i: number) =>
        e.mode === 'rhythm'
          ? el(
              'div',
              { class: 'hist', style: { '--i': String(i) } },
              el('span', { class: 't', text: `Ritmo · ${e.title ?? 'música'} · ${categoryLabel(e)}` }),
              el('span', { class: 'n' }, nf.format(e.score ?? 0), el('small', { text: 'pontos' })),
              el('span', { class: 'm', text: `${fmtDate.format(new Date(e.at))} · nota ${e.grade ?? '—'} · ${formatBp(e.accuracyBp)} · combo ${nf.format(e.maxStreak)}` }),
            )
          : el(
              'div',
              { class: 'hist', style: { '--i': String(i) } },
              el('span', { class: 't', text: `${e.mode === 'test' ? 'Teste' : `Livre (${e.texts} ${e.texts === 1 ? 'texto' : 'textos'})`} · ${categoryLabel(e)}` }),
              el('span', { class: 'n' }, formatX100(e.netPerMinX100), el('small', { text: 'toques/min' })),
              el('span', { class: 'm', text: `${fmtDate.format(new Date(e.at))} · ${formatDuration(e.durationMs)} · ${formatBp(e.accuracyBp)} · ${nf.format(e.errors)} ${e.errors === 1 ? 'erro' : 'erros'}` }),
            );
      shown.forEach((e, i) => list.append(item(e, i)));
      if (!shown.length) list.append(el('p', { class: 'empty', text: 'Nada por aqui ainda. Termine um texto para começar.' }));
      listBox.append(list);
      body.replaceChildren(mini, spark, recBox, songBox, listBox);
    };
    filter.addEventListener('change', render);
    render();
    openDrawer('Histórico e recordes', body, el('span', { class: 'filter-row' }, filter, exportBtn), () => this.focus());
  }

  tour(welcome: boolean) {
    closeMenu();
    this.input.blur();
    startTour(() => {
      this.prefs.tutorialDone = true;
      this.save();
      this.focus();
    }, welcome);
  }
}

new App();
