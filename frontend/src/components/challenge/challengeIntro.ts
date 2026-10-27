import type { ProjectMode } from "../projects/projectStore";

type IntroStorage = Pick<Storage, "getItem" | "setItem">;

// Acknowledgement belongs to a project/challenge pair, independently of graph edits or resets.
export function createChallengeIntroState(getStorage: () => IntroStorage | null) {
  const acknowledged = new Set<string>();
  const keyFor = (projectId: string, challengeId: string) =>
    `architech:challenge-intro:v1:${JSON.stringify([projectId, challengeId])}`;

  return {
    shouldShow(mode: ProjectMode, projectId: string, challengeId: string): boolean {
      if (mode !== "challenge") return false;
      const key = keyFor(projectId, challengeId);
      if (acknowledged.has(key)) return false;
      try {
        return getStorage()?.getItem(key) !== "acknowledged";
      } catch (error) {
        console.warn("Could not read Challenge introduction preference.", error);
        return true;
      }
    },
    acknowledge(projectId: string, challengeId: string) {
      const key = keyFor(projectId, challengeId);
      acknowledged.add(key);
      try {
        getStorage()?.setItem(key, "acknowledged");
      } catch (error) {
        console.warn("Challenge introduction dismissed for this session; preference could not be saved.", error);
      }
    },
  };
}
