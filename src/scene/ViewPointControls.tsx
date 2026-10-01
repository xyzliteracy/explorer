import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import type { SpatialNode } from '../model/SpatialNode';
import type { OrbitControls } from 'three-stdlib';

export function ViewPointControls({ point, orbitTarget, onTraverse, onExit }: {
  point?: SpatialNode; orbitTarget?: [number, number, number]; onTraverse: (delta: number) => void; onExit?: () => void;
}) {
  const { camera, gl, invalidate, get } = useThree();
  const saved = useRef<{ position: Vector3; quaternion: Quaternion; target?: Vector3 } | undefined>(undefined);
  useEffect(() => {
    if (!point) {
      if (saved.current) {
        camera.position.copy(saved.current.position);
        camera.quaternion.copy(saved.current.quaternion);
        const controls = get().controls as OrbitControls | null;
        if (saved.current.target && controls?.target) {
          controls.target.copy(saved.current.target);
          controls.update();
        }
        saved.current = undefined;
        invalidate();
      }
      return;
    }
    saved.current ??= { position: camera.position.clone(), quaternion: camera.quaternion.clone(), target: orbitTarget ? new Vector3(...orbitTarget) : (get().controls as OrbitControls | null)?.target?.clone() };
    camera.position.set(...point.transform.position);
    camera.rotation.set(...point.transform.rotation, 'XYZ');
    invalidate();
    const element = gl.domElement;
    const oldTouchAction = element.style.touchAction;
    element.style.touchAction = 'none';
    const angles = new Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    let drag: { id: number; lastX: number; lastY: number } | undefined;
    const down = (event: PointerEvent) => {
      if (drag || event.button !== 0 || !event.isPrimary) return;
      drag = { id: event.pointerId, lastX: event.clientX, lastY: event.clientY };
      element.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      angles.setFromQuaternion(camera.quaternion, 'YXZ');
      angles.y -= (event.clientX - drag.lastX) * 0.005;
      angles.x = MathUtils.clamp(angles.x - (event.clientY - drag.lastY) * 0.005, -Math.PI / 2 + .01, Math.PI / 2 - .01);
      camera.rotation.set(angles.x, angles.y, 0, 'YXZ');
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      invalidate();
    };
    const up = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      drag = undefined;
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    };
    const cancel = () => { drag = undefined; };
    const key = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]'))) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return;
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Escape'].includes(event.code)) {
        event.preventDefault();
        if (event.code === 'Escape') onExit?.();
        else onTraverse(['ArrowDown', 'PageDown'].includes(event.code) ? 1 : -1);
      }
    };
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', cancel);
    return () => {
      element.style.touchAction = oldTouchAction;
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', cancel);
      if (drag && element.hasPointerCapture(drag.id)) element.releasePointerCapture(drag.id);
    };
  }, [point, camera, gl, invalidate, onTraverse, onExit, get, orbitTarget]);
  return null;
}
