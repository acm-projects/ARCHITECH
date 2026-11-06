import { isImplementationOf, resolveImplementation } from "./componentLibrary.ts";
import type { NodeLike } from "./nodeOperations.ts";
import type { NodeProperties } from "./types.ts";

// Switching the technology (implementation) behind one component. Like the other node
// operations it never changes its input, and it returns the very same array when nothing
// changed, so a no-op adds no undo step, does not autosave and keeps a Run Design result current.
//
// What a switch does to the component's settings:
//   replicas      kept: that is how the user has sized their system.
//   capacity      back to the new technology's default (dropped).
//   cacheHitRate  back to the new technology's default (dropped).
// Choosing the type's default technology removes `implementation` from the node.

// Settings that describe the technology rather than the user's system.
const TECHNOLOGY_PROPERTIES = ["capacity", "cacheHitRate"] as const;

export type ImplementationEdit<N> =
  | { ok: true; changed: boolean; nodes: N[] }
  | { ok: false; message: string };

export function setNodeImplementation<N extends NodeLike>(
  nodes: N[],
  nodeId: string,
  // null (or the type's default id) chooses the default technology.
  implementationId: string | null,
): ImplementationEdit<N> {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return { ok: false, message: "That component no longer exists." };
  const type = node.data.type;
  if (implementationId !== null && !isImplementationOf(type, implementationId)) {
    return { ok: false, message: "That technology is not available for this component." };
  }

  const chosen = resolveImplementation(type, implementationId ?? undefined);
  const stored = chosen.isDefault ? undefined : chosen.id;
  if (node.data.implementation === stored) return { ok: true, changed: false, nodes };

  // Only a real change of technology resets its settings; tidying a stored default id does not.
  const switching = resolveImplementation(type, node.data.implementation).id !== chosen.id;
  let properties: NodeProperties | undefined = node.data.properties;
  if (switching && properties) {
    const kept = Object.fromEntries(
      Object.entries(properties).filter(
        ([key]) => !(TECHNOLOGY_PROPERTIES as readonly string[]).includes(key),
      ),
    ) as NodeProperties;
    properties = Object.keys(kept).length > 0 ? kept : undefined;
  }

  const rest = { ...node.data };
  delete rest.implementation;
  delete rest.properties;
  const data = {
    ...rest,
    ...(stored === undefined ? {} : { implementation: stored }),
    ...(properties === undefined ? {} : { properties }),
  };
  return {
    ok: true,
    changed: true,
    nodes: nodes.map((candidate) => (candidate.id === nodeId ? { ...candidate, data } : candidate)),
  };
}
