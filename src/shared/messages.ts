import type { ElementCandidate, TourStep } from './types';

// One-off messages between extension contexts. Long-lived state (chat history,
// the active walkthrough) goes through chrome.storage instead; see storage.ts.
export type RuntimeMessage =
  /** Side panel -> content script: is the tour runtime loaded in this tab? */
  | { type: 'PING' }
  /** Content script -> background: ask the backend to pick an element when label matching fails. */
  | { type: 'RESOLVE_TARGET'; step: TourStep; candidates: ElementCandidate[]; url: string }
  /** Content script in a sub-frame -> background -> top frame: the step's element was found (or lost) here. */
  | { type: 'TARGET_STATUS'; tourId: string; stepIndex: number; found: boolean };

export interface ResolveTargetResponse {
  id: number | null;
}

export function sendRuntimeMessage<Response = unknown>(message: RuntimeMessage): Promise<Response> {
  return chrome.runtime.sendMessage(message);
}
