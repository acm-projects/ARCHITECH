// A valid GitHub access token for a signed-in user, refreshed when it has expired.
//
// GitHub apps that issue expiring user tokens give an access token that lasts about 8 hours
// and a refresh token that lasts about 6 months. NextAuth stores both (and expires_at, in
// seconds since the epoch) in the user's `github` row of the accounts table. When the access
// token has expired, or will within a minute, this trades the refresh token for a new pair
// (POST https://github.com/login/oauth/access_token) and saves it, so the user does not
// have to sign in again. Tokens without an expiry are used as they are.
//
// The database and the network are passed in, so every case can be tested without them.

export type GitHubAccount = {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
};

export type GitHubTokenDeps = {
  findAccount: (userId: string) => Promise<GitHubAccount | null>;
  saveTokens: (
    accountId: string,
    tokens: { access_token: string; refresh_token: string | null; expires_at: number | null; refresh_token_expires_in: number | null; scope: string | null; token_type: string | null },
  ) => Promise<void>;
  fetch: typeof fetch;
  clientId: string | undefined;
  clientSecret: string | undefined;
  // Seconds since the epoch.
  now?: () => number;
};

export type GitHubTokenResult =
  | { ok: true; token: string; refreshed: boolean }
  | { ok: false; status: 401 | 404 | 409 | 502; error: string };

// Refresh this long before the recorded expiry, so a token does not expire mid-request.
const EARLY_SECONDS = 60;

const RECONNECT = "GitHub authorization expired. Reconnect GitHub.";

const isFresh = (account: GitHubAccount, now: number) =>
  account.expires_at === null || account.expires_at - EARLY_SECONDS > now;

export async function getGitHubAccessToken(userId: string, deps: GitHubTokenDeps): Promise<GitHubTokenResult> {
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  const account = await deps.findAccount(userId);
  if (!account) return { ok: false, status: 404, error: "Connect your GitHub account to access repositories." };
  if (!account.access_token) {
    return { ok: false, status: 409, error: "The linked GitHub account has no access token. Reconnect GitHub." };
  }
  if (isFresh(account, now())) return { ok: true, token: account.access_token, refreshed: false };

  // Expired: trade the refresh token for a new pair.
  if (!account.refresh_token || !deps.clientId || !deps.clientSecret) return { ok: false, status: 401, error: RECONNECT };
  let body: Record<string, unknown>;
  try {
    const response = await deps.fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: deps.clientId,
        client_secret: deps.clientSecret,
        grant_type: "refresh_token",
        refresh_token: account.refresh_token,
      }),
      cache: "no-store",
    });
    body = (await response.json()) as Record<string, unknown>;
    if (!response.ok && typeof body.error !== "string") return { ok: false, status: 502, error: "GitHub could not refresh the authorization." };
  } catch {
    return { ok: false, status: 502, error: "GitHub could not refresh the authorization." };
  }

  if (typeof body.access_token !== "string" || !body.access_token) {
    // A refresh token works once. If another request refreshed first, use what it saved.
    const latest = await deps.findAccount(userId);
    if (latest?.access_token && latest.access_token !== account.access_token && isFresh(latest, now())) {
      return { ok: true, token: latest.access_token, refreshed: true };
    }
    return { ok: false, status: 401, error: RECONNECT };
  }

  const seconds = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  const expiresIn = seconds(body.expires_in);
  const tokens = {
    access_token: body.access_token,
    refresh_token: typeof body.refresh_token === "string" ? body.refresh_token : account.refresh_token,
    expires_at: expiresIn === null ? null : now() + expiresIn,
    refresh_token_expires_in: seconds(body.refresh_token_expires_in),
    scope: typeof body.scope === "string" ? body.scope : null,
    token_type: typeof body.token_type === "string" ? body.token_type : null,
  };
  await deps.saveTokens(account.id, tokens);
  return { ok: true, token: tokens.access_token, refreshed: true };
}
