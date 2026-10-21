import { afterEach, expect, it, vi } from 'vitest';
import { openSceneBundle } from './sceneBundle';

// Minimal STORE ZIP fixture; directory names and local names match by default.
function bundle(entries: [string, string][]) {
  const chunks: Uint8Array<ArrayBuffer>[] = [], records: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const path = new TextEncoder().encode(name), data = new TextEncoder().encode(content);
    const local = new Uint8Array(30 + path.length + data.length), h = new DataView(local.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, path.length, true);
    local.set(path, 30); local.set(data, 30 + path.length);
    const record = new Uint8Array(46 + path.length), d = new DataView(record.buffer);
    d.setUint32(0, 0x02014b50, true); d.setUint32(20, data.length, true); d.setUint32(24, data.length, true);
    d.setUint16(28, path.length, true); d.setUint32(42, offset, true); record.set(path, 46);
    chunks.push(local); records.push(record); offset += local.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
  e.setUint32(12, records.reduce((sum, record) => sum + record.length, 0), true); e.setUint32(16, offset, true);
  return new File([...chunks, ...records, end], 'room.xyz');
}
afterEach(() => vi.restoreAllMocks());
it('opens an integrated scene and resolves its embedded model variants', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:embedded');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const scene = await openSceneBundle(bundle([['scene.xyz', 'scene text'], ['lepapayer/chair.glb', 'glb']]));
  expect(scene.source).toBe('scene text');
  expect(scene.resolve('lepapayer/chair.detail.glb')).toBe('blob:embedded');
  expect(() => scene.resolve('missing.glb')).toThrow('Missing local model');
  scene.close(); expect(revoke).toHaveBeenCalledWith('blob:embedded');
});
it.each(['../chair.glb', '/chair.glb', 'models/../chair.glb', 'models\\chair.glb'])('rejects unsafe archive path %s', async name => {
  await expect(openSceneBundle(bundle([['scene.xyz', ''], [name, 'glb']]))).rejects.toThrow('Invalid XYZ bundle');
});
it('rejects duplicate paths, missing scenes, and truncated archives', async () => {
  await expect(openSceneBundle(bundle([['scene.xyz', 'a'], ['scene.xyz', 'b']]))).rejects.toThrow('Invalid XYZ bundle');
  await expect(openSceneBundle(bundle([]))).rejects.toThrow('exactly one');
  await expect(openSceneBundle(new File(['not zip'], 'room.xyz'))).rejects.toThrow('Invalid XYZ bundle');
});
