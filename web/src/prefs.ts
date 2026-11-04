import { isComplexity, isKind, isSize, type Complexity, type Kind, type Size } from './content.ts';
import { storage } from './ui.ts';

export type Mode = 'free' | 'test';
export type Theme = 'light' | 'dark';
export type PaletteId = 'pluma' | 'bento' | 'sonda' | 'nexo';
export type Caret = 'line' | 'block' | 'underline';
export type FontSize = 'small' | 'medium' | 'large';

export interface Prefs {
  mode: Mode;
  kind: Kind;
  size: Size;
  complexity: Complexity;
  theme: Theme | null;
  palette: PaletteId;
  sound: boolean;
  keyboard: boolean;
  effects: boolean;
  caret: Caret;
  fontSize: FontSize;
  stopOnError: boolean;
  customText: string;
  customName: string | null;
  customPart: number;
  tutorialDone: boolean;
}

export const PALETTES: { id: PaletteId; label: string; origin: string; colors: string[] }[] = [
  { id: 'pluma', label: 'Pluma', origin: 'paleta original', colors: ['#E6DDCE', '#A3B4BE', '#F6E4A6', '#5D1C16'] },
  { id: 'bento', label: 'Bento', origin: 'painel administrativo', colors: ['#F5F4F4', '#BAB7B6', '#4D4B4B', '#000000'] },
  { id: 'sonda', label: 'Sonda', origin: 'motor de busca', colors: ['#F3F1EC', '#7FA7B8', '#17212B', '#A8235A'] },
  { id: 'nexo', label: 'Nexo', origin: 'paleta original do Nexo', colors: ['#E8E8E8', '#D9D1CE', '#AB9D9D', '#000000'] },
];

const DEFAULTS: Prefs = {
  mode: 'test',
  kind: 'text',
  size: 'short',
  complexity: 'easy',
  theme: null,
  palette: 'pluma',
  sound: false,
  keyboard: true,
  effects: true,
  caret: 'line',
  fontSize: 'medium',
  stopOnError: false,
  customText: '',
  customName: null,
  customPart: 0,
  tutorialDone: false,
};

const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => ((list as readonly unknown[]).includes(v) ? (v as T) : fallback);

export function loadPrefs(): Prefs {
  const raw = storage.get<Record<string, unknown>>('prefs', {});
  const p = raw && typeof raw === 'object' ? raw : {};
  return {
    mode: oneOf(p.mode, ['free', 'test'] as const, DEFAULTS.mode),
    kind: isKind(p.kind) ? p.kind : DEFAULTS.kind,
    size: isSize(p.size) ? p.size : DEFAULTS.size,
    complexity: isComplexity(p.complexity) ? p.complexity : DEFAULTS.complexity,
    theme: p.theme === 'light' || p.theme === 'dark' ? p.theme : null,
    palette: oneOf(p.palette, PALETTES.map((x) => x.id), DEFAULTS.palette),
    sound: typeof p.sound === 'boolean' ? p.sound : DEFAULTS.sound,
    keyboard: typeof p.keyboard === 'boolean' ? p.keyboard : DEFAULTS.keyboard,
    effects: typeof p.effects === 'boolean' ? p.effects : DEFAULTS.effects,
    caret: oneOf(p.caret, ['line', 'block', 'underline'] as const, DEFAULTS.caret),
    fontSize: oneOf(p.fontSize, ['small', 'medium', 'large'] as const, DEFAULTS.fontSize),
    stopOnError: typeof p.stopOnError === 'boolean' ? p.stopOnError : DEFAULTS.stopOnError,
    customText: typeof p.customText === 'string' ? p.customText.slice(0, 120_000) : '',
    customName: typeof p.customName === 'string' ? p.customName.slice(0, 200) : null,
    customPart: typeof p.customPart === 'number' && Number.isInteger(p.customPart) && p.customPart >= 0 ? p.customPart : 0,
    tutorialDone: p.tutorialDone === true,
  };
}

export const savePrefs = (p: Prefs) => storage.set('prefs', p);

export const systemTheme = (): Theme => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function applyLook(p: Prefs) {
  const d = document.documentElement;
  d.dataset.theme = p.theme ?? systemTheme();
  if (p.palette === 'pluma') delete d.dataset.palette;
  else d.dataset.palette = p.palette;
  if (p.fontSize === 'medium') delete d.dataset.font;
  else d.dataset.font = p.fontSize;
  if (p.effects) delete d.dataset.motion;
  else d.dataset.motion = 'off';
}
