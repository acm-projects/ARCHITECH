// auth.js — email/password authentication for ARCHITECT
// Implements the BACKEND INTEGRATION comments in src/screens/Auth.tsx (Jie branch).
//
// Routes (mount at /api/auth):
//   POST /api/auth/signup   { name, email, password, remember? }  -> 201 { user }
//   POST /api/auth/signin   { email, password, remember? }        -> 200 { user }
//   POST /api/auth/signout                                        -> 200 { ok: true }
//   GET  /api/auth/me                                             -> 200 { user } | 401
//   PATCH /api/auth/me      { experienceLevel }                   -> 200 { user } | 401
//
// Errors always come back as { error: "message" } so the frontend can pass
// it straight to setMessage().
//
// Session: every login is a row in the Session table (see prisma/schema.prisma).
// The httpOnly cookie ("architect_session") only carries a random token that points
// at that row; the database decides whether the login is still valid.
// "remember" = 30-day login; otherwise 1 day and the cookie ends when the browser closes.
// Signing out deletes the row, so the token stops working everywhere immediately.
//
// Needs: npm install express bcrypt cookie-parser
// Models: User and Session in prisma/schema.prisma

import express from "express";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const router = express.Router();

const COOKIE_NAME = "architect_session";
const SALT_ROUNDS = 12;
const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_SESSION_MS = 24 * 60 * 60 * 1000; // 1 day
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXPERIENCE_LEVELS = ["Beginner", "Intermediate", "Advanced"]; // same as ExperienceLevel in src/types.ts

// ---------- helpers ----------

// Never send passwordHash to the client.
function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    experienceLevel: user.experienceLevel ?? null,
  };
}

// Only the hash is stored, so reading the Session table doesn't yield usable tokens.
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Saves the login to the database and hands the browser the token for it.
async function startSession(res, userId, remember) {
  const token = crypto.randomBytes(32).toString("base64url");
  const lifetime = remember ? REMEMBER_MS : DEFAULT_SESSION_MS;
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + lifetime),
    },
  });
  // Drop this user's expired logins while we're here so the table doesn't grow forever.
  await prisma.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, // JS can't read it -> safer than localStorage
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: REMEMBER_MS } : {}), // no maxAge = session cookie
  });
}

// Middleware: protects any route. Sets req.userId or responds 401.
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Not signed in." });
  try {
    const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!session || session.expiresAt <= new Date()) {
      if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      res.clearCookie(COOKIE_NAME, { path: "/" });
      return res.status(401).json({ error: "Session expired. Sign in again." });
    }
    req.userId = session.userId;
    next();
  } catch (err) {
    console.error("session lookup failed:", err);
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }
}

// ---------- routes ----------

// Sign up: validate -> check email -> hash -> create user -> session -> return user
router.post("/signup", async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const remember = Boolean(req.body?.remember);

    // Same rules as canSubmit in Auth.tsx
    if (name.length < 2) return res.status(400).json({ error: "Name must be at least 2 characters." });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "An account with this email already exists." });

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({ data: { name, email, passwordHash } });

    await startSession(res, user.id, remember);
    return res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    // P2002 = unique constraint (two signups with same email at once)
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    console.error("signup failed:", err);
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// Sign in: find user -> check password -> session -> return user
router.post("/signin", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const remember = Boolean(req.body?.remember);

    if (!email || !password) return res.status(400).json({ error: "Enter your email and password." });

    const user = await prisma.user.findUnique({ where: { email } });
    // Same message for "no user" and "wrong password" so attackers can't probe emails
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) return res.status(401).json({ error: "Incorrect email or password." });

    await startSession(res, user.id, remember);
    return res.json({ user: publicUser(user) });
  } catch (err) {
    console.error("signin failed:", err);
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// Sign out: delete the login from the database, then clear the cookie.
router.post("/signout", async (req, res) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    res.clearCookie(COOKIE_NAME, { path: "/" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("signout failed:", err);
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// Who am I? Replaces readJsonStorage(STORAGE_KEYS.user) as the source of truth.
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(401).json({ error: "Account not found." });
    return res.json({ user: publicUser(user) });
  } catch (err) {
    console.error("me failed:", err);
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// Update my profile. Onboarding uses this to save the experience level to the DB.
router.patch("/me", requireAuth, async (req, res) => {
  try {
    const experienceLevel = req.body?.experienceLevel;
    if (!EXPERIENCE_LEVELS.includes(experienceLevel)) {
      return res.status(400).json({ error: "Choose Beginner, Intermediate, or Advanced." });
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { experienceLevel },
    });
    return res.json({ user: publicUser(user) });
  } catch (err) {
    // P2025 = no row to update (account was deleted mid-request)
    if (err?.code === "P2025") {
      res.clearCookie(COOKIE_NAME, { path: "/" });
      return res.status(401).json({ error: "Account not found." });
    }
    console.error("update me failed:", err);
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

export default router;

// ---------- how to mount it (in your server.js / index.js) ----------
// import express from "express";
// import cookieParser from "cookie-parser";
// import authRouter from "./auth.js";
//
// const app = express();
// app.use(express.json());
// app.use(cookieParser());
// app.use("/api/auth", authRouter);
// app.listen(3001, () => console.log("API on http://localhost:3001"));
