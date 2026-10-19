import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { authOptions } from "../../auth/[...nextauth]/route";
import { githubAccessTokenFor } from "@/lib/github/githubTokenServer";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    // The user's GitHub token, refreshed automatically when it has expired.
    const githubToken = await githubAccessTokenFor(userId);
    if (!githubToken.ok) {
      return NextResponse.json({ error: githubToken.error }, { status: githubToken.status });
    }

    const githubResponse = await fetch(
      "https://api.github.com/user/repos?sort=updated&per_page=3",
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${githubToken.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      },
    );

    let responseBody: unknown;
    try {
      responseBody = await githubResponse.json();
    } catch {
      return NextResponse.json(
        { error: "GitHub returned an invalid response." },
        { status: 502 },
      );
    }

    if (!githubResponse.ok) {
      return NextResponse.json(
        {
          error:
            githubResponse.status === 401
              ? "GitHub authorization expired. Reconnect GitHub."
              : "GitHub could not retrieve repositories.",
        },
        { status: githubResponse.status === 401 ? 401 : 502 },
      );
    }

    return NextResponse.json(responseBody, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Failed to retrieve GitHub repositories.", error);
    return NextResponse.json(
      { error: "Unable to retrieve GitHub repositories. Please try again." },
      { status: 502 },
    );
  }
}
