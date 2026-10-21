// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EditorLayout } from './EditorLayout';
let measure: () => void;
let width = 1200;
let height = 800;
vi.stubGlobal('ResizeObserver', class {
  constructor(callback: () => void) { measure = callback; }
  observe(element: HTMLElement) {
    Object.defineProperty(element, 'clientWidth', { get: () => width });
    Object.defineProperty(element, 'clientHeight', { get: () => height });
    measure();
  }
  disconnect() {}
});
afterEach(() => { cleanup(); width = 1200; height = 800; });
it('resizes with the keyboard and clamps the panel to preserve scene space', () => {
  render(<EditorLayout editing><div>Scene</div></EditorLayout>);
  const divider = screen.getByRole('separator');
  fireEvent.keyDown(divider, { key: 'ArrowRight' });
  expect(divider.getAttribute('aria-valuenow')).toBe('568');
  fireEvent.keyDown(divider, { key: 'End' });
  expect(divider.getAttribute('aria-valuenow')).toBe('908');
  width = 800;
  act(() => measure());
  expect(divider.getAttribute('aria-valuenow')).toBe('508');
});
it('uses a horizontal divider on mobile and restores desktop size', () => {
  render(<EditorLayout editing><div>Scene</div></EditorLayout>);
  const divider = screen.getByRole('separator');
  width = 390;
  act(() => measure());
  expect(divider.getAttribute('aria-orientation')).toBe('horizontal');
  fireEvent.keyDown(divider, { key: 'ArrowUp' });
  expect(divider.getAttribute('aria-valuenow')).toBe('344');
  height = 300;
  act(() => measure());
  expect(Number(divider.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(135);
  width = 1200;
  height = 800;
  act(() => measure());
  expect(divider.getAttribute('aria-valuenow')).toBe('544');
});
it('removes the divider in viewer mode', () => {
  render(<EditorLayout editing={false}><div>Scene</div></EditorLayout>);
  expect(screen.queryByRole('separator')).toBeNull();
});
