import { AWS_CONSOLE_HOME, isAwsConsoleUrl } from './config';
import { getItem, removeItem, setItem } from './storage';
import type { ActiveTour, TourPlan } from './types';

// Walkthrough state transitions. Several frames and the side panel can act on
// the same tour at once (e.g. a click handler in one frame and an auto-advance
// in another), so every transition is compare-and-set on the step it expects.

export function createActiveTour(plan: TourPlan, sourceId?: string): ActiveTour {
  return {
    ...plan,
    id: crypto.randomUUID(),
    sourceId,
    currentStep: 0,
    status: 'active',
    startedAt: Date.now(),
  };
}

/** Moves from step `from` to step `to`; past the last step completes the tour. No-op if the tour moved on already. */
export async function goToStep(tourId: string, from: number, to: number): Promise<void> {
  const tour = await getItem('activeTour');
  if (!tour || tour.id !== tourId || tour.currentStep !== from || tour.status !== 'active') return;
  if (to >= tour.steps.length) {
    await setItem('activeTour', { ...tour, currentStep: tour.steps.length - 1, status: 'completed' });
  } else {
    await setItem('activeTour', { ...tour, currentStep: Math.max(0, to) });
  }
}

export async function endTour(tourId?: string): Promise<void> {
  const tour = await getItem('activeTour');
  if (tour && (!tourId || tour.id === tourId)) await removeItem('activeTour');
}

/** Where a walkthrough should open: its first navigate step, or the console home. */
export function startUrlFor(plan: TourPlan): string {
  const first = plan.steps.find((step) => step.action === 'navigate' && isAwsConsoleUrl(step.url));
  return first?.url ?? AWS_CONSOLE_HOME;
}

// Some consoles redirect to a different first path segment than the one you open.
const SERVICE_ALIASES: Record<string, string> = {
  vpcconsole: 'vpc',
  iamv2: 'iam',
  dynamodbv2: 'dynamodb',
  'cloudfront-v4': 'cloudfront',
};

function serviceOf(url: URL): string | undefined {
  const segment = url.pathname.split('/').find(Boolean)?.toLowerCase();
  return segment ? (SERVICE_ALIASES[segment] ?? segment) : undefined;
}

/** True when `currentUrl` is already the console a navigate step points to. */
export function isOnStepPage(stepUrl: string | null | undefined, currentUrl: string): boolean {
  if (!stepUrl || !isAwsConsoleUrl(currentUrl)) return false;
  try {
    const wanted = serviceOf(new URL(stepUrl));
    return wanted !== undefined && wanted === serviceOf(new URL(currentUrl));
  } catch {
    return false;
  }
}
