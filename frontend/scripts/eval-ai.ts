import { runArchitectChat, validateChatRequest, type ChatEvent } from "../src/lib/ai/architectChat.ts";
import { ModelBusyError } from "../src/lib/ai/errors.ts";
import { EVAL_CASES } from "../src/lib/ai/eval/cases.ts";
import { gradeAnswer, type CaseGrade } from "../src/lib/ai/eval/grade.ts";
import { chatModelFromEnv } from "../src/lib/ai/model.ts";

// npm run eval:ai [-- --verbose] [-- --case <id>]
// Asks the configured AI (AI_PROVIDER / GROQ_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY from .env) every
// regression case in src/lib/ai/eval/cases.ts and scores the answers: does it name the right
// component, describe the right problem, and is any suggestion the right kind and an improvement?
// Fails (exit 1) when fewer than AI_EVAL_MIN_PASS (default 0.8) of the cases pass. Calls the
// model directly: no rate limits or cache, so each run uses one question per case.

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const only = args.includes("--case") ? args[args.indexOf("--case") + 1] : null;
const minPass = Number(process.env.AI_EVAL_MIN_PASS ?? 0.8);
const pauseMs = Number(process.env.AI_EVAL_PAUSE_MS ?? 2_500);

const choice = chatModelFromEnv(process.env);
if (!choice) {
  console.error("No AI provider is configured. Set GROQ_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY (and AI_PROVIDER=gemini to select Gemini) in frontend/.env.");
  process.exit(2);
}
const cases = EVAL_CASES.filter((c) => !only || c.id === only);
if (cases.length === 0) {
  console.error(`No case "${only}". Cases: ${EVAL_CASES.map((c) => c.id).join(", ")}`);
  process.exit(2);
}
console.log(`AI Architect regression set: ${cases.length} case(s) on ${choice.name}\n`);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ask(testCase: (typeof cases)[number]): Promise<ChatEvent[]> {
  const request = validateChatRequest({
    graph: testCase.graph,
    traffic: testCase.traffic,
    messages: [{ role: "user", content: testCase.question }],
    ...(testCase.focus ? { focus: { nodeIds: testCase.focus } } : {}),
  });
  if (!request.ok) throw new Error(`${testCase.id}: ${request.error}`);
  for (let attempt = 1; ; attempt += 1) {
    try {
      const events: ChatEvent[] = [];
      for await (const event of runArchitectChat({ request: request.value, level: "Intermediate", model: choice!.model })) events.push(event);
      return events;
    } catch (error) {
      if (error instanceof ModelBusyError && attempt < 3) {
        console.log(`  (provider busy, waiting ${error.retryAfterSeconds}s)`);
        await sleep(error.retryAfterSeconds * 1000);
        continue;
      }
      throw error;
    }
  }
}

const grades: CaseGrade[] = [];
for (const [index, testCase] of cases.entries()) {
  if (index > 0) await sleep(pauseMs);
  let grade: CaseGrade;
  try {
    grade = gradeAnswer(testCase, await ask(testCase));
  } catch (error) {
    grade = { id: testCase.id, passed: false, failures: [`error: ${error instanceof Error ? error.message : String(error)}`], answer: "", suggestions: 0 };
  }
  grades.push(grade);
  console.log(`${grade.passed ? "PASS" : "FAIL"}  ${testCase.id.padEnd(26)} ${testCase.problem}`);
  for (const failure of grade.failures) console.log(`        - ${failure}`);
  if (verbose || !grade.passed) {
    const answer = grade.answer.trim().replace(/\s+/g, " ");
    console.log(`        answer: ${answer.length > 400 ? `${answer.slice(0, 400)}…` : answer || "(empty)"}${grade.suggestions ? ` [+${grade.suggestions} suggestion(s)]` : ""}`);
  }
}

const passed = grades.filter((g) => g.passed).length;
const rate = passed / grades.length;
console.log(`\n${passed}/${grades.length} passed (${Math.round(rate * 100)}%), required ${Math.round(minPass * 100)}%.`);
process.exit(rate >= minPass ? 0 : 1);
