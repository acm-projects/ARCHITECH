import { prisma } from "../prisma";
import type { AttemptStore } from "./attemptLimits";

// Sign-in and sign-up attempts, in PostgreSQL (keys are hashes).
export const attemptStore: AttemptStore = {
  attempts: (kind, keyHash, since) =>
    prisma.authAttempt.findMany({
      where: { kind, keyHash, createdAt: { gte: since } },
      select: { createdAt: true, success: true },
      orderBy: { createdAt: "asc" },
    }).then((rows) => rows.map((row) => ({ at: row.createdAt, success: row.success }))),
  record: async (kind, keyHash, success) => {
    await prisma.authAttempt.create({ data: { kind, keyHash, success } });
  },
  prune: async (before) => {
    await prisma.authAttempt.deleteMany({ where: { createdAt: { lt: before } } });
  },
};
