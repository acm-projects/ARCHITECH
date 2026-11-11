// A breakdown opens in Learn (its walkthrough) or Challenge (designing the system yourself).
// The mode lives in the URL, so a reload or a copied link keeps it.
export type BreakdownMode = "learn" | "challenge";

export const breakdownMode = (value: string | null): BreakdownMode => (value === "challenge" ? "challenge" : "learn");

// The query string for `mode`, keeping everything else (the walkthrough's step) as it is.
export function breakdownModeQuery(query: string, mode: BreakdownMode): string {
  const params = new URLSearchParams(query);
  if (mode === "learn") params.delete("mode");
  else params.set("mode", mode);
  const result = params.toString();
  return result ? `?${result}` : "";
}
