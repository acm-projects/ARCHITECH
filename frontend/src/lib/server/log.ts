// Server logging. One line per event: JSON in production (for the host's log search), readable
// text in development. Every API request gets a request id (from an X-Request-Id header set by
// the host, or a new one); a 500 response carries the same id, so a user's report can be
// matched to the log line.

type Fields = Record<string, unknown>;
type Level = "error" | "warn" | "info";

const ids = new WeakMap<Request, string>();

export function requestIdOf(request: Request): string {
  let id = ids.get(request);
  if (!id) {
    const given = request.headers.get("x-request-id")?.trim();
    id = given && /^[\w.-]{1,100}$/.test(given) ? given : crypto.randomUUID();
    ids.set(request, id);
  }
  return id;
}

function describe(error: unknown): Fields | undefined {
  if (error === undefined) return undefined;
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { message: String(error) };
}

export function formatLogLine(level: Level, event: string, error: unknown, fields: Fields, production: boolean, now = new Date()): string {
  const record = { level, time: now.toISOString(), event, ...fields, ...(error === undefined ? {} : { error: describe(error) }) };
  if (production) return JSON.stringify(record);
  const context = Object.entries(fields).map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`).join(" ");
  const detail = error instanceof Error ? `\n${error.stack ?? error.message}` : error === undefined ? "" : ` ${String(error)}`;
  return `[${level}] ${event}${context ? ` (${context})` : ""}${detail}`;
}

function write(level: Level, event: string, error: unknown, fields: Fields) {
  const line = formatLogLine(level, event, error, fields, process.env.NODE_ENV === "production");
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const log = {
  error: (event: string, error?: unknown, fields: Fields = {}) => write("error", event, error, fields),
  warn: (event: string, error?: unknown, fields: Fields = {}) => write("warn", event, error, fields),
  info: (event: string, fields: Fields = {}) => write("info", event, undefined, fields),
};

// Logs an unexpected failure of a request and answers 500 with a message and the request id.
export function serverError(request: Request, event: string, error: unknown, message: string): Response {
  const requestId = requestIdOf(request);
  log.error(event, error, { requestId, method: request.method, path: new URL(request.url).pathname });
  return Response.json({ error: message, requestId }, { status: 500, headers: { "X-Request-Id": requestId } });
}
