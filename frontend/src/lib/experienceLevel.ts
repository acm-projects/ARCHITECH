import type { ExperienceLevel } from "../types";

export const EXPERIENCE_LEVELS: readonly ExperienceLevel[] = [
  "Beginner",
  "Intermediate",
  "Advanced",
];

export function isExperienceLevel(value: unknown): value is ExperienceLevel {
  return EXPERIENCE_LEVELS.some((level) => level === value);
}
