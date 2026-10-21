import { useCallback, useState } from 'react';

function readStoredValue<T>(key: string, fallback: T, initialValue?: T): T {
  if (initialValue !== undefined) {
    return initialValue;
  }

  if (typeof window === 'undefined') {
    return fallback;
  }

  const stored = window.localStorage.getItem(key);
  if (stored === null) {
    return fallback;
  }

  try {
    return JSON.parse(stored) as T;
  } catch {
    return fallback;
  }
}

export function usePersistentState<T>(key: string, fallback: T, initialValue?: T) {
  const [value, setValue] = useState<T>(() => readStoredValue(key, fallback, initialValue));

  const setPersistentValue: typeof setValue = useCallback((nextValue) => {
    setValue((previous) => {
      const resolved = nextValue instanceof Function ? nextValue(previous) : nextValue;
      window.localStorage.setItem(key, JSON.stringify(resolved));
      return resolved;
    });
  }, [key]);

  return [value, setPersistentValue] as const;
}
