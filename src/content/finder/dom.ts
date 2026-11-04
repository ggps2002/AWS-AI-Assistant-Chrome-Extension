import type { ElementKind } from '../../shared/types';

// DOM helpers for the element finder: which elements count as interactive,
// what label a user sees on them, whether they're visible, and how to walk
// into shadow roots (the old script only looked at button/span/h4 elements in
// the light DOM).

const CLICKABLE_ROLES = [
  'button',
  'link',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'checkbox',
  'switch',
  'treeitem',
];
const FIELD_ROLES = ['combobox', 'searchbox', 'textbox', 'listbox', 'spinbutton', 'slider'];

/** Elements a user can click or type into. */
export const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  'label',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[onclick]',
  ...CLICKABLE_ROLES.map((role) => `[role="${role}"]`),
  ...FIELD_ROLES.map((role) => `[role="${role}"]`),
].join(',');

/** Focusable or popup-opening elements that are often (not always) clickable. */
export const LOOSELY_INTERACTIVE_SELECTOR = '[tabindex]:not([tabindex="-1"]),[aria-haspopup]:not([aria-haspopup="false"])';

/** Things you type into or pick a value from. */
export const CONTROL_SELECTOR = [
  'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"])',
  'textarea',
  'select',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="combobox"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="spinbutton"]',
  'button[aria-haspopup="listbox"]',
  'button[aria-haspopup="true"]',
  'button[aria-haspopup="dialog"]',
].join(',');

const SKIP_TEXT_PARENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'svg', 'title', 'desc']);

/** Parent element, stepping out of shadow roots to their host. */
export function parentOf(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function shadowRootOf(el: Element): ShadowRoot | null {
  if (el.shadowRoot) return el.shadowRoot;
  // Content scripts can also see closed shadow roots. Only custom elements
  // realistically have them, so skip the call for everything else.
  if (el.tagName.includes('-') && typeof chrome !== 'undefined' && chrome.dom?.openOrClosedShadowRoot) {
    try {
      return chrome.dom.openOrClosedShadowRoot(el as HTMLElement) ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

/** The document plus every (open or closed) shadow root inside it, skipping `exclude`. */
export function collectRoots(doc: Document, exclude?: Element | null): Array<Document | ShadowRoot> {
  const roots: Array<Document | ShadowRoot> = [doc];
  for (let i = 0; i < roots.length; i++) {
    for (const el of roots[i].querySelectorAll('*')) {
      if (el === exclude) continue;
      const shadow = shadowRootOf(el);
      if (shadow) roots.push(shadow);
    }
  }
  return roots;
}

export function isInside(el: Element, container: Element | null | undefined): boolean {
  if (!container) return false;
  for (let node: Element | null = el; node; node = parentOf(node)) {
    if (node === container) return true;
  }
  return false;
}

/** Parents of short text nodes, e.g. the <span> inside <button><span>Launch instance</span></button>. */
export function textParents(root: Document | ShadowRoot, accept: (text: string) => boolean): Element[] {
  const doc = root instanceof Document ? root : root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parents: Element[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || SKIP_TEXT_PARENTS.has(parent.tagName)) continue;
    const text = node.nodeValue?.trim();
    if (!text || text.length > 120) continue;
    if (accept(text)) parents.push(parent);
  }
  return parents;
}

export function kindOf(el: Element): ElementKind {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role');
  if (role) {
    switch (role) {
      case 'button':
        return el.getAttribute('aria-haspopup') === 'listbox' ? 'select' : 'button';
      case 'link':
        return 'link';
      case 'tab':
        return 'tab';
      case 'menuitem':
      case 'menuitemcheckbox':
      case 'menuitemradio':
        return 'menuitem';
      case 'option':
      case 'treeitem':
        return 'option';
      case 'checkbox':
      case 'switch':
        return 'checkbox';
      case 'radio':
        return 'radio';
      case 'combobox':
        // An autosuggest <input role="combobox"> is typed into, like a text field.
        return tag === 'input' || tag === 'textarea' ? 'input' : 'select';
      case 'listbox':
        return 'select';
      case 'textbox':
      case 'searchbox':
      case 'spinbutton':
        return 'input';
    }
  }
  switch (tag) {
    case 'a':
      return 'link';
    case 'button':
    case 'summary':
      return el.getAttribute('aria-haspopup') === 'listbox' ? 'select' : 'button';
    case 'select':
      return 'select';
    case 'textarea':
      return 'input';
    case 'input': {
      const type = (el as HTMLInputElement).type;
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'button' || type === 'submit' || type === 'reset' || type === 'image') return 'button';
      return 'input';
    }
    case 'label': {
      const control = (el as HTMLLabelElement).control;
      return control ? kindOf(control) : 'text';
    }
  }
  if (el.getAttribute('contenteditable') === '' || el.getAttribute('contenteditable') === 'true') return 'input';
  if (el.hasAttribute('onclick') || el.matches(LOOSELY_INTERACTIVE_SELECTOR)) return 'button';
  return 'text';
}

export function isInteractive(el: Element): boolean {
  return el.matches(INTERACTIVE_SELECTOR);
}

function elementById(el: Element, id: string): Element | null {
  const root = el.getRootNode() as Document | ShadowRoot;
  return root.getElementById?.(id) ?? el.ownerDocument.getElementById(id);
}

function visibleText(el: Element): string {
  // innerText skips text hidden with CSS; jsdom (tests) doesn't implement it.
  const inner = (el as HTMLElement).innerText;
  return typeof inner === 'string' ? inner : (el.textContent ?? '');
}

function humanize(value: string | null): string | null {
  return value ? value.replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2') : null;
}

/** Label of the form field that contains `control`, for fields without proper ARIA wiring. */
function fieldLabel(control: Element): string | null {
  let ancestor = control.parentElement;
  for (let depth = 0; ancestor && depth < 5; depth++, ancestor = ancestor.parentElement) {
    if (ancestor.querySelectorAll(CONTROL_SELECTOR).length > 1) return null;
    const label = ancestor.querySelector('label, legend, [class*="label"]');
    if (label && !label.contains(control)) return label.textContent;
  }
  return null;
}

export interface Label {
  text: string;
  /** How much to trust this source; visible text and ARIA names are 1. */
  weight: number;
}

/** Every name a user (or a screen reader) would know this element by. */
export function labelsOf(el: Element): Label[] {
  const labels: Label[] = [];
  const add = (text: string | null | undefined, weight: number) => {
    const trimmed = text?.replace(/\s+/g, ' ').trim();
    if (trimmed && trimmed.length <= 200) labels.push({ text: trimmed, weight });
  };

  add(el.getAttribute('aria-label'), 1);

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => elementById(el, id)?.textContent ?? '')
      .filter(Boolean);
    add(parts.join(' '), 1);
    // Cloudscape points at both the field label and the current value; match either.
    if (parts.length > 1) parts.forEach((part) => add(part, 1));
  }

  if ('labels' in el && (el as HTMLInputElement).labels) {
    for (const label of (el as HTMLInputElement).labels ?? []) add(label.textContent, 1);
  }

  add(visibleText(el), 1);
  add(el.getAttribute('title'), 0.95);
  add(el.getAttribute('placeholder'), 0.9);
  if (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(el.type)) add(el.value, 1);
  add(el.getAttribute('alt') ?? el.querySelector('img[alt]')?.getAttribute('alt'), 0.9);
  add(humanize(el.getAttribute('data-testid')), 0.75);
  if (el.matches(CONTROL_SELECTOR)) add(fieldLabel(el), 0.95);

  return labels;
}

/** Cheap, layout-free text used to skip elements that can't possibly match. */
export function roughText(el: Element): string {
  let text = `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''} ${el.getAttribute('placeholder') ?? ''} ${el.getAttribute('data-testid') ?? ''}`;
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) text += ` ${elementById(el, id)?.textContent ?? ''}`;
  }
  if ('labels' in el && (el as HTMLInputElement).labels) {
    for (const label of (el as HTMLInputElement).labels ?? []) text += ` ${label.textContent ?? ''}`;
  }
  if (el.matches(CONTROL_SELECTOR)) text += ` ${fieldLabel(el) ?? ''}`;
  text += ` ${(el.textContent ?? '').slice(0, 400)}`;
  return text.toLowerCase();
}

export function isDisabled(el: Element): boolean {
  return (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true';
}

/** Default visibility check: has a box, isn't transparent/hidden, isn't parked off-screen. */
export function isElementVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const view = el.ownerDocument.defaultView;
  if (view) {
    // "Screen-reader only" text is usually pushed far outside the page.
    if (rect.right + view.scrollX <= 0 || rect.bottom + view.scrollY <= 0) return false;
  }
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({
      opacityProperty: true,
      visibilityProperty: true,
      checkOpacity: true,
      checkVisibilityCSS: true,
    } as CheckVisibilityOptions);
  }
  const style = view?.getComputedStyle(el);
  return !style || (style.visibility !== 'hidden' && style.opacity !== '0' && style.display !== 'none');
}

export function isInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  return rect.bottom > 0 && rect.right > 0 && rect.top < view.innerHeight && rect.left < view.innerWidth;
}

/** True when something else (a modal backdrop, a sticky header) covers the element's centre. */
export function isCovered(el: Element): boolean {
  if (!isInViewport(el)) return false;
  const rect = el.getBoundingClientRect();
  const root = el.getRootNode() as Document | ShadowRoot;
  if (typeof root.elementFromPoint !== 'function') return false;
  const hit = root.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  if (!hit) return false;
  return hit !== el && !el.contains(hit) && !hit.contains(el);
}

/** The control (input/select/combobox) a label or field caption belongs to. */
export function controlFor(el: Element, isVisible: (el: Element) => boolean): Element | null {
  if (el.matches(CONTROL_SELECTOR)) return el;
  if (el instanceof HTMLLabelElement && el.control) return el.control;

  // <span id="name-label">Function name</span> ... <input aria-labelledby="name-label">
  const root = el.getRootNode() as Document | ShadowRoot;
  for (const owner of [el, el.parentElement]) {
    if (!owner?.id) continue;
    const id = owner.id.replace(/["\\]/g, '\\$&');
    const referencing = root.querySelector(`[aria-labelledby~="${id}"]`);
    if (referencing?.matches(CONTROL_SELECTOR)) return referencing;
  }

  let ancestor = el.parentElement;
  for (let depth = 0; ancestor && depth < 4; depth++, ancestor = ancestor.parentElement) {
    const controls = [...ancestor.querySelectorAll(CONTROL_SELECTOR)].filter(isVisible);
    if (controls.length === 1) return controls[0];
    if (controls.length > 1) return null;
  }
  return null;
}
