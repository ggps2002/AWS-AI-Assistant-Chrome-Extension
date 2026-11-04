import { useLayoutEffect, useRef, useState } from 'react';
import { endTour } from '../shared/tour';
import type { ActiveTour } from '../shared/types';
import { useActiveTour } from '../shared/useActiveTour';
import { Composer } from './components/Composer';
import { NewChatIcon, SettingsIcon } from './components/icons';
import { MessageView } from './components/MessageView';
import { SettingsPanel } from './components/SettingsPanel';
import { useChat, type PendingState } from './useChat';

const SUGGESTIONS = [
  'I have a Node.js backend. Where should I deploy it?',
  'Host a static website',
  'Create an S3 bucket for file uploads',
  'Launch an EC2 instance',
];

export function App() {
  const chat = useChat();
  const activeTour = useActiveTour();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const conversationRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [chat.messages.length, chat.pending]);

  const empty = chat.loaded && chat.messages.length === 0 && !chat.pending;

  return (
    <div className="app">
      <header className="header">
        <img className="header__logo" src="/icons/icon48.png" alt="" width={20} height={20} />
        <span className="header__title">AWS Assistant</span>
        <button
          type="button"
          className="icon-button"
          onClick={chat.clear}
          disabled={chat.messages.length === 0 && !chat.pending}
          aria-label="New chat"
          title="New chat"
        >
          <NewChatIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-expanded={settingsOpen}
          aria-label="Settings"
          title="Settings"
        >
          <SettingsIcon />
        </button>
      </header>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}

      <main className="conversation" ref={conversationRef}>
        {empty ? (
          <EmptyState onPick={chat.send} />
        ) : (
          <div className="messages" aria-live="polite">
            {chat.messages.map((message, i) => (
              <MessageView
                key={message.id}
                message={message}
                isLatest={i === chat.messages.length - 1}
                busy={chat.pending !== null}
                activeTour={activeTour}
                onOption={chat.send}
                onRetry={chat.retry}
              />
            ))}
            {chat.pending && <Thinking state={chat.pending} onStop={chat.stop} />}
          </div>
        )}
      </main>

      {activeTour && <ActiveTourBar tour={activeTour} />}
      <Composer disabled={chat.pending !== null} onSend={chat.send} />
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="empty">
      <h1 className="empty__title">What do you want to build on AWS?</h1>
      <p className="empty__body">
        Ask a question or describe a task. When it’s done in the console, I’ll highlight each button and walk you
        through it one click at a time.
      </p>
      <div className="suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <button key={suggestion} type="button" className="chip" onClick={() => onPick(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function Thinking({ state, onStop }: { state: Exclude<PendingState, null>; onStop: () => void }) {
  return (
    <div className="thinking" role="status">
      <span className="thinking__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="thinking__text">
        {state === 'waking'
          ? 'Waking up the assistant. The first reply after a quiet spell can take up to a minute.'
          : 'Thinking…'}
      </span>
      <button type="button" className="text-button" onClick={onStop}>
        Stop
      </button>
    </div>
  );
}

function ActiveTourBar({ tour }: { tour: ActiveTour }) {
  const done = tour.status === 'completed';
  const step = tour.steps[tour.currentStep];
  return (
    <div className="tour-bar" role="status">
      <span className="tour-bar__marker" aria-hidden="true">
        {done ? '✓' : tour.currentStep + 1}
      </span>
      <div className="tour-bar__text">
        <strong>{tour.title}</strong>
        <span>{done ? 'Completed' : `Step ${tour.currentStep + 1} of ${tour.steps.length}: ${step?.title ?? ''}`}</span>
      </div>
      <button type="button" className="button button--secondary" onClick={() => void endTour(tour.id)}>
        {done ? 'Close' : 'End walkthrough'}
      </button>
    </div>
  );
}
