import assert from "node:assert/strict"

import test from "node:test"

import { ModelBusyError } from "../src/lib/ai/errors.ts"

import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_REQUEST_TIMEOUT_MS,
  geminiModelFromEnv,
  geminiModelName,
  readGeminiStream,
} from "../src/lib/ai/geminiModel.ts"

import { PROPOSE_CHANGES_TOOL } from "../src/lib/ai/architectPrompt.ts"

function stream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()

  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))

      controller.close()
    },
  })
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []

  for await (const item of items) values.push(item)

  return values
}

const event = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`

test("Gemini config requires a key and uses the selected model", () => {
  assert.equal(geminiModelFromEnv({}), null)

  assert.equal(geminiModelName({}), DEFAULT_GEMINI_MODEL)

  assert.equal(geminiModelName({ GEMINI_MODEL: "gemini-test" }), "gemini-test")
})

test("Gemini stream yields text and function calls even when chunks split lines", async () => {
  const payload = [
    event({ candidates: [{ content: { parts: [{ text: "Add a cache." }] } }] }),

    event({
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: "propose_changes",
                  args: { title: "Cache" },
                },
              },
            ],
          },
        },
      ],
    }),
  ].join("")

  const events = await collect(
    readGeminiStream(
      stream([payload.slice(0, 23), payload.slice(23, 71), payload.slice(71)]),
    ),
  )

  assert.deepEqual(events, [
    { type: "text", text: "Add a cache." },

    { type: "tool", name: "propose_changes", input: { title: "Cache" } },
  ])
})

test("Gemini stream surfaces provider and malformed JSON errors", async () => {
  assert.deepEqual(
    await collect(
      readGeminiStream(
        stream(['data: {"candidates":[{"content":{"parts":[{"text":"Final"}]}}]}']),
      ),
    ),
    [{ type: "text", text: "Final" }],
  );

  await assert.rejects(
    collect(
      readGeminiStream(
        stream([event({ error: { message: "Invalid API key" } })]),
      ),
    ),

    /Gemini returned an error: Invalid API key/,
  )

  await assert.rejects(
    collect(readGeminiStream(stream(["data: {bad json}\n"]))),
    /malformed stream JSON/,
  )
})

test("Gemini request maps chat roles and tool schema and keeps the key in a header", async () => {
  let seen: { url: string; init: RequestInit } | null = null

  const fakeFetch = (async (url: string, init: RequestInit) => {
    seen = { url, init }

    return new Response(
      stream([
        event({ candidates: [{ content: { parts: [{ text: "Hello." }] } }] }),
      ]),
      { status: 200 },
    )
  }) as unknown as typeof fetch

  const model = geminiModelFromEnv(
    {
      GEMINI_API_KEY: "test-key",
      GEMINI_BASE_URL: "https://example.test/v1beta/",
    },

    fakeFetch,
  )

  assert.ok(model)

  const events = await collect(
    model({
      system: "Be Archie.",

      messages: [
        { role: "user", content: "Question" },

        { role: "assistant", content: "Earlier answer" },
      ],

      tools: [PROPOSE_CHANGES_TOOL],

      maxTokens: 100,
    }),
  )

  assert.deepEqual(events, [{ type: "text", text: "Hello." }])

  assert.ok(seen)

  const { url, init } = seen as { url: string; init: RequestInit }

  assert.equal(
    url,
    "https://example.test/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse",
  )

  assert.equal(
    (init.headers as Record<string, string>)["x-goog-api-key"],
    "test-key",
  )

  const body = JSON.parse(String(init.body))

  assert.deepEqual(body.systemInstruction, { parts: [{ text: "Be Archie." }] })

  assert.deepEqual(body.contents, [
    { role: "user", parts: [{ text: "Question" }] },

    { role: "model", parts: [{ text: "Earlier answer" }] },
  ])

  assert.equal(body.generationConfig.maxOutputTokens, 100)

  assert.equal(
    body.tools[0].functionDeclarations[0].name,
    PROPOSE_CHANGES_TOOL.name,
  )

  assert.equal(body.tools[0].functionDeclarations[0].parameters.type, "OBJECT")

  assert.equal(
    body.tools[0].functionDeclarations[0].parameters.properties.changes.items
      .properties.value.type,
    "NUMBER",
  )

  assert.equal(
    body.tools[0].functionDeclarations[0].parameters.properties.changes.items
      .properties.value.nullable,
    true,
  )
})

test("Gemini HTTP errors include provider messages and rate limits or overloads become busy errors", async () => {
  const denied = geminiModelFromEnv(
    { GEMINI_API_KEY: "bad" },

    (async () =>
      new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
        status: 401,
      })) as unknown as typeof fetch,
  )!

  await assert.rejects(
    collect(
      denied({
        system: "s",
        messages: [{ role: "user", content: "q" }],
        tools: [],
        maxTokens: 10,
      }),
    ),

    /Gemini request failed \(401\): Invalid API key/,
  )

  const limited = geminiModelFromEnv(
    { GEMINI_API_KEY: "key" },

    (async () =>
      new Response(JSON.stringify({ error: { message: "Rate limited" } }), {
        status: 429,
        headers: { "retry-after": "12" },
      })) as unknown as typeof fetch,
  )!

  await assert.rejects(
    collect(
      limited({
        system: "s",
        messages: [{ role: "user", content: "q" }],
        tools: [],
        maxTokens: 10,
      }),
    ),

    (error: unknown) =>
      error instanceof ModelBusyError && error.retryAfterSeconds === 12,
  )

  const overloaded = geminiModelFromEnv(
    { GEMINI_API_KEY: "key" },
    (async () =>
      new Response(JSON.stringify({ error: { message: "Temporarily unavailable" } }), {
        status: 503,
        headers: { "retry-after": "5" },
      })) as unknown as typeof fetch,
  )!

  await assert.rejects(
    collect(
      overloaded({
        system: "s",
        messages: [{ role: "user", content: "q" }],
        tools: [],
        maxTokens: 10,
      }),
    ),
    (error: unknown) =>
      error instanceof ModelBusyError && error.retryAfterSeconds === 5,
  )
})

test("Gemini requests stop at the configured timeout and report a retryable busy error", async () => {
  const timeoutMs = 10
  const fakeFetch = (async (_url: string, init: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("Request aborted")), {
        once: true,
      })
    })) as unknown as typeof fetch
  const model = geminiModelFromEnv({ GEMINI_API_KEY: "key" }, fakeFetch, timeoutMs)!

  assert.equal(GEMINI_REQUEST_TIMEOUT_MS, 45_000)
  await assert.rejects(
    collect(
      model({
        system: "s",
        messages: [{ role: "user", content: "q" }],
        tools: [],
        maxTokens: 10,
      }),
    ),
    (error: unknown) =>
      error instanceof ModelBusyError && /did not finish the reply/.test(error.message),
  )
})
