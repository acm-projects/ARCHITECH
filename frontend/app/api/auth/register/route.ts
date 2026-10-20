import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { isValidAuthEmail, normalizeAuthEmail } from "@/lib/authEmail";
import { prisma } from "@/lib/prisma";
import { attemptLimitsFromEnv, checkSignup, clientIp, createAttemptPruner, hashKey } from "@/lib/auth/attemptLimits";
import { attemptStore } from "@/lib/auth/attemptStore";
import { serverError } from "@/lib/server/log";

const prune = createAttemptPruner(attemptStore);

// POST /api/auth/register: creates an email/password account.
// 201 created · 400 invalid or email in use · 429 too many accounts from this network
// (Retry-After header; 5 an hour per IP, see src/lib/auth/attemptLimits.ts).
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  prune();
  try {
    const verdict = await checkSignup(attemptStore, ip, attemptLimitsFromEnv());
    if (!verdict.ok) {
      return NextResponse.json({ error: verdict.error }, { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } });
    }
  } catch (error) {
    return serverError(req, "Checking the sign-up limit failed.", error, "Server error");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { name, email, password } = body as {
    name?: unknown;
    email?: unknown;
    password?: unknown;
  };
  const normalizedEmail = typeof email === "string" ? normalizeAuthEmail(email) : "";
  const normalizedName = typeof name === "string" ? name.trim() : "";

  if (normalizedName.length < 2) {
    return NextResponse.json({ error: "Name must be at least 2 characters." }, { status: 400 });
  }
  if (!isValidAuthEmail(normalizedEmail)) {
    return NextResponse.json({ error: "Enter a valid email address without spaces." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  try {
    const existingUser = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    });
    if (existingUser) {
      return NextResponse.json({ error: "Email already in use." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: { name: normalizedName, email: normalizedEmail, passwordHash },
    });
    await attemptStore.record("signup-ip", hashKey(ip), true);

    return NextResponse.json({ message: "User created." }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "Email already in use." }, { status: 400 });
    }
    return serverError(req, "Account registration failed.", error, "Server error");
  }
}