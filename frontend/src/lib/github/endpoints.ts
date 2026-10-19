// Where GitHub is. The defaults are GitHub itself; the environment variables exist only so
// the integration tests (tests/integration) can point the server at a fake GitHub.
//   GITHUB_API_URL    default https://api.github.com   (REST and GraphQL)
//   GITHUB_OAUTH_URL  default https://github.com       (token refresh)
export const githubApiUrl = (): string => (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");
export const githubOAuthUrl = (): string => (process.env.GITHUB_OAUTH_URL || "https://github.com").replace(/\/+$/, "");
