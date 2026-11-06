// A bounded undo/redo history over any value. Immutable: every function returns a new
// history, or the very same one when nothing changed. `key` turns a value into text, and
// equal text means "no change", so edits that change nothing never create an entry.

export const DEFAULT_HISTORY_LIMIT = 40;

export type History<T> = {
  // Oldest first. Never longer than `limit`.
  past: readonly T[];
  present: T;
  // Next redo first.
  future: readonly T[];
  limit: number;
  key: (value: T) => string;
  presentKey: string;
  // Identifies the kind of edit that produced `present`, so a run of the same kind of
  // edit (typing a name) can share one entry. Cleared by undo and redo.
  coalesceKey: string | null;
};

export function createHistory<T>(
  present: T,
  options: { key: (value: T) => string; limit?: number },
): History<T> {
  return {
    past: [],
    present,
    future: [],
    limit: Math.max(1, Math.floor(options.limit ?? DEFAULT_HISTORY_LIMIT)),
    key: options.key,
    presentKey: options.key(present),
    coalesceKey: null,
  };
}

// Makes `next` the present. The old present becomes an undo step and the redo steps are
// dropped. With a `coalesceKey` equal to the previous edit's, the present is replaced
// instead, so the run counts as one step.
export function record<T>(
  history: History<T>,
  next: T,
  coalesceKey: string | null = null,
): History<T> {
  const nextKey = history.key(next);
  if (nextKey === history.presentKey) return history;

  if (coalesceKey !== null && coalesceKey === history.coalesceKey && history.past.length > 0) {
    return { ...history, present: next, presentKey: nextKey, future: [] };
  }

  return {
    ...history,
    past: [...history.past, history.present].slice(-history.limit),
    present: next,
    presentKey: nextKey,
    future: [],
    coalesceKey,
  };
}

export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history;
  const present = history.past[history.past.length - 1];
  return {
    ...history,
    past: history.past.slice(0, -1),
    present,
    presentKey: history.key(present),
    future: [history.present, ...history.future],
    coalesceKey: null,
  };
}

export function redo<T>(history: History<T>): History<T> {
  if (history.future.length === 0) return history;
  const [present, ...future] = history.future;
  return {
    ...history,
    past: [...history.past, history.present].slice(-history.limit),
    present,
    presentKey: history.key(present),
    future,
    coalesceKey: null,
  };
}

export const canUndo = <T>(history: History<T>) => history.past.length > 0;
export const canRedo = <T>(history: History<T>) => history.future.length > 0;
