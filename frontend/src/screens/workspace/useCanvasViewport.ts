import {
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

interface Point {
  x: number;
  y: number;
}

interface PanStart extends Point {
  px: number;
  py: number;
}

export interface SelectionBox extends Point {
  w: number;
  h: number;
}

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.8;
const ZOOM_SENSITIVITY = 0.001;
const MIN_SELECTION_WIDTH = 20;
const MIN_SELECTION_HEIGHT = 20;

function isInteractiveCanvasTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        ".canvas-node,.component-popover,.sticky-note,.connect-mode-hint",
      ),
    )
  );
}

export function useCanvasViewport(
  initial?: { zoom?: number; pan?: Point },
  onSelectionComplete?: (selection: SelectionBox, canvas: HTMLDivElement) => void,
) {
  const [zoom, setZoom] = useState(initial?.zoom ?? 1);
  const [pan, setPan] = useState<Point>(initial?.pan ?? { x: 0, y: 0 });
  const [panStart, setPanStart] = useState<PanStart | null>(null);
  const [selection, setSelection] = useState<SelectionBox | null>(null);
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const nextZoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, zoom - event.deltaY * ZOOM_SENSITIVITY),
    );

    if (nextZoom === zoom) return;

    const worldX = (pointerX - pan.x) / zoom;
    const worldY = (pointerY - pan.y) / zoom;

    setPan({
      x: pointerX - worldX * nextZoom,
      y: pointerY - worldY * nextZoom,
    });
    setZoom(nextZoom);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const emptyCanvas = !isInteractiveCanvasTarget(event.target);

    if (
      event.button === 1 ||
      (event.button === 0 && emptyCanvas && !event.shiftKey)
    ) {
      setPanStart({
        x: event.clientX,
        y: event.clientY,
        px: pan.x,
        py: pan.y,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    if (event.button === 0 && emptyCanvas && event.shiftKey) {
      const rect = event.currentTarget.getBoundingClientRect();
      const point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      setSelectionStart(point);
      setSelection({ ...point, w: 0, h: 0 });
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panStart) {
      setPan({
        x: panStart.px + event.clientX - panStart.x,
        y: panStart.py + event.clientY - panStart.y,
      });
    }

    if (selectionStart) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      setSelection({
        x: Math.min(x, selectionStart.x),
        y: Math.min(y, selectionStart.y),
        w: Math.abs(x - selectionStart.x),
        h: Math.abs(y - selectionStart.y),
      });
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      selection &&
      selection.w >= MIN_SELECTION_WIDTH &&
      selection.h >= MIN_SELECTION_HEIGHT
    ) {
      onSelectionComplete?.(selection, event.currentTarget);
    }

    setPanStart(null);
    setSelectionStart(null);
    window.setTimeout(() => setSelection(null), 100);
  };

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return {
    zoom,
    pan,
    isPanning: Boolean(panStart),
    selection,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    resetZoom,
  };
}
