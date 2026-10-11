import { afterEach, expect, it, vi } from 'vitest';
import { MeshBasicMaterial, PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { compileModel } from './compileModel';
afterEach(() => vi.useRealTimers());
it('cancels shader polling before disposed programs are read', async () => {
  vi.useFakeTimers(); const material = new MeshBasicMaterial(), read = vi.fn(() => ({ currentProgram: { isReady: () => false } }));
  const renderer = { compile: () => new Set([material]), getContext: () => ({ isContextLost: () => false }), properties: { get: read } } as unknown as WebGLRenderer;
  const controller = new AbortController(); const promise = compileModel(renderer, new Scene(), new PerspectiveCamera(), controller.signal);
  vi.advanceTimersByTime(10); expect(read).toHaveBeenCalledOnce(); controller.abort(); await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  vi.advanceTimersByTime(1000); expect(read).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
it('rejects a lost context before compiling any materials', async () => {
  const compile = vi.fn(); const renderer = { compile, getContext: () => ({ isContextLost: () => true }) } as unknown as WebGLRenderer;
  await expect(compileModel(renderer, new Scene(), new PerspectiveCamera(), new AbortController().signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(compile).not.toHaveBeenCalled();
});
