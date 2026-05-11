import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Drives a right-side detail Sheet from the URL search params.
 * Pattern: ?drawer=<key>&id=<id>
 *
 * Reload-safe, deep-linkable, and back/forward friendly.
 */
export function useDrawerParam(key: string) {
  const [params, setParams] = useSearchParams();
  const open = params.get('drawer') === key;
  const id = params.get('id');

  const openDrawer = useCallback(
    (newId: string) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('drawer', key);
        next.set('id', newId);
        return next;
      });
    },
    [key, setParams],
  );

  const closeDrawer = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('drawer');
      next.delete('id');
      return next;
    });
  }, [setParams]);

  return { open, id, openDrawer, closeDrawer };
}
