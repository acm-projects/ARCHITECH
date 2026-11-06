// What a key press means in the architecture editor. Decided here, from plain values, so
// the rules are testable and the React layer only has to perform the result.
export type ShortcutIntent =
  | "delete-selection"
  | "clear-selection"
  | "save-now"
  | "undo"
  | "redo"
  | "copy"
  | "paste"
  | "duplicate";

export type ShortcutEvent = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
  target?: unknown;
};

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

// True when the key press is going into a text field, where Backspace, Delete and Escape
// belong to the field and not to the canvas. The event target is checked structurally so
// this works for any DOM element and in tests.
export function isTypingTarget(target: unknown): boolean {
  if (typeof target !== "object" || target === null) return false;
  const { tagName, isContentEditable } = target as {
    tagName?: unknown;
    isContentEditable?: unknown;
  };
  if (isContentEditable === true) return true;
  return typeof tagName === "string" && TYPING_TAGS.has(tagName.toUpperCase());
}

const CONTROL_TAGS = new Set(["BUTTON", "A", "SUMMARY"]);

// True when focus is on a control outside the canvas (a panel button, link or disclosure).
// Delete and Backspace there must not remove what is selected on the canvas; controls on the
// canvas itself (a selected component's action bar) still pass the keys through.
export function isControlTarget(target: unknown): boolean {
  if (typeof target !== "object" || target === null) return false;
  const { tagName, closest } = target as { tagName?: unknown; closest?: unknown };
  if (typeof tagName !== "string" || !CONTROL_TAGS.has(tagName.toUpperCase())) return false;
  const onCanvas = typeof closest === "function" && (closest as (selector: string) => unknown).call(target, ".react-flow");
  return !onCanvas;
}

// Delete and Backspace delete the selection (unless a panel control has focus), Escape clears it, and with Ctrl or Cmd:
// S saves now, Z undoes, Shift+Z or Y redoes, C copies, V pastes and D duplicates.
// Nothing fires while typing, during IME composition, with a modifier that makes it a
// different shortcut, or after something else already handled the event.
export function resolveShortcut(event: ShortcutEvent): ShortcutIntent | null {
  if (event.defaultPrevented || event.isComposing || isTypingTarget(event.target)) return null;

  const command = Boolean(event.ctrlKey || event.metaKey);
  const plain = !command && !event.altKey && !event.shiftKey;

  if (event.key === "Escape" && plain) return "clear-selection";
  if ((event.key === "Delete" || event.key === "Backspace") && plain) {
    return isControlTarget(event.target) ? null : "delete-selection";
  }

  if (!command || event.altKey) return null;
  const letter = event.key.toLowerCase();
  if (letter === "z") return event.shiftKey ? "redo" : "undo";
  if (event.shiftKey) return null;
  if (letter === "s") return "save-now";
  if (letter === "y") return "redo";
  if (letter === "c") return "copy";
  if (letter === "v") return "paste";
  if (letter === "d") return "duplicate";
  return null;
}
