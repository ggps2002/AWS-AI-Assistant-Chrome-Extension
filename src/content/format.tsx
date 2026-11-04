import { Fragment, type ReactNode } from 'react';

/**
 * Renders **bold** and `code` from model-written step text as React nodes.
 * Never as HTML: this text ends up inside the AWS console page.
 */
export function formatInline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((part, i) => {
      if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
      return <Fragment key={i}>{part}</Fragment>;
    });
}
