import assert from "node:assert/strict";
import test from "node:test";

import { firstWebSystemLesson } from "../src/components/learn/lessons.ts";
import {
  isLessonStepComplete,
  type LessonNode,
} from "../src/components/learn/lessonValidation.ts";

const [addClient, addServer, connectClientServer, addDatabase, connectServerDatabase] =
  firstWebSystemLesson.steps;

const node = (id: string, type: LessonNode["data"]["type"]): LessonNode => ({
  id,
  data: { type },
});

test("empty canvas does not satisfy Add Client", () => {
  assert.equal(isLessonStepComplete(addClient, [], []), false);
});

test("a Client node satisfies Add Client", () => {
  assert.equal(isLessonStepComplete(addClient, [node("a", "client")], []), true);
});

test("a different component does not satisfy Add Client", () => {
  assert.equal(isLessonStepComplete(addClient, [node("a", "server")], []), false);
});

test("node steps check the right component type", () => {
  assert.equal(isLessonStepComplete(addServer, [node("a", "server")], []), true);
  assert.equal(isLessonStepComplete(addDatabase, [node("a", "server")], []), false);
  assert.equal(isLessonStepComplete(addDatabase, [node("a", "database")], []), true);
});

test("Client -> API Server satisfies the connect step", () => {
  const nodes = [node("c", "client"), node("s", "server")];
  assert.equal(
    isLessonStepComplete(connectClientServer, nodes, [{ source: "c", target: "s" }]),
    true,
  );
});

test("API Server -> Client does not satisfy the connect step", () => {
  const nodes = [node("c", "client"), node("s", "server")];
  assert.equal(
    isLessonStepComplete(connectClientServer, nodes, [{ source: "s", target: "c" }]),
    false,
  );
});

test("edge steps depend on component type, not on labels or ids", () => {
  // A renamed node keeps its type; ids are arbitrary.
  const nodes = [node("backend-renamed", "server"), node("user", "client")];
  assert.equal(
    isLessonStepComplete(connectClientServer, nodes, [
      { source: "user", target: "backend-renamed" },
    ]),
    true,
  );
});

test("API Server -> Database satisfies the final step", () => {
  const nodes = [node("s", "server"), node("d", "database")];
  assert.equal(
    isLessonStepComplete(connectServerDatabase, nodes, [{ source: "s", target: "d" }]),
    true,
  );
});

test("an unrelated edge does not satisfy the final step", () => {
  const nodes = [node("c", "client"), node("s", "server"), node("d", "database")];
  assert.equal(
    isLessonStepComplete(connectServerDatabase, nodes, [{ source: "c", target: "s" }]),
    false,
  );
});

test("edges that reference missing nodes are ignored", () => {
  assert.equal(
    isLessonStepComplete(connectServerDatabase, [], [{ source: "s", target: "d" }]),
    false,
  );
});

test("any matching pair counts when several nodes of a type exist", () => {
  const nodes = [
    node("c1", "client"),
    node("c2", "client"),
    node("s1", "server"),
    node("s2", "server"),
  ];
  assert.equal(
    isLessonStepComplete(connectClientServer, nodes, [{ source: "c2", target: "s2" }]),
    true,
  );
  // A client -> client edge must not match.
  assert.equal(
    isLessonStepComplete(connectClientServer, nodes, [{ source: "c1", target: "c2" }]),
    false,
  );
});
