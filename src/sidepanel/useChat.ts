import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, sendChat, type ApiMessage } from '../shared/api';
import { isAwsConsoleUrl } from '../shared/config';
import { getItem, onItemChanged, setItem } from '../shared/storage';
import type { AssistantReply, ChatMessage, PageContext } from '../shared/types';

const STORED_MESSAGES = 100;
/** Earlier turns sent with each request, so follow-ups like "Serverless" make sense to the backend. */
const CONTEXT_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 4000;

export type PendingState = null | 'thinking' | 'waking';

/** An earlier assistant turn as the backend sees it: its text plus what it offered. */
function apiContent(message: ChatMessage): string {
  let content = message.content;
  const reply = message.reply;
  if (reply?.options.length) content += `\n\n(Options offered: ${reply.options.join(' | ')})`;
  if (reply?.tour) {
    const steps = reply.tour.steps.map((step) => step.title).join('; ');
    content += `\n\n(Walkthrough offered: "${reply.tour.title}". Steps: ${steps})`;
  }
  return content.slice(0, MAX_MESSAGE_CHARS);
}

function toApiMessages(messages: ChatMessage[]): ApiMessage[] {
  return messages
    .filter((message) => !message.error)
    .slice(-CONTEXT_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.role === 'assistant' ? apiContent(message) : message.content.slice(0, MAX_MESSAGE_CHARS),
    }));
}

/** The AWS console page in this window, so "how do I do this here?" has context. Never sent for non-AWS pages. */
async function currentPage(): Promise<PageContext | undefined> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url && isAwsConsoleUrl(tab.url) ? { url: tab.url, title: tab.title } : undefined;
  } catch {
    return undefined;
  }
}

function assistantMessage(reply: AssistantReply): ChatMessage {
  return { id: crypto.randomUUID(), role: 'assistant', content: reply.message, reply, createdAt: Date.now() };
}

function errorMessage(error: unknown): ChatMessage {
  const content =
    error instanceof ApiError && error.status === 429
      ? 'The assistant is getting too many requests right now. Wait a few seconds, then try again.'
      : error instanceof ApiError
        ? error.message
        : 'Something went wrong while talking to the assistant.';
  return { id: crypto.randomUUID(), role: 'assistant', content, error: true, createdAt: Date.now() };
}

/** Conversation state, persisted in chrome.storage so it survives closing the panel and syncs across windows. */
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<PendingState>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    getItem('chatHistory')
      .then((history) => {
        if (!alive) return;
        messagesRef.current = history ?? [];
        setMessages(messagesRef.current);
      })
      .finally(() => alive && setLoaded(true));
    const unsubscribe = onItemChanged('chatHistory', (history) => {
      messagesRef.current = history ?? [];
      setMessages(messagesRef.current);
    });
    return () => {
      alive = false;
      unsubscribe();
      controllerRef.current?.abort();
    };
  }, []);

  const commit = useCallback((next: ChatMessage[]) => {
    const trimmed = next.slice(-STORED_MESSAGES);
    messagesRef.current = trimmed;
    setMessages(trimmed);
    void setItem('chatHistory', trimmed);
  }, []);

  const request = useCallback(
    async (history: ChatMessage[]) => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setPending('thinking');
      try {
        const reply = await sendChat(toApiMessages(history), await currentPage(), {
          signal: controller.signal,
          onRetry: () => setPending('waking'),
        });
        commit([...messagesRef.current, assistantMessage(reply)]);
      } catch (error) {
        if (controller.signal.aborted) return;
        commit([...messagesRef.current, errorMessage(error)]);
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setPending(null);
        }
      }
    },
    [commit],
  );

  const send = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || controllerRef.current) return;
      const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content, createdAt: Date.now() };
      const history = [...messagesRef.current, userMessage];
      commit(history);
      void request(history);
    },
    [commit, request],
  );

  /** Re-sends the conversation after a failed reply. */
  const retry = useCallback(() => {
    if (controllerRef.current) return;
    const history = [...messagesRef.current];
    while (history.length > 0 && history[history.length - 1].error) history.pop();
    if (history[history.length - 1]?.role !== 'user') return;
    commit(history);
    void request(history);
  }, [commit, request]);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setPending(null);
  }, []);

  const clear = useCallback(() => {
    stop();
    commit([]);
  }, [stop, commit]);

  return { messages, loaded, pending, send, retry, stop, clear };
}
