import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { authOptions } from "../../auth/[...nextauth]/route";
import { aiStore } from "@/lib/ai/aiStore";
import { chatModelFromEnv } from "@/lib/ai/model";
import { currentUsage, limitsFromEnv } from "@/lib/ai/usage";

// GET /api/ai/usage: how many AI Architect questions the signed-in user has left today.
// 200 { configured, remainingToday, perDay, perMinute } · 401 not signed in.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const usage = await currentUsage(aiStore, session.user.id, limitsFromEnv());
    return NextResponse.json({ configured: chatModelFromEnv() !== null, ...usage }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Reading AI Architect usage failed.", error);
    return NextResponse.json({ error: "Could not read your AI Architect usage." }, { status: 500 });
  }
}
