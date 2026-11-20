import { useEffect, type RefObject } from "react";

// The right column never runs past the bottom of the page. When the open panels are taller
// than the column, the one used longest ago folds to its header, then the next, until they
// fit. The panel opened or used last stays open. If that one alone is still too tall, it
// scrolls inside itself instead of the page ("squeezed").
//
// Folding this way is temporary: when room comes back (the panel that grew shrinks or folds),
// the panels the column folded open again, last folded first, so the column returns to how it
// was. A panel the person folded themselves stays folded.

export type StackPanel = {
  id: string;
  activeAt: number;
  open: boolean;
  foldable: boolean;
  // Set when the column folded it: the order it was folded in, and the height it needs back.
  autoFoldedAt?: number;
  reopenHeight?: number;
};
export type FitStep = { fold: string } | { squeeze: true } | { reopen: string } | null;

// What to do about the column: fold when it overflows, reopen when there is room.
// `spare` is the height left over below the panels when it does not overflow.
export function fitStep(panels: readonly StackPanel[], overflowing: boolean, spare = 0): FitStep {
  if (overflowing) {
    const open = panels.filter((panel) => panel.open);
    const newest = Math.max(...open.map((panel) => panel.activeAt));
    const candidates = open
      .filter((panel) => panel.foldable && panel.activeAt < newest)
      .sort((a, b) => a.activeAt - b.activeAt);
    return candidates[0] ? { fold: candidates[0].id } : { squeeze: true };
  }
  const lastFolded = panels
    .filter((panel) => !panel.open && panel.autoFoldedAt !== undefined)
    .sort((a, b) => (b.autoFoldedAt ?? 0) - (a.autoFoldedAt ?? 0))[0];
  return lastFolded && (lastFolded.reopenHeight ?? 0) <= spare ? { reopen: lastFolded.id } : null;
}

// Panels mark when they were last opened or used, and fold or reopen when these reach them.
export const FOLD_EVENT = "axp:fold";
export const REOPEN_EVENT = "axp:reopen";
export const ACTIVE_ATTRIBUTE = "data-active-at";
export const AUTO_FOLDED_ATTRIBUTE = "data-auto-folded";
export const REOPEN_HEIGHT_ATTRIBUTE = "data-reopen-height";
const SQUEEZED_ATTRIBUTE = "data-squeezed";

let foldOrder = 0;

function panelsIn(stack: HTMLElement): { panels: StackPanel[]; elements: Map<string, HTMLElement> } {
  const elements = new Map<string, HTMLElement>();
  const panels = [...stack.querySelectorAll<HTMLElement>(".axp:not([hidden], [data-behind])")].map((element, index) => {
    const id = `${index}`;
    elements.set(id, element);
    const autoFolded = element.getAttribute(AUTO_FOLDED_ATTRIBUTE);
    const reopenHeight = element.getAttribute(REOPEN_HEIGHT_ATTRIBUTE);
    return {
      id,
      activeAt: Number(element.getAttribute(ACTIVE_ATTRIBUTE) ?? 0),
      open: !element.hasAttribute("data-folded"),
      // A panel without a header (the lesson card) cannot fold, and one that comes and goes
      // with canvas clicks is left alone.
      foldable: Boolean(element.querySelector(":scope > .axp-head")) && !element.hasAttribute("data-transient"),
      ...(autoFolded === null ? {} : { autoFoldedAt: Number(autoFolded) }),
      // The height it needs beyond its folded header.
      ...(reopenHeight === null ? {} : { reopenHeight: Number(reopenHeight) - element.getBoundingClientRect().height }),
    };
  });
  return { panels, elements };
}

// Height free below the panels. A panel that grows to fill the column (Archie) counts only at
// its smallest size, since it gives the rest back to whatever opens.
function spareHeight(stack: HTMLElement): number {
  const style = getComputedStyle(stack);
  const top = stack.getBoundingClientRect().top + parseFloat(style.paddingTop);
  const bottom = stack.getBoundingClientRect().bottom - parseFloat(style.paddingBottom);
  let used = 0;
  let slack = 0;
  const gap = parseFloat(style.rowGap) || 0;
  const children = [...stack.querySelectorAll<HTMLElement>(".axp:not([hidden], [data-behind])")];
  for (const panel of children) {
    const height = panel.getBoundingClientRect().height;
    used += height;
    const basis = parseFloat(getComputedStyle(panel).flexBasis);
    if (panel.hasAttribute("data-fill") && !panel.hasAttribute("data-folded") && Number.isFinite(basis)) slack += Math.max(0, height - basis);
  }
  used += gap * Math.max(0, children.length - 1);
  return bottom - top - used + slack;
}

// Keeps the column fitted as panels open, fold, grow (Archie's replies) and as the window resizes.
export function useStackFit(stackRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;
    let frame = 0;
    const fit = () => {
      frame = 0;
      // Measure as if nothing were squeezed, so a panel that now fits is released.
      stack.removeAttribute(SQUEEZED_ATTRIBUTE);
      const overflowing = stack.scrollHeight > stack.clientHeight + 1;
      const { panels, elements } = panelsIn(stack);
      const step = fitStep(panels, overflowing, overflowing ? 0 : spareHeight(stack));
      if (!step) return;
      if ("squeeze" in step) {
        stack.setAttribute(SQUEEZED_ATTRIBUTE, "");
      } else if ("fold" in step) {
        const panel = elements.get(step.fold);
        if (!panel) return;
        // Remembered so it can open again once there is room for it.
        panel.setAttribute(AUTO_FOLDED_ATTRIBUTE, String(++foldOrder));
        panel.setAttribute(REOPEN_HEIGHT_ATTRIBUTE, String(panel.getBoundingClientRect().height));
        panel.dispatchEvent(new Event(FOLD_EVENT));
      } else {
        elements.get(step.reopen)?.dispatchEvent(new Event(REOPEN_EVENT));
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(fit); };
    const mutations = new MutationObserver(schedule);
    mutations.observe(stack, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden", "data-folded", "data-behind"] });
    const sizes = new ResizeObserver(schedule);
    sizes.observe(stack);
    schedule();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      mutations.disconnect();
      sizes.disconnect();
    };
  }, [stackRef]);
}
