// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MOBILE_VIEWPORT_QUERY, useMobileViewport } from './useMobileViewport';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('detects mobile immediately and responds to viewport changes', () => {
  const listeners = new Set<() => void>();
  const query = {
    matches: true,
    addEventListener: vi.fn((_event: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_event: string, listener: () => void) => listeners.delete(listener)),
  };
  const matchMedia = vi.fn(() => query);
  vi.stubGlobal('matchMedia', matchMedia);
  const { result, unmount } = renderHook(useMobileViewport);
  expect(matchMedia).toHaveBeenCalledWith(MOBILE_VIEWPORT_QUERY);
  expect(result.current).toBe(true);
  act(() => { query.matches = false; listeners.forEach(listener => listener()); });
  expect(result.current).toBe(false);
  act(() => { query.matches = true; listeners.forEach(listener => listener()); });
  expect(result.current).toBe(true);
  unmount();
  expect(listeners.size).toBe(0);
});
