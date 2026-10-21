import { anthropicModelFromEnv, anthropicModelName } from "./anthropicModel.ts";
import type { ChatModel } from "./architectChat.ts";
import { geminiModelFromEnv, geminiModelName } from "./geminiModel.ts";
import { groqModelFromEnv, groqModelName } from "./groqModel.ts";

// Which AI the AI Architect uses, from the server's environment:
//   AI_PROVIDER = "anthropic", "groq", or "gemini". If unset: Anthropic, then Groq, then Gemini.
// Returns the model and a name that identifies it (part of the reply cache key).
export type ProviderChoice = { provider: "anthropic" | "groq" | "gemini"; name: string; model: ChatModel } | null;

export function chatModelFromEnv(env: Record<string, string | undefined> = process.env): ProviderChoice {
  const wanted = env.AI_PROVIDER?.trim().toLowerCase();
  const anthropic = () => {
    const model = anthropicModelFromEnv(env);
    return model ? { provider: "anthropic" as const, name: `anthropic:${anthropicModelName(env)}`, model } : null;
  };
  const groq = () => {
    const model = groqModelFromEnv(env);
    return model ? { provider: "groq" as const, name: `groq:${groqModelName(env)}`, model } : null;
  };
  const gemini = () => {
    const model = geminiModelFromEnv(env);
    return model ? { provider: "gemini" as const, name: `gemini:${geminiModelName(env)}`, model } : null;
  };
  if (wanted === "anthropic") return anthropic();
  if (wanted === "groq") return groq();
  if (wanted === "gemini") return gemini();
  return anthropic() ?? groq() ?? gemini();
}
