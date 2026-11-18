import type { Edge } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import { buildNotice, noticeFindings, type ArchieNotice, type NoticeSnapshot } from "../../lib/architecture/archie/notices";
import type { LiveResult } from "../../lib/architecture/evaluation/liveMetrics";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";

export type PostedNotice = ArchieNotice & { id: number; at: number };

// Older notices drop off the conversation past this many.
export const MAX_NOTICES = 40;

// Posts a notice into Archie's conversation each time the live evaluation settles on a new
// design: the first look at the design, then what every edit changed. Counts the ones that
// arrived while Archie was closed, for the badge on its bar button.
export function useArchieNotices({ result, nodes, edges, enabled, archieOpen }: {
  result: LiveResult | null;
  nodes: readonly ArchitectureFlowNode[];
  edges: readonly Edge[];
  enabled: boolean;
  archieOpen: boolean;
}) {
  const [notices, setNotices] = useState<PostedNotice[]>([]);
  const [seenAt, setSeenAt] = useState(0);
  // The design the live result was worked out for: the canvas as it stands when it arrives.
  const graph = useRef({ nodes, edges });
  useEffect(() => {
    graph.current = { nodes, edges };
  }, [nodes, edges]);
  const last = useRef<NoticeSnapshot | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    if (!enabled || !result?.summary.ready) return;
    const snapshot: NoticeSnapshot = {
      graph: {
        nodes: graph.current.nodes.map((node) => ({
          id: node.id,
          label: node.data.label,
          type: node.data.type,
          ...(node.data.implementation ? { implementation: node.data.implementation } : {}),
          ...(node.data.properties ? { properties: node.data.properties } : {}),
        })),
        edges: graph.current.edges.map(({ source, target }) => ({ source, target })),
      },
      summary: result.summary,
      findings: noticeFindings(result.evaluation.findings),
    };
    const notice = buildNotice(last.current, snapshot);
    last.current = snapshot;
    if (!notice) return;
    const posted = { ...notice, id: nextId.current++, at: Date.now() };
    setNotices((all) => [...all, posted].slice(-MAX_NOTICES));
  }, [result, enabled]);

  // Open, Archie has read everything so far (adjusted while rendering, before anything shows).
  const latestAt = notices.at(-1)?.at ?? 0;
  if (archieOpen && latestAt > seenAt) setSeenAt(latestAt);

  const unread = archieOpen ? 0 : notices.filter((notice) => notice.at > seenAt && notice.kind === "change").length;
  return { notices: enabled ? notices : [], unread: enabled ? unread : 0 };
}
