// Ranks canvas entries against a typed query. Pure.
import type { CanvasEntry } from './canvas.ts';

/**
 * How well `query` matches `text`, or null when it does not. Every word of
 * the query must match. A word scores best as a whole word, then as a
 * substring, then as scattered letters in order.
 */
export function score(query: string, text: string): number | null {
  const hay = text.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  let total = 0;
  for (const word of words) {
    const s = wordScore(word, hay);
    if (s === null) return null;
    total += s;
  }
  return total;
}

/** Up to this length a title or label may match as loose initials ("lpn" for "launch plan"); longer text needs tight matches. */
const LOOSE_MAX_LENGTH = 40;

/** Longest text that still gets scattered-letter matching. */
const FUZZY_MAX_LENGTH = 120;

function wordScore(word: string, hay: string): number | null {
  const at = hay.indexOf(word);
  if (at >= 0) {
    const before = at === 0 ? ' ' : hay[at - 1];
    const wordStart = !/[\p{L}\p{N}]/u.test(before);
    return 100 + (wordStart ? 40 : 0) - Math.min(at, 60) / 3;
  }
  // Letters in order, with a penalty for each gap. Only in short texts: in a
  // long note almost any word is "found" as scattered letters.
  if (hay.length > FUZZY_MAX_LENGTH) return null;
  let pos = -1;
  let gaps = 0;
  for (const ch of word) {
    const next = hay.indexOf(ch, pos + 1);
    if (next < 0) return null;
    if (pos >= 0 && next > pos + 1) gaps += next - pos - 1;
    pos = next;
  }
  if (word.length < 3 || (hay.length > LOOSE_MAX_LENGTH && gaps > Math.max(2, word.length))) return null;
  return Math.max(1, 50 - gaps);
}

export interface Hit {
  entry: CanvasEntry;
  score: number;
}

/** Best matches first. An empty query lists everything in canvas order. */
export function rank(entries: readonly CanvasEntry[], query: string, limit = 50): Hit[] {
  const hits: Hit[] = [];
  for (const entry of entries) {
    const inTitle = score(query, entry.title);
    const inBody = score(query, entry.body);
    if (inTitle === null && inBody === null) continue;
    // A title match outranks the same match deep inside the body.
    hits.push({ entry, score: Math.max((inTitle ?? 0) + 30, inBody ?? 0) });
  }
  if (!query.trim()) return hits.slice(0, limit);
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** A short piece of `text` around the first place `query` matches. */
export function snippet(text: string, query: string, radius = 40): string {
  const flat = text.replace(/^#+\s+/gm, '').replace(/\s+/g, ' ').trim();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = flat.toLowerCase();
  let at = -1;
  for (const w of words) {
    at = lower.indexOf(w);
    if (at >= 0) break;
  }
  if (at < 0) return flat.length > radius * 2 ? `${flat.slice(0, radius * 2)}…` : flat;
  const from = Math.max(0, at - radius);
  const to = Math.min(flat.length, at + radius);
  return `${from > 0 ? '…' : ''}${flat.slice(from, to)}${to < flat.length ? '…' : ''}`;
}
