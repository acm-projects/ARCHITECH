// Client for the auth backend (server/auth.js, mounted at /api/auth).
// In dev, Vite proxies /api to the backend (see vite.config.ts).
// Logins are stored in the database; an httpOnly cookie carries the token for one,
// so every request sends credentials.

import type { ExperienceLevel } from "../types";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  experienceLevel: ExperienceLevel | null;
}

// Thrown for any failed request; `message` is safe to show via setMessage().
export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/auth${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    throw new AuthError("Can't reach the server. Check your connection and try again.", 0);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AuthError(body.error ?? "Something went wrong. Try again.", response.status);
  }
  return body as T;
}

export async function signUp(input: {
  name: string;
  email: string;
  password: string;
  remember?: boolean;
}): Promise<AuthUser> {
  const { user } = await request<{ user: AuthUser }>("/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return user;
}

export async function signIn(input: {
  email: string;
  password: string;
  remember?: boolean;
}): Promise<AuthUser> {
  const { user } = await request<{ user: AuthUser }>("/signin", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return user;
}

export async function signOut(): Promise<void> {
  await request("/signout", { method: "POST" });
}

// Returns the signed-in user, or null if there is no valid session.
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const { user } = await request<{ user: AuthUser }>("/me");
    return user;
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) return null;
    throw error;
  }
}

// Saves the experience level on the signed-in user's account and returns the updated user.
export async function updateExperienceLevel(experienceLevel: ExperienceLevel): Promise<AuthUser> {
  const { user } = await request<{ user: AuthUser }>("/me", {
    method: "PATCH",
    body: JSON.stringify({ experienceLevel }),
  });
  return user;
}
