import { NextResponse } from "next/server";

import packageJson from "../../../package.json";
import { chatModelFromEnv } from "@/lib/ai/model";
import { prisma } from "@/lib/prisma";
import { overallStatus, timed, type HealthReport } from "@/lib/server/health";
import { log } from "@/lib/server/log";

// GET /api/health: for the hosting provider's health checks and uptime monitors. No sign-in.
// 200 { status: "ok" | "degraded", ... } when the database answers; 503 { status: "down" } when
// it does not. Checks: the database (a trivial query), migrations (the latest applied one) and
// whether an AI provider is configured. Contains no secrets.
export const dynamic = "force-dynamic";

export async function GET() {
  const database = await timed(async () => {
    await prisma.$queryRawUnsafe("SELECT 1");
    return undefined;
  });
  const migrations = database.ok
    ? await timed(async () => {
        const rows = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
          `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name DESC LIMIT 1`,
        );
        if (rows.length === 0) throw new Error("no migrations applied");
        return `latest: ${rows[0].migration_name}`;
      })
    : ({ ok: false, latencyMs: 0, error: "database unreachable" } as const);
  const choice = chatModelFromEnv();
  const checks: HealthReport["checks"] = {
    database,
    migrations,
    ai: { configured: choice !== null, provider: choice?.provider ?? null },
  };
  const report: HealthReport = {
    status: overallStatus(checks),
    time: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    version: packageJson.version,
    checks,
  };
  if (report.status === "down") log.error("Health check failed: database unreachable.", undefined, { error: database.ok ? undefined : database.error });
  return NextResponse.json(report, { status: report.status === "down" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
