import { useEffect, useRef } from "react";

import { isEditableTarget } from "../../lib/dom";

interface WorkspaceShortcutHandlers {
  onEscape: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onUndo: (redo: boolean) => void;
  onRedo: () => void;
  onSave: () => void;
}

export function useWorkspaceShortcuts(handlers: WorkspaceShortcutHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const {
        onEscape,
        onDelete,
        onCopy,
        onPaste,
        onDuplicate,
        onUndo,
        onRedo,
        onSave,
      } = handlersRef.current;

      if (event.key === "Escape") {
        onEscape();
        return;
      }

      if (isEditableTarget(event.target)) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onDelete();
        return;
      }

      if (!(event.metaKey || event.ctrlKey)) return;

      const key = event.key.toLowerCase();

      if (key === "c") {
        onCopy();
        return;
      }

      if (key === "v") {
        onPaste();
        return;
      }

      if (key === "d") {
        event.preventDefault();
        onDuplicate();
        return;
      }

      if (key === "z") {
        onUndo(event.shiftKey);
        return;
      }

      if (key === "y") {
        onRedo();
        return;
      }

      if (key === "s") {
        event.preventDefault();
        onSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
