// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ModelPrimitive } from './ModelPrimitive';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { useModelAsset, useOriginalModelAsset } from '../performance/ModelRuntime';
const state = vi.hoisted(() => ({ frame: undefined as undefined | ((value: any) => void), pixels: 500, ahead: 500, pressure: false }));
vi.mock('@react-three/fiber', () => ({ useFrame: (frame: any) => { state.frame = frame; } }));
vi.mock('../performance/modelVisibility', async original => ({ ...(await original<any>()), modelScreenPixels: (_camera: unknown, _world: unknown, _height: number, margin?: number) => margin ? state.ahead : state.pixels }));
vi.mock('../performance/ModelRuntime', () => ({ useOriginalModelAsset: vi.fn(), useModelAsset: vi.fn(), useModelPresentation: vi.fn(), useModelRetryGeneration: () => 0, useModelMemoryPressure: () => state.pressure, useModelSceneRevealed: () => true }));
vi.mock('../assets', () => ({ useAssetResolver: () => (url: string) => url }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); state.pressure = false; vi.mocked(useModelAsset).mockClear(); vi.mocked(useOriginalModelAsset).mockClear(); });
const node = createSpatialDocument('"Chair/+0+1/+0+1/+0+1":"model: chair.glb"').renderNodes[0];
it('keeps full quality across tour, selection and renderer quality changes', () => {
  vi.stubGlobal('navigator', { deviceMemory: 8, hardwareConcurrency: 8 });
  const view = render(<ModelPrimitive node={node} />);
  for (const selected of [true, false]) {
    view.rerender(<ModelPrimitive node={node} tourMode selected={selected} maxTier="preview" />);
  }
  const requested = vi.mocked(useModelAsset).mock.calls.map(call => call[0]).filter(Boolean);
  expect(requested.every(url => url === 'chair.detail.glb')).toBe(true);
});
it.each([
  [1, 8, true], [2, 2, true], [2, 8, false], [8, 2, false], [undefined, 2, false],
])('only permits previews with critical device evidence (%s GiB, %s cores)', (memory, cores, critical) => {
  vi.stubGlobal('navigator', { deviceMemory: memory, hardwareConcurrency: cores });
  render(<ModelPrimitive node={node} />);
  expect(useModelAsset).toHaveBeenNthCalledWith(1, critical ? 'chair.preview.glb' : 'chair.detail.glb', 2000);
});

it('never downgrades visible originals; releases only cold originals under pressure', () => {
  vi.useFakeTimers();
  vi.stubGlobal('navigator', { deviceMemory: 8, hardwareConcurrency: 8 });
  state.pixels = 500; state.ahead = 500; state.pressure = true;
  const view = render(<ModelPrimitive node={node} />);
  Object.assign(view.container.querySelector('group')!, { updateWorldMatrix: () => {} });
  const frame = () => act(() => state.frame!({ camera: {}, size: { height: 800 } }));
  const requestedOriginal = () => vi.mocked(useOriginalModelAsset).mock.calls.at(-1)?.[0];
  frame(); expect(requestedOriginal()).toBe('chair.glb');
  state.pixels = 1; state.ahead = 1; frame();
  act(() => vi.advanceTimersByTime(9000)); expect(requestedOriginal()).toBe('chair.glb');
  state.pixels = 0; state.ahead = 0; frame();
  act(() => vi.advanceTimersByTime(7999)); expect(requestedOriginal()).toBe('chair.glb');
  state.pixels = 500; state.ahead = 500; frame();
  act(() => vi.advanceTimersByTime(2)); expect(requestedOriginal()).toBe('chair.glb');
  state.pixels = 0; state.ahead = 0; frame();
  act(() => vi.advanceTimersByTime(8000)); expect(requestedOriginal()).toBeUndefined();
  expect(vi.mocked(useModelAsset).mock.calls.at(-2)?.[0]).toBe('chair.detail.glb');
});
it('keeps offscreen originals cached without memory pressure', () => {
  vi.useFakeTimers(); vi.stubGlobal('navigator', { deviceMemory: 8, hardwareConcurrency: 8 });
  state.pixels = 500; state.ahead = 500; state.pressure = false;
  const view = render(<ModelPrimitive node={node} />);
  Object.assign(view.container.querySelector('group')!, { updateWorldMatrix: () => {} });
  const frame = () => act(() => state.frame!({ camera: {}, size: { height: 800 } }));
  frame(); state.pixels = 0; state.ahead = 0; frame();
  act(() => vi.advanceTimersByTime(60000));
  expect(vi.mocked(useOriginalModelAsset).mock.calls.at(-1)?.[0]).toBe('chair.glb');
});
