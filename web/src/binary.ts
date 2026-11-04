export class DocumentError extends Error {}

export const ascii = (bytes: Uint8Array, start: number, length: number): string => {
  let s = '';
  for (let i = start; i < start + length && i < bytes.length; i++) s += String.fromCharCode(bytes[i] as number);
  return s;
};

export function concat(chunks: Uint8Array[]): Uint8Array {
  let size = 0;
  for (const c of chunks) size += c.length;
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export async function inflate(data: Uint8Array, raw = false): Promise<Uint8Array> {
  const run = async (format: 'deflate' | 'deflate-raw', input: Uint8Array) => {
    const ds = new DecompressionStream(format);
    const writer = ds.writable.getWriter();
    writer.write(input as unknown as BufferSource).catch(() => undefined);
    writer.close().catch(() => undefined);
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } catch {
      if (!chunks.length) throw new DocumentError('dados compactados corrompidos');
    }
    return concat(chunks);
  };
  if (raw) return run('deflate-raw', data);
  try {
    return await run('deflate', data);
  } catch {
    return run('deflate-raw', data.subarray(2));
  }
}

