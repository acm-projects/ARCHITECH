import type { Prisma } from "@prisma/client";

import { prisma } from "../prisma";
import type { ChatEvent } from "./architectChat";
import type { AiStore, RecentCalls } from "./usage";

// The AI Architect's rate-limit records and reply cache, in PostgreSQL.

// One app-wide advisory lock serializes reservations (a few milliseconds each), so the counts
// and the new row are consistent even with several servers.
const RESERVE_LOCK = 7_314_220;

async function recentCalls(db: Prisma.TransactionClient, userId: string, since: Date): Promise<RecentCalls> {
  const rows = await db.aiRequest.findMany({
    where: { cached: false, createdAt: { gte: since } },
    select: { userId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return { user: rows.filter((row) => row.userId === userId).map((row) => row.createdAt), all: rows.map((row) => row.createdAt) };
}

export const aiStore: AiStore = {
  reserve: (userId, since, decide) =>
    prisma.$transaction(async (tx) => {
      // pg_advisory_xact_lock returns void, which Prisma cannot read, so select a constant.
      await tx.$queryRawUnsafe(`SELECT 1 AS locked FROM pg_advisory_xact_lock(${RESERVE_LOCK})`);
      const decision = decide(await recentCalls(tx, userId, since));
      if (!decision.ok) return { decision, requestId: null };
      const row = await tx.aiRequest.create({ data: { userId, cached: false }, select: { id: true } });
      return { decision, requestId: row.id };
    }),
  release: async (requestId) => {
    await prisma.aiRequest.deleteMany({ where: { id: requestId } });
  },
  recent: (userId, since) => recentCalls(prisma, userId, since),
  recordCacheHit: async (userId) => {
    await prisma.aiRequest.create({ data: { userId, cached: true } });
  },
  readCache: async (key, since) => {
    const row = await prisma.aiReplyCache.findUnique({ where: { key } });
    return row && row.createdAt >= since ? (row.events as unknown as ChatEvent[]) : null;
  },
  writeCache: async (key, events) => {
    const value = events as unknown as Prisma.InputJsonValue;
    await prisma.aiReplyCache.upsert({
      where: { key },
      create: { key, events: value },
      update: { events: value, createdAt: new Date() },
    });
  },
  prune: async ({ requests, cache }) => {
    await prisma.aiRequest.deleteMany({ where: { createdAt: { lt: requests } } });
    await prisma.aiReplyCache.deleteMany({ where: { createdAt: { lt: cache } } });
  },
};
