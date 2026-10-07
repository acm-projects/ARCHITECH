import { useEffect, useRef } from "react";

import { resolveShortcut } from "../../lib/architecture/keyboard";

// Each action returns true when it did something. The key press is only consumed
// (preventDefault) then, so the browser's own Copy, Paste, Undo or bookmark shortcut still
// works when the editor had nothing to do.
type WorkspaceKeyboardHandlers = {
  onDeleteSelection: () => boolean;
  onClearSelection: () => boolean;
  onUndo: () => boolean;
  onRedo: () => boolean;
  onCopy: () => boolean;
  onPaste: () => boolean;
  onDuplicate: () => boolean;
  onSave: () => void;
};

// Connects window key presses to the editor. What a key means is decided by
// resolveShortcut; this only performs it.
export function useWorkspaceKeyboard(handlers: WorkspaceKeyboardHandlers) {
  // Always the latest handlers, so the listener never acts on a stale graph.
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const intent = resolveShortcut(event);
      if (!intent) return;

      const current = latest.current;
      if (intent === "save-now") {
        // Also stops the browser's own "save page" dialog.
        event.preventDefault();
        current.onSave();
        return;
      }

      const handled = {
        "delete-selection": current.onDeleteSelection,
        "clear-selection": current.onClearSelection,
        undo: current.onUndo,
        redo: current.onRedo,
        copy: current.onCopy,
        paste: current.onPaste,
        duplicate: current.onDuplicate,
      }[intent]();
      // Escape is never consumed, as before.
      if (handled && intent !== "clear-selection") event.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
