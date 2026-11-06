// The health report behind GET /api/health, independent of HTTP and the database client so it
// can be tested. Says nothing secret: no keys, URLs or user data.

export type CheckResult = { ok: true; latencyMs: number; detail?: string } | { ok: false; latencyMs: number; error: string };

export type HealthReport = {
  status: "ok" | "degraded" | "down";
  time: string;
  uptimeSeconds: number;
  version: string;
  checks: {
    database: CheckResult;
    migrations: CheckResult;
    ai: { configured: boolean; provider: "anthropic" | "groq" | "gemini" | null };
  };
};

export async function timed(check: () => Promise<string | undefined>, timeoutMs = 3_000): Promise<CheckResult> {
  const started = performance.now();
  try {
    const detail = await Promise.race([
      check(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs)),
    ]);
    return { ok: true, latencyMs: Math.round(performance.now() - started), ...(detail ? { detail } : {}) };
  } catch (error) {
    return { ok: false, latencyMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : String(error) };
  }
}

// down: the database is unreachable (the app cannot work). degraded: it works, but migrations
// look unapplied or the AI Architect is not configured.
export function overallStatus(checks: HealthReport["checks"]): HealthReport["status"] {
  if (!checks.database.ok) return "down";
  if (!checks.migrations.ok || !checks.ai.configured) return "degraded";
  return "ok";
}
