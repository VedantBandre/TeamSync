import { useEffect, useEffectEvent, useState } from "react";

export function useAutoRefresh(refresh: () => Promise<void>, enabled = true) {
  const run = useEffectEvent(refresh);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let running = false;
    let delay = 20000;
    let timer: number;
    async function tick() {
      if (!active || running) return;
      window.clearTimeout(timer);
      if (!document.hidden && navigator.onLine) {
        running = true;
        try {
          await run();
          delay = 20000;
        } catch {
          delay = Math.min(delay * 2, 120000);
        } finally {
          running = false;
        }
      }
      if (active) timer = window.setTimeout(() => void tick(), delay);
    }
    const resume = () => void tick();
    timer = window.setTimeout(resume, delay);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [enabled]);
}

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
