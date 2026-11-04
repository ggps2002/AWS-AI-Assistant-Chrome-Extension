import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SendIcon } from './icons';

const MAX_HEIGHT = 160;

export function Composer({ disabled, onSend }: { disabled: boolean; onSend: (text: string) => void }) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the text, up to a few lines.
  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const canSend = !disabled && value.trim().length > 0;
  const submit = () => {
    if (!canSend) return;
    onSend(value);
    setValue('');
  };

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder="Ask about AWS or describe a task"
        aria-label="Message"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <button type="submit" className="composer__send" disabled={!canSend} aria-label="Send message">
        <SendIcon />
      </button>
    </form>
  );
}
