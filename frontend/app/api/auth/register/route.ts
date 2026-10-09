import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { isValidAuthEmail, normalizeAuthEmail } from "@/lib/authEmail";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
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

    return NextResponse.json({ message: "User created." }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "Email already in use." }, { status: 400 });
    }
    console.error("Account registration failed.", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}