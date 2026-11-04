// Shapes shared by the side panel, background worker, content script and backend.
// Keep in sync with AWS_Assistant/schemas.py.

export type ElementKind =
  | 'button'
  | 'link'
  | 'tab'
  | 'menuitem'
  | 'option'
  | 'input'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'text'
  | 'any';

export type StepAction = 'navigate' | 'click' | 'type' | 'info';

/** How the walkthrough finds the element for a step: by what the user sees. */
export interface TargetSpec {
  /** Exact visible label, e.g. "Launch instance". */
  text: string;
  kind?: ElementKind;
  /** Other labels the same element may carry, e.g. ["Launch instances"]. */
  alternatives?: string[];
  /** Heading of the section the element sits in, used to break ties. */
  context?: string | null;
}

export interface TourStep {
  title: string;
  instruction: string;
  action: StepAction;
  target?: TargetSpec | null;
  /** Suggested value for `type` steps. */
  value?: string | null;
  /** Console URL for `navigate` steps. */
  url?: string | null;
}

export interface TourPlan {
  title: string;
  service?: string | null;
  steps: TourStep[];
}

export interface ActiveTour extends TourPlan {
  id: string;
  /** Chat message the walkthrough was started from. */
  sourceId?: string;
  currentStep: number;
  status: 'active' | 'completed';
  startedAt: number;
}

export type ReplyType = 'answer' | 'clarify' | 'guide' | 'deny';

export interface AssistantReply {
  type: ReplyType;
  /** Markdown shown in the chat. */
  message: string;
  /** Quick replies for `clarify`. */
  options: string[];
  /** Walkthrough for `guide`. */
  tour: TourPlan | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reply?: AssistantReply;
  error?: boolean;
  createdAt: number;
}

/** A visible element offered to the backend when label matching fails. */
export interface ElementCandidate {
  id: number;
  label: string;
  kind: string;
}

export interface PageContext {
  url: string;
  title?: string;
}

export interface Settings {
  backendUrl: string;
}
