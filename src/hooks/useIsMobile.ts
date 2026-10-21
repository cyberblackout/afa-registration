import { useEffect, useState } from 'react';

/**
 * Reactive media-query hook for mobile-only behavior (gesture gating,
 * conditional rendering of heavy desktop components). The default
 * (≤768px) must stay in lockstep with the `max-width: 768px` media
 * queries in the admin stylesheets — a mismatch leaves a dead zone
 * where neither the mobile carousel nor the desktop grid renders.
 */
export const useIsMobile = (query = '(max-width: 768px)'): boolean => {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
};

export default useIsMobile;
