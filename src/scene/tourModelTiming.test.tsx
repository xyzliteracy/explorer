// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ModelPrimitive } from './ModelPrimitive';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { useModelAsset, useSelectedModelAsset } from '../performance/ModelRuntime';

const state = vi.hoisted(() => ({ frame: undefined as undefined | ((value: any) => void), tier: 'detail', radial: false, focus: { focused: false, original: false, sustained: false } }));
vi.mock('@react-three/fiber', () => ({ useFrame: (frame: any) => { state.frame = frame; } }));
vi.mock('@react-three/drei', () => ({ Html: () => null }));
vi.mock('../performance/ModelRuntime', () => ({ useModelAsset: vi.fn(), useSelectedModelAsset: vi.fn() }));
vi.mock('../performance/TourModelFocus', () => ({ TOUR_DWELL_MS: 2000, useTourModelFocus: () => state.focus }));
vi.mock('../performance/modelVisibility', async importOriginal => {
  const actual = await importOriginal<typeof import('../performance/modelVisibility')>();
  return { ...actual, modelScreenPixels: () => 100,
    requestedModelTier: () => state.tier,
    requestedTourModelTier: (...args: Parameters<typeof actual.requestedTourModelTier>) => state.radial ? actual.requestedTourModelTier(...args) : state.tier,
  };
});
vi.mock('../assets', () => ({ useAssetResolver: () => (url: string) => url }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('delays tour degradation, cancels it on return, and settles while rendering is idle', () => {
  vi.useFakeTimers();
  state.radial = false;
  state.tier = 'detail';
  const node = createSpatialDocument('"Chair/+0+1/+0+1/+0+1":"model: chair.glb"').renderNodes[0];
  const view = render(<ModelPrimitive node={node} tourMode />);
  const group = view.container.querySelector('group')!;
  Object.assign(group, { updateWorldMatrix: () => {} });
  const frame = () => act(() => state.frame!({ camera: {}, size: { height: 800 } }));
  const target = () => vi.mocked(useModelAsset).mock.calls.at(-2)?.[0];
  frame();
  expect(target()).toBe('chair.detail.glb');
  state.tier = 'standard';
  frame();
  act(() => vi.advanceTimersByTime(1500));
  expect(target()).toBe('chair.detail.glb');
  state.tier = 'detail';
  frame();
  act(() => vi.advanceTimersByTime(1000));
  expect(target()).toBe('chair.detail.glb');
  state.tier = 'none';
  frame();
  act(() => vi.advanceTimersByTime(1999));
  expect(target()).toBe('chair.detail.glb');
  act(() => vi.advanceTimersByTime(1));
  expect(target()).toBeUndefined();
});

it.each([false, true])('connects both rings to prepared loading and gates originals (underpowered: %s)', underpowered => {
  vi.useFakeTimers();
  state.radial = true;
  state.focus = { focused: false, original: false, sustained: false };
  vi.mocked(useModelAsset).mockClear();
  vi.mocked(useSelectedModelAsset).mockClear();
  const node = createSpatialDocument('"Chair/+0+1/+0+1/+0+1":"model: chair.glb"').renderNodes[0];
  const props = { node, tourMode: true, maxTier: underpowered ? 'preview' as const : 'detail' as const };
  const view = render(<ModelPrimitive {...props} />);
  Object.assign(view.container.querySelector('group')!, { updateWorldMatrix: () => {} });
  const frame = () => act(() => state.frame!({ camera: {}, size: { height: 800 } }));
  const target = () => vi.mocked(useModelAsset).mock.calls.at(-2)?.[0];
  frame();
  // Preview is acquired directly; the separate target hook stays empty.
  expect(target()).toBe(underpowered ? undefined : 'chair.standard.glb');
  state.focus = { focused: true, original: false, sustained: false };
  view.rerender(<ModelPrimitive {...props} />);
  frame();
  expect(target()).toBe(underpowered ? 'chair.standard.glb' : 'chair.detail.glb');
  state.focus = { focused: true, original: true, sustained: true };
  view.rerender(<ModelPrimitive {...props} />);
  frame();
  expect(target()).toBe('chair.detail.glb');
  expect(useSelectedModelAsset).toHaveBeenLastCalledWith(underpowered ? undefined : 'chair.glb');
  state.focus = { focused: false, original: false, sustained: true };
  view.rerender(<ModelPrimitive {...props} />);
  frame();
  act(() => vi.advanceTimersByTime(2000));
  expect(target()).toBe(underpowered ? 'chair.standard.glb' : 'chair.detail.glb');
  expect(useSelectedModelAsset).toHaveBeenLastCalledWith(undefined);
});
