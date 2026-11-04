import { useEffect, useRef, useState } from 'react';
import { sendRuntimeMessage, type ResolveTargetResponse } from '../shared/messages';
import type { TargetSpec, TourStep } from '../shared/types';
import { MIN_SCORE, collectCandidates, findTarget, isElementVisible } from './finder';

export type TargetStatus = 'none' | 'searching' | 'found' | 'missing';

export interface TargetState {
  element: Element | null;
  status: TargetStatus;
  /** How the element was found: by its label, or picked by the backend from the page's elements. */
  via: 'label' | 'ai' | null;
}

const SEARCH_GAP_MS = 300; // minimum time between scans while looking
const FOUND_GAP_MS = 1000; // ...and once found (still rescanning in case it re-renders)
const ASK_BACKEND_AFTER_MS = 2500;
const MISSING_AFTER_MS = 5000;
const MAX_BACKEND_ATTEMPTS = 3;

/** What to look for on the page for a step, or null if the step has nothing to highlight. */
export function specForStep(step: TourStep | undefined): TargetSpec | null {
  if (!step?.target?.text || step.action === 'navigate') return null;
  const kind = step.target.kind;
  // On a "type" step the label names a field: highlight the field, not its caption.
  if (step.action === 'type' && (!kind || kind === 'any' || kind === 'text')) return { ...step.target, kind: 'input' };
  return step.target;
}

/**
 * Finds the element for `step` and keeps tracking it as the AWS console
 * re-renders: rescans on DOM mutations (throttled), swaps to a better match if
 * one appears, re-finds it if React replaces the node, and after a few seconds
 * without a label match asks the backend to pick from the visible elements.
 */
export function useTargetElement(step: TourStep, stepKey: string, host: Element, retryToken: number): TargetState {
  const stepRef = useRef(step);
  stepRef.current = step;
  const [state, setState] = useState<TargetState>(() => ({
    element: null,
    status: specForStep(step) ? 'searching' : 'none',
    via: null,
  }));

  useEffect(() => {
    const currentStep = stepRef.current;
    const spec = specForStep(currentStep);
    if (!spec) {
      setState({ element: null, status: 'none', via: null });
      return;
    }

    let disposed = false;
    let current: { element: Element; score: number; via: 'label' | 'ai' } | null = null;
    let timer: number | undefined;
    let lastScan = 0;
    let pageUrl = location.href;
    let pageSince = performance.now();
    let backendAttempts = 0;
    let backendBusy = false;
    let backendTriedUrl = '';
    let backendDoneUrl = '';

    const usable = (el: Element) => el.isConnected && isElementVisible(el);
    const commit = (next: TargetState) =>
      setState((prev) =>
        prev.element === next.element && prev.status === next.status && prev.via === next.via ? prev : next,
      );

    const askBackend = async () => {
      backendBusy = true;
      backendAttempts++;
      backendTriedUrl = pageUrl;
      const url = pageUrl;
      try {
        const snapshot = collectCandidates({ exclude: host });
        if (snapshot.candidates.length < 3) return; // an empty frame; nothing to choose from
        const response = await sendRuntimeMessage<ResolveTargetResponse>({
          type: 'RESOLVE_TARGET',
          step: currentStep,
          candidates: snapshot.candidates,
          url,
        });
        const element = typeof response?.id === 'number' ? snapshot.elements[response.id] : undefined;
        if (!disposed && !current && element && usable(element)) {
          current = { element, score: MIN_SCORE, via: 'ai' };
        }
      } catch {
        // Backend unreachable or extension reloaded: keep scanning by label.
      } finally {
        backendBusy = false;
        backendDoneUrl = url;
        if (!disposed) scan();
      }
    };

    const scan = () => {
      timer = undefined;
      if (disposed) return;
      const now = performance.now();
      lastScan = now;

      const match = findTarget(spec, { exclude: host });
      if (match && (!current || !usable(current.element) || (match.element !== current.element && match.score > current.score + 4))) {
        current = { element: match.element, score: match.score, via: 'label' };
      } else if (current && !usable(current.element)) {
        current = null;
      }
      if (current) {
        commit({ element: current.element, status: 'found', via: current.via });
        return;
      }

      // Single-page navigation: give the new page its own grace period and backend attempt.
      if (location.href !== pageUrl) {
        pageUrl = location.href;
        pageSince = now;
      }
      const elapsed = now - pageSince;
      if (!backendBusy && backendAttempts < MAX_BACKEND_ATTEMPTS && elapsed > ASK_BACKEND_AFTER_MS && backendTriedUrl !== pageUrl) {
        void askBackend();
      }
      const backendDone = backendDoneUrl === pageUrl || backendAttempts >= MAX_BACKEND_ATTEMPTS;
      commit({
        element: null,
        status: elapsed > MISSING_AFTER_MS && backendDone && !backendBusy ? 'missing' : 'searching',
        via: null,
      });
    };

    const schedule = () => {
      if (timer !== undefined || disposed) return;
      const gap = current ? FOUND_GAP_MS : SEARCH_GAP_MS;
      timer = window.setTimeout(scan, Math.max(0, gap - (performance.now() - lastScan)));
    };

    // Our own UI lives in a shadow root, which this observer doesn't see, so it can't trigger itself.
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'aria-expanded', 'disabled', 'open'],
    });
    const heartbeat = window.setInterval(schedule, 1000);
    scan();

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(heartbeat);
      window.clearTimeout(timer);
    };
  }, [stepKey, host, retryToken]);

  return state;
}
