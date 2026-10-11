import { describe, expect, it } from 'vitest';
import { inspectOriginalGlb, modelUpgradePolicy } from './modelUpgradeMemory';
import { isCriticallyUnderpowered } from './renderQuality';
function glb(image: Uint8Array, accessors: unknown[] = []) {
  const text = new TextEncoder().encode(JSON.stringify({ accessors, images: [{ bufferView: 0 }], bufferViews: [{ buffer: 0, byteLength: image.length }] }));
  const jsonLength = Math.ceil(text.length / 4) * 4;
  const binLength = Math.ceil(image.length / 4) * 4;
  const buffer = new ArrayBuffer(28 + jsonLength + binLength); const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer, 20, jsonLength).fill(32); new Uint8Array(buffer, 20, text.length).set(text);
  view.setUint32(20 + jsonLength, binLength, true); view.setUint32(24 + jsonLength, 0x004e4942, true);
  new Uint8Array(buffer, 28 + jsonLength, image.length).set(image);
  return buffer;
}
function png(width = 2048, height = 2048) {
  const data = new Uint8Array(24); const view = new DataView(data.buffer);
  view.setUint32(0, 0x89504e47); view.setUint32(4, 0x0d0a1a0a); view.setUint32(16, width); view.setUint32(20, height); return data;
}
describe('original admission before decoding', () => {
  it('budgets decoded geometry and GPU mipmaps from compressed file metadata', () => {
    const buffer = glb(png(), [{ count: 100000, type: 'VEC3', componentType: 5126 }]);
    expect(inspectOriginalGlb(buffer)).toEqual({ bytes: Math.ceil(1200000 + 2048 * 2048 * 4 * 4 / 3), triangles: 0, downloadBytes: buffer.byteLength });
  });
  it('reads JPEG SOF dimensions without decompressing pixels', () => {
    const jpeg = new Uint8Array([255, 216, 255, 224, 0, 4, 0, 0, 255, 194, 0, 8, 8, 8, 0, 4, 0, 1]);
    expect(inspectOriginalGlb(glb(jpeg)).bytes).toBe(Math.ceil(20 + 1024 * 2048 * 4 * 4 / 3));
  });
  it('counts KTX2 conservatively without assuming a browser transcode format', () => {
    const ktx = new Uint8Array(40); const view = new DataView(ktx.buffer);
    view.setUint32(0, 0xab4b5458); view.setUint32(20, 1024, true); view.setUint32(24, 512, true);
    expect(inspectOriginalGlb(glb(ktx)).bytes).toBe(Math.ceil(40 + 1024 * 512 * 4 * 4 / 3));
  });
  it('rejects unknown image formats and malformed dimensions before decoding', () => {
    expect(() => inspectOriginalGlb(glb(new Uint8Array(24)))).toThrow('dimensions');
    expect(() => inspectOriginalGlb(glb(png(0)))).toThrow('dimensions');
    expect(() => inspectOriginalGlb(new ArrayBuffer(12))).toThrow('budget');
  });
  it('uses conservative grants on iPhones and missing memory hints without enabling previews', () => {
    expect(modelUpgradePolicy(8, 'iPhone').constrained).toBe(true);
    expect(modelUpgradePolicy(undefined).constrained).toBe(true);
    expect(modelUpgradePolicy(8, '', 'MacIntel', 5).constrained).toBe(true);
    expect(modelUpgradePolicy(8, 'Chrome').constrained).toBe(false);
    expect(isCriticallyUnderpowered(undefined, 6)).toBe(false);
    const policy = modelUpgradePolicy(undefined);
    expect(policy.originals).toBeLessThan(policy.combined);
    expect(2 * policy.combined + 2 * policy.download + policy.transient).toBe(832 * 1024 * 1024);
  });
});
