// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { useViewPointTour } from './useViewPointTour';

afterEach(cleanup);
const document = createSpatialDocument('');
describe('view point tour policy', () => {
  it('starts mobile inspection immediately, cannot exit, and loops both ways', () => {
    const { result } = renderHook(() => useViewPointTour(document, 3, true, false));
    expect(result.current.index).toBe(0);
    expect(result.current.exit).toBeUndefined();
    act(() => result.current.traverse(-1));
    expect(result.current.index).toBe(2);
    act(() => result.current.traverse(1));
    expect(result.current.index).toBe(0);
    act(() => result.current.traverse(1));
    expect(result.current.index).toBe(1);
  });
  it('keeps mobile editing and scenes without points in orbit, resets new scenes', () => {
    const { result, rerender } = renderHook(({ doc, count, editor }) => useViewPointTour(doc, count, true, editor), {
      initialProps: { doc: document, count: 3, editor: false },
    });
    act(() => result.current.traverse(1));
    rerender({ doc: createSpatialDocument(''), count: 3, editor: false });
    expect(result.current.index).toBe(0);
    rerender({ doc: document, count: 3, editor: true });
    expect(result.current.index).toBeUndefined();
    rerender({ doc: document, count: 0, editor: false });
    expect(result.current.index).toBeUndefined();
    act(() => result.current.traverse(1));
    expect(result.current.index).toBeUndefined();
  });
  it('keeps a single mobile point fixed', () => {
    const { result } = renderHook(() => useViewPointTour(document, 1, true, false));
    act(() => result.current.traverse(-1));
    expect(result.current.index).toBe(0);
    act(() => result.current.traverse(1));
    expect(result.current.index).toBe(0);
  });
  it('keeps desktop tours opt-in with an exit and preserves the orbit target', () => {
    const { result } = renderHook(() => useViewPointTour(document, 3, false, false));
    expect(result.current.index).toBeUndefined();
    act(() => result.current.start([3, 4, 5]));
    expect(result.current.index).toBe(0);
    act(() => result.current.traverse(-1));
    expect(result.current.index).toBe(2);
    expect(result.current.orbitTarget).toEqual([3, 4, 5]);
    act(() => result.current.exit?.());
    expect(result.current.index).toBeUndefined();
  });
});
