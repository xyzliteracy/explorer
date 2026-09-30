import { useSyncExternalStore } from 'react';

// Include touch-only phones/tablets in landscape as well as narrow windows.
export const MOBILE_VIEWPORT_QUERY = '(max-width: 640px), (hover: none) and (pointer: coarse)';
function subscribe(onChange: () => void) {
  const query = window.matchMedia(MOBILE_VIEWPORT_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
function getSnapshot() {
  return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
}
export function useMobileViewport() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
