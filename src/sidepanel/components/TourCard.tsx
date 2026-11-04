import { useState } from 'react';
import { endTour } from '../../shared/tour';
import type { ActiveTour, TourPlan } from '../../shared/types';
import { startTour } from '../startTour';

const COLLAPSED_STEPS = 4;

interface TourCardProps {
  plan: TourPlan;
  messageId: string;
  activeTour: ActiveTour | null;
}

/** A walkthrough offered in the chat: its steps as a trail, and the button that starts it in the console. */
export function TourCard({ plan, messageId, activeTour }: TourCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const running = activeTour?.sourceId === messageId ? activeTour : null;
  const current = running ? running.currentStep : -1;
  const steps = expanded ? plan.steps : plan.steps.slice(0, COLLAPSED_STEPS);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      await startTour(plan, messageId);
    } catch {
      setError('The walkthrough didn’t start. Open the AWS console in this window, then try again.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <section className="tour-card" aria-label={`Walkthrough: ${plan.title}`}>
      <h3 className="tour-card__title">{plan.title}</h3>
      <p className="tour-card__meta">
        {plan.steps.length} steps{plan.service ? ` in ${plan.service}` : ''}
      </p>

      <ol className="trail">
        {steps.map((step, i) => {
          const state = running?.status === 'completed' || i < current ? 'done' : i === current ? 'current' : 'todo';
          return (
            <li key={i} className={`trail__step trail__step--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="trail__marker" aria-hidden="true">
                {i + 1}
              </span>
              <span className="trail__title">{step.title}</span>
            </li>
          );
        })}
      </ol>

      {plan.steps.length > COLLAPSED_STEPS && (
        <button type="button" className="text-button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Show fewer steps' : `Show all ${plan.steps.length} steps`}
        </button>
      )}

      <div className="tour-card__actions">
        {running?.status === 'completed' ? (
          <>
            <span className="tour-card__status">Completed</span>
            <button type="button" className="button button--secondary" onClick={start} disabled={starting}>
              Run again
            </button>
          </>
        ) : running ? (
          <>
            <span className="tour-card__status">
              Step {running.currentStep + 1} of {running.steps.length}
            </span>
            <button type="button" className="button button--secondary" onClick={() => void endTour(running.id)}>
              End walkthrough
            </button>
          </>
        ) : (
          <button type="button" className="button button--primary" onClick={start} disabled={starting}>
            {starting ? 'Starting…' : 'Start walkthrough'}
          </button>
        )}
      </div>

      {error && (
        <p className="tour-card__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
