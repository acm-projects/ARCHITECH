import type { Prisma } from "@prisma/client";

import { prisma } from "../prisma.ts";
import type { GraphDocument } from "./projectPayload.ts";
import { shouldSnapshot, summarizeGraph, versionsToPrune, type VersionKind, type VersionSummary } from "./versions.ts";

// Version history in PostgreSQL (rules in versions.ts).

export const VERSION_LIST_SELECT = { id: true, title: true, kind: true, label: true, summary: true, createdAt: true } as const;

export type VersionListItem = {
  id: string;
  title: string;
  kind: VersionKind;
  label: string | null;
  summary: VersionSummary;
  createdAt: string;
};

export function toListItem(row: { id: string; title: string; kind: string; label: string | null; summary: Prisma.JsonValue; createdAt: Date }): VersionListItem {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind as VersionKind,
    label: row.label,
    summary: row.summary as unknown as VersionSummary,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function recordVersion(
  project: { id: string; title: string; graph: GraphDocument },
  kind: VersionKind,
  label: string | null = null,
  now = new Date(),
): Promise<VersionListItem | null> {
  const { fingerprint, summary } = summarizeGraph(project.graph);
  if (kind === "auto") {
    const latest = await prisma.projectVersion.findFirst({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      select: { fingerprint: true, createdAt: true },
    });
    if (!shouldSnapshot(latest, fingerprint, now)) return null;
  }
  const row = await prisma.projectVersion.create({
    data: {
      projectId: project.id,
      title: project.title,
      graph: project.graph as unknown as Prisma.InputJsonValue,
      fingerprint,
      summary: summary as unknown as Prisma.InputJsonValue,
      kind,
      label,
    },
    select: VERSION_LIST_SELECT,
  });
  const all = await prisma.projectVersion.findMany({ where: { projectId: project.id }, select: { id: true, kind: true, createdAt: true } });
  const prune = versionsToPrune(all);
  if (prune.length > 0) await prisma.projectVersion.deleteMany({ where: { id: { in: prune } } });
  return toListItem(row);
}
