import type { ElementCandidate, ElementKind, TargetSpec } from '../../shared/types';
import {
  INTERACTIVE_SELECTOR,
  LOOSELY_INTERACTIVE_SELECTOR,
  collectRoots,
  controlFor,
  isCovered,
  isDisabled,
  isElementVisible,
  isInViewport,
  isInside,
  isInteractive,
  kindOf,
  labelsOf,
  parentOf,
  roughText,
  textParents,
} from './dom';
import { prepare, scoreText, targetVariants, type PreparedText } from './text';

export { isElementVisible } from './dom';

export interface FinderOptions {
  doc?: Document;
  /** Injected in unit tests, where jsdom has no layout. */
  isVisible?: (el: Element) => boolean;
  /** Our own UI; never matched. */
  exclude?: Element | null;
}

export interface TargetMatch {
  element: Element;
  /** Label similarity plus bonuses for kind, visibility, context. Compare with MIN_SCORE. */
  score: number;
  /** Label similarity alone, 0-100. */
  textScore: number;
  /** The label that matched. */
  label: string;
}

const MIN_TEXT_SCORE = 55;
export const MIN_SCORE = 62;

interface WeightedTarget {
  text: PreparedText;
  weight: number;
}

function prepareTargets(spec: TargetSpec): WeightedTarget[] {
  const seen = new Set<string>();
  const targets: WeightedTarget[] = [];
  const add = (raw: string, weight: number) => {
    for (const variant of targetVariants(raw)) {
      const text = prepare(variant);
      if (!text.norm || seen.has(text.stemmed)) continue;
      seen.add(text.stemmed);
      targets.push({ text, weight });
    }
  };
  add(spec.text ?? '', 1);
  for (const alternative of spec.alternatives ?? []) add(alternative, 0.97);
  return targets;
}

/** Fast substring pre-filter so only elements sharing a word with the target get scored. */
function makeProbe(targets: WeightedTarget[]): (lowercaseText: string) => boolean {
  const probes = new Set<string>();
  for (const target of targets) {
    for (const word of target.text.words) {
      // Drop the last two letters so "policy" (stem of "policies") still hits "policies".
      probes.add(word.length <= 4 ? word : word.slice(0, -2));
    }
  }
  const list = [...probes];
  return (text) => list.some((probe) => text.includes(probe));
}

function bestLabel(el: Element, targets: WeightedTarget[]): { score: number; label: string } {
  let best = { score: 0, label: '' };
  for (const label of labelsOf(el)) {
    const text = prepare(label.text);
    for (const target of targets) {
      const score = scoreText(text, target.text) * label.weight * target.weight;
      if (score > best.score) best = { score, label: label.text };
    }
  }
  return best;
}

function isTooLarge(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  const rect = el.getBoundingClientRect();
  return rect.width * rect.height > view.innerWidth * view.innerHeight * 0.25;
}

/** Text matched inside a button/link/tab: highlight the clickable thing, not the inner <span>. */
function promote(el: Element): Element {
  if (isInteractive(el)) return el;
  let node = parentOf(el);
  for (let depth = 0; node && depth < 5; depth++, node = parentOf(node)) {
    if (isInteractive(node)) return isTooLarge(node) ? el : node;
  }
  return el;
}

const FIELD_KINDS = new Set<ElementKind>(['input', 'select']);
const CLICK_KINDS = new Set<ElementKind>(['button', 'link', 'tab', 'menuitem', 'option', 'checkbox', 'radio', 'select']);

function kindBonus(wanted: ElementKind | undefined, actual: ElementKind): number {
  if (!wanted || wanted === 'any') return actual === 'text' ? 0 : 4;
  if (wanted === actual) return 12;
  if (wanted === 'text') return 2;
  if (actual === 'text') return -6;
  const sameFamily =
    (FIELD_KINDS.has(wanted) && FIELD_KINDS.has(actual)) || (CLICK_KINDS.has(wanted) && CLICK_KINDS.has(actual));
  return sameFamily ? 4 : -18;
}

function bonuses(el: Element, spec: TargetSpec): number {
  let bonus = kindBonus(spec.kind, kindOf(el));
  if (isInteractive(el)) bonus += 4;
  if (isDisabled(el)) bonus -= 6;
  if (el.closest('[aria-hidden="true"], [inert]')) bonus -= 8;
  if (isInViewport(el)) bonus += 3;
  if (isTooLarge(el)) bonus -= 15;
  return bonus;
}

const HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6,[role="heading"],legend';

/**
 * Bonus when the element sits under a heading matching `context` ("Basic settings" > "Edit").
 * Only headings *before* the element count, nearest first, the way a reader sees section titles.
 */
function contextBonus(el: Element, context: PreparedText): number {
  let node = parentOf(el);
  for (let depth = 0; node && depth < 10; depth++, node = parentOf(node)) {
    const preceding = [...node.querySelectorAll(HEADING_SELECTOR)].filter(
      (heading) => heading.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const nearestFirst = preceding.reverse().slice(0, 3);
    for (let i = 0; i < nearestFirst.length; i++) {
      if (scoreText(prepare(nearestFirst[i].textContent), context) >= 80) return Math.max(2, 12 - depth - 3 * i);
    }
  }
  return 0;
}

/** Every plausible element for `spec`, best first. */
function rankTargets(spec: TargetSpec, options: FinderOptions = {}): TargetMatch[] {
  const doc = options.doc ?? document;
  const isVisible = options.isVisible ?? isElementVisible;
  const targets = prepareTargets(spec);
  if (targets.length === 0) return [];

  const probe = makeProbe(targets);
  const wantsControl = spec.kind === 'input' || spec.kind === 'select';
  const visited = new Set<Element>();
  const matches = new Map<Element, TargetMatch>();

  const consider = (raw: Element) => {
    if (visited.has(raw)) return;
    visited.add(raw);
    if (isInside(raw, options.exclude) || !probe(roughText(raw))) return;
    // Visually hidden native inputs (Cloudscape checkboxes, radios, tiles) are
    // skipped here; their visible <label> is a candidate of its own.
    if (!isVisible(raw)) return;

    const { score: textScore, label } = bestLabel(raw, targets);
    if (textScore < MIN_TEXT_SCORE) return;

    let element = promote(raw);
    if (wantsControl) element = controlFor(element, isVisible) ?? element;
    if (element !== raw && !isVisible(element)) element = raw;

    const score = textScore + bonuses(element, spec);
    const existing = matches.get(element);
    if (!existing || existing.score < score) matches.set(element, { element, score, textScore, label });
  };

  for (const root of collectRoots(doc, options.exclude)) {
    root.querySelectorAll(INTERACTIVE_SELECTOR).forEach(consider);
    root.querySelectorAll(LOOSELY_INTERACTIVE_SELECTOR).forEach((el) => {
      // Focusable wrappers around whole tables/panels aren't targets.
      if (el.getElementsByTagName('*').length <= 40) consider(el);
    });
    textParents(root, (text) => probe(text.toLowerCase())).forEach(consider);
  }

  const byScore = (a: TargetMatch, b: TargetMatch) => {
    if (b.score !== a.score) return b.score - a.score;
    const ra = a.element.getBoundingClientRect();
    const rb = b.element.getBoundingClientRect();
    return ra.width * ra.height - rb.width * rb.height;
  };

  const ranked = [...matches.values()].sort(byScore);
  const context = spec.context ? prepare(spec.context) : null;
  for (const match of ranked.slice(0, 8)) {
    if (context?.norm) match.score += contextBonus(match.element, context);
    if (isCovered(match.element)) match.score -= 10;
  }
  return ranked.sort(byScore);
}

/** The element the user should interact with for `spec`, or null when nothing on the page is a confident match. */
export function findTarget(spec: TargetSpec, options: FinderOptions = {}): TargetMatch | null {
  const [best] = rankTargets(spec, options);
  return best && best.score >= MIN_SCORE ? best : null;
}

export interface CandidateSnapshot {
  candidates: ElementCandidate[];
  elements: Element[];
}

/** Visible interactive elements, numbered, for the backend to choose from when labels don't match. */
export function collectCandidates(options: FinderOptions & { limit?: number } = {}): CandidateSnapshot {
  const doc = options.doc ?? document;
  const isVisible = options.isVisible ?? isElementVisible;
  const limit = options.limit ?? 150;
  const seen = new Set<Element>();
  const inView: Array<{ el: Element; label: string }> = [];
  const offScreen: Array<{ el: Element; label: string }> = [];

  for (const root of collectRoots(doc, options.exclude)) {
    for (const el of root.querySelectorAll(`${INTERACTIVE_SELECTOR},${LOOSELY_INTERACTIVE_SELECTOR}`)) {
      if (seen.has(el) || isInside(el, options.exclude)) continue;
      seen.add(el);
      if (!isVisible(el)) continue;
      const label = labelsOf(el)[0]?.text;
      if (!label) continue;
      (isInViewport(el) ? inView : offScreen).push({ el, label: label.slice(0, 100) });
    }
  }

  const picked = [...inView, ...offScreen].slice(0, limit);
  return {
    candidates: picked.map(({ el, label }, id) => ({ id, label, kind: kindOf(el) })),
    elements: picked.map(({ el }) => el),
  };
}
