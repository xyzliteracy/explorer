const MiB = 1024 * 1024;
/** These bound model estimates, not actual Safari process memory. The peak
 * envelope reserves two copies of resident buffers plus download/decoder work. */
export function modelUpgradePolicy(memory?: number, userAgent = '', platform = '', touchPoints = 0) {
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && touchPoints > 1);
  const constrained = ios || memory === undefined || memory <= 4;
  return constrained
    ? { constrained, originals: 160 * MiB, combined: 256 * MiB, download: 96 * MiB, transient: 128 * MiB }
    : { constrained, originals: 1024 * MiB, combined: 1536 * MiB, download: 256 * MiB, transient: 256 * MiB };
}
export function currentModelUpgradePolicy() {
  if (typeof navigator === 'undefined') return modelUpgradePolicy();
  return modelUpgradePolicy((navigator as Navigator & { deviceMemory?: number }).deviceMemory, navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
}

function imageSize(data: Uint8Array): [number, number] | undefined {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) return [view.getUint32(16), view.getUint32(20)];
  if (data.length >= 40 && view.getUint32(0) === 0xab4b5458) return [view.getUint32(20, true), view.getUint32(24, true)]; // KTX2: conservative RGBA
  if (data[0] !== 0xff || data[1] !== 0xd8) return;
  let offset = 2;
  while (offset + 4 <= data.length) {
    if (data[offset++] !== 0xff) return;
    while (data[offset] === 0xff) offset++;
    const marker = data[offset++];
    if (marker === 0xd9 || marker === 0xda) return;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > data.length) return;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > data.length) return;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) return;
      return [view.getUint16(offset + 5), view.getUint16(offset + 3)];
    }
    offset += length;
  }
}

/** Read compressed-file metadata before GLTF creates geometry, decoded images
 * or GPU resources. Unknown/external image formats cannot safely get an
 * optional grant. Required authored baselines use the normal loader. */
export function inspectOriginalGlb(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw Error('Cannot budget this optional model before decoding.');
  const jsonSize = view.getUint32(12, true);
  const binHeader = 20 + jsonSize;
  if (binHeader + 8 > buffer.byteLength || view.getUint32(binHeader + 4, true) !== 0x004e4942) throw Error('Optional original requires embedded GLB resources.');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonSize)));
  const binLength = view.getUint32(binHeader, true);
  if (binHeader + 8 + binLength !== buffer.byteLength || (json.buffers ?? []).some((entry: { uri?: string; extensions?: { EXT_meshopt_compression?: { fallback?: boolean } } }, index: number) => entry.uri !== undefined || (index !== 0 && !(entry.extensions?.EXT_meshopt_compression?.fallback === true && json.extensionsRequired?.includes('EXT_meshopt_compression'))))) throw Error('Optional original has unbudgeted external buffers.');
  const components: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  const sizes: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  let bytes = 0;
  for (const accessor of json.accessors ?? []) {
    const size = accessor.count * components[accessor.type] * sizes[accessor.componentType];
    if (!Number.isFinite(size) || size < 0) throw Error('Invalid original geometry metadata.');
    bytes += size;
  }
  bytes = Math.max(bytes, view.getUint32(binHeader, true));
  for (const image of json.images ?? []) {
    const range = json.bufferViews?.[image.bufferView];
    if (!range || (range.buffer ?? 0) !== 0) throw Error('Optional model image cannot be budgeted before decoding.');
    const offset = binHeader + 8 + (range.byteOffset ?? 0);
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(range.byteLength) || offset < binHeader + 8 || offset + range.byteLength > binHeader + 8 + binLength) throw Error('Invalid original image range.');
    const size = imageSize(new Uint8Array(buffer, offset, range.byteLength));
    if (!size || !size.every(value => Number.isFinite(value) && value > 0 && value <= 32768)) throw Error('Unknown optional image dimensions.');
    bytes += size[0] * size[1] * 4 * 4 / 3;
  }
  if (!Number.isFinite(bytes)) throw Error('Invalid original resource estimate.');
  return { bytes: Math.ceil(bytes), triangles: 0, downloadBytes: buffer.byteLength };
}
