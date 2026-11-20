import assert from "node:assert/strict";
import test from "node:test";

import {
  ARCHITECH_COMPONENTS,
  ARCHITECH_CONNECTIONS,
  ARCHITECH_NODES,
  ARCHITECH_SOURCES,
  ARCHITECH_STEPS,
  ARCHITECH_WALKTHROUGH,
} from "../src/components/breakdowns/architech.ts";
import { ARCHITECH_PREVIEWS } from "../src/components/breakdowns/architechPreviews.ts";
import { MAX_PREVIEW_MS, previewDurationMs } from "../src/components/breakdowns/livePreview.ts";
import { diagramEditorChallenge } from "../src/components/challenge/challenges.ts";
import { challengeDefinition } from "../src/lib/architecture/challenge/catalog.ts";
import { validateChallengeDefinition } from "../src/lib/architecture/challenge/evaluate.ts";
import { gradeSubmission } from "../src/lib/architecture/challenge/submissions.ts";

test("every ARCHITECH component is drawn and has a complete, sourced walkthrough step", () => {
  const ids = ARCHITECH_COMPONENTS.map(component => component.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ARCHITECH_STEPS, [...ids, "review"]);
  assert.deepEqual(ARCHITECH_NODES.map(node => node.id), ids);
  for (const component of ARCHITECH_COMPONENTS) {
    for (const field of ["explanation", "why", "flow", "tradeoff"] as const) {
      assert.ok(component[field].trim().length > 40, `${component.id}: missing ${field}`);
    }
    assert.ok(component.sources.length > 0);
    for (const source of component.sources) assert.equal(new URL(ARCHITECH_SOURCES[source].href).protocol, "https:");
  }
});

test("connections have valid endpoints and each component joins the build through one", () => {
  const ids = new Set<string>(ARCHITECH_COMPONENTS.map(component => component.id));
  assert.equal(new Set(ARCHITECH_CONNECTIONS.map(edge => edge.id)).size, ARCHITECH_CONNECTIONS.length);
  for (const edge of ARCHITECH_CONNECTIONS) {
    assert.ok(ids.has(edge.source) && ids.has(edge.target), edge.id);
    assert.notEqual(edge.source, edge.target);
    assert.ok(edge.purpose.length > 8);
  }
  ARCHITECH_COMPONENTS.forEach((component, index) => {
    if (index === 0) return;
    const scene = ARCHITECH_WALKTHROUGH.scene(index + 1);
    assert.ok(scene.connections.some(edge => edge.source === component.id || edge.target === component.id), `${component.id} was added without a connection`);
  });
});

test("the model provider is reached only through Archie, never from the browser", () => {
  const touchingModel = ARCHITECH_CONNECTIONS.filter(edge => edge.source === "model" || edge.target === "model");
  assert.deepEqual(touchingModel.map(edge => edge.source), ["archie"]);
  assert.ok(!ARCHITECH_CONNECTIONS.some(edge => edge.source === "designer" && edge.target !== "edge"));
});

test("vertical links name a port on both ends' sides", () => {
  for (const edge of ARCHITECH_CONNECTIONS) {
    if (!edge.sourcePort && !edge.targetPort) continue;
    const source = ARCHITECH_COMPONENTS.find(component => component.id === edge.source)!;
    const target = ARCHITECH_COMPONENTS.find(component => component.id === edge.target)!;
    assert.equal(source.position.x, target.position.x, `${edge.id} runs vertically`);
  }
});

test("every step has a short preview that only lights its own diagram's connections", () => {
  assert.deepEqual(Object.keys(ARCHITECH_PREVIEWS).sort(), [...ARCHITECH_STEPS].sort());
  const connections = new Set(ARCHITECH_CONNECTIONS.map(connection => connection.id));
  for (const [id, frames] of Object.entries(ARCHITECH_PREVIEWS)) {
    assert.ok(previewDurationMs(frames) <= MAX_PREVIEW_MS, `${id} runs ${previewDurationMs(frames)} ms`);
    assert.ok(frames.length >= 2);
    for (const frame of frames) {
      assert.ok(frame.caption.length <= 32, `${id}: "${frame.caption}" is too long`);
      assert.ok(frame.connections.length > 0);
      for (const connection of frame.connections) assert.ok(connections.has(connection), `${id}: unknown connection ${connection}`);
    }
    if (id === "review") continue;
    const touched = frames.flatMap(frame => frame.connections).some(connectionId => {
      const connection = ARCHITECH_CONNECTIONS.find(item => item.id === connectionId);
      return connection?.source === id || connection?.target === id;
    });
    assert.ok(touched, `${id}: no frame uses this component's connections`);
  }
});

const node = (id: string, type: string, properties?: Record<string, number>) => ({
  id, type: "architecture", position: { x: 0, y: 0 }, data: { type, label: id, ...(properties ? { properties } : {}) },
});
const edge = (source: string, target: string) => ({ id: `${source}->${target}`, source, target });

test("the diagram editor challenge is graded by the server and is well formed", () => {
  assert.equal(challengeDefinition(diagramEditorChallenge.id), diagramEditorChallenge.definition);
  assert.deepEqual(validateChallengeDefinition(diagramEditorChallenge.definition), []);
});

test("the diagram editor challenge needs sign-in and rewards a CDN", () => {
  const challenge = diagramEditorChallenge.definition;
  const noSignIn = gradeSubmission(challenge, {
    nodes: [node("browser", "client"), node("api", "server", { replicas: 3 }), node("db", "database")],
    edges: [edge("browser", "api"), edge("api", "db")],
  });
  const editor = gradeSubmission(challenge, {
    nodes: [
      node("browser", "client"), node("cdn", "cdn"), node("lb", "load-balancer"), node("api", "server", { replicas: 3 }),
      node("auth", "auth"), node("cache", "cache"), node("db", "database"),
    ],
    edges: [
      edge("browser", "cdn"), edge("cdn", "lb"), edge("lb", "api"), edge("api", "auth"), edge("api", "cache"), edge("cache", "db"),
    ],
  });
  assert.equal(noSignIn.passed, false);
  assert.ok(noSignIn.failedRequirements.includes("sign-in"));
  assert.ok(noSignIn.score < editor.score);
  assert.deepEqual(editor.failedRequirements, [], `failed: ${editor.failedRequirements.join(", ")}`);
  assert.equal(editor.passed, true);
});
