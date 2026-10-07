// Component names by id, as Archie and the challenge feedback use them.

export function labelsOf(
  nodes: readonly { id: string; data: { label: string } }[],
): Record<string, string> {
  return Object.fromEntries(nodes.map((node) => [node.id, node.data.label]));
}

export function sameLabels(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
