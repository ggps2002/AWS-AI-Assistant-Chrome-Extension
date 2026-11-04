import { getItem } from './storage';
import type { Settings } from './types';

export const DEFAULT_BACKEND_URL = 'https://pradipto2002-aws-assistant.fly.dev';
export const AWS_CONSOLE_HOME = 'https://console.aws.amazon.com/console/home';

export async function getSettings(): Promise<Settings> {
  const saved = await getItem('settings');
  return { backendUrl: saved?.backendUrl?.trim() || DEFAULT_BACKEND_URL };
}

function parseUrl(url: string | undefined | null): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Pages where a walkthrough can run: the AWS Management Console. */
export function isAwsConsoleUrl(url: string | undefined | null): boolean {
  const parsed = parseUrl(url);
  if (!parsed || parsed.protocol !== 'https:') return false;
  const host = parsed.hostname;
  return (
    host === 'console.aws.amazon.com' ||
    host.endsWith('.console.aws.amazon.com') ||
    host === 'lightsail.aws.amazon.com'
  );
}

export function isAwsSignInUrl(url: string | undefined | null): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  return parsed.hostname === 'signin.aws.amazon.com' || parsed.hostname.endsWith('.signin.aws.amazon.com');
}
