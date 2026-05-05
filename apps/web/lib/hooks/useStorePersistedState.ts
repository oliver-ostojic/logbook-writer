import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';

interface PersistOptions<T> {
  serialize?: (value: T) => unknown;
  deserialize?: (raw: unknown) => T;
}

function makeStorageKey(scope: string, key: string) {
  return `fairness-dashboard-${scope}-${key}`;
}

function readFromStorage<T>(
  storageKey: string,
  defaultValue: T,
  deserialize?: (raw: unknown) => T
): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return defaultValue;
    const parsed = JSON.parse(raw);
    return deserialize ? deserialize(parsed) : (parsed as T);
  } catch (e) {
    console.error(`Failed to load ${storageKey}:`, e);
    return defaultValue;
  }
}

function writeToStorage<T>(
  storageKey: string,
  value: T,
  serialize?: (value: T) => unknown
) {
  if (typeof window === 'undefined') return;
  try {
    const payload = serialize ? serialize(value) : value;
    localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch (e) {
    console.error(`Failed to save ${storageKey}:`, e);
  }
}

export function useStorePersistedState<T>(
  scope: string,
  key: string,
  defaultValue: T,
  options?: PersistOptions<T>
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const storageKey = makeStorageKey(scope, key);
  const [value, setValue] = useState<T>(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const loaded = readFromStorage(storageKey, defaultValue, optionsRef.current?.deserialize);
    setValue(loaded);
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    writeToStorage(storageKey, value, optionsRef.current?.serialize);
  }, [storageKey, value, hydrated]);

  return [value, setValue, hydrated];
}
