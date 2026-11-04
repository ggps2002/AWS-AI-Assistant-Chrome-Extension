import type { ActiveTour, ChatMessage, Settings } from './types';

// Everything persistent lives in chrome.storage.local so the side panel, the
// background worker and the content script in every AWS frame stay in sync,
// and a walkthrough survives page navigations and reloads.
export interface StorageSchema {
  chatHistory: ChatMessage[];
  activeTour: ActiveTour;
  settings: Settings;
}

type Key = keyof StorageSchema;

export async function getItem<K extends Key>(key: K): Promise<StorageSchema[K] | undefined> {
  const data = await chrome.storage.local.get(key);
  return data[key] as StorageSchema[K] | undefined;
}

export function setItem<K extends Key>(key: K, value: StorageSchema[K]): Promise<void> {
  return chrome.storage.local.set({ [key]: value });
}

export function removeItem(key: Key): Promise<void> {
  return chrome.storage.local.remove(key);
}

/** Calls `callback` whenever `key` changes in any extension context. Returns an unsubscribe function. */
export function onItemChanged<K extends Key>(
  key: K,
  callback: (value: StorageSchema[K] | undefined) => void,
): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
    if (areaName === 'local' && key in changes) {
      callback(changes[key].newValue as StorageSchema[K] | undefined);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
