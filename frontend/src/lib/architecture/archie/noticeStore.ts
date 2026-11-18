import type { ArchieNotice, NoticeFinding, NoticeMetric, NoticeSnapshot } from "./notices.ts";

// Archie's notices for one project, kept in this browser so they survive a reload alongside
// the saved conversation. Storage is user-controlled, so everything read back is checked.
export type StoredNotice = ArchieNotice & { id: number; at: number };
export type NoticeLog = { notices: StoredNotice[]; last: NoticeSnapshot | null };

export const NOTICE_LOG_VERSION = 1;
export const noticeLogKey = (projectId: string) => `architech:archie-notices:${projectId}`;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function finding(raw: unknown): NoticeFinding | null {
  if (!isRecord(raw) || !isString(raw.id) || !isString(raw.title)) return null;
  if (raw.severity !== "high" && raw.severity !== "medium" && raw.severity !== "low") return null;
  return { id: raw.id, title: raw.title, severity: raw.severity };
}
function findings(raw: unknown): NoticeFinding[] | null {
  if (!Array.isArray(raw)) return null;
  const list = raw.map(finding);
  return list.every((item): item is NoticeFinding => item !== null) ? list : null;
}
function metric(raw: unknown): NoticeMetric | null {
  if (!isRecord(raw) || !isString(raw.label) || !isString(raw.before) || !isString(raw.after) || typeof raw.better !== "boolean") return null;
  return { label: raw.label, before: raw.before, after: raw.after, better: raw.better };
}

function notice(raw: unknown): StoredNotice | null {
  if (!isRecord(raw) || !isNumber(raw.id) || !isNumber(raw.at)) return null;
  if (raw.kind !== "check" && raw.kind !== "change") return null;
  if (!Array.isArray(raw.edits) || !raw.edits.every(isString) || !Array.isArray(raw.metrics)) return null;
  const metrics = raw.metrics.map(metric);
  const added = findings(raw.added), resolved = findings(raw.resolved), open = findings(raw.open);
  if (!metrics.every((item): item is NoticeMetric => item !== null) || !added || !resolved || !open) return null;
  return { id: raw.id, at: raw.at, kind: raw.kind, edits: raw.edits, metrics, added, resolved, open };
}

function snapshot(raw: unknown): NoticeSnapshot | null {
  if (!isRecord(raw) || !isRecord(raw.graph) || !isRecord(raw.summary)) return null;
  const { nodes, edges } = raw.graph;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return null;
  if (!nodes.every((node) => isRecord(node) && isString(node.id) && isString(node.label) && isString(node.type))) return null;
  if (!edges.every((edge) => isRecord(edge) && isString(edge.source) && isString(edge.target))) return null;
  const { score, p95LatencyMs, monthlyCost, uptimePercent, capacityRps } = raw.summary;
  if (![score, p95LatencyMs, monthlyCost, uptimePercent].every(isNumber) || !(capacityRps === null || isNumber(capacityRps))) return null;
  const list = findings(raw.findings);
  if (!list) return null;
  if (raw.requestsPerSecond !== undefined && !isNumber(raw.requestsPerSecond)) return null;
  return raw as unknown as NoticeSnapshot;
}

// An unreadable or tampered log starts empty rather than breaking Archie's panel.
export function readNoticeLog(store: Store | null, projectId: string): NoticeLog {
  const empty: NoticeLog = { notices: [], last: null };
  if (!store) return empty;
  try {
    const parsed: unknown = JSON.parse(store.getItem(noticeLogKey(projectId)) ?? "null");
    if (!isRecord(parsed) || parsed.version !== NOTICE_LOG_VERSION || !Array.isArray(parsed.notices)) return empty;
    const notices = parsed.notices.map(notice).filter((item): item is StoredNotice => item !== null);
    return { notices, last: snapshot(parsed.last) };
  } catch {
    return empty;
  }
}

// Returns false when the browser will not keep it; the notices still show for this visit.
export function writeNoticeLog(store: Store | null, projectId: string, log: NoticeLog): boolean {
  if (!store) return false;
  try {
    store.setItem(noticeLogKey(projectId), JSON.stringify({ version: NOTICE_LOG_VERSION, ...log }));
    return true;
  } catch {
    return false;
  }
}
