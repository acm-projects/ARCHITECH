import assert from "node:assert/strict";
import test from "node:test";

import { getGitHubAccessToken, type GitHubAccount, type GitHubTokenDeps } from "../src/lib/github/githubToken.ts";

const NOW = 1_800_000_000;

// A fake accounts table and a fake GitHub token endpoint.
function setup(account: GitHubAccount | null, reply?: { status?: number; body: unknown } | "network-error") {
  let stored = account;
  const saved: unknown[] = [];
  const requests: Record<string, unknown>[] = [];
  const deps: GitHubTokenDeps = {
    findAccount: async () => stored,
    saveTokens: async (id, tokens) => {
      saved.push({ id, ...tokens });
      stored = { ...(stored as GitHubAccount), access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: tokens.expires_at };
    },
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), ...JSON.parse(init?.body as string) });
      if (reply === "network-error") throw new Error("offline");
      return new Response(JSON.stringify(reply?.body ?? {}), { status: reply?.status ?? 200 });
    }) as typeof fetch,
    clientId: "client-id",
    clientSecret: "client-secret",
    now: () => NOW,
  };
  return { deps, saved, requests, setStored: (next: GitHubAccount) => (stored = next) };
}
const account = (overrides: Partial<GitHubAccount> = {}): GitHubAccount => ({
  id: "acc-1",
  access_token: "old-token",
  refresh_token: "refresh-1",
  expires_at: NOW + 3_600,
  ...overrides,
});

test("a token that is still valid is used without calling GitHub", async () => {
  const { deps, requests } = setup(account());
  assert.deepEqual(await getGitHubAccessToken("u", deps), { ok: true, token: "old-token", refreshed: false });
  assert.equal(requests.length, 0);
});

test("a token without an expiry is used as it is", async () => {
  const { deps, requests } = setup(account({ expires_at: null, refresh_token: null }));
  assert.deepEqual(await getGitHubAccessToken("u", deps), { ok: true, token: "old-token", refreshed: false });
  assert.equal(requests.length, 0);
});

test("an expired token (or one expiring within a minute) is refreshed and saved", async () => {
  for (const expiresAt of [NOW - 10, NOW + 30]) {
    const { deps, saved, requests } = setup(account({ expires_at: expiresAt }), {
      body: { access_token: "new-token", expires_in: 28_800, refresh_token: "refresh-2", refresh_token_expires_in: 15_811_200, scope: "repo", token_type: "bearer" },
    });
    assert.deepEqual(await getGitHubAccessToken("u", deps), { ok: true, token: "new-token", refreshed: true });
    assert.deepEqual(requests, [{
      url: "https://github.com/login/oauth/access_token",
      client_id: "client-id",
      client_secret: "client-secret",
      grant_type: "refresh_token",
      refresh_token: "refresh-1",
    }]);
    assert.deepEqual(saved, [{
      id: "acc-1", access_token: "new-token", refresh_token: "refresh-2", expires_at: NOW + 28_800,
      refresh_token_expires_in: 15_811_200, scope: "repo", token_type: "bearer",
    }]);
  }
});

test("a rejected refresh token means reconnecting GitHub", async () => {
  const { deps, saved } = setup(account({ expires_at: NOW - 10 }), { body: { error: "bad_refresh_token" } });
  assert.deepEqual(await getGitHubAccessToken("u", deps), { ok: false, status: 401, error: "GitHub authorization expired. Reconnect GitHub." });
  assert.equal(saved.length, 0);
});

test("if another request refreshed first, its new token is used", async () => {
  const setupResult = setup(account({ expires_at: NOW - 10 }), { body: { error: "bad_refresh_token" } });
  const { deps } = setupResult;
  const realFind = deps.findAccount;
  let calls = 0;
  deps.findAccount = async (id) => {
    calls += 1;
    // Second read: another request already saved a fresh token.
    if (calls === 2) setupResult.setStored(account({ access_token: "theirs", expires_at: NOW + 28_800 }));
    return realFind(id);
  };
  assert.deepEqual(await getGitHubAccessToken("u", deps), { ok: true, token: "theirs", refreshed: true });
});

test("missing pieces give clear errors", async () => {
  assert.equal((await getGitHubAccessToken("u", setup(null).deps)).ok ? 0 : 404, 404);
  const noToken = await getGitHubAccessToken("u", setup(account({ access_token: null })).deps);
  assert.deepEqual(noToken.ok ? null : noToken.status, 409);
  const noRefresh = await getGitHubAccessToken("u", setup(account({ expires_at: NOW - 10, refresh_token: null })).deps);
  assert.deepEqual(noRefresh.ok ? null : noRefresh.status, 401);
  const { deps } = setup(account({ expires_at: NOW - 10 }));
  deps.clientSecret = undefined;
  const noSecret = await getGitHubAccessToken("u", deps);
  assert.deepEqual(noSecret.ok ? null : noSecret.status, 401);
  const offline = await getGitHubAccessToken("u", setup(account({ expires_at: NOW - 10 }), "network-error").deps);
  assert.deepEqual(offline.ok ? null : offline.status, 502);
  const serverError = await getGitHubAccessToken("u", setup(account({ expires_at: NOW - 10 }), { status: 500, body: {} }).deps);
  assert.deepEqual(serverError.ok ? null : serverError.status, 502);
});
