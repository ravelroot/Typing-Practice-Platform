export const KINDS = ['text', 'words', 'no-accents', 'alphabet', 'numbers', 'numpad', 'data', 'mixed', 'custom'] as const;
export const SIZES = ['short', 'medium', 'long'] as const;
export const COMPLEXITIES = ['easy', 'medium', 'hard'] as const;

export type Kind = (typeof KINDS)[number];
export type Size = (typeof SIZES)[number];
export type Complexity = (typeof COMPLEXITIES)[number];

export interface Phrase {
  id: string;
  size: Size;
  complexity: Complexity;
  text: string;
}

export interface WordLists {
  easy: string[];
  medium: string[];
  hard: string[];
  sounds: string[];
}

export interface ContentData {
  phrases: Phrase[];
  words: WordLists;
}

export interface Request {
  kind: Kind;
  size: Size;
  complexity: Complexity;
  seed: number;
}

export interface Generated extends Request {
  text: string;
  phraseId: string | null;
}

export const KIND_LABELS: Record<Kind, string> = {
  text: 'Texto',
  words: 'Palavras',
  'no-accents': 'Sem acentos',
  alphabet: 'Alfabeto',
  numbers: 'Números',
  numpad: 'Teclado num.',
  data: 'Dados',
  mixed: 'Misto',
  custom: 'Customizado',
};

export const KIND_HINTS: Record<Kind, string> = {
  text: 'Frases e parágrafos em português',
  words: 'Palavras soltas, das mais comuns às mais longas',
  'no-accents': 'Os mesmos textos, sem acentos e sem cedilha',
  alphabet: 'De a a z, em ordem, espaçado ou embaralhado',
  numbers: 'Números na fileira de cima, com valores, datas e horas',
  numpad: 'Contas e valores para o teclado numérico, com Enter',
  data: 'Pedidos, notas e registros, como numa planilha',
  mixed: 'Palavras, números, letras, onomatopeias e símbolos, tudo junto',
  custom: 'Seu texto ou um PDF, DOCX, DOC, ODT ou TXT',
};

export const SIZE_LABELS: Record<Size, string> = { short: 'Curto', medium: 'Médio', long: 'Longo' };
export const COMPLEXITY_LABELS: Record<Complexity, string> = { easy: 'Fácil', medium: 'Média', hard: 'Difícil' };

export const MAX_CUSTOM_CHARS = 100_000;

export class Rng {
  private a: number;

  constructor(seed: number) {
    this.a = seed >>> 0;
  }

  next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  int(n: number): number {
    return Math.floor((this.next() / 4294967296) * n);
  }

  range(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }

  pick<T>(list: readonly T[]): T {
    return list[this.int(list.length)] as T;
  }

  shuffle<T>(list: readonly T[]): T[] {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }
}

export const randomSeed = (): number => {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] ?? 1;
};

const ACCENTS: Record<string, string> = {
  á: 'a', à: 'a', â: 'a', ã: 'a', é: 'e', ê: 'e', í: 'i', ó: 'o', ô: 'o', õ: 'o', ú: 'u', ü: 'u', ç: 'c',
  Á: 'A', À: 'A', Â: 'A', Ã: 'A', É: 'E', Ê: 'E', Í: 'I', Ó: 'O', Ô: 'O', Õ: 'O', Ú: 'U', Ü: 'U', Ç: 'C',
};

export const stripAccents = (text: string): string => Array.from(text, (c) => ACCENTS[c] ?? c).join('');

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

export const formatInt = (n: number): string => {
  const digits = String(n);
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += '.';
    out += digits[i];
  }
  return out;
};

export const formatMoney = (cents: number): string => `${formatInt(Math.floor(cents / 100))},${pad(cents % 100, 2)}`;

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const WORD_COUNT: Record<Size, number> = { short: 12, medium: 30, long: 60 };
const ALPHABET_REPS: Record<Size, number> = { short: 1, medium: 2, long: 3 };
const NUMBER_COUNT: Record<Size, number> = { short: 10, medium: 22, long: 44 };
const NUMPAD_LINES: Record<Size, number> = { short: 8, medium: 16, long: 30 };
const DATA_LINES: Record<Complexity, Record<Size, number>> = {
  easy: { short: 3, medium: 6, long: 12 },
  medium: { short: 2, medium: 5, long: 9 },
  hard: { short: 2, medium: 4, long: 7 },
};

const UNITS: readonly (readonly [string, string])[] = [
  ['caixa', 'caixas'],
  ['pacote', 'pacotes'],
  ['unidade', 'unidades'],
  ['fardo', 'fardos'],
  ['rolo', 'rolos'],
  ['kit', 'kits'],
];

const ITEMS = [
  'papel A4', 'cabo USB', 'caneta azul', 'café 500 g', 'arroz 5 kg', 'teclado ABNT2', 'mouse sem fio', 'cadeira giratória',
  'luminária', 'garrafa térmica', 'fone de ouvido', 'agenda', 'tinta guache', 'fita adesiva', 'pendrive 64 GB', 'grampeador',
  'calculadora', 'mochila', 'estojo', 'pasta suspensa',
];

const CITIES: readonly (readonly [string, string])[] = [
  ['Recife', 'PE'], ['Salvador', 'BA'], ['Curitiba', 'PR'], ['Belém', 'PA'], ['Manaus', 'AM'], ['Goiânia', 'GO'], ['Natal', 'RN'],
  ['Maceió', 'AL'], ['Teresina', 'PI'], ['Cuiabá', 'MT'], ['Vitória', 'ES'], ['Niterói', 'RJ'], ['Campinas', 'SP'], ['Londrina', 'PR'],
  ['Joinville', 'SC'], ['Uberlândia', 'MG'], ['Sobral', 'CE'], ['Pelotas', 'RS'], ['Ilhéus', 'BA'], ['Petrópolis', 'RJ'],
  ['Santarém', 'PA'], ['Macapá', 'AP'], ['Palmas', 'TO'], ['Aracaju', 'SE'], ['Florianópolis', 'SC'], ['Porto Alegre', 'RS'],
  ['Belo Horizonte', 'MG'], ['São Luís', 'MA'], ['João Pessoa', 'PB'], ['Campo Grande', 'MS'], ['Boa Vista', 'RR'],
  ['Rio Branco', 'AC'], ['Porto Velho', 'RO'], ['Brasília', 'DF'], ['Fortaleza', 'CE'], ['São Paulo', 'SP'], ['Rio de Janeiro', 'RJ'],
];

const SECTORS = ['vendas', 'compras', 'suporte', 'financeiro', 'contato', 'logistica', 'atendimento', 'estoque', 'faturamento'];
const OPERATORS = ['+', '-', '*', '/'];
const MIXED_COUNT: Record<Size, number> = { short: 12, medium: 28, long: 55 };
const SYMBOLS = ['@', '#', '&', '*', '+', '=', '%', '$', '/', '_'];
const BRACKETS: readonly (readonly [string, string])[] = [['(', ')'], ['[', ']'], ['{', '}'], ['<', '>'], ['"', '"'], ["'", "'"]];

const digitsNumber = (rng: Rng, digits: number): number =>
  digits === 1 ? rng.range(0, 9) : rng.range(10 ** (digits - 1), 10 ** digits - 1);

function phraseFor(data: ContentData, size: Size, complexity: Complexity, rng: Rng): Phrase {
  const list = data.phrases.filter((p) => p.size === size && p.complexity === complexity);
  if (list.length === 0) throw new Error(`acervo sem frases para ${size}/${complexity}`);
  return rng.pick(list);
}

function wordsText(data: ContentData, size: Size, complexity: Complexity, rng: Rng): string {
  const { easy, medium, hard } = data.words;
  const draw = (): string => {
    if (complexity === 'easy') return rng.pick(easy);
    if (complexity === 'medium') return rng.int(100) < 40 ? rng.pick(easy) : rng.pick(medium);
    return rng.int(100) < 30 ? rng.pick(medium) : rng.pick(hard);
  };
  const out: string[] = [];
  for (let i = 0; i < WORD_COUNT[size]; i++) {
    let w = draw();
    if (w === out[out.length - 1]) w = draw();
    out.push(w);
  }
  return out.join(' ');
}

function alphabetText(size: Size, complexity: Complexity, rng: Rng): string {
  const parts: string[] = [];
  for (let i = 0; i < ALPHABET_REPS[size]; i++) {
    if (complexity === 'easy') parts.push(LETTERS.join(''));
    else if (complexity === 'medium') parts.push(LETTERS.join(' '));
    else parts.push(rng.shuffle(LETTERS).join(''));
  }
  return parts.join(' ');
}

function numberToken(complexity: Complexity, rng: Rng): string {
  if (complexity === 'easy') return String(digitsNumber(rng, rng.range(1, 3)));
  if (complexity === 'medium') {
    const c = rng.int(10);
    if (c < 6) return String(digitsNumber(rng, rng.range(2, 5)));
    if (c < 8) {
      const decimals = rng.range(1, 2);
      return `${rng.range(0, 999)},${pad(rng.range(0, 10 ** decimals - 1), decimals)}`;
    }
    return formatInt(rng.range(1000, 99999));
  }
  switch (rng.int(8)) {
    case 0:
      return `R$ ${formatMoney(rng.range(100, 999999))}`;
    case 1: {
      const v = rng.range(1, 999);
      return `${Math.floor(v / 10)},${v % 10}%`;
    }
    case 2:
      return `-${rng.range(1, 9999)}`;
    case 3:
      return `+${rng.range(1, 999)}`;
    case 4:
      return `${rng.range(1, 9)}/${rng.range(2, 12)}`;
    case 5:
      return `${pad(rng.range(0, 23), 2)}h${pad(rng.range(0, 59), 2)}`;
    case 6:
      return `${pad(rng.range(1, 28), 2)}/${pad(rng.range(1, 12), 2)}/${rng.range(1990, 2035)}`;
    default:
      return formatInt(rng.range(10000, 9999999));
  }
}

function numbersText(size: Size, complexity: Complexity, rng: Rng): string {
  const out: string[] = [];
  for (let i = 0; i < NUMBER_COUNT[size]; i++) out.push(numberToken(complexity, rng));
  return out.join(' ');
}

function numpadTerm(rng: Rng): string {
  if (rng.int(3) === 0) return `${rng.range(0, 999)},${pad(rng.range(0, 99), 2)}`;
  return String(rng.range(1, 9999));
}

function numpadLine(complexity: Complexity, rng: Rng): string {
  if (complexity === 'easy') return String(digitsNumber(rng, rng.range(1, 4)));
  if (complexity === 'medium') {
    const c = rng.int(10);
    if (c < 5) return `${rng.range(0, 9999)},${pad(rng.range(0, 99), 2)}`;
    if (c < 8) return String(rng.range(10, 99999));
    return `${rng.range(1, 999)}+${rng.range(1, 999)}`;
  }
  const terms = rng.range(2, 4);
  let line = numpadTerm(rng);
  for (let i = 1; i < terms; i++) line += rng.pick(OPERATORS) + numpadTerm(rng);
  return line;
}

function numpadText(size: Size, complexity: Complexity, rng: Rng): string {
  const out: string[] = [];
  for (let i = 0; i < NUMPAD_LINES[size]; i++) out.push(numpadLine(complexity, rng));
  return out.join('\n');
}

const dateText = (rng: Rng, from: number, to: number): string =>
  `${pad(rng.range(1, 28), 2)}/${pad(rng.range(1, 12), 2)}/${rng.range(from, to)}`;

function dataLine(complexity: Complexity, rng: Rng): string {
  if (complexity === 'easy') {
    const code = rng.range(1000, 9999);
    const q = rng.range(1, 20);
    const unit = rng.pick(UNITS);
    const city = rng.pick(CITIES);
    return `Pedido ${code}, ${q} ${q === 1 ? unit[0] : unit[1]}, ${city[0]}`;
  }
  if (complexity === 'medium') {
    const code = rng.range(1000, 9999);
    const date = dateText(rng, 2024, 2027);
    const item = rng.pick(ITEMS);
    const q = rng.range(1, 48);
    const cents = rng.range(990, 499999);
    const city = rng.pick(CITIES);
    return `${code}; ${date}; ${item}; ${q} un.; R$ ${formatMoney(cents)}; ${city[0]}/${city[1]}`;
  }
  const nf = `${pad(rng.range(0, 999), 3)}.${pad(rng.range(0, 999), 3)}-${rng.range(0, 9)}`;
  const date = dateText(rng, 2024, 2027);
  const time = `${pad(rng.range(0, 23), 2)}:${pad(rng.range(0, 59), 2)}`;
  const sku = `${rng.pick(LETTERS).toUpperCase()}${rng.pick(LETTERS).toUpperCase()}-${rng.range(1000, 9999)}`;
  const q = rng.range(2, 12);
  const unit = rng.range(150, 99999);
  const cep = `${pad(rng.range(1000, 99999), 5)}-${pad(rng.range(0, 999), 3)}`;
  const mail = `${rng.pick(SECTORS)}@exemplo.com.br`;
  return `NF ${nf}; ${date} ${time}; SKU ${sku}; ${q} x R$ ${formatMoney(unit)} = R$ ${formatMoney(q * unit)}; CEP ${cep}; ${mail}`;
}

function dataText(size: Size, complexity: Complexity, rng: Rng): string {
  const out: string[] = [];
  for (let i = 0; i < DATA_LINES[complexity][size]; i++) out.push(dataLine(complexity, rng));
  return out.join('\n');
}

const letters = (rng: Rng, n: number, mixedCase: boolean): string => {
  let out = '';
  for (let i = 0; i < n; i++) {
    const c = rng.pick(LETTERS);
    out += mixedCase && rng.int(2) === 1 ? c.toUpperCase() : c;
  }
  return out;
};

const capitalize = (w: string): string => (w ? (w[0] as string).toUpperCase() + w.slice(1) : w);

function mixedToken(data: ContentData, complexity: Complexity, rng: Rng): string {
  const { easy, medium, hard, sounds } = data.words;
  const r = rng.int(100);
  if (complexity === 'easy') {
    if (r < 35) return rng.pick(easy);
    if (r < 60) return rng.pick(sounds);
    if (r < 80) return String(digitsNumber(rng, rng.range(1, 3)));
    return letters(rng, rng.range(2, 4), false);
  }
  if (complexity === 'medium') {
    if (r < 25) return rng.pick(medium);
    if (r < 45) return rng.pick(sounds) + rng.pick(['', '', '!', '...', '?']);
    if (r < 65) return numberToken('medium', rng);
    if (r < 80) return capitalize(rng.pick(easy));
    if (r < 90) return letters(rng, rng.range(3, 5), true);
    return rng.pick(medium) + rng.pick([',', '.', ';', ':']);
  }
  if (r < 20) return rng.pick(hard);
  if (r < 35) {
    const s = rng.pick(sounds);
    switch (rng.int(5)) {
      case 0:
        return `${s.toUpperCase()}!`;
      case 1:
        return `"${s}"`;
      case 2:
        return `(${s})`;
      case 3:
        return `${s}...`;
      default:
        return `${s}?!`;
    }
  }
  if (r < 55) return numberToken('hard', rng);
  if (r < 65) return rng.pick(SYMBOLS) + rng.pick(easy);
  if (r < 75) return letters(rng, rng.range(3, 6), true);
  if (r < 85) return rng.pick(medium) + rng.pick([',', ';', ':', '.', '!', '?']);
  if (r < 96) {
    const [open, close] = rng.pick(BRACKETS);
    return `${open}${rng.int(2) === 0 ? rng.range(1, 999) : rng.pick(easy)}${close}`;
  }
  return `${rng.pick(SECTORS)}@exemplo.com.br`;
}

function mixedText(data: ContentData, size: Size, complexity: Complexity, rng: Rng): string {
  const out: string[] = [];
  for (let i = 0; i < MIXED_COUNT[size]; i++) {
    let t = mixedToken(data, complexity, rng);
    if (t === out[out.length - 1]) t = mixedToken(data, complexity, rng);
    out.push(t);
  }
  return out.join(' ');
}

export const isKind = (v: unknown): v is Kind => (KINDS as readonly unknown[]).includes(v);
export const isSize = (v: unknown): v is Size => (SIZES as readonly unknown[]).includes(v);
export const isComplexity = (v: unknown): v is Complexity => (COMPLEXITIES as readonly unknown[]).includes(v);

export function generate(data: ContentData, req: Request): Generated {
  const { kind, size, complexity } = req;
  if (!isKind(kind) || kind === 'custom') throw new Error(`tipo inválido: ${kind}`);
  if (!isSize(size)) throw new Error(`tamanho inválido: ${size}`);
  if (!isComplexity(complexity)) throw new Error(`complexidade inválida: ${complexity}`);
  const seed = req.seed >>> 0;
  const rng = new Rng(seed);
  const base = { kind, size, complexity, seed, phraseId: null };
  switch (kind) {
    case 'text': {
      const p = phraseFor(data, size, complexity, rng);
      return { ...base, phraseId: p.id, text: p.text };
    }
    case 'no-accents': {
      const p = phraseFor(data, size, complexity, rng);
      return { ...base, phraseId: p.id, text: stripAccents(p.text) };
    }
    case 'words':
      return { ...base, text: wordsText(data, size, complexity, rng) };
    case 'alphabet':
      return { ...base, text: alphabetText(size, complexity, rng) };
    case 'numbers':
      return { ...base, text: numbersText(size, complexity, rng) };
    case 'numpad':
      return { ...base, text: numpadText(size, complexity, rng) };
    case 'mixed':
      return { ...base, text: mixedText(data, size, complexity, rng) };
    default:
      return { ...base, text: dataText(size, complexity, rng) };
  }
}

const TYPO: readonly (readonly [RegExp, string])[] = [
  [/\r\n?/g, '\n'],
  [/[\t\u000b\u000c]/g, ' '],
  [/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, ' '],
  [/[\u200b-\u200d\u2060\ufeff\u00ad]/g, ''],
  [/[\u201c\u201d\u201e\u201f\u00ab\u00bb\u2033\u02dd]/g, '"'],
  [/[\u2018\u2019\u201a\u201b\u2032\u00b4\u02bc]/g, "'"],
  [/[\u2039]/g, '<'],
  [/[\u203a]/g, '>'],
  [/[\u2010-\u2015\u2212\u2e3a\u2e3b\ufe58\ufe63\uff0d]/g, '-'],
  [/\u2026/g, '...'],
  [/\ufb00/g, 'ff'],
  [/\ufb01/g, 'fi'],
  [/\ufb02/g, 'fl'],
  [/\ufb03/g, 'ffi'],
  [/\ufb04/g, 'ffl'],
  [/[\ufb05\ufb06]/g, 'st'],
  [/^[ ]*[\u2022\u2023\u2043\u204c\u204d\u2219\u25aa\u25ab\u25cf\u25cb\u25e6\u25a0\u25a1\u25b6\u25ba\u27a2\u2794\u2713\u2714\u2717\u2718\ue000-\uf8ff][ ]*/gm, '- '],
  [/[\u2022\u2023\u2219\u25aa\u25cf\u25e6\u25a0]/g, '-'],
  [/\u00d7/g, 'x'],
  [/\u00f7/g, '/'],
  [/\u00b1/g, '+/-'],
  [/[\u2192\u27f6\u2794]/g, '->'],
  [/[\u2190\u27f5]/g, '<-'],
  [/[\u21d2\u27f9]/g, '=>'],
  [/\u2264/g, '<='],
  [/\u2265/g, '>='],
  [/\u2260/g, '!='],
  [/\u00bd/g, '1/2'],
  [/\u00bc/g, '1/4'],
  [/\u00be/g, '3/4'],
  [/\u00a9/g, '(c)'],
  [/\u00ae/g, '(r)'],
  [/\u2122/g, '(tm)'],
  [/\u2030/g, '%'],
  [/[\u00b7\u2027]/g, '.'],
];

const KEEP = /[\n -~\u00c0-\u00c4\u00c7-\u00cf\u00d1-\u00d6\u00d9-\u00dd\u00e0-\u00e4\u00e7-\u00ef\u00f1-\u00f6\u00f9-\u00fd\u00ff\u00aa\u00ba\u00b0\u00a7\u00a3\u00a2\u00ac\u00b9\u00b2\u00b3\u20ac]/u;

export interface Adapted {
  text: string;
  removed: number;
  truncated: boolean;
}

export function adaptForTyping(raw: unknown): Adapted {
  let text = String(raw ?? '').normalize('NFC');
  for (const [re, to] of TYPO) text = text.replace(re, to);
  let removed = 0;
  text = Array.from(text)
    .filter((c) => {
      if (KEEP.test(c)) return true;
      if (c.trim() !== '') removed++;
      return false;
    })
    .join('');
  text = text
    .split('\n')
    .map((l) => l.replace(/ {2,}/g, ' ').trim())
    .filter((l) => l !== '')
    .join('\n');
  const chars = Array.from(text);
  const truncated = chars.length > MAX_CUSTOM_CHARS;
  if (truncated) text = chars.slice(0, MAX_CUSTOM_CHARS).join('').trimEnd();
  return { text, removed, truncated };
}

export const normalizeCustom = (raw: unknown): string => adaptForTyping(raw).text;

export const PART_TARGET: Record<Size, number> = { short: 160, medium: 420, long: 900 };

function wrapWords(sentence: string, target: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of sentence.split(' ')) {
    if (cur && cur.length + 1 + w.length > target) {
      out.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out;
}

export function splitParts(text: string, size: Size): string[] {
  const target = PART_TARGET[size];
  const clean = normalizeCustom(text);
  if (!clean) return [];
  if (Array.from(clean).length <= target * 1.25) return [clean];
  const parts: string[] = [];
  let cur = '';
  for (const para of clean.split('\n')) {
    let first = true;
    for (const sentence of para.split(/(?<=[.!?]["')\]]?)\s+/)) {
      if (!sentence) continue;
      const pieces = sentence.length > target ? wrapWords(sentence, target) : [sentence];
      for (const piece of pieces) {
        const sep = cur ? (first ? '\n' : ' ') : '';
        if (cur && cur.length + sep.length + piece.length > target) {
          parts.push(cur);
          cur = piece;
        } else cur += sep + piece;
        first = false;
      }
    }
  }
  if (cur) parts.push(cur);
  return parts;
}
