import { prisma } from "../prisma";
import { githubOAuthUrl } from "./endpoints";
import { getGitHubAccessToken, type GitHubTokenResult } from "./githubToken";

// getGitHubAccessToken wired to the database and GitHub, for the API routes.
export function githubAccessTokenFor(userId: string): Promise<GitHubTokenResult> {
  return getGitHubAccessToken(userId, {
    findAccount: (id) =>
      prisma.account.findFirst({
        where: { userId: id, provider: "github" },
        select: { id: true, access_token: true, refresh_token: true, expires_at: true },
      }),
    saveTokens: async (accountId, tokens) => {
      await prisma.account.update({ where: { id: accountId }, data: tokens });
    },
    fetch,
    tokenUrl: `${githubOAuthUrl()}/login/oauth/access_token`,
    clientId: process.env.GITHUB_ID,
    clientSecret: process.env.GITHUB_SECRET,
  });
}
