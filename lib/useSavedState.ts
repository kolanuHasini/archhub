"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// Saves a piece of data in the visitor's own browser, so their work is still
// there when they come back. Nothing is sent to a server.
//
// If the browser blocks storage (for example in private mode), the data is
// kept in memory instead, so the page keeps working until it is closed.

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function read(key: string): string | null {
  const inMemory = memory.get(key);
  if (inMemory !== undefined) return inMemory;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    memory.delete(key);
  } catch {
    memory.set(key, value ?? "");
  }
  listeners.forEach((listener) => listener());
}

/** False when the browser's storage was full or blocked for this item. */
export function isSavedInBrowser(key: string): boolean {
  return !memory.has(key);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * `initial` must be a constant defined outside the component.
 * Returns [value, save, reset].
 */
export function useSavedState<T extends object>(
  key: string,
  initial: T,
): [T, (next: T) => void, () => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );

  const value = useMemo<T>(() => {
    if (!raw) return initial;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ...initial, ...(parsed as Partial<T>) };
      }
    } catch {
      // Saved data was damaged; fall back to a clean start.
    }
    return initial;
  }, [raw, initial]);

  const save = useCallback(
    (next: T) => write(key, JSON.stringify(next)),
    [key],
  );
  const reset = useCallback(() => write(key, null), [key]);

  return [value, save, reset];
}
