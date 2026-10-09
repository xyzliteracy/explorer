// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { Group, PerspectiveCamera } from 'three';
import { TourModelFocus, useTourModelFocus } from './TourModelFocus';

const state = vi.hoisted(() => ({ frame: undefined as undefined | ((value: any) => void) }));
vi.mock('@react-three/fiber', () => ({ useFrame: (frame: any) => { state.frame = frame; } }));
afterEach(() => { cleanup(); vi.useRealTimers(); });

function Target({ id, x = 0, z }: { id: string; x?: number; z: number }) {
  const group = useRef(new Group());
  group.current.position.set(x, 0, z);
  const focus = useTourModelFocus(id, group, true);
  return <span data-testid={id}>{JSON.stringify(focus)}</span>;
}

it('boosts all visible rings after nearest center focus and starts grace once on departure', () => {
  vi.useFakeTimers();
  render(<TourModelFocus>
    <Target id="near" z={-5} />
    <Target id="far" z={-10} />
    <Target id="side" x={4} z={-5} />
  </TourModelFocus>);
  const camera = new PerspectiveCamera(60, 1, .01, 1000);
  const frame = () => act(() => state.frame!({ camera }));
  const focus = (id: string) => JSON.parse(screen.getByTestId(id).textContent!);
  frame();
  expect(focus('near')).toEqual({ focused: true, original: false, sustained: false });
  expect(focus('far').focused).toBe(false);
  act(() => vi.advanceTimersByTime(1999));
  expect(focus('side').sustained).toBe(false);
  act(() => vi.advanceTimersByTime(1));
  expect(focus('near')).toEqual({ focused: true, original: true, sustained: true });
  expect(focus('side')).toEqual({ focused: false, original: false, sustained: true });
  camera.lookAt(4, 0, -5);
  frame();
  expect(focus('side')).toEqual({ focused: true, original: false, sustained: false });
  expect(focus('near').original).toBe(true);
  act(() => vi.advanceTimersByTime(2000));
  expect(focus('near').original).toBe(false);
  expect(focus('side')).toEqual({ focused: true, original: true, sustained: true });
});
