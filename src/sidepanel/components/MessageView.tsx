import type { ActiveTour, ChatMessage } from '../../shared/types';
import { Markdown } from './Markdown';
import { TourCard } from './TourCard';

interface MessageViewProps {
  message: ChatMessage;
  isLatest: boolean;
  busy: boolean;
  activeTour: ActiveTour | null;
  onOption: (option: string) => void;
  onRetry: () => void;
}

export function MessageView({ message, isLatest, busy, activeTour, onOption, onRetry }: MessageViewProps) {
  if (message.role === 'user') {
    return (
      <div className="message message--user">
        <p>{message.content}</p>
      </div>
    );
  }

  if (message.error) {
    return (
      <div className="message message--error" role="alert">
        <p>{message.content}</p>
        {isLatest && (
          <button type="button" className="button button--secondary" onClick={onRetry} disabled={busy}>
            Try again
          </button>
        )}
      </div>
    );
  }

  const reply = message.reply;
  // Options stay clickable until the conversation moves on.
  const optionsOpen = isLatest && !busy;

  return (
    <div className="message message--assistant">
      {message.content && <Markdown source={message.content} />}

      {reply?.type === 'clarify' && reply.options.length > 0 && (
        <div className="options" role="group" aria-label="Choose an option">
          {reply.options.map((option) => (
            <button
              key={option}
              type="button"
              className="chip chip--option"
              disabled={!optionsOpen}
              onClick={() => onOption(option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {reply?.tour && <TourCard plan={reply.tour} messageId={message.id} activeTour={activeTour} />}
    </div>
  );
}
