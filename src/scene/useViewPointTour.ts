import { useCallback, useState } from 'react';
import type { SpatialDocument } from '../model/SpatialDocument';

export function useViewPointTour(document: SpatialDocument, count: number, mobile: boolean, editorMode: boolean) {
  const [tour, setTour] = useState<{ document: SpatialDocument; index: number; orbitTarget?: [number, number, number] }>();
  const forced = mobile && !editorMode && count > 0;
  const current = tour?.document === document ? tour : undefined;
  const index = count > 0 && (forced || (!mobile && current)) ? (current?.index ?? 0) % count : undefined;
  const start = useCallback((orbitTarget?: [number, number, number]) => setTour({ document, index: 0, orbitTarget }), [document]);
  const traverse = useCallback((delta: number) => {
    if (!count || index === undefined) return;
    setTour({ document, index: ((index + delta) % count + count) % count, orbitTarget: current?.orbitTarget });
  }, [document, count, index, current?.orbitTarget]);
  const exit = useCallback(() => { if (!mobile) setTour(undefined); }, [mobile]);
  return { index, start, traverse, exit: mobile ? undefined : exit, orbitTarget: current?.orbitTarget };
}
