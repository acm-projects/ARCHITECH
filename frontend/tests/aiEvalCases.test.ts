import assert from "node:assert/strict";
import test from "node:test";

import { buildArchitectSystemPrompt } from "../src/lib/ai/architectPrompt.ts";
import { runArchitectChat, validateChatRequest, type ChatEvent, type ChatModel } from "../src/lib/ai/architectChat.ts";
import { EVAL_CASES } from "../src/lib/ai/eval/cases.ts";
import { gradeAnswer } from "../src/lib/ai/eval/grade.ts";
import { evaluateArchitecture } from "../src/lib/architecture/evaluation/evaluate.ts";

// The AI regression set, without calling an AI: every case's problem is found by the engine's
// pre-checks and reaches the prompt, so the AI is told about it. (npm run eval:ai asks the AI.)

test("every regression case is a valid request", () => {
  assert.equal(new Set(EVAL_CASES.map((c) => c.id)).size, EVAL_CASES.length, "unique ids");
  assert.ok(EVAL_CASES.length >= 12);
  for (const c of EVAL_CASES) {
    const parsed = validateChatRequest({ graph: c.graph, traffic: c.traffic, messages: [{ role: "user", content: c.question }], ...(c.focus ? { focus: { nodeIds: c.focus } } : {}) });
    assert.ok(parsed.ok, `${c.id}: ${parsed.ok ? "" : parsed.error}`);
  }
});

for (const c of EVAL_CASES) {
  test(`pre-checks find the problem and the prompt carries it: ${c.id}`, () => {
    const evaluation = evaluateArchitecture({ graph: c.graph as never, traffic: c.traffic });
    if (c.finding) {
      const finding = evaluation.findings.find((f) => f.id.startsWith(c.finding));
      assert.ok(finding, `${c.id}: expected a finding starting "${c.finding}", got ${evaluation.findings.map((f) => f.id).join(", ")}`);
      const prompt = buildArchitectSystemPrompt({ graph: c.graph, evaluation, level: "Intermediate", focus: c.focus });
      const evaluationBlock = prompt.split("<evaluation>\n")[1].split("\n</evaluation>")[0];
      assert.ok(evaluationBlock.includes(finding.id.replace(/[<>]/g, "")) || evaluationBlock.includes(JSON.stringify(finding.title).slice(1, -1).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")), `${c.id}: the finding reaches the prompt`);
      for (const label of c.mustMention) assert.ok(prompt.includes(label), `${c.id}: the prompt names "${label}"`);
    } else {
      assert.ok(!evaluation.findings.some((f) => f.severity === "high"), `${c.id}: no high-severity finding`);
      assert.notEqual(evaluation.health.status, "critical");
    }
  });
}

const replay = (events: { type: "text"; text: string }[] | ChatEvent[]): ChatModel =>
  async function* () {
    for (const event of events) if (event.type === "text") yield event;
  };

test("grading: a good answer passes, a vague or wrong one fails with reasons", async () => {
  const c = EVAL_CASES.find((x) => x.id === "spof-single-server")!;
  const request = validateChatRequest({ graph: c.graph, messages: [{ role: "user", content: c.question }] });
  assert.ok(request.ok);
  const ask = async (text: string) => {
    const events: ChatEvent[] = [];
    for await (const event of runArchitectChat({ request: request.value, level: "Beginner", model: replay([{ type: "text", text }]) })) events.push(event);
    return gradeAnswer(c, events);
  };
  assert.deepEqual((await ask("Checkout API is a single point of failure: run a second instance.")).failures, []);
  // Either fix for a single point of failure is accepted: more replicas, or another component.
  assert.deepEqual(c.suggestion?.ops, ["set_setting", "add_component"]);
  const vague = await ask("Your design looks fine overall, maybe add monitoring.");
  assert.equal(vague.passed, false);
  assert.deepEqual(vague.failures, ['does not name "Checkout API"', `does not match ${c.mustMatch[0]}`]);
});

test("grading: a suggestion of the wrong kind, or one that makes things worse, fails", async () => {
  const c = EVAL_CASES.find((x) => x.id === "missing-cache")!;
  const request = validateChatRequest({ graph: c.graph, traffic: c.traffic, messages: [{ role: "user", content: c.question }] });
  assert.ok(request.ok);
  const withTool = (input: unknown): ChatModel =>
    async function* () {
      yield { type: "text", text: "Products DB takes every read: add a cache." };
      yield { type: "tool", name: "propose_changes", input };
    };
  const run = async (model: ChatModel) => {
    const events: ChatEvent[] = [];
    for await (const event of runArchitectChat({ request: request.value, level: "Beginner", model })) events.push(event);
    return gradeAnswer(c, events);
  };
  const good = await run(withTool({ title: "Add a cache", reason: "r", changes: [{ op: "add_component", ref: "new-cache", type: "cache", settings: { replicas: 2 } }, { op: "connect", from: "server-1", to: "new-cache" }, { op: "connect", from: "new-cache", to: "database-1" }, { op: "disconnect", from: "server-1", to: "database-1" }] }));
  assert.deepEqual(good.failures, []);
  const wrong = await run(withTool({ title: "More servers", reason: "r", changes: [{ op: "set_setting", node: "server-1", key: "replicas", value: 5 }] }));
  assert.deepEqual(wrong.failures, ["no suggestion does add_component cache"]);
});
