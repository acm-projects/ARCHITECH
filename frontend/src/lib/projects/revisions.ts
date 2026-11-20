// A project's revision: when the server last stored it, in milliseconds. Sent as the ETag of
// GET and PUT, and back in If-Match, so a save based on an older copy is refused (409).
export const revisionOf = (row: { syncedAt: Date }): string => String(row.syncedAt.getTime());

// The revision in an If-Match header ("123", W/"123" or 123), or null when absent or "*".
export function ifMatchRevision(header: string | null): string | null {
  const value = header?.trim().replace(/^W\//, "").replace(/^"(.*)"$/, "$1").trim();
  return value && value !== "*" && /^\d+$/.test(value) ? value : null;
}

export const etag = (revision: string) => `"${revision}"`;
