import { arrow, autoUpdate, computePosition, flip, hide, offset, shift } from '@floating-ui/dom';
import { useEffect, useState } from 'react';

export const RING_PADDING = 4;

/**
 * Keeps the spotlight ring on `element` and the step card beside it while the
 * page scrolls, resizes or re-lays out. Returns true while the element is
 * scrolled out of view (the card then docks to the corner instead).
 */
export function useAnchor(
  element: Element | null,
  ring: HTMLElement | null,
  card: HTMLElement | null,
  arrowEl: HTMLElement | null,
): boolean {
  const [offscreen, setOffscreen] = useState(false);

  useEffect(() => {
    if (!element || !ring) return;
    let disposed = false;

    const update = () => {
      const rect = element.getBoundingClientRect();
      ring.style.transform = `translate(${rect.left - RING_PADDING}px, ${rect.top - RING_PADDING}px)`;
      ring.style.width = `${rect.width + RING_PADDING * 2}px`;
      ring.style.height = `${rect.height + RING_PADDING * 2}px`;
      if (!card) return;

      void computePosition(element, card, {
        strategy: 'fixed',
        placement: 'bottom',
        middleware: [
          offset(RING_PADDING + 12),
          flip({ padding: 12, fallbackPlacements: ['top', 'right', 'left'] }),
          shift({ padding: 12 }),
          ...(arrowEl ? [arrow({ element: arrowEl, padding: 14 })] : []),
          hide({ strategy: 'referenceHidden' }),
        ],
      }).then(({ x, y, placement, middlewareData }) => {
        if (disposed) return;
        card.style.left = `${x}px`;
        card.style.top = `${y}px`;
        card.dataset.side = placement.split('-')[0];
        if (arrowEl && middlewareData.arrow) {
          const { x: arrowX, y: arrowY } = middlewareData.arrow;
          arrowEl.style.left = arrowX != null ? `${arrowX}px` : '';
          arrowEl.style.top = arrowY != null ? `${arrowY}px` : '';
        }
        setOffscreen(Boolean(middlewareData.hide?.referenceHidden));
      });
    };

    // animationFrame: also follow moves that fire no scroll/resize event (animations, async layout).
    const stop = autoUpdate(element, card ?? ring, update, { animationFrame: true });
    return () => {
      disposed = true;
      stop();
    };
  }, [element, ring, card, arrowEl]);

  return offscreen;
}

export function scrollIntoViewIfNeeded(element: Element): void {
  const rect = element.getBoundingClientRect();
  const fullyVisible = rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth;
  if (fullyVisible) return;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
}
