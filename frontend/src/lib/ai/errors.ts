// The AI provider refused the request because of its own rate limit (for example Groq's free-plan
// requests or tokens per minute). Not the user's fault: the route answers 429 with the wait, and
// the question does not count toward the user's limits.
export class ModelBusyError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number | null, message = "The AI provider is busy.") {
    super(message);
    this.name = "ModelBusyError";
    this.retryAfterSeconds = retryAfterSeconds && retryAfterSeconds > 0 ? Math.ceil(retryAfterSeconds) : 30;
  }
}

// A Retry-After header value in seconds (a number of seconds or an HTTP date), or null.
export function retryAfterSeconds(header: string | null | undefined, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, (date - now) / 1000);
}
