import { useEffect, type RefObject } from "react";

// The right column never runs past the bottom of the page. When the open panels are taller
// than the column, the one used longest ago folds to its header, then the next, until they
// fit. The panel opened or used last stays open. If that one alone is still too tall, it
// scrolls inside itself instead of the page ("squeezed").

export type StackPanel = { id: string; activeAt: number; open: boolean; foldable: boolean };
export type FitStep = { fold: string } | { squeeze: true } | null;

// What to do about a column whose open panels overflow it.
export function fitStep(panels: readonly StackPanel[], overflowing: boolean): FitStep {
  if (!overflowing) return null;
  const open = panels.filter((panel) => panel.open);
  const newest = Math.max(...open.map((panel) => panel.activeAt));
  const candidates = open
    .filter((panel) => panel.foldable && panel.activeAt < newest)
    .sort((a, b) => a.activeAt - b.activeAt);
  return candidates[0] ? { fold: candidates[0].id } : { squeeze: true };
}

// Panels mark when they were last opened or used, and fold when this event reaches them.
export const FOLD_EVENT = "axp:fold";
export const ACTIVE_ATTRIBUTE = "data-active-at";
const SQUEEZED_ATTRIBUTE = "data-squeezed";

function panelsIn(stack: HTMLElement): { panels: StackPanel[]; elements: Map<string, HTMLElement> } {
  const elements = new Map<string, HTMLElement>();
  const panels = [...stack.querySelectorAll<HTMLElement>(".axp:not([hidden])")].map((element, index) => {
    const id = `${index}`;
    elements.set(id, element);
    return {
      id,
      activeAt: Number(element.getAttribute(ACTIVE_ATTRIBUTE) ?? 0),
      open: !element.hasAttribute("data-folded"),
      // A panel without a header (the lesson card) cannot fold, and one that comes and goes
      // with canvas clicks is left alone.
      foldable: Boolean(element.querySelector(":scope > .axp-head")) && !element.hasAttribute("data-transient"),
    };
  });
  return { panels, elements };
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
      const step = fitStep(panels, overflowing);
      if (step && "fold" in step) elements.get(step.fold)?.dispatchEvent(new Event(FOLD_EVENT));
      else if (step) stack.setAttribute(SQUEEZED_ATTRIBUTE, "");
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(fit); };
    const mutations = new MutationObserver(schedule);
    mutations.observe(stack, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden", "data-folded"] });
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
