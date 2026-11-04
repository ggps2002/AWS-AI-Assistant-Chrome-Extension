// Small stroke icons. Decorative: buttons carry their own aria-label.

const common = {
  viewBox: '0 0 20 20',
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function NewChatIcon() {
  return (
    <svg {...common}>
      <path d="M10 4.5v11M4.5 10h11" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg {...common}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1L4.7 4.7" />
    </svg>
  );
}

export function SendIcon() {
  return (
    <svg {...common}>
      <path d="M10 15.5v-11M5.5 9L10 4.5 14.5 9" />
    </svg>
  );
}
