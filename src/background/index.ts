import { resolveTarget } from '../shared/api';
import type { ResolveTargetResponse, RuntimeMessage } from '../shared/messages';

// Clicking the toolbar icon opens the chat in Chrome's side panel. Unlike a
// popup, the side panel stays open while you click around the console.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Could not enable the side panel:', error));

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  switch (message?.type) {
    case 'RESOLVE_TARGET':
      // Content scripts are bound by the page's CORS rules; the worker isn't,
      // thanks to host_permissions, so backend calls go through here.
      resolveTarget(message.step, message.candidates, message.url)
        .then((id) => sendResponse({ id } satisfies ResolveTargetResponse))
        .catch((error) => {
          console.warn('Could not resolve the walkthrough element:', error);
          sendResponse({ id: null } satisfies ResolveTargetResponse);
        });
      return true; // keep the channel open for the async response

    case 'TARGET_STATUS':
      // A sub-frame found (or lost) the step's element: tell the tab's top frame.
      if (sender.tab?.id !== undefined) {
        chrome.tabs.sendMessage(sender.tab.id, message, { frameId: 0 }).catch(() => {});
      }
      return false;

    default:
      return false;
  }
});
