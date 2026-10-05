import { useRef } from "react";

import type { NodePropertyValues } from "./workspaceData";
import type {
  AddedComponent,
  Connection,
  NodeOffset,
} from "./workspaceModel";

export interface DiagramSnapshot {
  addedComponents: AddedComponent[];
  nodeOffsets: Record<string, NodeOffset>;
  deletedNodes: string[];
  userConnections: Connection[];
  nodeProperties: Record<string, NodePropertyValues>;
  deletedEdges: string[];
}

function cloneSnapshot(snapshot: DiagramSnapshot): DiagramSnapshot {
  return {
    addedComponents: snapshot.addedComponents.map((component) => ({ ...component })),
    nodeOffsets: Object.fromEntries(
      Object.entries(snapshot.nodeOffsets).map(([id, value]) => [id, { ...value }]),
    ),
    deletedNodes: [...snapshot.deletedNodes],
    userConnections: snapshot.userConnections.map((connection) => ({ ...connection })),
    nodeProperties: Object.fromEntries(
      Object.entries(snapshot.nodeProperties).map(([id, values]) => [id, { ...values }]),
    ),
    deletedEdges: [...snapshot.deletedEdges],
  };
}

export function useDiagramHistory(
  snapshot: DiagramSnapshot,
  onApply: (snapshot: DiagramSnapshot) => void,
  onMessage: (message: string) => void,
) {
  const undoStack = useRef<DiagramSnapshot[]>([]);
  const redoStack = useRef<DiagramSnapshot[]>([]);

  const pushUndo = (value: DiagramSnapshot) => {
    undoStack.current = [
      ...undoStack.current.slice(-39),
      cloneSnapshot(value),
    ];
  };

  const captureSnapshot = () => {
    pushUndo(snapshot);
    redoStack.current = [];
  };

  const undoDiagram = () => {
    const previous = undoStack.current.pop();
    if (!previous) {
      onMessage("Nothing to undo");
      return;
    }

    redoStack.current = [
      ...redoStack.current.slice(-39),
      cloneSnapshot(snapshot),
    ];
    onApply(cloneSnapshot(previous));
    onMessage("Undo applied");
  };

  const redoDiagram = () => {
    const next = redoStack.current.pop();
    if (!next) {
      onMessage("Nothing to redo");
      return;
    }

    pushUndo(snapshot);
    onApply(cloneSnapshot(next));
    onMessage("Redo applied");
  };

  return {
    captureSnapshot,
    undoDiagram,
    redoDiagram,
    undoCount: undoStack.current.length,
    redoCount: redoStack.current.length,
  };
}
