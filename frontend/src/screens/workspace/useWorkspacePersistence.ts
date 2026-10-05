import { useState } from "react";

import { getProject } from "../../lib/projects";
import type { NodePropertyValues } from "./workspaceData";
import type { AddedComponent, Connection, NodeOffset } from "./workspaceModel";

export function useWorkspacePersistence(projectId: string) {
  const initialState = getProject(projectId)?.state;

  const [addedComponents, setAddedComponents] = useState<AddedComponent[]>(
    () => initialState?.addedComponents ?? [],
  );
  const [nodeOffsets, setNodeOffsets] = useState<Record<string, NodeOffset>>(
    () => initialState?.nodeOffsets ?? {},
  );
  const [deletedNodes, setDeletedNodes] = useState<string[]>(
    () => initialState?.deletedNodes ?? [],
  );
  const [userConnections, setUserConnections] = useState<Connection[]>(
    () => initialState?.connections ?? [],
  );
  const [nodeProperties, setNodeProperties] = useState<
    Record<string, NodePropertyValues>
  >(() => initialState?.nodeProperties ?? {});

  return {
    addedComponents,
    setAddedComponents,
    nodeOffsets,
    setNodeOffsets,
    deletedNodes,
    setDeletedNodes,
    userConnections,
    setUserConnections,
    nodeProperties,
    setNodeProperties,
  };
}
