import type { ChatEvent, SuggestionEvent } from "../architectChat.ts";
import type { EvalCase } from "./cases.ts";

// Scores one AI Architect answer against a regression case. Pure, so it can be tested with
// written answers; scripts/eval-ai.ts uses it on live answers.

export type CaseGrade = { id: string; passed: boolean; failures: string[]; answer: string; suggestions: number };

export function gradeAnswer(testCase: EvalCase, events: readonly ChatEvent[]): CaseGrade {
  const answer = events.filter((event): event is { type: "text"; text: string } => event.type === "text").map((event) => event.text).join("");
  const suggestions = events.filter((event): event is SuggestionEvent => event.type === "suggestion");
  const failures: string[] = [];
  if (!events.some((event) => event.type === "done")) failures.push("the answer did not finish");
  for (const label of testCase.mustMention) {
    if (!answer.toLowerCase().includes(label.toLowerCase())) failures.push(`does not name "${label}"`);
  }
  for (const pattern of testCase.mustMatch) {
    if (!pattern.test(answer)) failures.push(`does not match ${pattern}`);
  }
  if (testCase.suggestion && suggestions.length > 0) {
    // A suggestion is optional, but when one is made it must be the right kind and help.
    const expected = testCase.suggestion;
    const fitting = suggestions.find((suggestion) =>
      suggestion.changes.some(
        (change) => expected.ops.includes(change.op) && (!expected.type || change.op !== "add_component" || change.type === expected.type),
      ),
    );
    if (!fitting) {
      failures.push(`no suggestion does ${expected.ops.join(" or ")}${expected.type ? ` ${expected.type}` : ""}`);
    } else {
      const { before, after } = fitting.preview;
      const higherIsBetter = expected.improves !== "p95LatencyMs";
      const b = before[expected.improves];
      const a = after[expected.improves];
      const worse = b !== null && a !== null && (higherIsBetter ? a < b : a > b);
      if (worse || (b === null ? false : a === null ? !higherIsBetter : false)) failures.push(`the suggestion makes ${expected.improves} worse`);
    }
  }
  return { id: testCase.id, passed: failures.length === 0, failures, answer, suggestions: suggestions.length };
}
