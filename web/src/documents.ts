import { DocumentError, ascii, concat, inflate } from './binary.ts';
import { pdfText } from './pdf.ts';

export { DocumentError };

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ACCEPTED = '.pdf,.docx,.doc,.odt,.txt,.md,.text';

export type DocKind = 'pdf' | 'docx' | 'doc' | 'odt' | 'txt';

export interface Extracted {
  kind: DocKind;
  text: string;
  pages: number | null;
}

interface ZipEntry {
  name: string;
  method: number;
  size: number;
  offset: number;
}

export function zipEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new DocumentError('o arquivo não é um ZIP válido');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder();
  for (let i = 0; i < count && p + 46 <= bytes.length; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, { name, method, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export async function zipRead(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(entry.offset, true) !== 0x04034b50) throw new DocumentError(`entrada ${entry.name} corrompida`);
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const data = bytes.subarray(start, start + entry.size);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflate(data, true);
  throw new DocumentError(`compressão ${entry.method} não suportada`);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export const decodeEntities = (s: string): string =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    }
    return ENTITIES[e] ?? m;
  });

export function docxXmlText(xml: string): string {
  const out: string[] = [];
  let para = '';
  let inText = false;
  let listItem = false;
  const re = /<(\/?)(w:[A-Za-z]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[5] !== undefined) {
      if (inText) para += decodeEntities(m[5]);
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2];
    const selfClosing = m[4] === '/';
    if (tag === 'w:t') inText = !closing && !selfClosing;
    else if (tag === 'w:p' && !closing) {
      para = '';
      listItem = false;
      if (selfClosing) out.push('');
    } else if (tag === 'w:p' && closing) {
      out.push(listItem && para.trim() ? `- ${para}` : para);
      para = '';
    } else if (tag === 'w:numPr' && !closing) listItem = true;
    else if (tag === 'w:pStyle' && /w:val="(List|Lista|PargrafodaLista|ListParagraph)/i.test(m[3] ?? '')) listItem = true;
    else if (!closing && (tag === 'w:tab' || tag === 'w:ptab')) para += ' ';
    else if (!closing && (tag === 'w:br' || tag === 'w:cr')) para += '\n';
    else if (!closing && tag === 'w:noBreakHyphen') para += '-';
    else if (tag === 'w:tc' && closing) para += ' ';
  }
  return out.join('\n');
}

export function odtXmlText(xml: string): string {
  const out: string[] = [];
  let depth = 0;
  let para = '';
  let skip = 0;
  const re = /<(\/?)(text:[A-Za-z-]+|office:annotation)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[5] !== undefined) {
      if (depth > 0 && skip === 0) para += decodeEntities(m[5]);
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2];
    const selfClosing = m[4] === '/';
    if (tag === 'office:annotation' || tag === 'text:note-citation' || tag === 'text:tracked-changes') {
      if (!selfClosing) skip += closing ? -1 : 1;
    } else if (tag === 'text:p' || tag === 'text:h') {
      if (selfClosing) out.push('');
      else if (closing) {
        depth--;
        if (depth === 0) {
          out.push(para);
          para = '';
        }
      } else depth++;
    } else if (tag === 'text:s' && !closing) {
      const c = /text:c="(\d+)"/.exec(m[3] ?? '');
      para += ' '.repeat(Math.min(50, c ? Number(c[1]) : 1));
    } else if (tag === 'text:tab' && !closing) para += ' ';
    else if (tag === 'text:line-break' && !closing) para += '\n';
  }
  return out.join('\n');
}

export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

interface CfbEntry {
  name: string;
  type: number;
  start: number;
  size: number;
}

function cfbStreams(bytes: Uint8Array): { read: (name: string) => Uint8Array | null } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorSize = 1 << view.getUint16(0x1e, true);
  const miniSize = 1 << view.getUint16(0x20, true);
  const firstDir = view.getUint32(0x30, true);
  const cutoff = view.getUint32(0x38, true);
  const firstMiniFat = view.getUint32(0x3c, true);
  const firstDifat = view.getUint32(0x44, true);
  const sector = (n: number) => 512 + n * sectorSize;
  const END = 0xfffffffe;
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) {
    const s = view.getUint32(0x4c + i * 4, true);
    if (s < 0xfffffffa) fatSectors.push(s);
  }
  let difat = firstDifat;
  for (let guard = 0; difat < 0xfffffffa && guard < 10000; guard++) {
    const base = sector(difat);
    const per = sectorSize / 4 - 1;
    for (let i = 0; i < per; i++) {
      const s = view.getUint32(base + i * 4, true);
      if (s < 0xfffffffa) fatSectors.push(s);
    }
    difat = view.getUint32(base + per * 4, true);
  }
  const fat: number[] = [];
  for (const s of fatSectors) {
    const base = sector(s);
    for (let i = 0; i < sectorSize / 4 && base + i * 4 + 4 <= bytes.length; i++) fat.push(view.getUint32(base + i * 4, true));
  }
  const chain = (start: number, table: number[]) => {
    const out: number[] = [];
    const seen = new Set<number>();
    for (let s = start; s !== END && s < table.length && !seen.has(s); s = table[s] as number) {
      seen.add(s);
      out.push(s);
    }
    return out;
  };
  const readChain = (start: number, size: number) => {
    const parts = chain(start, fat).map((s) => bytes.subarray(sector(s), sector(s) + sectorSize));
    return concat(parts).subarray(0, size);
  };
  const dirBytes = concat(chain(firstDir, fat).map((s) => bytes.subarray(sector(s), sector(s) + sectorSize)));
  const dv = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);
  const entries: CfbEntry[] = [];
  for (let p = 0; p + 128 <= dirBytes.length; p += 128) {
    const len = dv.getUint16(p + 64, true);
    const name = new TextDecoder('utf-16le').decode(dirBytes.subarray(p, p + Math.max(0, len - 2)));
    entries.push({ name, type: dirBytes[p + 66] as number, start: dv.getUint32(p + 116, true), size: dv.getUint32(p + 120, true) });
  }
  const root = entries.find((e) => e.type === 5);
  const miniStream = root ? readChain(root.start, root.size) : new Uint8Array(0);
  const miniFat: number[] = [];
  if (firstMiniFat < 0xfffffffa) {
    const mf = readChain(firstMiniFat, chain(firstMiniFat, fat).length * sectorSize);
    const mv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength);
    for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(mv.getUint32(i, true));
  }
  return {
    read(name: string) {
      const e = entries.find((x) => x.type === 2 && x.name === name);
      if (!e) return null;
      if (e.size < cutoff) {
        const parts = chain(e.start, miniFat).map((s) => miniStream.subarray(s * miniSize, (s + 1) * miniSize));
        return concat(parts).subarray(0, e.size);
      }
      return readChain(e.start, e.size);
    },
  };
}

export function docText(bytes: Uint8Array): string {
  const cfb = cfbStreams(bytes);
  const word = cfb.read('WordDocument');
  if (!word || word.length < 0x200) throw new DocumentError('este .doc não tem o texto do Word');
  const wv = new DataView(word.buffer, word.byteOffset, word.byteLength);
  if (wv.getUint16(0, true) !== 0xa5ec) throw new DocumentError('este .doc não é do Word 97 ou mais novo');
  const flags = wv.getUint16(0x0a, true);
  if (flags & 0x0100) throw new DocumentError('este .doc está protegido por senha');
  const table = cfb.read(flags & 0x0200 ? '1Table' : '0Table');
  if (!table) throw new DocumentError('este .doc está incompleto');
  const csw = wv.getUint16(32, true);
  const lwStart = 32 + 2 + csw * 2;
  const cslw = wv.getUint16(lwStart, true);
  const ccpText = wv.getInt32(lwStart + 2 + 3 * 4, true);
  const fcLcbStart = lwStart + 2 + cslw * 4 + 2;
  const fcClx = wv.getUint32(fcLcbStart + 33 * 8, true);
  const lcbClx = wv.getUint32(fcLcbStart + 33 * 8 + 4, true);
  const tv = new DataView(table.buffer, table.byteOffset, table.byteLength);
  let p = fcClx;
  const end = fcClx + lcbClx;
  while (p < end && table[p] === 0x01) p += 3 + tv.getInt16(p + 1, true);
  if (table[p] !== 0x02) throw new DocumentError('não foi possível achar o texto deste .doc');
  const lcb = tv.getUint32(p + 1, true);
  const plc = p + 5;
  const n = Math.floor((lcb - 4) / 12);
  const cp1252 = new TextDecoder('windows-1252');
  const utf16 = new TextDecoder('utf-16le');
  let text = '';
  for (let i = 0; i < n && text.length < ccpText; i++) {
    const cpStart = tv.getUint32(plc + i * 4, true);
    const cpEnd = tv.getUint32(plc + (i + 1) * 4, true);
    const pcd = plc + (n + 1) * 4 + i * 8;
    const fcRaw = tv.getUint32(pcd + 2, true);
    const count = cpEnd - cpStart;
    if (fcRaw & 0x40000000) {
      const at = (fcRaw & 0x3fffffff) / 2;
      text += cp1252.decode(word.subarray(at, at + count));
    } else {
      text += utf16.decode(word.subarray(fcRaw, fcRaw + count * 2));
    }
  }
  text = text.slice(0, Math.max(0, ccpText));
  let out = '';
  let field = 0;
  let codeDepth = 0;
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c === 0x13) {
      field++;
      codeDepth = field;
      continue;
    }
    if (c === 0x14) {
      if (codeDepth === field) codeDepth = 0;
      continue;
    }
    if (c === 0x15) {
      if (codeDepth === field) codeDepth = 0;
      field = Math.max(0, field - 1);
      continue;
    }
    if (codeDepth) continue;
    if (c === 0x0d || c === 0x0c) out += '\n';
    else if (c === 0x0b) out += '\n';
    else if (c === 0x07) out += '\n';
    else if (c === 0x09) out += ' ';
    else if (c === 0x1e) out += '-';
    else if (c === 0x1f || c === 0x01 || c === 0x08 || c < 0x09) continue;
    else out += ch;
  }
  return out;
}

export function detectKind(name: string, bytes: Uint8Array): DocKind | null {
  const head = ascii(bytes, 0, 8);
  if (head.startsWith('%PDF')) return 'pdf';
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'doc';
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (head.startsWith('PK')) {
    if (ext === 'odt') return 'odt';
    return 'docx';
  }
  if (ascii(bytes, 0, 1024).includes('%PDF-')) return 'pdf';
  if (['txt', 'md', 'text'].includes(ext)) return 'txt';
  return null;
}

export async function extract(name: string, bytes: Uint8Array): Promise<Extracted> {
  if (bytes.length > MAX_FILE_BYTES) throw new DocumentError('arquivo maior que 25 MB');
  const kind = detectKind(name, bytes);
  if (!kind) throw new DocumentError('formato não reconhecido: envie PDF, DOCX, DOC, ODT ou TXT');
  if (kind === 'txt') return { kind, text: decodeText(bytes), pages: null };
  if (kind === 'doc') return { kind, text: docText(bytes), pages: null };
  if (kind === 'pdf') {
    const r = await pdfText(bytes);
    return { kind, text: r.text, pages: r.pages };
  }
  const entries = zipEntries(bytes);
  if (kind === 'odt' || entries.has('content.xml')) {
    const content = entries.get('content.xml');
    if (!content) throw new DocumentError('este .odt não tem conteúdo');
    return { kind: 'odt', text: odtXmlText(new TextDecoder().decode(await zipRead(bytes, content))), pages: null };
  }
  const doc = entries.get('word/document.xml');
  if (!doc) throw new DocumentError('este arquivo não é um documento do Word (.docx)');
  return { kind: 'docx', text: docxXmlText(new TextDecoder().decode(await zipRead(bytes, doc))), pages: null };
}
