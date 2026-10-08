"use client";

import { useState } from "react";
import { Logo } from "../ui";
import { readStorageOption, STORAGE_KEYS } from "../../lib/storage";
import type { ExperienceLevel } from "../../types";

const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
const LOGOS = {
  Beginner: "with-archie",
  Intermediate: "archie-without-props",
  Advanced: "without-archie",
} as const satisfies Record<ExperienceLevel, string>;

export default function DashboardLogo() {
  // Onboarding already saves the level. Read it again when the dashboard opens.
  const [level] = useState(() => readStorageOption(STORAGE_KEYS.level, LEVELS, "Intermediate"));

  return <Logo variant={LOGOS[level]} />;
}
