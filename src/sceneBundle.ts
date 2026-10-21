import { openLocalScene } from './localScene';

// Version 1 bundles are ZIP archives using STORE (no compression). Keeping GLBs
// as file slices lets the browser load them on demand instead of unpacking the
// entire scene into JavaScript memory. ZIP64/encrypted/compressed ZIPs are not v1.
export async function openSceneBundle(bundle: File) {
  const fail = () => new Error('Invalid XYZ bundle. Expected an uncompressed ZIP containing scene.xyz and GLB models.');
  const tailStart = Math.max(0, bundle.size - 65557);
  const tail = new DataView(await bundle.slice(tailStart).arrayBuffer());
  let end = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50 && i + 22 + tail.getUint16(i + 20, true) === tail.byteLength) { end = i; break; }
  }
  if (end < 0) throw fail();
  const count = tail.getUint16(end + 10, true);
  const size = tail.getUint32(end + 12, true), offset = tail.getUint32(end + 16, true);
  if (tail.getUint16(end + 4, true) || tail.getUint16(end + 6, true) ||
      tail.getUint16(end + 8, true) !== count || count === 65535 ||
      size > 16 * 1024 * 1024 || offset + size !== tailStart + end) throw fail();
  const bytes = new Uint8Array(await bundle.slice(offset, offset + size).arrayBuffer());
  const directory = new DataView(bytes.buffer);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const names = new Set<string>();
  const files: File[] = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > size || directory.getUint32(cursor, true) !== 0x02014b50) throw fail();
    const flags = directory.getUint16(cursor + 8, true);
    const method = directory.getUint16(cursor + 10, true);
    const packed = directory.getUint32(cursor + 20, true), length = directory.getUint32(cursor + 24, true);
    const nameLength = directory.getUint16(cursor + 28, true);
    const extraLength = directory.getUint16(cursor + 30, true), commentLength = directory.getUint16(cursor + 32, true);
    const localOffset = directory.getUint32(cursor + 42, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > size || flags & 1 || method !== 0 || packed !== length || directory.getUint16(cursor + 34, true)) throw fail();
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (!name || name.startsWith('/') || name.includes('\\') || name.includes(':') || name.includes('\0') ||
        name.split('/').some(part => part === '..' || part === '.') || names.has(name)) throw fail();
    names.add(name);
    cursor = next;
    if (name.endsWith('/')) continue;
    if (localOffset + 30 > offset) throw fail();
    const header = new DataView(await bundle.slice(localOffset, localOffset + 30).arrayBuffer());
    if (header.getUint32(0, true) !== 0x04034b50 || header.getUint16(8, true) !== method || header.getUint16(6, true) !== flags) throw fail();
    const localNameLength = header.getUint16(26, true);
    const start = localOffset + 30 + localNameLength + header.getUint16(28, true);
    if (start + length > offset) throw fail();
    const localName = decoder.decode(await bundle.slice(localOffset + 30, localOffset + 30 + localNameLength).arrayBuffer());
    if (localName !== name) throw fail();
    if (!name.endsWith('.glb') && name !== 'scene.xyz') continue;
    if (name === 'scene.xyz' && length > 10 * 1024 * 1024) throw fail();
    // File construction from a Blob slice preserves lazy backing storage.
    const file = new File([bundle.slice(start, start + length)], name.split('/').pop()!, { type: name.endsWith('.glb') ? 'model/gltf-binary' : 'text/plain' });
    Object.defineProperty(file, 'webkitRelativePath', { value: name });
    files.push(file);
  }
  if (cursor !== size) throw fail();
  return openLocalScene(files);
}
