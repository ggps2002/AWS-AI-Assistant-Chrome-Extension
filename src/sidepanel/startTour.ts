import { isAwsConsoleUrl } from '../shared/config';
import type { RuntimeMessage } from '../shared/messages';
import { setItem } from '../shared/storage';
import { createActiveTour, startUrlFor } from '../shared/tour';
import type { TourPlan } from '../shared/types';

const CONSOLE_TAB_PATTERNS = ['https://console.aws.amazon.com/*', 'https://*.console.aws.amazon.com/*'];

/**
 * Starts a walkthrough in this window's AWS console tab: the active tab if it's
 * on the console, else the most recent console tab, else a new tab at the
 * walkthrough's first page. Never navigates away from a non-AWS page.
 */
export async function startTour(plan: TourPlan, sourceId: string): Promise<void> {
  const tab = await findConsoleTab();
  await setItem('activeTour', createActiveTour(plan, sourceId));

  if (tab?.id !== undefined) {
    await chrome.tabs.update(tab.id, { active: true });
    await ensureTourRuntime(tab.id);
  } else {
    await chrome.tabs.create({ url: startUrlFor(plan), active: true });
  }
}

async function findConsoleTab(): Promise<chrome.tabs.Tab | undefined> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active && isAwsConsoleUrl(active.url)) return active;
  const consoleTabs = await chrome.tabs.query({ currentWindow: true, url: CONSOLE_TAB_PATTERNS });
  return consoleTabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
}

/** Tabs opened before the extension was installed (or reloaded) don't have the content script yet. */
async function ensureTourRuntime(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' } satisfies RuntimeMessage, { frameId: 0 });
  } catch {
    await chrome.scripting
      .executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] })
      .catch((error) => console.warn('Could not load the walkthrough into this tab:', error));
  }
}
