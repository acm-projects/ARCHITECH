// Accounts and sessions: sign up, sign in, sign out, and who is signed in. Used by the auth
// service (auth.js) and, when the design has no separate auth component, by the API itself.
// Passwords are hashed with scrypt and a random salt; sessions are random tokens of which only
// a hash is stored.

import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { config, db, ms, step } from "./common.js";

const scrypt = promisify(scryptCallback);
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const SESSION_DAYS = 7;
export const COOKIE = "app_session";

// Without a database in the design, accounts live in this process's memory.
const memory = { users: [], sessions: new Map() };
const tokenHash = (token) => createHash("sha256").update(token).digest("hex");
const dbNode = config.auth?.database ?? null;

async function hashPassword(password) {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${(await scrypt(password, salt, 32)).toString("hex")}`;
}
async function passwordMatches(password, stored) {
  const [salt, hash] = stored.split(":");
  return timingSafeEqual(await scrypt(password, Buffer.from(salt, "hex"), 32), Buffer.from(hash, "hex"));
}

export function sessionCookie(token, maxAgeSeconds = SESSION_DAYS * 86_400) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function check(email, password) {
  if (!EMAIL.test(email)) return "Enter a valid email address.";
  if (password.length < 8 || password.length > 200) return "Use a password of 8 to 200 characters.";
  return null;
}

async function newSession(userId, steps) {
  const token = randomBytes(24).toString("base64url");
  const started = performance.now();
  if (db) {
    await db.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))", [tokenHash(token), userId, SESSION_DAYS]);
    steps.push(step(dbNode, `Saved a new session for user #${userId}.`, { ms: ms(started) }));
  } else {
    memory.sessions.set(tokenHash(token), userId);
  }
  return token;
}

// { status, body, token?, steps } for POST /api/auth/signup | signin. Steps are in the order
// things happen: look up the account, hash the password, save.
export async function signUpOrIn(kind, input, authNode) {
  const steps = [];
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const problem = check(email, password);
  if (problem) return { status: 400, body: { error: problem }, steps: [step(authNode, `Rejected the form: ${problem}`, { ok: false })] };

  steps.push(step(authNode, kind === "signup" ? `Creating an account for ${email}.` : `Signing in ${email}.`));
  let started = performance.now();
  const existing = db
    ? (await db.query("SELECT id, email, password_hash FROM users WHERE email = $1", [email])).rows[0]
    : memory.users.find((user) => user.email === email);
  if (db) steps.push(step(dbNode, existing ? `Found the account for ${email}.` : `No account for ${email} yet.`, { ms: ms(started) }));

  if (kind === "signup") {
    if (existing) return { status: 409, body: { error: "That email already has an account. Sign in instead." }, steps: [...steps, step(authNode, "The email is taken.", { ok: false })] };
    started = performance.now();
    const hash = await hashPassword(password);
    steps.push(step(authNode, "Turned the password into a salted hash (scrypt), so the password itself is never stored.", { ms: ms(started) }));
    started = performance.now();
    let user;
    if (db) {
      user = (await db.query("INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email", [email, hash])).rows[0];
      steps.push(step(dbNode, `Saved user #${user.id}: the email and the password hash.`, { ms: ms(started) }));
    } else {
      user = { id: memory.users.length + 1, email, password_hash: hash };
      memory.users.push(user);
    }
    const token = await newSession(user.id, steps);
    steps.push(step(authNode, "Signed you in with a session cookie."));
    return { status: 201, body: { user: { id: user.id, email: user.email } }, token, steps };
  }

  if (!existing) return { status: 401, body: { error: "No account with that email. Create one first." }, steps: [...steps, step(authNode, "No such account.", { ok: false })] };
  started = performance.now();
  const ok = await passwordMatches(password, existing.password_hash);
  if (!ok) return { status: 401, body: { error: "Wrong password." }, steps: [...steps, step(authNode, "Hashed the password you typed: it does not match the saved hash.", { ms: ms(started), ok: false })] };
  steps.push(step(authNode, "Hashed the password you typed: it matches the saved hash.", { ms: ms(started) }));
  const token = await newSession(existing.id, steps);
  steps.push(step(authNode, "Signed you in with a session cookie."));
  return { status: 200, body: { user: { id: existing.id, email: existing.email } }, token, steps };
}

// The signed-in user for a session token, or null.
export async function userForToken(token, authNode) {
  if (!token) return { user: null, steps: [step(authNode, "No session cookie: not signed in.")] };
  const started = performance.now();
  if (db) {
    const row = (
      await db.query(
        "SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()",
        [tokenHash(token)],
      )
    ).rows[0];
    return {
      user: row ?? null,
      steps: [step(authNode, row ? `Checked the session cookie: signed in as ${row.email}.` : "The session cookie is unknown or expired."), step(dbNode, "Looked up the session.", { ms: ms(started) })],
    };
  }
  const id = memory.sessions.get(tokenHash(token));
  const user = memory.users.find((candidate) => candidate.id === id);
  return { user: user ? { id: user.id, email: user.email } : null, steps: [step(authNode, user ? `Checked the session: signed in as ${user.email}.` : "Unknown session.")] };
}

export async function signOut(token, authNode) {
  if (token) {
    if (db) await db.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash(token)]);
    else memory.sessions.delete(tokenHash(token));
  }
  return [step(authNode, "Ended the session."), ...(db && token ? [step(dbNode, "Deleted the session.")] : [])];
}
