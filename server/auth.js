// auth.js — email/password authentication for ARCHITECT
// Implements the BACKEND INTEGRATION comments in src/screens/Auth.tsx (Jie branch).
//
// Routes (mount at /api/auth):
//   POST /api/auth/signup   { name, email, password, remember? }  -> 201 { user }
//   POST /api/auth/signin   { email, password, remember? }        -> 200 { user }
//   POST /api/auth/signout                                        -> 200 { ok: true }
//   GET  /api/auth/me                                             -> 200 { user } | 401
//
// Errors always come back as { error: "message" } so the frontend can pass
// it straight to setMessage().
//
// Session: a signed JWT in an httpOnly cookie ("architect_session").
// "remember" = 30-day cookie; otherwise a session cookie that ends when the browser closes.
//
// Needs: npm install express bcrypt jsonwebtoken cookie-parser
// Env:   JWT_SECRET=<long random string>   (in .env, never commit it)
//
// Prisma User model this expects (tell whoever owns schema.prisma):
//   model User {
//     id              String   @id @default(cuid())
//     name            String
//     email           String   @unique
//     passwordHash    String
//     experienceLevel String?
//     createdAt       DateTime @default(now())
//   }

import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

// If your teammate already exports a shared client (e.g. db.js / lib/prisma.js),
// import that instead of creating a new one here.
const prisma = new PrismaClient();

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is not set");

const COOKIE_NAME = "architect_session";
const SALT_ROUNDS = 12;
const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function setSessionCookie(res, userId, remember) {
  const token = jwt.sign({ sub: userId }, JWT_SECRET, {
    expiresIn: remember ? "30d" : "1d",
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, // JS can't read it -> safer than localStorage
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: REMEMBER_MS } : {}), // no maxAge = session cookie
  });
}

// Middleware: protects any route. Sets req.userId or responds 401.
export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Not signed in." });
  try {
    req.userId = jwt.verify(token, JWT_SECRET).sub;
    next();
  } catch {
    res.clearCookie(COOKIE_NAME, { path: "/" });
    return res.status(401).json({ error: "Session expired. Sign in again." });
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

    setSessionCookie(res, user.id, remember);
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

    setSessionCookie(res, user.id, remember);
    return res.json({ user: publicUser(user) });
  } catch (err) {
    console.error("signin failed:", err);
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

router.post("/signout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  return res.json({ ok: true });
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
