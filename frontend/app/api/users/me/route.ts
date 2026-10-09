import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { authOptions } from "../../auth/[...nextauth]/route";
import { isExperienceLevel } from "@/lib/experienceLevel";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("experienceLevel" in body) ||
    !isExperienceLevel(body.experienceLevel)
  ) {
    return NextResponse.json({ error: "Select a valid experience level." }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { experienceLevel: body.experienceLevel },
      select: { experienceLevel: true },
    });
    return NextResponse.json({ experienceLevel: user.experienceLevel });
  } catch (error) {
    console.error("Failed to save the user's experience level.", error);
    return NextResponse.json({ error: "Unable to save your experience level." }, { status: 500 });
  }
}
