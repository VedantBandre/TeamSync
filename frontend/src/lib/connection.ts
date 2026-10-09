import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const slowRequests = new Set<symbol>();
let snapshot = false;
function publish() {
  const next = slowRequests.size > 0;
  if (next === snapshot) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}
export function trackConnection() {
  const id = Symbol();
  const timer = window.setTimeout(() => {
    slowRequests.add(id);
    publish();
  }, 6000);
  return () => {
    window.clearTimeout(timer);
    slowRequests.delete(id);
    publish();
  };
}
export function useSlowConnection() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => false,
  );
}
