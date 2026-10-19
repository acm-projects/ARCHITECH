import { anthropicModelFromEnv, anthropicModelName } from "./anthropicModel.ts";
import type { ChatModel } from "./architectChat.ts";
import { groqModelFromEnv, groqModelName } from "./groqModel.ts";

// Which AI the AI Architect uses, from the server's environment:
//   AI_PROVIDER = "groq" or "anthropic". If unset: Anthropic when ANTHROPIC_API_KEY is set,
//   otherwise Groq when GROQ_API_KEY is set, otherwise none (the feature is off).
// Returns the model and a name that identifies it (part of the reply cache key).
export type ProviderChoice = { provider: "anthropic" | "groq"; name: string; model: ChatModel } | null;

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
  if (wanted === "anthropic") return anthropic();
  if (wanted === "groq") return groq();
  return anthropic() ?? groq();
}
