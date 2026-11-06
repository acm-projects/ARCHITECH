import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export default async function proxy(req: NextRequest) {
  // Securely read the NextAuth cookie
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  // If there is no token, kick the user back to the landing page
  if (!token) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/workspace/:path*"]
};