import { useCallback, useEffect, useState } from 'react';
import { isAwsSignInUrl } from '../shared/config';
import { endTour, goToStep } from '../shared/tour';
import type { ActiveTour } from '../shared/types';
import { useActiveTour } from '../shared/useActiveTour';
import { MinimizedPill, StepCard } from './StepCard';
import {
  useAdvanceOnAction,
  useAdvanceOnArrival,
  useFoundInSubframe,
  useReportFound,
} from './tourEffects';
import { scrollIntoViewIfNeeded, useAnchor } from './useAnchor';
import { useTargetElement } from './useTargetElement';

const isTopFrame = window.top === window;

export function TourApp({ host }: { host: Element }) {
  const tour = useActiveTour();
  const [minimized, setMinimized] = useState(false);

  if (!tour?.steps?.[tour.currentStep]) return null;
  if (tour.status === 'completed') return isTopFrame ? <FinishedCard tour={tour} /> : null;
  if (isAwsSignInUrl(location.href)) return isTopFrame ? <SignInCard tour={tour} /> : null;

  return (
    <TourStepView
      key={`${tour.id}:${tour.currentStep}`}
      tour={tour}
      host={host}
      minimized={minimized}
      onMinimizedChange={setMinimized}
    />
  );
}

interface TourStepViewProps {
  tour: ActiveTour;
  host: Element;
  minimized: boolean;
  onMinimizedChange: (minimized: boolean) => void;
}

/** One step of the walkthrough. Remounted per step, so all per-step state starts fresh. */
function TourStepView({ tour, host, minimized, onMinimizedChange }: TourStepViewProps) {
  const index = tour.currentStep;
  const step = tour.steps[index];
  const [retryToken, setRetryToken] = useState(0);
  const target = useTargetElement(step, `${tour.id}:${index}`, host, retryToken);
  const element = target.element;

  const next = useCallback(() => void goToStep(tour.id, index, index + 1), [tour.id, index]);
  const back = useCallback(() => void goToStep(tour.id, index, index - 1), [tour.id, index]);
  const end = useCallback(() => void endTour(tour.id), [tour.id]);
  const retry = useCallback(() => setRetryToken((n) => n + 1), []);

  useAdvanceOnAction(step, element, next);
  useAdvanceOnArrival(step, isTopFrame, next);
  useReportFound(tour.id, index, element !== null, isTopFrame);
  const shownInSubframe = useFoundInSubframe(tour.id, index, isTopFrame);

  const [ring, setRing] = useState<HTMLDivElement | null>(null);
  const [card, setCard] = useState<HTMLDivElement | null>(null);
  const [arrow, setArrow] = useState<HTMLDivElement | null>(null);
  const offscreen = useAnchor(element, ring, minimized ? null : card, arrow);

  useEffect(() => {
    if (element) scrollIntoViewIfNeeded(element);
  }, [element]);

  // Sub-frames only show the step next to an element they found; the top
  // frame docks it in the corner unless a sub-frame is already showing it.
  if (!element && (!isTopFrame || shownInSubframe)) return null;

  return (
    <>
      {element && (
        <div
          ref={setRing}
          className={minimized ? 'spotlight spotlight--quiet' : 'spotlight'}
          data-hidden={offscreen || undefined}
        />
      )}
      {minimized ? (
        <MinimizedPill tour={tour} onExpand={() => onMinimizedChange(false)} />
      ) : (
        <StepCard
          tour={tour}
          status={target.status}
          via={target.via}
          docked={!element || offscreen}
          offscreen={Boolean(element) && offscreen}
          cardRef={setCard}
          arrowRef={setArrow}
          onBack={back}
          onNext={next}
          onEnd={end}
          onRetry={retry}
          onShowMe={() => element && scrollIntoViewIfNeeded(element)}
          onMinimize={() => onMinimizedChange(true)}
        />
      )}
    </>
  );
}

function FinishedCard({ tour }: { tour: ActiveTour }) {
  useEffect(() => {
    const timer = window.setTimeout(() => void endTour(tour.id), 8000);
    return () => window.clearTimeout(timer);
  }, [tour.id]);

  return (
    <div className="card card--docked" role="status">
      <div className="card__head">
        <span className="marker" aria-hidden="true">
          <svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg>
        </span>
        <h2 className="card__title">Walkthrough complete</h2>
      </div>
      <p className="card__body">
        You finished “{tour.title}”. Ask the assistant in the side panel if you want to take it further.
      </p>
      <div className="card__foot">
        <button type="button" className="button button--primary" onClick={() => void endTour(tour.id)}>
          Done
        </button>
      </div>
    </div>
  );
}

function SignInCard({ tour }: { tour: ActiveTour }) {
  return (
    <div className="card card--docked" role="status">
      <div className="card__head">
        <span className="marker" aria-hidden="true">
          {tour.currentStep + 1}
        </span>
        <h2 className="card__title">Sign in to continue</h2>
      </div>
      <p className="card__body">Sign in to the AWS console and “{tour.title}” picks up where you left off.</p>
      <div className="card__foot">
        <button type="button" className="button button--ghost" onClick={() => void endTour(tour.id)}>
          End walkthrough
        </button>
      </div>
    </div>
  );
}
