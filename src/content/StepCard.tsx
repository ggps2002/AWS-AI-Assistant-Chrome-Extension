import { useState, type Ref } from 'react';
import { isAwsConsoleUrl } from '../shared/config';
import type { ActiveTour } from '../shared/types';
import { formatInline } from './format';
import type { TargetStatus } from './useTargetElement';

const SERVICE_NAMES: Record<string, string> = {
  amplify: 'Amplify',
  apigateway: 'API Gateway',
  apprunner: 'App Runner',
  billing: 'Billing',
  cloudformation: 'CloudFormation',
  cloudfront: 'CloudFront',
  cloudwatch: 'CloudWatch',
  cognito: 'Cognito',
  dynamodbv2: 'DynamoDB',
  ec2: 'EC2',
  ecr: 'ECR',
  ecs: 'ECS',
  elasticbeanstalk: 'Elastic Beanstalk',
  iam: 'IAM',
  lambda: 'Lambda',
  rds: 'RDS',
  route53: 'Route 53',
  s3: 'S3',
  sagemaker: 'SageMaker',
  secretsmanager: 'Secrets Manager',
  sns: 'SNS',
  sqs: 'SQS',
  vpc: 'VPC',
  vpcconsole: 'VPC',
};

function navigateLabel(url: string): string {
  try {
    const segment = new URL(url).pathname.split('/').find(Boolean)?.toLowerCase() ?? '';
    if (segment === 'console') return 'Open Console Home';
    return SERVICE_NAMES[segment] ? `Open the ${SERVICE_NAMES[segment]} console` : 'Open this page';
  } catch {
    return 'Open this page';
  }
}

export interface StepCardProps {
  tour: ActiveTour;
  status: TargetStatus;
  via: 'label' | 'ai' | null;
  /** Docked to the corner (element not found, or nothing to point at) instead of beside the element. */
  docked: boolean;
  /** The element exists but is scrolled out of view. */
  offscreen: boolean;
  cardRef?: Ref<HTMLDivElement>;
  arrowRef?: Ref<HTMLDivElement>;
  onBack: () => void;
  onNext: () => void;
  onEnd: () => void;
  onRetry: () => void;
  onShowMe: () => void;
  onMinimize: () => void;
}

export function StepCard(props: StepCardProps) {
  const { tour, status, via, docked, offscreen, cardRef, arrowRef } = props;
  const index = tour.currentStep;
  const step = tour.steps[index];
  const total = tour.steps.length;
  const label = step.target?.text ?? '';
  const actionable = step.action === 'click' || step.action === 'type';

  return (
    <div
      ref={cardRef}
      className={docked ? 'card card--docked' : 'card'}
      role="dialog"
      aria-modal="false"
      aria-labelledby="aws-assistant-step-title"
    >
      {!docked && <div ref={arrowRef} className="card__arrow" />}

      <div className="card__head">
        <span className="marker" aria-hidden="true">
          {index + 1}
        </span>
        <h2 id="aws-assistant-step-title" className="card__title">
          {step.title}
        </h2>
        <button type="button" className="icon-button" aria-label="Minimize walkthrough" onClick={props.onMinimize}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" /></svg>
        </button>
        <button type="button" className="icon-button" aria-label="End walkthrough" onClick={props.onEnd}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </div>

      <p className="card__body" aria-live="polite">
        {formatInline(step.instruction)}
      </p>

      {step.value && <ValueToUse value={step.value} />}

      {step.action === 'navigate' && step.url && isAwsConsoleUrl(step.url) && (
        <a className="button button--primary button--block" href={step.url} target="_top">
          {navigateLabel(step.url)}
        </a>
      )}

      {via === 'ai' && !docked && (
        <p className="note">The label on this page differs from “{label}”. This is the closest match.</p>
      )}

      {docked && offscreen && (
        <div className="status">
          <span>“{label}” is off-screen.</span>
          <button type="button" className="button button--quiet" onClick={props.onShowMe}>
            Show me
          </button>
        </div>
      )}

      {docked && !offscreen && actionable && status === 'searching' && (
        <div className="status" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>Looking for “{label}” on this page…</span>
        </div>
      )}

      {docked && !offscreen && actionable && status === 'missing' && (
        <div className="status status--missing" role="status">
          <span>
            “{label}” isn’t on this page yet. Finish the previous step, or go to the page this step is on.
          </span>
          <span className="status__actions">
            <button type="button" className="button button--quiet" onClick={props.onRetry}>
              Search again
            </button>
            <button type="button" className="button button--quiet" onClick={props.onNext}>
              Skip step
            </button>
          </span>
        </div>
      )}

      <div className="progress" aria-hidden="true">
        {tour.steps.map((_, i) => (
          <span key={i} className={i <= index ? 'progress__done' : undefined} />
        ))}
      </div>

      <div className="card__foot">
        <span className="count">
          Step {index + 1} of {total}
        </span>
        {index > 0 && (
          <button type="button" className="button button--ghost" onClick={props.onBack}>
            Back
          </button>
        )}
        <button type="button" className="button button--primary" onClick={props.onNext}>
          {index === total - 1 ? 'Finish' : 'Next'}
        </button>
      </div>
    </div>
  );
}

function ValueToUse({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked by the page; the value is still visible to copy by hand.
    }
  };
  return (
    <div className="value">
      <code>{value}</code>
      <button type="button" className="button button--quiet" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export function MinimizedPill({ tour, onExpand }: { tour: ActiveTour; onExpand: () => void }) {
  const step = tour.steps[tour.currentStep];
  return (
    <button type="button" className="pill" onClick={onExpand} aria-label={`Show walkthrough step ${tour.currentStep + 1}: ${step.title}`}>
      <span className="marker" aria-hidden="true">
        {tour.currentStep + 1}
      </span>
      <span className="pill__text">{step.title}</span>
    </button>
  );
}
