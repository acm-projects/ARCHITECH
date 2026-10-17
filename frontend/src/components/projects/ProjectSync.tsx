"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";

import { startProjectSync } from "./projectSync";

// Saves the signed-in user's projects to the server (see projectSync.ts). Renders nothing.
export default function ProjectSync() {
  const { data: session, status } = useSession();
  const userId = status === "authenticated" ? session?.user?.id : undefined;

  useEffect(() => {
    if (!userId) return;
    return startProjectSync(userId);
  }, [userId]);

  return null;
}
