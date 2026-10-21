// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { openLocalScene } from '../localScene';
import { useSceneAssets } from './useSceneAssets';
vi.mock('../localScene', () => ({ openLocalScene: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const files = [new File([''], 'scene.xyz')];
const scene = (source: string) => ({ source, resolve: vi.fn(() => 'blob:' + source), close: vi.fn() });

it('loads source and local assets, releases replaced folders, and switches back to remote', async () => {
  const first = scene('first'), second = scene('second'), onSource = vi.fn();
  vi.mocked(openLocalScene).mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  const { result } = renderHook(() => useSceneAssets(onSource));
  await act(() => result.current.openFolder(files));
  expect(onSource).toHaveBeenLastCalledWith('first');
  expect(result.current.resolve('chair.glb')).toBe('blob:first');
  await act(() => result.current.openFolder(files));
  expect(first.close).toHaveBeenCalledOnce();
  act(() => result.current.useRemote());
  expect(second.close).toHaveBeenCalledOnce();
  expect(result.current.isLocal).toBe(false);
  expect(result.current.resolve('chair.glb')).toMatch(/^https:/);
});

it('keeps the current scene when an invalid folder is selected', async () => {
  const local = scene('valid'), onSource = vi.fn();
  vi.mocked(openLocalScene).mockResolvedValueOnce(local).mockRejectedValueOnce(new Error('Missing scene.xyz'));
  const { result } = renderHook(() => useSceneAssets(onSource));
  await act(() => result.current.openFolder(files));
  await act(() => result.current.openFolder(files));
  expect(result.current.error).toBe('Missing scene.xyz');
  expect(result.current.isLocal).toBe(true);
  expect(onSource).toHaveBeenCalledTimes(1);
  expect(local.close).not.toHaveBeenCalled();
});

it.each(['remote', 'unmount'])('disposes a pending folder after %s without changing the source', async action => {
  const local = scene('late'), onSource = vi.fn();
  let finish!: (value: typeof local) => void;
  vi.mocked(openLocalScene).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const { result, unmount } = renderHook(() => useSceneAssets(onSource));
  let pending!: Promise<void>;
  act(() => { pending = result.current.openFolder(files); });
  act(() => { if (action === 'remote') result.current.useRemote(); else unmount(); });
  await act(async () => { finish(local); await pending; });
  expect(local.close).toHaveBeenCalledOnce();
  expect(onSource).not.toHaveBeenCalled();
});
