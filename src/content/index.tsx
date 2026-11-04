import { createRoot } from 'react-dom/client';
import type { RuntimeMessage } from '../shared/messages';
import { TourApp } from './TourApp';
import styles from './styles.css?inline';

// Runs in every frame of AWS console pages. Renders the walkthrough overlay
// into a shadow root so the console's CSS and ours can't affect each other.

const HOST_ID = 'aws-ai-assistant-tour';

declare global {
  interface Window {
    __awsAiAssistantTour?: boolean;
  }
}

function extensionAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function mount() {
  // The side panel may inject this script into tabs opened before the extension was installed.
  if (window.__awsAiAssistantTour) return;
  window.__awsAiAssistantTour = true;

  // A copy of this script from before an extension reload/update may still be on the page.
  const stale = document.getElementById(HOST_ID);
  if (stale) {
    stale.setAttribute('data-retired', '');
    stale.remove();
  }

  const host = document.createElement('div');
  host.id = HOST_ID;
  const hostStyle: Record<string, string> = {
    all: 'initial',
    display: 'block',
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    'z-index': '2147483647',
  };
  for (const [property, value] of Object.entries(hostStyle)) host.style.setProperty(property, value, 'important');

  const shadow = host.attachShadow({ mode: 'open' });
  // A constructed stylesheet isn't subject to the page's style-src CSP the way a <style> tag can be.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(styles);
  shadow.adoptedStyleSheets = [sheet];
  const container = document.createElement('div');
  container.className = 'root';
  shadow.append(container);
  document.documentElement.append(host);

  const root = createRoot(container);
  root.render(<TourApp host={host} />);

  const onMessage = (message: RuntimeMessage, _sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => {
    if (message?.type === 'PING') sendResponse({ ok: true });
  };
  chrome.runtime.onMessage.addListener(onMessage);

  // Some single-page apps rebuild the document; put the overlay back if it gets removed.
  const keepAttached = new MutationObserver(() => {
    if (host.hasAttribute('data-retired') || !extensionAlive()) {
      teardown();
    } else if (!host.isConnected) {
      document.documentElement.append(host);
    }
  });
  keepAttached.observe(document.documentElement, { childList: true });

  // After the extension is reloaded this copy loses its chrome.* APIs; remove it.
  const aliveCheck = window.setInterval(() => {
    if (!extensionAlive()) teardown();
  }, 5000);

  function teardown() {
    keepAttached.disconnect();
    window.clearInterval(aliveCheck);
    root.unmount();
    host.remove();
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch {
      // Extension context already gone.
    }
  }
}

mount();
