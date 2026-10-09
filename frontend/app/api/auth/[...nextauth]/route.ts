import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isValidAuthEmail, normalizeAuthEmail } from "@/lib/authEmail";
import { isExperienceLevel } from "@/lib/experienceLevel";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt", //Required for email/password logins
  },
  providers: [
    GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID as string,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
  }),
    GithubProvider({
    clientId: process.env.GITHUB_ID as string,
    clientSecret: process.env.GITHUB_SECRET as string,
  }),
    CredentialsProvider({
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (
          typeof credentials?.email !== "string" ||
          typeof credentials.password !== "string" ||
          !isValidAuthEmail(normalizeAuthEmail(credentials.email))
        ) {
          throw new Error("Invalid email or password");
        }

        const email = normalizeAuthEmail(credentials.email);
        const user = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
        });

        if (!user || !user.passwordHash) {
          throw new Error("Invalid email or password");
        }

        //Compare the hashed password
        const isPasswordValid = await bcrypt.compare(credentials.password, user.passwordHash);

        if (!isPasswordValid) {
          throw new Error("Invalid email or password");
        }

        return { id: user.id, name: user.name, email: user.email };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (token.sub && (user || trigger === "update")) {
        const profile = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { experienceLevel: true },
        });
        token.experienceLevel = isExperienceLevel(profile?.experienceLevel)
          ? profile.experienceLevel
          : null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.experienceLevel = isExperienceLevel(token.experienceLevel)
          ? token.experienceLevel
          : null;
      }
      return session;
    },
  },
  //This tells NextAuth to use Jie's UI pages
  pages: {
    signIn: '/', //Change this to wherever Jie's login page is located
  }
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };