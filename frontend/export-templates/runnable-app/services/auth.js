// The design's authentication component. Two placements:
//   on the request path (Client -> Auth -> ...): every request passes through it; it handles
//     sign-in itself and lets other API calls through only with the signed-in user attached;
//   beside the API server (API -> Auth): the API asks it to sign people in and to check sessions.

import http from "node:http";

import { config, cookies, forward, readJson, SELF, sendJson, step } from "./common.js";
import { COOKIE, sessionCookie, signOut, signUpOrIn, userForToken } from "./authCore.js";

const auth = config.auth;
const node = auth.node;
const hop = config.hops?.[SELF];

async function handleAuth(request, response, path) {
  const token = cookies(request.headers.cookie)[COOKIE];
  if (request.method === "POST" && (path === "/api/auth/signup" || path === "/api/auth/signin")) {
    const result = await signUpOrIn(path.endsWith("signup") ? "signup" : "signin", await readJson(request), node);
    return sendJson(response, result.status, result.body, result.steps, result.token ? { "Set-Cookie": sessionCookie(result.token) } : {});
  }
  if (request.method === "POST" && path === "/api/auth/signout") {
    return sendJson(response, 200, { ok: true }, await signOut(token, node), { "Set-Cookie": sessionCookie("", 0) });
  }
  if (request.method === "GET" && path === "/api/auth/me") {
    const { user, steps } = await userForToken(token, node);
    return sendJson(response, 200, { user }, steps);
  }
  return sendJson(response, 404, { error: "Not found." });
}

const server = http.createServer(async (request, response) => {
  const path = (request.url ?? "/").split("?")[0];
  try {
    if (path.startsWith("/api/auth/")) return await handleAuth(request, response, path);

    // Beside the API: it asks who is signed in.
    if (path === "/internal/verify") {
      const { user, steps } = await userForToken(cookies(request.headers.cookie)[COOKIE], node);
      return sendJson(response, 200, { user }, steps);
    }

    // On the request path: pages pass straight through; API calls need a signed-in user.
    if (!hop) return sendJson(response, 404, { error: "Not found." });
    if (!path.startsWith("/api/")) return await forward(request, response, hop.next);
    const { user, steps } = await userForToken(cookies(request.headers.cookie)[COOKIE], node);
    if (!user) return sendJson(response, 401, { error: "Sign in first." }, [...steps, step(node, "Stopped the request: only signed-in users get through.", { ok: false })], { [`X-Trace-${SELF}`]: "blocked" });
    return await forward(request, response, hop.next, {
      steps: [...steps, step(node, `Let the request through for ${user.email}.`)],
      headers: { "x-user-id": String(user.id), "x-user-email": user.email },
    });
  } catch (error) {
    console.error(`${SELF}:`, error.message);
    return sendJson(response, error.status ?? 500, { error: error.status ? "Invalid request." : "The auth service failed." }, [step(node, "Failed.", { ok: false })]);
  }
});

server.listen(Number(process.env.PORT ?? 80), () => console.log(`${SELF} (auth, ${auth.mode}) listening`));
