import { DocumentError, concat, inflate } from './binary.ts';

interface Name {
  k: 'n';
  v: string;
}
interface Str {
  k: 's';
  v: Uint8Array;
}
interface Ref {
  k: 'r';
  n: number;
}
interface Dict {
  k: 'd';
  v: Map<string, Val>;
}
interface Stream {
  k: 'st';
  dict: Dict;
  raw: Uint8Array;
}
type Val = null | boolean | number | Name | Str | Ref | Val[] | Dict | Stream;

type Token =
  | { t: 'num'; v: number }
  | { t: 'name'; v: string }
  | { t: 'str'; v: Uint8Array }
  | { t: 'kw'; v: string }
  | { t: 'p'; v: string }
  | { t: 'eof' };

const isWs = (c: number) => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
const isDelim = (c: number) => c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;
const hexVal = (c: number) => (c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1);

class Lexer {
  bytes: Uint8Array;
  pos: number;

  constructor(bytes: Uint8Array, pos = 0) {
    this.bytes = bytes;
    this.pos = pos;
  }

  skip() {
    const b = this.bytes;
    while (this.pos < b.length) {
      const c = b[this.pos] as number;
      if (isWs(c)) this.pos++;
      else if (c === 37) {
        while (this.pos < b.length && b[this.pos] !== 10 && b[this.pos] !== 13) this.pos++;
      } else break;
    }
  }

  next(): Token {
    this.skip();
    const b = this.bytes;
    if (this.pos >= b.length) return { t: 'eof' };
    const c = b[this.pos] as number;
    if (c === 47) {
      this.pos++;
      let name = '';
      while (this.pos < b.length) {
        const d = b[this.pos] as number;
        if (isWs(d) || isDelim(d)) break;
        if (d === 35 && this.pos + 2 < b.length) {
          const h = hexVal(b[this.pos + 1] as number) * 16 + hexVal(b[this.pos + 2] as number);
          if (h >= 0) {
            name += String.fromCharCode(h);
            this.pos += 3;
            continue;
          }
        }
        name += String.fromCharCode(d);
        this.pos++;
      }
      return { t: 'name', v: name };
    }
    if (c === 40) return { t: 'str', v: this.literal() };
    if (c === 60) {
      if (b[this.pos + 1] === 60) {
        this.pos += 2;
        return { t: 'p', v: '<<' };
      }
      return { t: 'str', v: this.hex() };
    }
    if (c === 62) {
      this.pos += b[this.pos + 1] === 62 ? 2 : 1;
      return { t: 'p', v: '>>' };
    }
    if (c === 91 || c === 93 || c === 123 || c === 125) {
      this.pos++;
      return { t: 'p', v: String.fromCharCode(c) };
    }
    if ((c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46) {
      const start = this.pos;
      this.pos++;
      while (this.pos < b.length) {
        const d = b[this.pos] as number;
        if ((d >= 48 && d <= 57) || d === 46) this.pos++;
        else break;
      }
      let s = '';
      for (let i = start; i < this.pos; i++) s += String.fromCharCode(b[i] as number);
      const v = parseFloat(s);
      return { t: 'num', v: Number.isFinite(v) ? v : 0 };
    }
    const start = this.pos;
    while (this.pos < b.length && !isWs(b[this.pos] as number) && !isDelim(b[this.pos] as number)) this.pos++;
    if (this.pos === start) this.pos++;
    let s = '';
    for (let i = start; i < this.pos; i++) s += String.fromCharCode(b[i] as number);
    return { t: 'kw', v: s };
  }

  private literal(): Uint8Array {
    const b = this.bytes;
    const out: number[] = [];
    let depth = 1;
    this.pos++;
    while (this.pos < b.length) {
      let c = b[this.pos++] as number;
      if (c === 92) {
        c = b[this.pos++] as number;
        if (c === 110) out.push(10);
        else if (c === 114) out.push(13);
        else if (c === 116) out.push(9);
        else if (c === 98) out.push(8);
        else if (c === 102) out.push(12);
        else if (c === 13) {
          if (b[this.pos] === 10) this.pos++;
        } else if (c === 10) continue;
        else if (c >= 48 && c <= 55) {
          let v = c - 48;
          for (let i = 0; i < 2 && (b[this.pos] as number) >= 48 && (b[this.pos] as number) <= 55; i++) v = v * 8 + ((b[this.pos++] as number) - 48);
          out.push(v & 255);
        } else out.push(c);
        continue;
      }
      if (c === 40) depth++;
      else if (c === 41 && --depth === 0) break;
      out.push(c);
    }
    return Uint8Array.from(out);
  }

  private hex(): Uint8Array {
    const b = this.bytes;
    const out: number[] = [];
    let hi = -1;
    this.pos++;
    while (this.pos < b.length) {
      const c = b[this.pos++] as number;
      if (c === 62) break;
      const v = hexVal(c);
      if (v < 0) continue;
      if (hi < 0) hi = v;
      else {
        out.push(hi * 16 + v);
        hi = -1;
      }
    }
    if (hi >= 0) out.push(hi * 16);
    return Uint8Array.from(out);
  }
}

function parseValue(lx: Lexer, first?: Token): Val | Token {
  const tok = first ?? lx.next();
  if (tok.t === 'num') {
    const save = lx.pos;
    const a = lx.next();
    if (a.t === 'num' && Number.isInteger(tok.v) && Number.isInteger(a.v)) {
      const r = lx.next();
      if (r.t === 'kw' && r.v === 'R') return { k: 'r', n: tok.v };
    }
    lx.pos = save;
    return tok.v;
  }
  if (tok.t === 'name') return { k: 'n', v: tok.v };
  if (tok.t === 'str') return { k: 's', v: tok.v };
  if (tok.t === 'p' && tok.v === '[') {
    const arr: Val[] = [];
    for (let guard = 0; guard < 1_000_000; guard++) {
      const t = lx.next();
      if (t.t === 'eof' || (t.t === 'p' && t.v === ']')) break;
      const v = parseValue(lx, t);
      if (isToken(v)) {
        if (v.t === 'kw' && (v.v === 'true' || v.v === 'false')) arr.push(v.v === 'true');
        else if (v.t === 'kw' && v.v === 'null') arr.push(null);
        continue;
      }
      arr.push(v);
    }
    return arr;
  }
  if (tok.t === 'p' && tok.v === '<<') {
    const map = new Map<string, Val>();
    for (let guard = 0; guard < 100_000; guard++) {
      const key = lx.next();
      if (key.t === 'eof' || (key.t === 'p' && key.v === '>>')) break;
      if (key.t !== 'name') continue;
      const v = parseValue(lx);
      if (isToken(v)) {
        if (v.t === 'kw' && (v.v === 'true' || v.v === 'false')) map.set(key.v, v.v === 'true');
        else if (v.t === 'kw' && v.v === 'null') map.set(key.v, null);
        else if (v.t === 'p' && v.v === '>>') break;
        continue;
      }
      map.set(key.v, v);
    }
    return { k: 'd', v: map };
  }
  return tok;
}

function isToken(v: Val | Token): v is Token {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && 't' in v;
}

const isDict = (v: Val | undefined): v is Dict => !!v && typeof v === 'object' && !Array.isArray(v) && v.k === 'd';
const isStream = (v: Val | undefined): v is Stream => !!v && typeof v === 'object' && !Array.isArray(v) && v.k === 'st';
const isName = (v: Val | undefined): v is Name => !!v && typeof v === 'object' && !Array.isArray(v) && v.k === 'n';
const dictOf = (v: Val | undefined): Dict | null => (isDict(v) ? v : isStream(v) ? v.dict : null);

class Doc {
  bytes: Uint8Array;
  objects = new Map<number, Val>();
  private depth = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  resolve(v: Val | undefined): Val | undefined {
    let cur = v;
    for (let i = 0; i < 16 && cur && typeof cur === 'object' && !Array.isArray(cur) && cur.k === 'r'; i++) cur = this.objects.get(cur.n);
    return cur;
  }

  get(d: Dict | null, key: string): Val | undefined {
    return d ? this.resolve(d.v.get(key)) : undefined;
  }

  num(d: Dict | null, key: string, fallback: number): number {
    const v = this.get(d, key);
    return typeof v === 'number' ? v : fallback;
  }

  scan() {
    const b = this.bytes;
    let text = '';
    const CHUNK = 1 << 16;
    for (let i = 0; i < b.length; i += CHUNK) text += String.fromCharCode(...b.subarray(i, Math.min(b.length, i + CHUNK)));
    if (/\/Encrypt\s+\d+\s+\d+\s+R/.test(text) || /\/Encrypt\s*<</.test(text)) throw new DocumentError('este PDF está protegido ou criptografado');
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    let skipUntil = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index < skipUntil) continue;
      const num = Number(m[1]);
      const lx = new Lexer(b, m.index + m[0].length);
      let v: Val | Token;
      try {
        v = parseValue(lx);
      } catch {
        continue;
      }
      if (isToken(v)) continue;
      if (isDict(v)) {
        lx.skip();
        if (text.startsWith('stream', lx.pos)) {
          let start = lx.pos + 6;
          if (b[start] === 13) start++;
          if (b[start] === 10) start++;
          let end = -1;
          const len = this.resolve(v.v.get('Length'));
          if (typeof len === 'number' && len >= 0 && start + len <= b.length) {
            const after = text.slice(start + len, start + len + 12);
            if (/^\s*endstream/.test(after)) end = start + len;
          }
          if (end < 0) {
            const found = text.indexOf('endstream', start);
            end = found < 0 ? b.length : found;
            while (end > start && (b[end - 1] === 10 || b[end - 1] === 13)) end--;
          }
          this.objects.set(num, { k: 'st', dict: v, raw: b.subarray(start, end) });
          skipUntil = end;
          re.lastIndex = Math.max(re.lastIndex, end);
          continue;
        }
      }
      this.objects.set(num, v);
    }
  }

  async expandObjectStreams() {
    for (const v of [...this.objects.values()]) {
      if (!isStream(v) || !isName(this.get(v.dict, 'Type')) || (this.get(v.dict, 'Type') as Name).v !== 'ObjStm') continue;
      const data = await this.decode(v);
      if (!data) continue;
      const n = this.num(v.dict, 'N', 0);
      const first = this.num(v.dict, 'First', 0);
      const lx = new Lexer(data);
      const pairs: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const a = lx.next();
        const o = lx.next();
        if (a.t !== 'num' || o.t !== 'num') break;
        pairs.push([a.v, o.v]);
      }
      for (const [num, off] of pairs) {
        if (this.objects.has(num)) continue;
        const val = parseValue(new Lexer(data, first + off));
        if (!isToken(val)) this.objects.set(num, val);
      }
    }
  }

  async decode(s: Stream): Promise<Uint8Array | null> {
    let data: Uint8Array = s.raw;
    const f = this.get(s.dict, 'Filter');
    const filters = (Array.isArray(f) ? f : f ? [f] : []).map((x) => this.resolve(x)).filter(isName).map((x) => x.v);
    for (const name of filters) {
      if (name === 'FlateDecode' || name === 'Fl') data = await inflate(data);
      else if (name === 'ASCIIHexDecode' || name === 'AHx') data = asciiHex(data);
      else if (name === 'ASCII85Decode' || name === 'A85') data = ascii85(data);
      else if (name === 'LZWDecode' || name === 'LZW') data = lzw(data);
      else return null;
    }
    return data;
  }

  pages(): { dict: Dict; resources: Dict | null }[] {
    const out: { dict: Dict; resources: Dict | null }[] = [];
    let catalog: Dict | null = null;
    for (const v of this.objects.values()) {
      const d = dictOf(v);
      const t = this.get(d, 'Type');
      if (d && isName(t) && t.v === 'Catalog') catalog = d;
    }
    const seen = new Set<Dict>();
    const walk = (node: Val | undefined, inherited: Dict | null, depth: number) => {
      const d = dictOf(node);
      if (!d || seen.has(d) || depth > 64) return;
      seen.add(d);
      const res = dictOf(this.get(d, 'Resources')) ?? inherited;
      const kids = this.get(d, 'Kids');
      if (Array.isArray(kids)) for (const k of kids) walk(this.resolve(k), res, depth + 1);
      else {
        const t = this.get(d, 'Type');
        if (!t || (isName(t) && t.v === 'Page')) out.push({ dict: d, resources: res });
      }
    };
    if (catalog) walk(this.get(catalog, 'Pages'), null, 0);
    if (!out.length) {
      const nums = [...this.objects.keys()].sort((a, b) => a - b);
      for (const n of nums) {
        const d = dictOf(this.objects.get(n));
        const t = this.get(d, 'Type');
        if (d && isName(t) && t.v === 'Page') out.push({ dict: d, resources: dictOf(this.get(d, 'Resources')) });
      }
    }
    return out;
  }

  async contents(page: Dict): Promise<Uint8Array> {
    const c = this.get(page, 'Contents');
    const list = Array.isArray(c) ? c.map((x) => this.resolve(x)) : [c];
    const parts: Uint8Array[] = [];
    for (const s of list) {
      if (!isStream(s)) continue;
      const data = await this.decode(s);
      if (data) parts.push(data, Uint8Array.of(10));
    }
    return concat(parts);
  }

  enter(): boolean {
    if (this.depth > 6) return false;
    this.depth++;
    return true;
  }

  leave() {
    this.depth--;
  }
}

function asciiHex(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let hi = -1;
  for (const c of data) {
    if (c === 62) break;
    const v = hexVal(c);
    if (v < 0) continue;
    if (hi < 0) hi = v;
    else {
      out.push(hi * 16 + v);
      hi = -1;
    }
  }
  if (hi >= 0) out.push(hi * 16);
  return Uint8Array.from(out);
}

function ascii85(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  const group: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const c = data[i] as number;
    if (c === 126) break;
    if (isWs(c)) continue;
    if (c === 122 && group.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    if (c < 33 || c > 117) continue;
    group.push(c - 33);
    if (group.length === 5) {
      let v = 0;
      for (const g of group) v = v * 85 + g;
      out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
      group.length = 0;
    }
  }
  if (group.length > 1) {
    const n = group.length;
    while (group.length < 5) group.push(84);
    let v = 0;
    for (const g of group) v = v * 85 + g;
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    out.push(...bytes.slice(0, n - 1));
  }
  return Uint8Array.from(out);
}

function lzw(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let dict: number[][] = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < 256; i++) dict.push([i]);
    dict.push([], []);
  };
  reset();
  let bits = 9;
  let buf = 0;
  let count = 0;
  let prev: number[] | null = null;
  for (const byte of data) {
    buf = (buf << 8) | byte;
    count += 8;
    while (count >= bits) {
      const code = (buf >>> (count - bits)) & ((1 << bits) - 1);
      count -= bits;
      if (code === 256) {
        reset();
        bits = 9;
        prev = null;
        continue;
      }
      if (code === 257) return Uint8Array.from(out);
      let entry: number[];
      if (code < dict.length) entry = dict[code] as number[];
      else if (prev) entry = [...prev, prev[0] as number];
      else break;
      out.push(...entry);
      if (prev) dict.push([...prev, entry[0] as number]);
      prev = entry;
      if (dict.length + 1 >= 1 << bits && bits < 12) bits++;
    }
  }
  return Uint8Array.from(out);
}

const MARKS: Record<string, string> = {
  acute: '\u0301',
  grave: '\u0300',
  circumflex: '\u0302',
  tilde: '\u0303',
  dieresis: '\u0308',
  cedilla: '\u0327',
  caron: '\u030c',
  ring: '\u030a',
};

const GLYPHS: Record<string, string> = {
  space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%', ampersand: '&', quotesingle: "'",
  parenleft: '(', parenright: ')', asterisk: '*', plus: '+', comma: ',', hyphen: '-', period: '.', slash: '/', colon: ':',
  semicolon: ';', less: '<', equal: '=', greater: '>', question: '?', at: '@', bracketleft: '[', backslash: '\\', bracketright: ']',
  asciicircum: '^', underscore: '_', grave: '`', braceleft: '{', bar: '|', braceright: '}', asciitilde: '~', quoteleft: '‘',
  quoteright: '’', quotedblleft: '“', quotedblright: '”', quotesinglbase: '‚', quotedblbase: '„',
  endash: '–', emdash: '—', bullet: '•', ellipsis: '…', guillemotleft: '«', guillemotright: '»',
  ordfeminine: 'ª', ordmasculine: 'º', degree: '°', section: '§', paragraph: '¶', copyright: '©',
  registered: '®', trademark: '™', Euro: '€', sterling: '£', cent: '¢', yen: '¥', nbspace: ' ',
  sfthyphen: '', fi: 'fi', fl: 'fl', ff: 'ff', ffi: 'ffi', ffl: 'ffl', dotlessi: 'i', germandbls: 'ß', ae: 'æ', AE: 'Æ',
  oe: 'œ', OE: 'Œ', oslash: 'ø', Oslash: 'Ø', multiply: '×', divide: '÷', plusminus: '±',
  minus: '-', periodcentered: '·', exclamdown: '¡', questiondown: '¿', dagger: '†', daggerdbl: '‡',
  perthousand: '‰', zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  onesuperior: '¹', twosuperior: '²', threesuperior: '³', onehalf: '½', onequarter: '¼', threequarters: '¾',
};

function glyphChar(name: string): string | undefined {
  const base = name.split('.')[0] ?? name;
  if (GLYPHS[base] !== undefined) return GLYPHS[base];
  if (/^[A-Za-z]$/.test(base)) return base;
  const uni = /^uni([0-9A-Fa-f]{4,6})$/.exec(base) ?? /^u([0-9A-Fa-f]{4,6})$/.exec(base);
  if (uni) return String.fromCodePoint(parseInt(uni[1] as string, 16));
  const acc = /^([A-Za-z])(acute|grave|circumflex|tilde|dieresis|cedilla|caron|ring)$/.exec(base);
  if (acc) return ((acc[1] as string) + MARKS[acc[2] as string]).normalize('NFC');
  return undefined;
}

interface Font {
  bytesPerCode: number;
  map: Map<number, string>;
  fallback: (code: number) => string;
  width: (code: number) => number;
}

const cp1252 = new TextDecoder('windows-1252');
const winAnsi = (code: number) => (code < 32 ? '' : cp1252.decode(Uint8Array.of(code)));

function parseCMap(data: Uint8Array, map: Map<number, string>): number {
  const lx = new Lexer(data);
  const utf16 = (bytes: Uint8Array) => {
    let s = '';
    for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode(((bytes[i] as number) << 8) | (bytes[i + 1] as number));
    if (bytes.length % 2 === 1) s += String.fromCharCode(bytes[bytes.length - 1] as number);
    return s;
  };
  const code = (bytes: Uint8Array) => {
    let v = 0;
    for (const x of bytes) v = v * 256 + x;
    return v;
  };
  let codeLength = 0;
  const stack: Token[] = [];
  for (let guard = 0; guard < 2_000_000; guard++) {
    const t = lx.next();
    if (t.t === 'eof') break;
    if (t.t === 'kw' && t.v === 'endcodespacerange') {
      for (const s of stack) if (s.t === 'str') codeLength = Math.max(codeLength, s.v.length);
      stack.length = 0;
    } else if (t.t === 'kw' && t.v === 'endbfchar') {
      for (let i = 0; i + 1 < stack.length; i += 2) {
        const a = stack[i] as Token;
        const b = stack[i + 1] as Token;
        if (a.t === 'str' && b.t === 'str') map.set(code(a.v), utf16(b.v));
      }
      stack.length = 0;
    } else if (t.t === 'kw' && t.v === 'endbfrange') {
      stack.length = 0;
    } else if (t.t === 'kw' && t.v === 'beginbfrange') {
      stack.length = 0;
      for (let g = 0; g < 100_000; g++) {
        const lo = lx.next();
        if (lo.t === 'kw' && lo.v === 'endbfrange') break;
        if (lo.t === 'eof') break;
        const hi = lx.next();
        const dst = parseValue(lx);
        if (lo.t !== 'str' || hi.t !== 'str') continue;
        const a = code(lo.v);
        const b = Math.min(code(hi.v), a + 65535);
        if (Array.isArray(dst)) {
          dst.forEach((d, i) => {
            if (d && typeof d === 'object' && !Array.isArray(d) && d.k === 's') map.set(a + i, utf16(d.v));
          });
        } else if (dst && typeof dst === 'object' && !Array.isArray(dst) && 'k' in dst && dst.k === 's') {
          const base = dst.v;
          for (let c = a; c <= b; c++) {
            const bytes = base.slice();
            let carry = c - a;
            for (let i = bytes.length - 1; i >= 0 && carry > 0; i--) {
              const sum = (bytes[i] as number) + carry;
              bytes[i] = sum & 255;
              carry = sum >> 8;
            }
            map.set(c, utf16(bytes));
          }
        }
      }
    } else if (t.t === 'kw' && (t.v === 'begincodespacerange' || t.v === 'beginbfchar')) {
      stack.length = 0;
    } else if (t.t === 'str') {
      stack.push(t);
    }
  }
  return codeLength;
}

async function loadFont(doc: Doc, fontDict: Dict): Promise<Font> {
  const subtype = doc.get(fontDict, 'Subtype');
  const type0 = isName(subtype) && subtype.v === 'Type0';
  const map = new Map<number, string>();
  let codeLength = 0;
  const tu = doc.get(fontDict, 'ToUnicode');
  if (isStream(tu)) {
    const data = await doc.decode(tu);
    if (data) codeLength = parseCMap(data, map);
  }
  const bytesPerCode = type0 ? (codeLength || 2) : 1;
  let fallback: (code: number) => string = winAnsi;
  if (type0) fallback = () => '';
  const enc = doc.get(fontDict, 'Encoding');
  const encDict = dictOf(enc);
  const encName = isName(enc) ? enc.v : isName(doc.get(encDict, 'BaseEncoding')) ? (doc.get(encDict, 'BaseEncoding') as Name).v : '';
  if (!type0 && encName === 'MacRomanEncoding') {
    try {
      const mac = new TextDecoder('macintosh');
      fallback = (c) => (c < 32 ? '' : mac.decode(Uint8Array.of(c)));
    } catch {
      fallback = winAnsi;
    }
  }
  const diffs = doc.get(encDict, 'Differences');
  if (!type0 && Array.isArray(diffs)) {
    const custom = new Map<number, string>();
    let code = 0;
    for (const d of diffs) {
      const v = doc.resolve(d);
      if (typeof v === 'number') code = v;
      else if (isName(v)) {
        const ch = glyphChar(v.v);
        if (ch !== undefined) custom.set(code, ch);
        code++;
      }
    }
    const base = fallback;
    fallback = (c) => custom.get(c) ?? base(c);
  }
  let width: (code: number) => number = () => 500;
  if (type0) {
    const desc = doc.get(fontDict, 'DescendantFonts');
    const cid = dictOf(Array.isArray(desc) ? doc.resolve(desc[0]) : desc);
    const dw = doc.num(cid, 'DW', 1000);
    const widths = new Map<number, number>();
    const w = doc.get(cid, 'W');
    if (Array.isArray(w)) {
      for (let i = 0; i < w.length; ) {
        const first = doc.resolve(w[i]);
        const next = doc.resolve(w[i + 1]);
        if (typeof first !== 'number') break;
        if (Array.isArray(next)) {
          next.forEach((x, j) => {
            const v = doc.resolve(x);
            if (typeof v === 'number') widths.set(first + j, v);
          });
          i += 2;
        } else {
          const last = next;
          const v = doc.resolve(w[i + 2]);
          if (typeof last === 'number' && typeof v === 'number') for (let c = first; c <= last && c - first < 65536; c++) widths.set(c, v);
          i += 3;
        }
      }
    }
    width = (c) => widths.get(c) ?? dw;
  } else {
    const firstChar = doc.num(fontDict, 'FirstChar', 0);
    const ws = doc.get(fontDict, 'Widths');
    const desc = dictOf(doc.get(fontDict, 'FontDescriptor'));
    const missing = doc.num(desc, 'MissingWidth', 500);
    if (Array.isArray(ws)) {
      const arr = ws.map((x) => doc.resolve(x));
      width = (c) => {
        const v = arr[c - firstChar];
        return typeof v === 'number' ? v : missing;
      };
    }
  }
  return { bytesPerCode, map, fallback, width };
}

type Matrix = [number, number, number, number, number, number];
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];
const ID: Matrix = [1, 0, 0, 1, 0, 0];

interface Glyph {
  ch: string;
  x: number;
  y: number;
  w: number;
  size: number;
}

const MAX_GLYPHS = 2_000_000;

async function runContent(doc: Doc, data: Uint8Array, resources: Dict | null, ctm0: Matrix, glyphs: Glyph[], fonts: Map<Dict, Font>) {
  if (!doc.enter()) return;
  try {
    const lx = new Lexer(data);
    const ops: (Val | Token)[] = [];
    let ctm: Matrix = ctm0;
    const stack: Matrix[] = [];
    let tm: Matrix = ID;
    let tlm: Matrix = ID;
    let font: Font | null = null;
    let fs = 0;
    let tc = 0;
    let tw = 0;
    let th = 1;
    let tl = 0;
    const fontRes = dictOf(doc.get(resources, 'Font'));
    const xobjects = dictOf(doc.get(resources, 'XObject'));
    const nums = () => ops.filter((o): o is number => typeof o === 'number');
    const td = (tx: number, ty: number) => {
      tlm = mul([1, 0, 0, 1, tx, ty], tlm);
      tm = tlm;
    };
    const show = (bytes: Uint8Array) => {
      if (!font) return;
      const n = font.bytesPerCode;
      for (let i = 0; i + n <= bytes.length; i += n) {
        let code = 0;
        for (let j = 0; j < n; j++) code = code * 256 + (bytes[i + j] as number);
        const ch = font.map.get(code) ?? font.fallback(code);
        const adv = ((font.width(code) / 1000) * fs + tc + (n === 1 && code === 32 ? tw : 0)) * th;
        const m = mul(tm, ctm);
        const size = Math.hypot(m[2], m[3]) * fs || fs;
        const w = adv * Math.hypot(m[0], m[1]);
        if (glyphs.length < MAX_GLYPHS) glyphs.push({ ch, x: m[4], y: m[5], w, size });
        tm = mul([1, 0, 0, 1, adv, 0], tm);
      }
    };
    for (let guard = 0; guard < 20_000_000; guard++) {
      const t = lx.next();
      if (t.t === 'eof') break;
      if (t.t !== 'kw') {
        const v = parseValue(lx, t);
        ops.push(v);
        if (ops.length > 64) ops.shift();
        continue;
      }
      const op = t.v;
      switch (op) {
        case 'q':
          stack.push(ctm);
          break;
        case 'Q':
          ctm = stack.pop() ?? ctm;
          break;
        case 'cm': {
          const a = nums();
          if (a.length >= 6) ctm = mul(a.slice(-6) as Matrix, ctm);
          break;
        }
        case 'BT':
          tm = ID;
          tlm = ID;
          break;
        case 'Tf': {
          const name = ops.find(isNameVal);
          const size = nums().pop();
          fs = size ?? fs;
          const fd = name ? dictOf(doc.get(fontRes, name.v)) : null;
          if (fd) {
            let f = fonts.get(fd);
            if (!f) {
              f = await loadFont(doc, fd);
              fonts.set(fd, f);
            }
            font = f;
          }
          break;
        }
        case 'Tc':
          tc = nums().pop() ?? tc;
          break;
        case 'Tw':
          tw = nums().pop() ?? tw;
          break;
        case 'Tz':
          th = (nums().pop() ?? 100) / 100;
          break;
        case 'TL':
          tl = nums().pop() ?? tl;
          break;
        case 'Td': {
          const a = nums();
          if (a.length >= 2) td(a[a.length - 2] as number, a[a.length - 1] as number);
          break;
        }
        case 'TD': {
          const a = nums();
          if (a.length >= 2) {
            tl = -(a[a.length - 1] as number);
            td(a[a.length - 2] as number, a[a.length - 1] as number);
          }
          break;
        }
        case 'Tm': {
          const a = nums();
          if (a.length >= 6) {
            tlm = a.slice(-6) as Matrix;
            tm = tlm;
          }
          break;
        }
        case 'T*':
          td(0, -tl);
          break;
        case 'Tj': {
          const s = ops.filter(isStrVal).pop();
          if (s) show(s.v);
          break;
        }
        case "'": {
          td(0, -tl);
          const s = ops.filter(isStrVal).pop();
          if (s) show(s.v);
          break;
        }
        case '"': {
          const a = nums();
          if (a.length >= 2) {
            tw = a[a.length - 2] as number;
            tc = a[a.length - 1] as number;
          }
          td(0, -tl);
          const s = ops.filter(isStrVal).pop();
          if (s) show(s.v);
          break;
        }
        case 'TJ': {
          const arr = [...ops].reverse().find(Array.isArray) as Val[] | undefined;
          if (arr) {
            for (const item of arr) {
              if (typeof item === 'number') tm = mul([1, 0, 0, 1, (-item / 1000) * fs * th, 0], tm);
              else if (isStrVal(item)) show(item.v);
            }
          }
          break;
        }
        case 'Do': {
          const name = ops.find(isNameVal);
          const xo = name ? doc.get(xobjects, name.v) : undefined;
          if (isStream(xo)) {
            const st = doc.get(xo.dict, 'Subtype');
            if (isName(st) && st.v === 'Form') {
              const body = await doc.decode(xo);
              const mx = doc.get(xo.dict, 'Matrix');
              const matrix = Array.isArray(mx) && mx.length === 6 && mx.every((x) => typeof x === 'number') ? (mx as Matrix) : ID;
              if (body) await runContent(doc, body, dictOf(doc.get(xo.dict, 'Resources')) ?? resources, mul(matrix, ctm), glyphs, fonts);
            }
          }
          break;
        }
        case 'BI': {
          const text = lx.bytes;
          let p = lx.pos;
          while (p < text.length - 2 && !(text[p] === 73 && text[p + 1] === 68 && isWs(text[p + 2] as number))) p++;
          p += 3;
          while (p < text.length - 2 && !(isWs(text[p - 1] as number) && text[p] === 69 && text[p + 1] === 73 && (p + 2 >= text.length || isWs(text[p + 2] as number)))) p++;
          lx.pos = p + 2;
          break;
        }
        default:
          break;
      }
      ops.length = 0;
    }
  } finally {
    doc.leave();
  }
}

function isNameVal(v: Val | Token): v is Name {
  return !!v && typeof v === 'object' && !Array.isArray(v) && 'k' in v && v.k === 'n';
}

function isStrVal(v: Val | Token): v is Str {
  return !!v && typeof v === 'object' && !Array.isArray(v) && 'k' in v && v.k === 's';
}

interface Line {
  text: string;
  y: number;
  x0: number;
  x1: number;
  size: number;
}

function toLines(glyphs: Glyph[]): Line[] {
  const lines: Line[] = [];
  let cur: Line | null = null;
  let prev: Glyph | null = null;
  for (const g of glyphs) {
    if (!g.ch) continue;
    const size = Math.max(1, Math.abs(g.size));
    if (prev && cur) {
      const dy = Math.abs(g.y - prev.y);
      if (prev.ch === g.ch && Math.abs(g.x - prev.x) < size * 0.1 && dy < size * 0.1) continue;
      const end = prev.x + prev.w;
      if (dy > size * 0.5) {
        lines.push(cur);
        cur = null;
      } else if (g.x - end > size * 0.18 || g.x < prev.x - size) {
        if (!cur.text.endsWith(' ') && g.ch !== ' ') cur.text += ' ';
      }
    }
    if (!cur) cur = { text: '', y: g.y, x0: g.x, x1: g.x + g.w, size };
    cur.text += /[\ue000-\uf8ff]/.test(g.ch) ? '\u2022' : g.ch;
    cur.x1 = Math.max(cur.x1, g.x + g.w);
    cur.x0 = Math.min(cur.x0, g.x);
    cur.size = Math.max(cur.size, size);
    prev = g;
  }
  if (cur) lines.push(cur);
  return lines
    .map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text !== '');
}

function toParagraphs(lines: Line[]): string {
  if (!lines.length) return '';
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const g = (lines[i - 1] as Line).y - (lines[i] as Line).y;
    if (g > 0) gaps.push(g);
  }
  gaps.sort((a, b) => a - b);
  const pitch = gaps.length ? (gaps[Math.floor(gaps.length * 0.2)] as number) : 0;
  const right = Math.max(...lines.map((l) => l.x1));
  const left = Math.min(...lines.map((l) => l.x0));
  const width = right - left;
  let out = '';
  lines.forEach((l, i) => {
    if (i === 0) {
      out = l.text;
      return;
    }
    const p = lines[i - 1] as Line;
    const gap = p.y - l.y;
    const indent = (x: number) => x > left + p.size * 0.8;
    const short = width > 0 && p.x1 < right - Math.max(width * 0.12, p.size * 2);
    const ends = /[.!?:;]["')\]]?$/.test(p.text);
    const starts = /^[A-ZÀ-Ý0-9"(\u2022-]/.test(l.text);
    const bullet = /^([-\u2022\u25e6\u25aa\u25cf\u25a0\u2013]|\d+[.)])\s/.test(l.text);
    const breakPara =
      gap <= 0 ||
      (pitch > 0 && gap > pitch * 1.3) ||
      bullet ||
      (short && (ends || starts || indent(l.x0) !== indent(p.x0))) ||
      Math.abs(l.size - p.size) > p.size * 0.2;
    if (breakPara) out += `\n${l.text}`;
    else if (/[A-Za-zÀ-ÿ]-$/.test(out) && /^[a-zà-ÿ]/.test(l.text)) out = out.slice(0, -1) + l.text;
    else if (out.endsWith('\u00ad')) out = out.slice(0, -1) + l.text;
    else out += ` ${l.text}`;
  });
  return out;
}

export async function pdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const doc = new Doc(bytes);
  doc.scan();
  await doc.expandObjectStreams();
  const pages = doc.pages();
  if (!pages.length) throw new DocumentError('não foi possível ler as páginas deste PDF');
  const fonts = new Map<Dict, Font>();
  const texts: string[] = [];
  for (const page of pages) {
    const glyphs: Glyph[] = [];
    const data = await doc.contents(page.dict);
    await runContent(doc, data, page.resources, ID, glyphs, fonts);
    const text = toParagraphs(toLines(glyphs));
    if (text) texts.push(text);
  }
  const text = texts.join('\n');
  if (text.replace(/\s/g, '').length < 10) throw new DocumentError('este PDF não tem texto selecionável (pode ser uma imagem escaneada)');
  return { text, pages: pages.length };
}
