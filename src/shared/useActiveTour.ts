import { useEffect, useState } from 'react';
import { getItem, onItemChanged } from './storage';
import type { ActiveTour } from './types';

/** The walkthrough currently running (in any tab), kept live from chrome.storage. */
export function useActiveTour(): ActiveTour | null {
  const [tour, setTour] = useState<ActiveTour | null>(null);

  useEffect(() => {
    let alive = true;
    getItem('activeTour')
      .then((value) => alive && setTour(value ?? null))
      .catch(() => {});
    const unsubscribe = onItemChanged('activeTour', (value) => setTour(value ?? null));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  return tour;
}
