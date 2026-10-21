// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { openLocalScene } from './localScene';
it('loads nested local models, falls back from inferred tiers, and releases URLs', async () => {
 vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:local'); static revokeObjectURL = vi.fn(); });
 const scene = { name:'scene.xyz', webkitRelativePath:'room/scene.xyz', text:async () => 'source' } as File;
 const model = { name:'chair.glb', webkitRelativePath:'room/models/chair.glb' } as File;
 const local = await openLocalScene([scene,model]);
 expect(local.source).toBe('source');
 expect(local.resolve('models/chair.preview.glb')).toBe('blob:local');
 expect(() => local.resolve('../chair.glb')).toThrow();
 expect(() => local.resolve('https://example.com/chair.glb')).toThrow();
 expect(() => local.resolve('missing.glb')).toThrow();
 local.close(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local'); vi.unstubAllGlobals();
});
it('requires an unambiguous scene entry', async () => {
 await expect(openLocalScene([])).rejects.toThrow('exactly one');
});
