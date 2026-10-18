import assert from "node:assert/strict";
import test from "node:test";

import { parseProject } from "../src/components/projects/projectStore.ts";
import { readComponentDragData, writeComponentDragData, componentGroups } from "../src/components/workspace/componentCatalog.ts";
import { evaluateArchitecture } from "../src/lib/architecture/evaluation/evaluate.ts";
import { getPropertyDefinitions } from "../src/lib/architecture/componentProperties.ts";
import { sanitizeCustomTechnologies } from "../src/lib/projects/customTechnologies.ts";
import { payloadToStoredProject, projectToPayload, validateGraph } from "../src/lib/projects/projectPayload.ts";

// A minimal DataTransfer, enough for the drag helpers.
function fakeDataTransfer(): DataTransfer {
  const data = new Map<string, string>();
  const transfer = {
    types: [] as string[],
    effectAllowed: "none",
    setData: (type: string, value: string) => {
      data.set(type, value);
      transfer.types = [...data.keys()];
    },
    getData: (type: string) => data.get(type) ?? "",
  };
  return transfer as unknown as DataTransfer;
}

const traefik = { id: "traefik", name: "Traefik", evidence: ['docker-compose.yml runs the "traefik" image'] };

test("dragging a custom technology places a Custom component named after it", () => {
  const transfer = fakeDataTransfer();
  writeComponentDragData(transfer, { type: "custom", label: "Traefik", properties: { technology: "Traefik" } });
  assert.deepEqual(readComponentDragData(transfer), { type: "custom", label: "Traefik", properties: { technology: "Traefik" } });

  // Only a custom component carries a technology name through a drag.
  const server = fakeDataTransfer();
  writeComponentDragData(server, { type: "server", label: "API", properties: { technology: "x" } });
  assert.deepEqual(readComponentDragData(server), { type: "server", label: "API" });
});

test("the Custom type never appears in the normal component library", () => {
  const all = componentGroups("").flatMap((group) => group.components.map((component) => component.type));
  assert.ok(!all.includes("custom"));
  assert.ok(all.includes("api"));
});

test("a custom component is drawn and passed through, not measured", () => {
  const graph = {
    nodes: [
      { id: "c", data: { type: "client", label: "c" } },
      { id: "proxy", data: { type: "custom", label: "Traefik", properties: { technology: "Traefik" } } },
      { id: "s", data: { type: "server", label: "s", properties: { replicas: 4 } } },
      { id: "d", data: { type: "database", label: "d", properties: { replicas: 1 } } },
    ],
    edges: [{ source: "c", target: "proxy" }, { source: "proxy", target: "s" }, { source: "s", target: "d" }],
  };
  const direct = {
    nodes: graph.nodes.filter((node) => node.id !== "proxy"),
    edges: [{ source: "c", target: "s" }, { source: "s", target: "d" }],
  };
  const through = evaluateArchitecture({ graph: graph as never, traffic: { requestsPerSecond: 3_000 } });
  const without = evaluateArchitecture({ graph: direct as never, traffic: { requestsPerSecond: 3_000 } });
  const proxy = through.nodes.find((node) => node.nodeId === "proxy")!;
  assert.equal(proxy.capacityRps, null);
  assert.equal(proxy.monthlyCost, 0);
  assert.equal(through.metrics.capacityRps, without.metrics.capacityRps, "it never limits the design");
  assert.equal(through.metrics.estimatedMonthlyCost, without.metrics.estimatedMonthlyCost);
  assert.ok(Math.abs(through.metrics.uptimeAvailability - without.metrics.uptimeAvailability) < 1e-9);
  assert.ok(!through.findings.some((finding) => finding.nodeIds.includes("proxy") && finding.id.startsWith("spof-")));
  assert.deepEqual(getPropertyDefinitions("custom"), []);
});

test("a project keeps its custom technologies through save, sync and load", () => {
  const stored = {
    id: "p-1", title: "orders", mode: "learn", learnSkipped: true, source: "github",
    nodes: [{ id: "client-1", type: "architecture", position: { x: 0, y: 0 }, data: { type: "client", label: "Users" } }],
    edges: [],
    customTechnologies: [traefik, { id: "Bad Id", name: "x", evidence: [] }],
    createdAt: "2026-10-18T00:00:00.000Z", updatedAt: "2026-10-18T00:00:00.000Z", lastOpenedAt: "2026-10-18T00:00:00.000Z",
  };
  const project = parseProject(JSON.parse(JSON.stringify(stored)));
  assert.deepEqual(project?.customTechnologies, [traefik], "bad entries are dropped when loading");
  assert.equal(project?.source, "github");

  const payload = projectToPayload(project!);
  assert.deepEqual(payload.graph.customTechnologies, [traefik]);
  const checked = validateGraph(JSON.parse(JSON.stringify(payload.graph)));
  assert.ok(checked.ok);
  assert.deepEqual(checked.ok && checked.value.customTechnologies, [traefik]);
  assert.deepEqual(parseProject(payloadToStoredProject(payload))?.customTechnologies, [traefik]);

  // A project without any keeps none.
  const plain = parseProject({ ...stored, customTechnologies: undefined });
  assert.equal(plain?.customTechnologies, undefined);
  assert.equal(projectToPayload(plain!).graph.customTechnologies, undefined);
});

test("the server rejects malformed custom technologies with a clear message", () => {
  const graph = (customTechnologies: unknown) => ({ schemaVersion: 1, nodes: [], edges: [], customTechnologies });
  const error = (value: unknown) => {
    const result = validateGraph(graph(value));
    return result.ok ? "" : result.error;
  };
  assert.equal(validateGraph(graph([traefik])).ok, true);
  assert.match(error("x"), /must be an array/);
  assert.match(error([{ ...traefik, id: "Not OK" }]), /\.id must be lowercase/);
  assert.match(error([traefik, traefik]), /repeated/);
  assert.match(error([{ ...traefik, name: "" }]), /name must be/);
  assert.match(error([{ ...traefik, extra: 1 }]), /unknown key "extra"/);
  assert.match(error(Array.from({ length: 31 }, (_, i) => ({ ...traefik, id: `t${i}` }))), /at most 30/);
  assert.equal(sanitizeCustomTechnologies("nonsense"), undefined);
});
