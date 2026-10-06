import assert from "node:assert/strict";
import test from "node:test";

import { firstWebSystemLesson } from "../src/components/learn/lessons.ts";
import {
  classifyLessonConnection,
  type LessonNode,
} from "../src/components/learn/lessonValidation.ts";

const [addClient, , connectClientServer, , connectServerDatabase] =
  firstWebSystemLesson.steps;

const node = (id: string, type: LessonNode["data"]["type"]): LessonNode => ({
  id,
  data: { type },
});
const link = (source: string, target: string) => ({ source, target });

const nodes = [
  node("c", "client"),
  node("s", "server"),
  node("d", "database"),
  node("lb", "load-balancer"),
];

test("step 3: Client -> API Server is correct", () => {
  assert.deepEqual(
    classifyLessonConnection(connectClientServer, link("c", "s"), nodes),
    { result: "correct" },
  );
});

test("step 3: API Server -> Client is incorrect with reversal feedback", () => {
  const out = classifyLessonConnection(connectClientServer, link("s", "c"), nodes);
  assert.equal(out.result, "incorrect");
  assert.deepEqual(out.feedback, {
    title: "Try reversing that connection.",
    explanation: "Requests normally travel from the client to the API server.",
  });
});

test("step 3: Client -> Database is incorrect", () => {
  const out = classifyLessonConnection(connectClientServer, link("c", "d"), nodes);
  assert.equal(out.result, "incorrect");
  assert.deepEqual(out.feedback, {
    title: "Connect the client to the API server first.",
    explanation: "The API server sits between the client and your data layer.",
  });
});

test("step 3: API Server -> Database and Client -> Load Balancer are unrelated", () => {
  assert.deepEqual(
    classifyLessonConnection(connectClientServer, link("s", "d"), nodes),
    { result: "unrelated" },
  );
  assert.deepEqual(
    classifyLessonConnection(connectClientServer, link("c", "lb"), nodes),
    { result: "unrelated" },
  );
});

test("step 5: API Server -> Database is correct", () => {
  assert.deepEqual(
    classifyLessonConnection(connectServerDatabase, link("s", "d"), nodes),
    { result: "correct" },
  );
});

test("step 5: Database -> API Server is incorrect", () => {
  const out = classifyLessonConnection(connectServerDatabase, link("d", "s"), nodes);
  assert.equal(out.result, "incorrect");
  assert.equal(out.feedback?.title, "Try reversing that connection.");
  assert.equal(
    out.feedback?.explanation,
    "The API server sends requests to the database when it needs to read or store data.",
  );
});

test("step 5: Client -> Database is incorrect", () => {
  const out = classifyLessonConnection(connectServerDatabase, link("c", "d"), nodes);
  assert.equal(out.result, "incorrect");
  assert.equal(out.feedback?.title, "Keep the database behind your backend.");
});

test("step 5: an unrelated connection is unrelated", () => {
  assert.deepEqual(
    classifyLessonConnection(connectServerDatabase, link("c", "lb"), nodes),
    { result: "unrelated" },
  );
});

test("classification uses component types, not ids or labels", () => {
  const renamed = [node("backend", "server"), node("user", "client")];
  assert.equal(
    classifyLessonConnection(connectClientServer, link("backend", "user"), renamed)
      .result,
    "incorrect",
  );
  assert.equal(
    classifyLessonConnection(connectClientServer, link("user", "backend"), renamed)
      .result,
    "correct",
  );
});

test("missing node ids and node steps classify as unrelated", () => {
  assert.deepEqual(
    classifyLessonConnection(connectClientServer, link("x", "y"), nodes),
    { result: "unrelated" },
  );
  assert.deepEqual(classifyLessonConnection(addClient, link("c", "s"), nodes), {
    result: "unrelated",
  });
});
