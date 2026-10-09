import { createContext, useContext, useEffect, useMemo, useState, type ReactNode, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { cameraModelDistance } from './modelVisibility';

export const TOUR_DWELL_MS = 2000;

/** Timers also settle focus when demand rendering stops after a pan. */
export class TourFocusDwell {
  private candidate?: string;
  private original?: string;
  private focusTimer?: ReturnType<typeof setTimeout>;
  private awayTimer?: ReturnType<typeof setTimeout>;
  constructor(private changed: (id: string | undefined) => void) {}
  update(id?: string) {
    if (id === this.candidate) return;
    this.candidate = id;
    clearTimeout(this.focusTimer);
    if (id === this.original) { clearTimeout(this.awayTimer); this.awayTimer = undefined; }
    if (this.original && id !== this.original && this.awayTimer === undefined) this.awayTimer = setTimeout(() => {
      this.awayTimer = undefined;
      this.original = undefined;
      this.changed(undefined);
    }, TOUR_DWELL_MS);
    if (id && id !== this.original) this.focusTimer = setTimeout(() => {
      clearTimeout(this.awayTimer);
      this.awayTimer = undefined;
      this.original = id;
      this.changed(id);
    }, TOUR_DWELL_MS);
  }
  close() { clearTimeout(this.focusTimer); clearTimeout(this.awayTimer); }
}

type Target = { id: string; group: RefObject<Group | null> };
const Context = createContext<{ targets: Set<Target>; focused?: string; original?: string } | undefined>(undefined);

export function TourModelFocus({ children }: { children: ReactNode }) {
  const targets = useMemo(() => new Set<Target>(), []);
  const [focused, setFocused] = useState<string>();
  const [original, setOriginal] = useState<string>();
  const dwell = useMemo(() => new TourFocusDwell(setOriginal), []);
  useEffect(() => () => dwell.close(), [dwell]);
  useFrame(({ camera }) => {
    let nearest: string | undefined;
    let distance = Infinity;
    for (const target of targets) {
      const group = target.group.current;
      if (!group) continue;
      group.updateWorldMatrix(true, false);
      const next = cameraModelDistance(camera, group.matrixWorld);
      if (next < distance) { distance = next; nearest = target.id; }
    }
    setFocused(previous => previous === nearest ? previous : nearest);
    dwell.update(nearest);
  }, -1);
  return <Context.Provider value={{ targets, focused, original }}>{children}</Context.Provider>;
}

export function useTourModelFocus(id: string, group: RefObject<Group | null>, enabled: boolean) {
  const context = useContext(Context);
  const targets = context?.targets;
  useEffect(() => {
    if (!enabled || !targets) return;
    const target = { id, group };
    targets.add(target);
    return () => { targets.delete(target); };
  }, [targets, id, group, enabled]);
  return {
    focused: enabled && context?.focused === id,
    original: enabled && context?.original === id,
    // The away grace retains the old original, but starts ring downgrades now
    // so it does not compound with each model's two-second downgrade timer.
    sustained: enabled && context?.focused !== undefined && context.focused === context.original,
  };
}
