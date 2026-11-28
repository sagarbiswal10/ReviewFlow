import { useEffect, useRef } from 'react';

export const AUTO_DISMISS_MS = 5000;

/**
 * Automatically clears any displayed error, status, or success message after 5 seconds.
 */
export function useAutoDismiss<T>(
  value: T | null | undefined | false,
  onClear: () => void,
  delayMs = AUTO_DISMISS_MS,
): void {
  const clearRef = useRef(onClear);
  clearRef.current = onClear;

  useEffect(() => {
    if (!value) return;
    const timer = window.setTimeout(() => {
      clearRef.current();
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
}
