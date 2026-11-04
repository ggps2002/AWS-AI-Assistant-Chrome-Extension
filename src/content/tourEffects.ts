import { useEffect, useState } from 'react';
import { sendRuntimeMessage, type RuntimeMessage } from '../shared/messages';
import { isOnStepPage } from '../shared/tour';
import type { TourStep } from '../shared/types';

/** Advances when the user does what the step asks: clicks the element, or fills in the field. */
export function useAdvanceOnAction(step: TourStep, element: Element | null, advance: () => void): void {
  useEffect(() => {
    if (!element) return;

    if (step.action === 'click') {
      // Document capture phase, so the page can't swallow the click before we see it...
      const onDocumentClick = (event: Event) => {
        if (event.composedPath().includes(element)) advance();
      };
      // ...plus the element itself, because composedPath() at document level
      // can't see into closed shadow roots. A double advance is a no-op.
      document.addEventListener('click', onDocumentClick, true);
      element.addEventListener('click', advance);
      return () => {
        document.removeEventListener('click', onDocumentClick, true);
        element.removeEventListener('click', advance);
      };
    }

    if (step.action === 'type') {
      let timer: number | undefined;
      const onKeyDown = (event: Event) => {
        const key = event as KeyboardEvent;
        if (key.key === 'Enter' && !key.isComposing && element instanceof HTMLInputElement) advance();
      };
      // `change` fires when the field loses focus with a new value; wait for focus to settle.
      const onChange = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(advance, 400);
      };
      element.addEventListener('keydown', onKeyDown);
      element.addEventListener('change', onChange);
      return () => {
        window.clearTimeout(timer);
        element.removeEventListener('keydown', onKeyDown);
        element.removeEventListener('change', onChange);
      };
    }
  }, [step.action, element, advance]);
}

/** Completes a navigate step as soon as the browser is on that console (including single-page navigation). */
export function useAdvanceOnArrival(step: TourStep, enabled: boolean, advance: () => void): void {
  useEffect(() => {
    if (!enabled || step.action !== 'navigate') return;
    const check = () => {
      if (isOnStepPage(step.url, location.href)) advance();
    };
    check();
    const interval = window.setInterval(check, 1000);
    return () => window.clearInterval(interval);
  }, [enabled, step.action, step.url, advance]);
}

const HEARTBEAT_MS = 2000;
const STALE_AFTER_MS = 5000;

/** Sub-frames: tell the top frame (via the background worker) that this frame is showing the step. */
export function useReportFound(tourId: string, stepIndex: number, found: boolean, isTopFrame: boolean): void {
  useEffect(() => {
    if (isTopFrame) return;
    const report = (value: boolean) =>
      sendRuntimeMessage({ type: 'TARGET_STATUS', tourId, stepIndex, found: value }).catch(() => {});
    report(found);
    if (!found) return;
    // Heartbeat, so the top frame notices if this frame navigates away without saying so.
    const interval = window.setInterval(() => report(true), HEARTBEAT_MS);
    return () => {
      window.clearInterval(interval);
      report(false);
    };
  }, [tourId, stepIndex, found, isTopFrame]);
}

/** Top frame: is some sub-frame currently showing this step? */
export function useFoundInSubframe(tourId: string, stepIndex: number, isTopFrame: boolean): boolean {
  const [found, setFound] = useState(false);

  useEffect(() => {
    if (!isTopFrame) return;
    let expiry: number | undefined;
    const listener = (message: RuntimeMessage) => {
      if (message?.type !== 'TARGET_STATUS' || message.tourId !== tourId || message.stepIndex !== stepIndex) return;
      window.clearTimeout(expiry);
      setFound(message.found);
      if (message.found) expiry = window.setTimeout(() => setFound(false), STALE_AFTER_MS);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      window.clearTimeout(expiry);
    };
  }, [tourId, stepIndex, isTopFrame]);

  return found;
}
