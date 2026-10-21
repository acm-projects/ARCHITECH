import type { ChatModel, ModelEvent } from "./architectChat.ts"

import { ModelBusyError, retryAfterSeconds } from "./errors.ts"

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"
export const GEMINI_REQUEST_TIMEOUT_MS = 45_000

const DEFAULT_GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta"

export function geminiModelName(
  env: Record<string, string | undefined> = process.env,
): string {
  return env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
}

type GeminiPart = {
  text?: string

  functionCall?: { name?: string; args?: unknown }
}

type GeminiChunk = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>

  error?: { message?: string }
}

type JsonSchema = {
  type?: string | readonly string[]

  description?: string

  properties?: Record<string, JsonSchema>

  items?: JsonSchema

  required?: readonly string[]

  enum?: readonly string[]

  minItems?: number

  maxItems?: number
}

function toGeminiSchema(schema: JsonSchema): Record<string, unknown> {
  const { type, properties, items, ...rest } = schema

  const nullable = Array.isArray(type) && type.includes("null")

  const resolvedType = Array.isArray(type)
    ? type.find((value) => value !== "null")
    : type

  return {
    ...rest,

    ...(resolvedType ? { type: resolvedType.toUpperCase() } : {}),

    ...(nullable ? { nullable: true } : {}),

    ...(properties
      ? {
          properties: Object.fromEntries(
            Object.entries(properties).map(([key, value]) => [
              key,
              toGeminiSchema(value),
            ]),
          ),
        }
      : {}),

    ...(items ? { items: toGeminiSchema(items) } : {}),
  }
}

function eventsFromGeminiChunk(chunk: GeminiChunk): ModelEvent[] {
  if (chunk.error?.message)
    throw new Error(`Gemini returned an error: ${chunk.error.message}`)

  const parts =
    chunk.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ??
    []

  return parts.flatMap((part): ModelEvent[] => {
    const events: ModelEvent[] = []

    if (typeof part.text === "string" && part.text)
      events.push({ type: "text", text: part.text })

    if (
      part.functionCall &&
      (typeof part.functionCall.name !== "string" || !part.functionCall.name)
    ) {
      throw new Error("Gemini returned an unnamed tool call.")
    }

    if (part.functionCall?.name) {
      events.push({
        type: "tool",
        name: part.functionCall.name,
        input: part.functionCall.args ?? null,
      })
    }

    return events
  })
}

function eventsFromGeminiSseLine(raw: string): ModelEvent[] {
  const line = raw.trim()

  if (!line.startsWith("data:")) return []

  const data = line.slice(5).trim()

  if (!data) return []

  let chunk: GeminiChunk

  try {
    chunk = (JSON.parse(data) as GeminiChunk)
  } catch {
    throw new Error("Gemini returned malformed stream JSON.")
  }

  return eventsFromGeminiChunk(chunk)
}

export async function* readGeminiStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<ModelEvent> {
  const reader = body.getReader()

  const decoder = new TextDecoder()

  let buffer = ""

  for (;;) {
    const { done, value } = await reader.read()

    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })

    const lines = buffer.split("\n");

    buffer = done ? "" : (lines.pop() ?? "");

    for (const raw of lines) {
      for (const event of eventsFromGeminiSseLine(raw)) yield event
    }

    if (done) break
  }
}

export function geminiModelFromEnv(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = GEMINI_REQUEST_TIMEOUT_MS,
): ChatModel | null {
  const apiKey = env.GEMINI_API_KEY?.trim()

  if (!apiKey) return null

  const model = geminiModelName(env)

  const baseUrl = (
    env.GEMINI_BASE_URL?.trim() || DEFAULT_GEMINI_BASE_URL
  ).replace(/\/+$/, "")

  return async function* ({ system, messages, tools, maxTokens, signal }) {
    const controller = new AbortController()
    const abortWithRequest = () => controller.abort(signal?.reason)
    if (signal?.aborted) abortWithRequest()
    else signal?.addEventListener("abort", abortWithRequest, { once: true })
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)

    try {
      const functionDeclarations = tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: toGeminiSchema(tool.input_schema),
      }))

      const response = await fetchImpl(
        `${baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: messages.map((message) => ({
              role: message.role === "assistant" ? "model" : "user",
              parts: [{ text: message.content }],
            })),
            ...(functionDeclarations.length
              ? { tools: [{ functionDeclarations }] }
              : {}),
            generationConfig: { maxOutputTokens: maxTokens },
          }),
          signal: controller.signal,
        },
      )

      if (response.status === 429 || response.status === 503) {
        throw new ModelBusyError(
          retryAfterSeconds(response.headers.get("retry-after")),
          response.status === 429
            ? "Gemini's rate limit was reached."
            : "Gemini is temporarily overloaded.",
        )
      }

      if (!response.ok || !response.body) {
        let message: string | undefined
        try {
          message = ((await response.json()) as { error?: { message?: string } })
            .error?.message
        } catch {
          message = undefined
        }
        throw new Error(
          `Gemini request failed (${response.status})${message ? `: ${message}` : ""}`,
        )
      }

      yield* readGeminiStream(response.body)
    } catch (error) {
      if (timedOut) {
        throw new ModelBusyError(
          30,
          `Gemini did not finish the reply within ${timeoutMs / 1000} seconds.`,
        )
      }
      throw error
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", abortWithRequest)
    }
  }
}
