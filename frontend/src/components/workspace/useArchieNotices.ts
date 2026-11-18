import type { Edge } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { readNoticeLog, writeNoticeLog, type StoredNotice } from "../../lib/architecture/archie/noticeStore";
import { buildNotice, noticeFindings, withoutFindings, type NoticeSnapshot } from "../../lib/architecture/archie/notices";
import type { LiveResult } from "../../lib/architecture/evaluation/liveMetrics";
import type { ArchitectureFlowNode } from "./nodes/ArchitectureNode";

export type PostedNotice = StoredNotice;

// Older notices drop off the conversation past this many.
export const MAX_NOTICES = 40;

const browserStorage = () => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

// Posts a notice into Archie's conversation each time the live evaluation settles on a new
// design: the first look at the design, then what every edit changed. Counts the ones that
// arrived while Archie was closed, for the badge on its bar button.
//
// A saved project keeps its notices in this browser (noticeStore.ts), with the design they
// last described, so a reload shows the same conversation and posts nothing new for an
// unchanged design. Without `includeFindings` (Challenge, where problems would be hints) a
// notice says only what changed and which numbers moved.
export function useArchieNotices({ scopeKey, result, nodes, edges, enabled, includeFindings, archieOpen }: {
  // The saved project, or null when the notices last only as long as the page.
  scopeKey: string | null;
  result: LiveResult | null;
  nodes: readonly ArchitectureFlowNode[];
  edges: readonly Edge[];
  enabled: boolean;
  includeFindings: boolean;
  archieOpen: boolean;
}) {
  const [stored] = useState(() => (scopeKey ? readNoticeLog(browserStorage(), scopeKey) : { notices: [], last: null }));
  const [notices, setNotices] = useState<PostedNotice[]>(stored.notices);
  const [seenAt, setSeenAt] = useState(() => stored.notices.at(-1)?.at ?? 0);
  // The design the live result was worked out for: the canvas as it stands when it arrives.
  const graph = useRef({ nodes, edges });
  useEffect(() => {
    graph.current = { nodes, edges };
  }, [nodes, edges]);
  const last = useRef<NoticeSnapshot | null>(stored.last);
  const posted = useRef<PostedNotice[]>(stored.notices);
  const nextId = useRef((stored.notices.at(-1)?.id ?? 0) + 1);

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
      requestsPerSecond: result.evaluation.traffic.requestsPerSecond,
      summary: {
        score: result.summary.score,
        capacityRps: result.summary.capacityRps,
        p95LatencyMs: result.summary.p95LatencyMs,
        monthlyCost: result.summary.monthlyCost,
        uptimePercent: result.summary.uptimePercent,
      },
      findings: includeFindings ? noticeFindings(result.evaluation.findings) : [],
    };
    // Leaving Learn for Challenge does not "resolve" every problem: compare like with like.
    const before = last.current && !includeFindings ? { ...last.current, findings: [] } : last.current;
    const notice = buildNotice(before, snapshot);
    last.current = snapshot;
    // Without findings, the first look has nothing to say.
    if (notice && (includeFindings || notice.kind === "change")) {
      posted.current = [...posted.current, { ...notice, id: nextId.current++, at: Date.now() }].slice(-MAX_NOTICES);
      setNotices(posted.current);
    }
    if (scopeKey) writeNoticeLog(browserStorage(), scopeKey, { notices: posted.current, last: snapshot });
  }, [result, enabled, includeFindings, scopeKey]);

  // Starting a new chat clears the notices too, here and in storage. The design they
  // described is kept, so the next notice still says only what changed after it.
  const clear = useCallback(() => {
    posted.current = [];
    setNotices([]);
    if (scopeKey) writeNoticeLog(browserStorage(), scopeKey, { notices: [], last: last.current });
  }, [scopeKey]);

  // Open, Archie has read everything so far (adjusted while rendering, before anything shows).
  const latestAt = notices.at(-1)?.at ?? 0;
  if (archieOpen && latestAt > seenAt) setSeenAt(latestAt);

  // Notices posted in Learn keep their problems out of Challenge as well.
  const shown = includeFindings ? notices : notices.map(withoutFindings).filter((notice): notice is PostedNotice => notice !== null);
  const unread = archieOpen ? 0 : shown.filter((notice) => notice.at > seenAt && notice.kind === "change").length;
  return { notices: enabled ? shown : [], unread: enabled ? unread : 0, clear };
}
