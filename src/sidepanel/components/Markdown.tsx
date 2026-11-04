import { useMemo, type MouseEvent } from 'react';
import { renderMarkdown } from '../markdown';

export function Markdown({ source }: { source: string }) {
  const html = useMemo(() => renderMarkdown(source), [source]);

  // Copy buttons on code blocks (the HTML is sanitized, so wire them up by delegation).
  const onClick = async (event: MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-copy]');
    if (!button) return;
    const code = button.closest('.code')?.querySelector('code')?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(code);
      button.textContent = 'Copied';
      window.setTimeout(() => (button.textContent = 'Copy'), 1500);
    } catch {
      button.textContent = 'Copy failed';
    }
  };

  return <div className="markdown" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
