import { urlShortenerDefinition } from "../../../components/challenge/challenges.ts";
import type { ChallengeDefinition } from "./contract.ts";

// Every challenge the server can grade, by id. Add a challenge's definition here when it is
// added to the app, so its submissions can be graded and ranked.
export const CHALLENGE_DEFINITIONS: Readonly<Record<string, ChallengeDefinition>> = {
  [urlShortenerDefinition.id]: urlShortenerDefinition,
};

export function challengeDefinition(id: string): ChallengeDefinition | null {
  return Object.hasOwn(CHALLENGE_DEFINITIONS, id) ? CHALLENGE_DEFINITIONS[id] : null;
}
