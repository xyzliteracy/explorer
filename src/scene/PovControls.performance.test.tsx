// @vitest-environment jsdom
import { render, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { PovControls } from './PovControls';
const mock = vi.hoisted(() => ({ state: {} as any, frame: undefined as any, collision: false }));
vi.mock('@react-three/fiber', () => ({ useThree: () => mock.state, useFrame: (callback: unknown) => { mock.frame = callback; } }));
vi.mock('./povCollision', () => ({ sweptSphereIntersectsScene: () => mock.collision }));
beforeEach(() => {
  mock.state = { camera: new PerspectiveCamera(), scene: new Scene(), gl: { domElement: document.createElement('canvas') }, invalidate: vi.fn() };
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: mock.state.gl.domElement });
  mock.collision = false;
});
afterEach(cleanup);
it('wakes demand rendering on keyboard/mouse, continues movement, then stops on key release', () => {
  render(<PovControls active collision={false} speed={1} collisionRadius={.1} onLockChange={() => {}}/>);
  fireEvent.keyDown(document, { code: 'KeyW' }); expect(mock.state.invalidate).toHaveBeenCalledOnce();
  mock.frame({}, .016); expect(mock.state.camera.position.z).toBeLessThan(0); expect(mock.state.invalidate).toHaveBeenCalledTimes(2);
  fireEvent.keyUp(document, { code: 'KeyW' }); mock.state.invalidate.mockClear(); mock.frame({}, .016); expect(mock.state.invalidate).not.toHaveBeenCalled();
  const movement = new MouseEvent('mousemove'); Object.defineProperties(movement, { movementX: { value: 5 }, movementY: { value: 0 } });
  fireEvent(document, movement); expect(mock.state.invalidate).toHaveBeenCalledOnce();
});
it('keeps responding while movement is collision-blocked and clears input on visibility change', () => {
  mock.collision = true;
  render(<PovControls active collision speed={1} collisionRadius={.1} onLockChange={() => {}}/>);
  fireEvent.keyDown(document, { code: 'KeyW' }); mock.state.invalidate.mockClear(); mock.frame({}, .016);
  expect(mock.state.camera.position.z).toBe(0); expect(mock.state.invalidate).toHaveBeenCalledOnce();
  fireEvent(document, new Event('visibilitychange')); mock.state.invalidate.mockClear(); mock.frame({}, .016); expect(mock.state.invalidate).not.toHaveBeenCalled();
});
