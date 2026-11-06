// Debounced "save when changed" logic with no React in it.
//
//   saved --change--> dirty --timer or flush--> saving --ok--> saved
//                                                  \--throws--> error
//
// A change that brings the content back to what is already saved returns to "saved"
// without writing. After an error the unsaved content is kept: the next change, flush()
// (page hide, leaving the workspace) or a revert retries it.
//
// One controller belongs to one save target. Switch targets by creating a new controller
// and flushing the old one, so pending content can only ever reach its own target.
// Saving is synchronous (localStorage). BACKEND: an API save is asynchronous, so `save`
// would return a promise and the controller would need to ignore a result that arrives
// after newer content was queued.

export type AutosaveStatus = "saved" | "dirty" | "saving" | "error";

export type AutosaveTimers = {
  set: (callback: () => void, delayMs: number) => unknown;
  clear: (handle: unknown) => void;
};

export type AutosaveOptions<T> = {
  // Stable text form of the content; equal text means "no change".
  serialize: (content: T) => string;
  // Persists `content`. `saved` is the last content known to be persisted. Throws on failure.
  save: (content: T, saved: T) => void;
  debounceMs: number;
  timers?: AutosaveTimers;
  onError?: (error: unknown) => void;
};

const defaultTimers: AutosaveTimers = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createAutosaveController<T>(options: AutosaveOptions<T>) {
  const timers = options.timers ?? defaultTimers;
  const listeners = new Set<() => void>();

  let saved: { content: T; snapshot: string } | null = null;
  let pending: { content: T; snapshot: string } | null = null;
  let timer: unknown = null;
  let status: AutosaveStatus = "saved";

  const setStatus = (next: AutosaveStatus) => {
    if (status === next) return;
    status = next;
    listeners.forEach((listener) => listener());
  };

  const cancelTimer = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };

  // Writes the pending content now, if there is any.
  function flush() {
    cancelTimer();
    if (!pending || !saved) return;

    const attempt = pending;
    setStatus("saving");
    try {
      options.save(attempt.content, saved.content);
    } catch (error) {
      options.onError?.(error);
      setStatus("error");
      return;
    }
    saved = attempt;
    pending = null;
    setStatus("saved");
  }

  // Reports the current content. The first call only records what is already saved.
  function update(content: T) {
    const snapshot = options.serialize(content);
    if (!saved) {
      saved = { content, snapshot };
      return;
    }

    if (snapshot === saved.snapshot) {
      cancelTimer();
      pending = null;
      setStatus("saved");
      return;
    }
    // Same unsaved content again (for example a selection change): keep the running timer.
    if (pending?.snapshot === snapshot) return;

    pending = { content, snapshot };
    setStatus("dirty");
    cancelTimer();
    timer = timers.set(flush, options.debounceMs);
  }

  return {
    update,
    flush,
    getStatus: () => status,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type AutosaveController<T> = ReturnType<typeof createAutosaveController<T>>;
