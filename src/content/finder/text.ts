// Text normalization and fuzzy label scoring for the element finder.
//
// The old content script required `element.innerHTML === label`, so a label
// with different casing, extra whitespace, a nested <span>, a plural, or an
// icon next to it never matched. Everything here compares normalized words.

const INVISIBLE_CHARS = /[​-‍⁠﻿­]/g;
const PUNCTUATION = /[‘’‚“”„"'`´()[\]{}<>:;,.!?*•·|\\/_\-–—→←↗›‹»«▼▾▲▴▸►◂◄…+=~^@$%]/g;

export function normalize(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFKC')
    .replace(INVISIBLE_CHARS, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tiny plural stemmer: "instances" -> "instance", "policies" -> "policy". */
export function stemWord(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

export interface PreparedText {
  /** Normalized text. */
  norm: string;
  /** Stemmed words. */
  words: string[];
  /** Stemmed words joined by spaces. */
  stemmed: string;
}

export function prepare(value: string | null | undefined): PreparedText {
  const norm = normalize(value);
  const words = norm ? norm.split(' ').map(stemWord) : [];
  return { norm, words, stemmed: words.join(' ') };
}

/** Index of `needle` as a run of consecutive words inside `haystack`, or -1. */
function indexOfPhrase(haystack: string[], needle: string[]): number {
  if (needle.length === 0 || needle.length > haystack.length) return -1;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function sharedWordCount(a: string[], b: string[]): number {
  const remaining = new Map<string, number>();
  for (const word of b) remaining.set(word, (remaining.get(word) ?? 0) + 1);
  let shared = 0;
  for (const word of a) {
    const count = remaining.get(word) ?? 0;
    if (count > 0) {
      shared++;
      remaining.set(word, count - 1);
    }
  }
  return shared;
}

/**
 * How well an element's label matches the label the walkthrough asked for, 0-100.
 *   100  identical after normalization ("LAUNCH  instance" vs "Launch instance")
 *    96  identical after stemming ("Launch instances")
 * 92-~  label contains the target phrase; each extra word costs 6, or 10 for one-word targets
 * 63-75 label is a large part of the target ("Create function" for "Create function URL")
 * 59-75 two or more shared words in a different order ("Type of instance" for "Instance type")
 */
export function scoreText(candidate: PreparedText, target: PreparedText): number {
  if (!candidate.norm || !target.norm) return 0;
  if (candidate.norm === target.norm) return 100;
  if (candidate.stemmed === target.stemmed) return 96;

  // Versions, sizes and regions must match exactly: "Node.js 20.x" is not "Node.js 22.x".
  for (const word of target.words) {
    if (/\d/.test(word) && !candidate.words.includes(word)) return 0;
  }

  const at = indexOfPhrase(candidate.words, target.words);
  if (at >= 0) {
    const extraWords = candidate.words.length - target.words.length;
    // A one-word target ("Edit") is weak evidence inside a longer label ("Edit tags"), so extra words cost more.
    const costPerWord = target.words.length === 1 ? 10 : 6;
    return Math.max(0, (at === 0 ? 92 : 86) - extraWords * costPerWord);
  }

  if (indexOfPhrase(target.words, candidate.words) >= 0) {
    const coverage = candidate.words.length / target.words.length;
    if (coverage >= 0.6) return Math.round(45 + 30 * coverage);
  }

  // One shared word ("Launch" vs "Launch instance") is not evidence enough.
  const shared = sharedWordCount(candidate.words, target.words);
  const dice = (2 * shared) / (candidate.words.length + target.words.length);
  if (shared >= 2 && dice >= 0.6) return Math.round(35 + 40 * dice);
  return 0;
}

const TRAILING_ROLE_WORDS = /\s+(button|link|tab|menu item|menu|option|checkbox|check box|radio button|toggle|field|text box|textbox|input|dropdown|drop-down|card|tile)$/i;

/**
 * Labels to try for a target: the label itself, plus a cleaned-up variant when
 * the model wrote `"Create function" button` instead of `Create function`.
 */
export function targetVariants(text: string): string[] {
  const variants = new Set<string>();
  const trimmed = text.trim();
  if (trimmed) variants.add(trimmed);
  const unquoted = trimmed.replace(/^["'“‘(]+|["'”’)]+$/g, '').trim();
  if (unquoted) variants.add(unquoted);
  const withoutRole = unquoted.replace(TRAILING_ROLE_WORDS, '').replace(/^the\s+/i, '').replace(/^["'“‘]+|["'”’]+$/g, '').trim();
  if (withoutRole) variants.add(withoutRole);
  return [...variants];
}
