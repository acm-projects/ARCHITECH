// What the restored landing, sign-in and onboarding screens share.
export const EXPERIENCE_LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export type Mode = "learn" | "challenge";
export type Page = "landing" | "signin" | "signup" | "onboarding";
