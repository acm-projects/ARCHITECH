// Longest numeric suffix we read from an existing id; longer digit runs are ignored so
// the arithmetic below can never leave the safe integer range.
const MAX_SUFFIX_DIGITS = 9;

// Id for a new node of `type`: `<type>-<n>` (for example `server-3`), where n is one more
// than the highest number already used by that type among `existingIds`.
//
// - Collision-safe against every id passed in, so pass all nodes currently on the canvas,
//   including ones loaded from a saved project.
// - Other id shapes (`server-added-1` from earlier versions, custom ids) are never
//   matched, so they cannot collide and do not affect numbering.
// - Ids are never changed after creation. Deleting the highest-numbered node frees its
//   number for the next node of that type, which is safe because deleting a node also
//   removes its edges.
export function generateNodeId(type: string, existingIds: Iterable<string>): string {
  const taken = new Set(existingIds);
  const prefix = `${type}-`;

  let highest = 0;
  for (const id of taken) {
    if (!id.startsWith(prefix)) continue;
    const suffix = id.slice(prefix.length);
    if (suffix.length <= MAX_SUFFIX_DIGITS && /^\d+$/.test(suffix)) {
      highest = Math.max(highest, Number(suffix));
    }
  }

  let next = highest + 1;
  while (taken.has(`${prefix}${next}`)) next += 1;
  return `${prefix}${next}`;
}

// Picks an id for a new node of `type`, given the ids that exist right now.
export type NodeIdAllocator = (type: string, existingIds: Iterable<string>) => string;

const NUMBERED_ID = /^(.*-)(\d+)$/;

// An allocator that also remembers every number it has handed out, or seen in the ids it
// was given, so an id is never used twice during a session even after its node is deleted
// (and then restored by undo, or re-added by redo). It starts from the ids already
// present, so a reopened project continues after its highest existing number.
// Keep one per editing session and call it outside React state updaters: it has memory.
export function createNodeIdAllocator(seedIds: Iterable<string> = []): NodeIdAllocator {
  const highest = new Map<string, number>();

  const note = (ids: Iterable<string>) => {
    for (const id of ids) {
      const match = NUMBERED_ID.exec(id);
      if (!match || match[2].length > MAX_SUFFIX_DIGITS) continue;
      highest.set(match[1], Math.max(highest.get(match[1]) ?? 0, Number(match[2])));
    }
  };
  note(seedIds);

  return (type, existingIds) => {
    const existing = new Set(existingIds);
    note(existing);
    const prefix = `${type}-`;
    let next = (highest.get(prefix) ?? 0) + 1;
    while (existing.has(`${prefix}${next}`)) next += 1;
    highest.set(prefix, next);
    return `${prefix}${next}`;
  };
}
