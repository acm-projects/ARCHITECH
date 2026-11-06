import type { DefaultSession } from "next-auth";
import type { ExperienceLevel } from "../types";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      experienceLevel: ExperienceLevel | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    experienceLevel?: ExperienceLevel | null;
  }
}
